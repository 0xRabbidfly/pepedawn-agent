/**
 * Knowledge Orchestrator Service
 * 
 * ElizaOS Service implementation for knowledge retrieval and lore generation.
 * Orchestrates RAG pipeline: retrieval → diversity → clustering → storytelling.
 * 
 * Migrated from functional module to Service pattern for:
 * - Lifecycle management (init/stop)
 * - Discoverability via runtime.getService()
 * - Better composability with other services
 * 
 * CRITICAL: Conditional MMR application
 * - FACTS mode: Skip MMR, use pure relevance (preserves high-priority memories)
 * - LORE mode: Apply MMR for diverse storytelling
 * Fixed Nov 2025 - was incorrectly applying MMR to all queries
 */

import { Service, type IAgentRuntime, logger, ModelType } from '@elizaos/core';
import { searchKnowledgeWithExpansion, selectDiversePassages, expandQuery, type RetrievedPassage } from '../utils/loreRetrieval';
import { clusterAndSummarize, formatSourcesLine, formatCompactCitation } from '../utils/loreSummarize';
import { generatePersonaStory } from '../utils/storyComposer';
import { filterOutRecentlyUsed, markIdAsRecentlyUsed } from '../utils/lru';
import { LORE_CONFIG } from '../utils/loreConfig';
import { classifyQuery } from '../utils/queryClassifier';
import { CLARIFICATION_MESSAGE } from '../actions/loreCommand';
import { isInFullIndex, getCardInfo } from '../data/fullCardIndex';
import { callTextModel } from '../utils/modelGateway';

export interface KnowledgeRetrievalOptions {
  mode?: 'FACTS' | 'LORE';
  includeMetrics?: boolean;
  preferCardFacts?: boolean;
  deterministicCardSelection?: boolean;
  suppressCardDiscovery?: boolean;
}

export interface KnowledgeRetrievalResult {
  story: string;
  sourcesLine: string;
  hasWikiOrMemory?: boolean;  // True if wiki/memory sources were found (for silent ignore logic)
  primaryCardAsset?: string;
  cardSummary?: string;
  cardMatches?: Array<{ asset: string; reason: string }>;
  metrics: {
    query: string;
    hits_raw: number;
    hits_used: number;
    clusters: number;
    latency_ms: number;
    story_words: number;
  };
}

export class KnowledgeOrchestratorService extends Service {
  static serviceType = 'knowledge-orchestrator';
  
  capabilityDescription = 
    'Orchestrates knowledge retrieval with RAG pipeline: query expansion, vector search, ' +
    'diversity selection (MMR), clustering, and persona-based storytelling.';

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  private logStep(step: number, label: string, info?: Record<string, any>): void {
    const message = `[STEP ${step}/5] ${label}`;
    if (info && Object.keys(info).length > 0) {
      logger.info({ step: `${step}/5`, label, ...info }, message);
    } else {
      logger.info(message);
    }
  }

  private shouldRegenerateFactsAnswer(output: string): boolean {
    const normalized = (output || '').trim();
    if (!normalized) return true;
    if (normalized.toUpperCase() === 'NO_ANSWER') return true;
    const fallbackPatterns = [
      /haven['’]t heard of that/i,
      /not sure what you mean/i,
      /need a hint/i,
      /try asking/i,
      /couldn['’]t find any lore/i,
      /not sure which fake fits/i,
    ];
    return fallbackPatterns.some((pattern) => pattern.test(normalized));
  }

  private async regenerateFactsAnswer(
    query: string,
    passages: RetrievedPassage[]
  ): Promise<{ story: string; sourcesLine: string }> {
    const usable = passages.slice(0, Math.max(3, Math.min(5, passages.length)));
    const notes = usable
      .map((p, idx) => {
        const contentText =
          typeof (p as any)?.content?.text === 'string'
            ? ((p as any).content.text as string)
            : '';
        const text = (p.text || contentText || '').trim();
        return text ? `[${idx + 1}] ${text}` : '';
      })
      .filter(Boolean)
      .join('\n\n');

    if (!notes) {
      return {
        story: 'No factual passages available to answer.',
        sourcesLine: '',
      };
    }

    const prompt = [
      `You are PEPEDAWN, the factual Rare Pepe archivist. The user asked: "${query}"`,
      'Write a concise factual answer using only the notes below. Tie the key facts together in 2-4 sentences or short bullets.',
      'Requirements:',
      '- Use confident, informative language (no apologies, no requests for more info).',
      '- Do not say you have not heard of it.',
      '- Cite specific details when available (names, events, outcomes).',
      '- If the notes contain multiple beats, connect them logically.',
      '- Stay under 120 words.',
      '',
      'Notes:',
      notes,
      '',
      'Answer:',
    ].join('\n');

    try {
      const model = process.env.LORE_STORY_MODEL || 'gpt-4o';
      const response = await callTextModel(this.runtime, {
        model,
        prompt,
        maxTokens: Math.min(LORE_CONFIG.MAX_TOKENS_STORY, 320),
        temperature: Math.min(0.7, LORE_CONFIG.TEMPERATURE),
        source: 'Lore facts regeneration',
      });
      const regenerated = (response.text || '').trim();

      if (!this.shouldRegenerateFactsAnswer(regenerated)) {
        const sourcesLine =
          process.env.HIDE_LORE_SOURCES === 'true'
            ? ''
            : `\n\nSources:  ${usable
                .map((p) => formatCompactCitation(p))
                .join('  ||  ')}`;
        return { story: regenerated, sourcesLine };
      }
    } catch (err) {
      logger.warn({ err }, '[KnowledgeOrchestrator] Facts regeneration failed');
    }

    // Fall back to direct concatenation if regeneration still refused
    const fallback = usable
      .map((p) => (p.text || '').trim())
      .filter(Boolean)
      .join(' ');
    const sourcesLine =
      process.env.HIDE_LORE_SOURCES === 'true'
        ? ''
        : `\n\nSources:  ${usable
            .map((p) => formatCompactCitation(p))
            .join('  ||  ')}`;
    return {
      story: fallback || 'Information unavailable.',
      sourcesLine,
    };
  }

  /**
   * Perform a dedicated global recall for card facts only.
   * Fetches a larger pool and post-filters to metadata.source === 'card-visual'.
   */
  private async expandCardOnlyPassages(
    query: string,
    count: number
  ): Promise<RetrievedPassage[]> {
    try {
      const knowledgeService = (this.runtime as any).getService
        ? (this.runtime as any).getService('knowledge')
        : null;

      let raw: any[] = [];
      if (knowledgeService?.getKnowledge) {
        const pseudoMessage = { id: 'card-expansion', content: { text: query } };
        const scope = { roomId: undefined, count } as any;

        const searchPromise = knowledgeService.getKnowledge(pseudoMessage, scope);
        const timeoutPromise: Promise<never> = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Card-only search timeout')), LORE_CONFIG.SEARCH_TIMEOUT_MS);
        });
        raw = (await Promise.race([searchPromise, timeoutPromise])) || [];
      } else {
        logger.warn('[CardDiscovery] Knowledge service unavailable for card-only recall');
        raw = [];
      }

      if (!Array.isArray(raw) || raw.length === 0) return [];

      const mapped: RetrievedPassage[] = raw.map((r: any, idx: number) => {
        const text = (r.content?.text || r.text || '').trim();
        const id = (r.id || r.content?.id || `card-extra-${idx}`) as string;
        const score = r.similarity || r.score || 1.0;
        const metadata = r.metadata || r.content?.metadata || {};

        // Identify card-visual memories
        const isCardVisual =
          (metadata?.source === 'card-visual') ||
          /\[CARD:[^\]]+\]/.test(text) ||
          !!metadata?.asset;

        const asset =
          (metadata?.asset &&
            typeof metadata.asset === 'string' &&
            metadata.asset.toUpperCase()) ||
          undefined;

        const cardBlockType =
          (metadata?.blockType as RetrievedPassage['cardBlockType']) ||
          'combined';
        const cardBlockLabel =
          (typeof metadata?.blockLabel === 'string' &&
            metadata.blockLabel) ||
          undefined;
        const cardBlockPriority =
          typeof metadata?.blockPriority === 'number'
            ? metadata.blockPriority
            : undefined;
        const visualKws: string[] = Array.isArray(metadata?.visualKeywords)
          ? metadata.visualKeywords
          : [];
        const textKws: string[] = Array.isArray(metadata?.textKeywords)
          ? metadata.textKeywords
          : [];

        return {
          id,
          text,
          score,
          sourceType: isCardVisual ? 'card-fact' : 'unknown',
          sourceRef: asset ? `card:${asset}` : id,
          cardAsset: asset,
          cardBlockType,
          cardBlockLabel,
          cardBlockPriority,
          cardKeywords: [...visualKws, ...textKws],
          metadata,
        } as RetrievedPassage;
      });

      return mapped.filter(
        (p) => p.sourceType === 'card-fact' && !!p.cardAsset
      );
    } catch (err) {
      logger.warn({ err }, '[CardDiscovery] expandCardOnlyPassages failed');
      return [];
    }
  }

  private static readonly CARD_QUERY_STOP_WORDS = new Set<string>([
    'fake',
    'rares',
    'rare',
    'card',
    'cards',
    'pepe',
    'please',
    'pls',
    'show',
    'find',
    'look',
    'search',
    'need',
    'want',
    'with',
    'word',
    'text',
    'have',
    'that',
    'this',
    'about',
    'give',
    'tell',
    'most',
    'any',
    'kind',
    'type',
    'really',
    'which',
    'what',
    'whats',
    'does',
    'like',
    'make',
    'maybe',
    'someone',
    'something',
    'good',
    'best',
    'absolute',
    'absolutely',
    'teh',
  ]);

  private static readonly CARD_VISUAL_TRAIT_TOKENS = new Set<string>();

  /**
   * Initialize service
   */
  static async start(runtime: IAgentRuntime): Promise<KnowledgeOrchestratorService> {
    logger.info('🧠 [KnowledgeOrchestrator] Starting service...');
    const service = new KnowledgeOrchestratorService(runtime);
    logger.info('✅ [KnowledgeOrchestrator] Service ready');
    return service;
  }

  /**
   * Cleanup service
   */
  static async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('🛑 [KnowledgeOrchestrator] Stopping service...');
    const service = runtime.getService(KnowledgeOrchestratorService.serviceType);
    if (service) {
      await service.stop();
    }
  }

  async stop(): Promise<void> {
    logger.info('✅ [KnowledgeOrchestrator] Service stopped');
  }

  /**
   * Retrieve knowledge with RAG pipeline
   * 
   * @param query - User query (e.g., "FREEDOMKEK lore", "submission rules")
   * @param roomId - Chat/room ID for LRU filtering
   * @param options - Optional configuration (mode override, metrics)
   * @returns Story text, sources line, and metrics
   */
  async retrieveKnowledge(
    query: string,
    roomId: string,
    options?: KnowledgeRetrievalOptions
  ): Promise<KnowledgeRetrievalResult> {
    const startTime = Date.now();
    const preferCardFacts = options?.preferCardFacts ?? false;
    const suppressCardDiscovery = options?.suppressCardDiscovery ?? false;

    logger.debug(`\n🔍 [KNOWLEDGE] Query: "${query}"`);
    this.logStep(1, 'expand_query', { query });
    logger.debug('='.repeat(60));

    // STEP 1: Query expansion
    const expandedQuery = expandQuery(query);
    logger.debug(`📝 Expanded query: "${expandedQuery}"`);
    this.logStep(2, 'retrieve_passages_start');
    // STEP 2: Retrieve passages
    const queryMode = options?.mode; // Pass mode to use correct source weights
    const passages = await searchKnowledgeWithExpansion(
      this.runtime,
      expandedQuery,
      roomId,
      queryMode
    );

    const primaryCardAsset = this.detectPrimaryCardAsset(query);

    const sourceBreakdown = passages.reduce((acc, p) => {
      const type = p.sourceType === 'telegram' ? 'tg' : 
                   p.sourceType === 'wiki' ? 'wiki' :
                   p.sourceType === 'memory' ? 'mem' :
                   p.sourceType === 'card-fact' ? 'card' : 'other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const sourceStr = Object.entries(sourceBreakdown)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    
    this.logStep(2, 'retrieve_passages_complete', {
      total: passages.length,
      sources: sourceStr || 'none',
    });

    if (passages.length === 0) {
      logger.debug('⚠️  No passages found - checking if query is a known card');
      
      // Check if query matches a card in our index
      const { getCardInfo } = await import('../data/fullCardIndex');
      const cardInfo = getCardInfo(query.trim());
      
      let responseMessage: string;
      
      if (cardInfo) {
        // Card exists but has no lore yet
        logger.info(`✨ Card "${cardInfo.asset}" found in index but has no lore - prompting user to add`);
        responseMessage = `🎨 The lore vault for ${cardInfo.asset.toUpperCase()} is empty - a blank canvas waiting for your story!\n\n` +
          `Help fill it by dropping some knowledge:\n` +
          `"@pepedawn_bot remember this ${cardInfo.asset.toUpperCase()}: <share that sweet lore here>"\n\n` +
          `Every card has a tale worth telling 🐸✨`;
      } else {
        // Not a card, give general clarification
        responseMessage = CLARIFICATION_MESSAGE;
      }
      
      return {
        story: responseMessage,
        sourcesLine: '',
        hasWikiOrMemory: false,
        metrics: {
          query,
          hits_raw: 0,
          hits_used: 0,
          clusters: 0,
          latency_ms: Date.now() - startTime,
          story_words: responseMessage.split(/\s+/).length,
        }
      };
    }

    // STEP 3: Pre-classify to determine if we need MMR
    const hasWikiOrMemoryPassages = passages.some((p) =>
      this.isMatchingWikiOrMemory(p, primaryCardAsset)
    );
    let cardFactPassages = passages.filter(
      (p) => p.sourceType === 'card-fact' && p.cardAsset
    );

    const metadataAnswer = this.tryAnswerCardMetadata(
      query,
      primaryCardAsset,
      startTime,
      passages.length,
      passages.length
    );
    if (metadataAnswer) {
      return metadataAnswer;
    }

    // Dedicated card-only recall to guarantee enough candidates for the reranker
    // We bypass wiki/memory here and fetch additional card-visual facts globally.
    // This avoids channel LRU variance and ensures winter cards can enter the pool.
    const TARGET_CARD_CANDIDATES =
      parseInt(process.env.CARD_FACT_RECALL_TARGET || '60', 10);
    if (cardFactPassages.length < TARGET_CARD_CANDIDATES) {
      const needed = TARGET_CARD_CANDIDATES - cardFactPassages.length;
      try {
        const extra = await this.expandCardOnlyPassages(query, TARGET_CARD_CANDIDATES * 2);
        if (extra.length > 0) {
          const existingIds = new Set(cardFactPassages.map((p) => p.id));
          const merged = [...cardFactPassages];
          for (const p of extra) {
            if (existingIds.has(p.id)) continue;
            if (p.sourceType !== 'card-fact' || !p.cardAsset) continue;
            merged.push(p);
            existingIds.add(p.id);
          }
          // Keep the strongest candidates first
          merged.sort((a, b) => {
            const prio = (b.cardBlockPriority ?? 0) - (a.cardBlockPriority ?? 0);
            if (prio !== 0) return prio;
            return (b.score ?? 0) - (a.score ?? 0);
          });
          cardFactPassages = merged.slice(0, TARGET_CARD_CANDIDATES);
          logger.info(
            `🧠 [CardDiscovery] Card-only recall expanded → ${cardFactPassages.length} card passages`
          );
        }
      } catch (err) {
        logger.warn({ err }, 'Card-only recall expansion failed');
      }
    }
    if (!suppressCardDiscovery) {
      if (preferCardFacts) {
        const cardIntentResult = await this.composeCardFactAnswer(
          query,
          cardFactPassages,
          roomId,
          startTime,
          { deterministicSelection: options?.deterministicCardSelection }
        );
        if (cardIntentResult) {
          logger.info(
            `🃏 [KNOWLEDGE] Card discovery forced (intent) using ${cardFactPassages.length} card-related passages.`
          );
          return cardIntentResult;
        }
        logger.info(
          `🧠 [KNOWLEDGE] Card intent detected but no strong card matches found; falling back to wiki/memory flow.`
        );
      } else if (!hasWikiOrMemoryPassages && !primaryCardAsset) {
        const cardFactResult = await this.composeCardFactAnswer(
          query,
          cardFactPassages,
          roomId,
          startTime,
          { deterministicSelection: options?.deterministicCardSelection }
        );
        if (cardFactResult) {
          logger.info(`🃏 [KNOWLEDGE] Card discovery fired (no wiki/memory hits, ${cardFactPassages.length} card-fact passages)`);
          return cardFactResult;
        }
      } else if (cardFactPassages.length > 0) {
        logger.info(`🧠 [KNOWLEDGE] Wiki/memory hits found – skipping card discovery despite ${cardFactPassages.length} card-fact passages.`);
      }
    } else if (process.env.LORE_DEBUG === 'verbose') {
      logger.info('🧠 [KNOWLEDGE] Card discovery suppressed by caller.');
    }

    // /fl flow is always LORE - skip all FACTS logic when mode is explicitly LORE
    const isLoreMode = options?.mode === 'LORE';
    const queryType = isLoreMode ? 'LORE' : (options?.mode || classifyQuery(query));
    
    this.logStep(3, 'select_passages', {
      mode: queryType,
      hasPrimaryCardAsset: !!primaryCardAsset,
    });
    
    // Filter recently used (but ALWAYS preserve memories)
    const passageIds = passages.map(p => p.id);
    const filteredIds = filterOutRecentlyUsed(roomId, passageIds);
    
    let candidatePassages = passages;
    if (filteredIds.length >= LORE_CONFIG.MIN_HITS) {
      candidatePassages = passages.filter(p => 
        p.sourceType === 'memory' || filteredIds.includes(p.id)
      );
      const memCount = candidatePassages.filter(p => p.sourceType === 'memory').length;
      logger.debug(`🔄 Filtered to ${candidatePassages.length} fresh passages (${memCount} memories always included)`);
    }

    const topK = Math.min(LORE_CONFIG.TOP_K_FOR_CLUSTERING, candidatePassages.length);
    const topPassages = candidatePassages.slice(0, topK);
    
    const topPassage = topPassages[0];
    const hasCardMemory = topPassage?.sourceType === 'memory' && 
                          topPassage?.sourceRef?.startsWith('card:');
    const targetPassageCount = hasCardMemory ? 5 : LORE_CONFIG.CLUSTER_TARGET_MAX * 2;
    
    let diversePassages: RetrievedPassage[];
    
    if (isLoreMode || queryType !== 'FACTS') {
      // LORE mode: source diversity + MMR
      const bySource: Record<string, RetrievedPassage[]> = {
        'memory': [], 'wiki': [], 'telegram': [], 'card-fact': [], 'unknown': [],
      };
      for (const p of topPassages) {
        const source = p.sourceType || 'unknown';
        (bySource[source] || bySource['unknown']).push(p);
      }
      
      const sourceDiverse: RetrievedPassage[] = [];
      const sourceOrder = ['memory', 'telegram', 'wiki', 'card-fact', 'unknown'];
      const maxPerSource = Math.max(2, Math.floor(targetPassageCount / 3));
      
      for (const sourceType of sourceOrder) {
        const available = bySource[sourceType] || [];
        if (available.length > 0 && sourceDiverse.length < targetPassageCount) {
          const toTake = Math.min(maxPerSource, available.length, targetPassageCount - sourceDiverse.length);
          sourceDiverse.push(...available.slice(0, toTake));
        }
      }
      
      if (sourceDiverse.length < targetPassageCount) {
        const sourceDiverseIds = new Set(sourceDiverse.map(p => p.id));
        const remaining = topPassages.filter(p => !sourceDiverseIds.has(p.id));
        sourceDiverse.push(...remaining.slice(0, targetPassageCount - sourceDiverse.length));
      }
      
      diversePassages = selectDiversePassages(sourceDiverse, Math.min(targetPassageCount, sourceDiverse.length));
      logger.debug(`📖 LORE mode: Applied source diversity + MMR (${diversePassages.length} passages)`);
    } else {
      // FACTS mode: top-k by relevance
      diversePassages = topPassages.slice(0, Math.min(targetPassageCount, topK));
      logger.debug(`📋 FACTS mode: Skipping MMR, using top ${diversePassages.length} by relevance`);
    }
    
    // Debug: Check source breakdown after selection
    const postSelectionBreakdown = diversePassages.reduce((acc, p) => {
      const type = p.sourceType === 'telegram' ? 'tg' : 
                   p.sourceType === 'wiki' ? 'wiki' :
                   p.sourceType === 'memory' ? 'mem' :
                   p.sourceType === 'card-fact' ? 'card' : 'other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const postSelectionStr = Object.entries(postSelectionBreakdown)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    
    this.logStep(3, 'select_passages_complete', {
      selected: diversePassages.length,
      sources: postSelectionStr || 'none',
    });

    diversePassages.forEach(p => markIdAsRecentlyUsed(roomId, p.id));

    this.logStep(4, 'compose_response', {
      mode: queryType,
      passageCount: diversePassages.length,
    });
    
    let story: string;
    let sourcesLine: string;
    let clusterCount = 0;
    let hasWikiOrMemory = false;
    
    if (isLoreMode || queryType !== 'FACTS') {
      // LORE mode: clustering and storytelling
      const cardMemories = diversePassages.filter(p => 
        p.sourceType === 'memory' && p.sourceRef?.startsWith('card:')
      );
      const otherPassages = diversePassages.filter(p => 
        !(p.sourceType === 'memory' && p.sourceRef?.startsWith('card:'))
      );
      
      let summaries: any[] = [];
      if (cardMemories.length > 0) {
        const cardCluster = {
          id: 'card-memories',
          passageRefs: cardMemories.map(p => p.id),
          summary: cardMemories.map(p => p.text).join('\n\n'),
          citations: cardMemories.map(p => formatCompactCitation(p))
        };
        const otherClusters = otherPassages.length > 0 
          ? await clusterAndSummarize(this.runtime, otherPassages, query, 'LORE')
          : [];
        summaries = [cardCluster, ...otherClusters];
        logger.info({ step: '4/5', branch: 'LORE', clusters: summaries.length, cardClusters: 1 },
          '[KnowledgeOrchestrator] LORE clustering (card memories present)');
      } else {
        summaries = await clusterAndSummarize(this.runtime, diversePassages, query, 'LORE');
        logger.info({ step: '4/5', branch: 'LORE', clusters: summaries.length },
          '[KnowledgeOrchestrator] LORE clustering');
      }
      
      clusterCount = summaries.length;
      story = await generatePersonaStory(this.runtime, query, summaries, 'LORE');
      sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' : formatSourcesLine(summaries);
    } else {
      logger.debug('📋 FACTS mode: Using top wiki and memory passages directly');
      
      const factsPassages = diversePassages.filter(p => p.sourceType === 'wiki' || p.sourceType === 'memory').slice(0, 5);
      const factsBreakdown = factsPassages.reduce((acc, p) => {
        const type = p.sourceType === 'memory' ? 'mem' : 'wiki';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const factsStr = Object.entries(factsBreakdown).map(([t, c]) => `${c} ${t}`).join(', ');
      logger.info(
        { step: '4/5', branch: 'FACTS', passages: factsPassages.length, breakdown: factsStr },
        '[KnowledgeOrchestrator] FACTS passage selection'
      );
      
      hasWikiOrMemory = factsPassages.length > 0;
      
      if (factsPassages.length === 0) {
        const topPassages = diversePassages.slice(0, 5);
        story = await generatePersonaStory(this.runtime, query, [{
          id: 'direct',
          passageRefs: topPassages.map(p => p.id),
          summary: topPassages.map(p => p.text).join('\n\n'),
          citations: topPassages.map(p => formatCompactCitation(p))
        }], queryType);
        sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' : 
          `\n\nSources:  ${topPassages.map(p => formatCompactCitation(p)).join('  ||  ')}`;
        clusterCount = 1;
      } else {
        story = await generatePersonaStory(this.runtime, query, [
          {
          id: 'facts',
          passageRefs: factsPassages.map(p => p.id),
          summary: factsPassages.map(p => p.text).join('\n\n'),
          citations: factsPassages.map(p => formatCompactCitation(p))
          },
        ], queryType);
        sourcesLine =
          process.env.HIDE_LORE_SOURCES === 'true'
            ? ''
            : `\n\nSources:  ${factsPassages
                .map((p) => formatCompactCitation(p))
                .join('  ||  ')}`;
        clusterCount = 1;
      }
      logger.debug(`📋 Sent ${factsPassages.length || diversePassages.slice(0, 5).length} passages directly (no clustering)`);

      if (this.shouldRegenerateFactsAnswer(story)) {
        const fallbackPassages =
          factsPassages.length > 0 ? factsPassages : diversePassages.slice(0, 5);
        const { story: regeneratedStory, sourcesLine: regeneratedSources } =
          await this.regenerateFactsAnswer(query, fallbackPassages);
        story = regeneratedStory;
        if (regeneratedSources) {
          sourcesLine = regeneratedSources;
        }
        hasWikiOrMemory = fallbackPassages.some(
          (p) => p.sourceType === 'wiki' || p.sourceType === 'memory'
        );
        logger.info(
          { step: '4/5', branch: 'FACTS', regeneration: true },
          '[KnowledgeOrchestrator] FACTS regeneration executed due to fallback output'
        );
      }
    }
    
    // Robust fallback: if story is empty or too short (e.g., 1 word), synthesize from top passages
    const wordCount = (story || '').trim().split(/\s+/).filter(Boolean).length;
    if (!story || story.trim().length === 0 || wordCount < 4) {
      const take = (arr: RetrievedPassage[], n: number) => arr.slice(0, Math.max(0, n));
      const fallbackSet = (isLoreMode || queryType !== 'FACTS')
        ? take(diversePassages, 3)
        : (() => {
            const pickFacts = diversePassages.filter(p => p.sourceType === 'wiki' || p.sourceType === 'memory');
            return pickFacts.length > 0 ? take(pickFacts, 3) : take(diversePassages, 3);
          })();
      
      const firstSentence = (text: string) => {
        const trimmed = (text || '').trim();
        const m = trimmed.match(/^[\s\S]*?[.!?](\s|$)/);
        return (m ? m[0] : trimmed).trim();
      };
      
      const synthesized = fallbackSet.map(p => firstSentence(p.text)).filter(Boolean).join(' ');
      if (synthesized && synthesized.length > 0) {
        story = synthesized;
        sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' :
          `\n\nSources:  ${fallbackSet.map(p => formatCompactCitation(p)).join('  ||  ')}`;
        hasWikiOrMemory = fallbackSet.some(p => p.sourceType === 'wiki' || p.sourceType === 'memory');
      } else {
        story = '🤔 Not sure which fake fits that yet. Try a different clue or ping `/fl CARDNAME` for direct lore.';
        sourcesLine = '';
        hasWikiOrMemory = false;
      }
    }

    logger.debug(`✍️  Generated story (${story.split(/\s+/).length} words)`);
    this.logStep(5, 'story_generated', {
      words: story.split(/\s+/).length,
      clusters: clusterCount,
    });

    const latencyMs = Date.now() - startTime;
    logger.debug(`\n📈 [METRICS]`);
    logger.debug(`   Query: "${query}"`);
    logger.debug(`   Hits raw: ${passages.length}`);
    logger.debug(`   Hits used: ${diversePassages.length}`);
    logger.debug(`   Clusters: ${clusterCount}`);
    logger.debug(`   Latency: ${latencyMs}ms`);
    logger.debug(`   Story length: ${story.split(/\s+/).length} words`);
    logger.debug('='.repeat(60) + '\n');

    return {
      story,
      sourcesLine,
      hasWikiOrMemory,
      metrics: {
        query,
        hits_raw: passages.length,
        hits_used: diversePassages.length,
        clusters: clusterCount,
        latency_ms: latencyMs,
        story_words: story.split(/\s+/).length,
      }
    };
  }

  private async composeCardFactAnswer(
    query: string,
    passages: RetrievedPassage[],
    roomId: string,
    startTime: number,
    options?: { deterministicSelection?: boolean }
  ): Promise<KnowledgeRetrievalResult | null> {
    if (passages.length === 0) {
      return null;
    }

    const sorted = [...passages].sort((a, b) => {
      const priorityDiff =
        (b.cardBlockPriority ?? 0) - (a.cardBlockPriority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return b.score - a.score;
    });

    const groups = new Map<string, CardFactGroup>();

    for (const passage of sorted) {
      const normalizedSnippet = this.normalizeCardFactText(passage).toLowerCase();
      const passageKeywords = this.collectPassageKeywords(passage, normalizedSnippet);
      const asset =
        passage.cardAsset ??
        (passage.sourceRef?.startsWith('card:')
          ? passage.sourceRef.slice(5)
          : undefined);
      if (!asset) continue;

      const blockTypeKey = this.getBlockTypeKey(passage.cardBlockType);
      const normalizedAsset = asset.toUpperCase();
      const existing = groups.get(normalizedAsset);
      if (existing) {
        existing.passages.push(passage);
        passageKeywords.all.forEach((kw) => existing.keywordSet.add(kw));
        this.mergeKeywordMaps(existing.keywordSetByType, passageKeywords.byType);
        if (normalizedSnippet && !existing.textSnippets.includes(normalizedSnippet)) {
          existing.textSnippets.push(normalizedSnippet);
        }
        if (normalizedSnippet) {
          this.addSnippetToMap(existing.textSnippetsByType, blockTypeKey, normalizedSnippet);
        }
      } else {
        groups.set(normalizedAsset, {
          asset: normalizedAsset,
          passages: [passage],
          best: passage,
          score:
            (passage.cardBlockPriority ?? 0) * 10 + passage.score,
          keywordSet: new Set(passageKeywords.all),
          keywordSetByType: this.cloneKeywordMap(passageKeywords.byType),
          textSnippets: normalizedSnippet ? [normalizedSnippet] : [],
          textSnippetsByType: this.createSnippetMap(blockTypeKey, normalizedSnippet),
        });
      }
    }

    if (groups.size === 0) {
      return null;
    }

    const analysis = this.analyzeCardQueryIntent(query);

    if (process.env.LORE_DEBUG === 'verbose') {
      logger.info(
        `🧠 [CardDiscovery] Groups=${groups.size} query="${query}"`
      );
    }

    const baseGroups = Array.from(groups.values()).map((group) => {
      const best = group.passages[0];
      const baseScore =
        (best.cardBlockPriority ?? 0) * 10 + best.score;
      const relevance = this.computeGroupRelevance(group, analysis);
      const heuristicScore =
        baseScore +
        relevance.boost -
        relevance.literalMisses * 80 -
        relevance.tokenMissPenalty;

      if (process.env.LORE_DEBUG === 'verbose') {
        logger.info(
          `🧠 [CardDiscovery] ${group.asset} base=${baseScore.toFixed(
            2
          )} boost=${relevance.boost.toFixed(2)} literalMiss=${
            relevance.literalMisses
          } tokenPenalty=${relevance.tokenMissPenalty.toFixed(
            2
          )} visualMatches=${relevance.visualMatches} heuristic=${heuristicScore.toFixed(2)}`
        );
        logger.info(
          `   • highlights=${relevance.highlights.join(', ') || 'none'}`
        );
      }

      return {
        ...group,
        best,
        heuristicScore,
        score: heuristicScore,
        matchHighlights: relevance.highlights,
        literalSatisfied: relevance.literalMisses === 0,
        visualMatches: relevance.visualMatches,
        totalKeywordMatches: relevance.keywordMatches,
        literalMisses: relevance.literalMisses,
        tokenPenalty: relevance.tokenMissPenalty,
        rerankSource: 'heuristic' as const,
      };
    });

    let ranked: CardFactGroup[];

    const llmMap = await this.rerankCardCandidatesWithLLM(query, baseGroups);
    if (!llmMap) {
      logger.info('🤖 [CardDiscovery.LLM] Reranker disabled or failed (map=null)');
    } else {
      const sortedScores = Array.from(llmMap.entries())
        .map(([asset, entry]) => ({
          asset,
          score: typeof entry.score === 'number' ? entry.score : Number(entry.score) || 0,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ asset, score }) => `${asset}:${score.toFixed(2)}`)
        .join(', ');
      logger.info(
        `🤖 [CardDiscovery.LLM] Returned ${llmMap.size} scores | Top3 ${sortedScores || 'n/a'}`
      );
    }

    if (llmMap && llmMap.size > 0) {
      const detailedScores = Array.from(llmMap.entries())
        .map(
          ([asset, entry]) =>
            `${asset.toUpperCase()}:${(entry.score ?? 0).toFixed(2)}${
              entry.reason ? ` "${entry.reason}"` : ''
            }`
        )
        .join('  ||  ');
      logger.info(`🤖 [CardDiscovery.LLM] Scores: ${detailedScores}`);

      ranked = baseGroups
        .map((group) => {
          const rerank = llmMap.get(group.asset);
          if (rerank) {
            const llmScore = Math.max(0, Math.min(1, rerank.score));
            if (process.env.LORE_DEBUG === 'verbose') {
              logger.info(
                `🤖 [CardDiscovery.LLM] ${group.asset} score=${llmScore.toFixed(
                  3
                )} reason=${rerank.reason || 'n/a'}`
              );
            }
            return {
              ...group,
              score: llmScore,
              llmScore,
              llmReason: rerank.reason,
              rerankSource: 'llm' as const,
            };
          }
          return {
            ...group,
            score: group.heuristicScore ?? group.score ?? 0,
            rerankSource: 'heuristic' as const,
          };
        })
        .sort((a, b) => {
          const aHas = a.rerankSource === 'llm';
          const bHas = b.rerankSource === 'llm';
          if (aHas && bHas) {
            return (b.llmScore ?? 0) - (a.llmScore ?? 0);
          }
          if (aHas) return -1;
          if (bHas) return 1;
          return (b.heuristicScore ?? 0) - (a.heuristicScore ?? 0);
        });
    } else {
      const heuristicLog = baseGroups
        .slice(0, 6)
        .map(
          (group) =>
            `${group.asset}:${(group.heuristicScore ?? 0).toFixed(2)}`
        )
        .join('  ||  ');
      logger.info(`[CardDiscovery] Heuristic ranking used: ${heuristicLog || 'n/a'}`);
      ranked = baseGroups.sort(
        (a, b) => (b.heuristicScore ?? 0) - (a.heuristicScore ?? 0)
      );
    }

    const limited = ranked.slice(0, Math.min(3, ranked.length));

    const threshold = Math.max(
      0,
      Math.min(
        1,
        parseFloat(process.env.CARD_TRAIT_RERANK_MIN_SCORE || '0.55')
      )
    );

    let selectedGroup: CardFactGroup | undefined;

    const topLlms = limited.filter(
      (group) => group.rerankSource === 'llm' && (group.llmScore ?? 0) >= threshold
    );
    if (topLlms.length > 0) {
      selectedGroup = topLlms[0];
      logger.debug(
        `🤖 [CardDiscovery.LLM] Selected ${selectedGroup.asset} with score ${(selectedGroup.llmScore ?? 0).toFixed(2)} >= ${threshold.toFixed(
          2
        )}`
      );
    }

    if (!selectedGroup) {
      const candidateIds = limited.map((group) => `card:${group.asset}`);
      const freshIds = filterOutRecentlyUsed(roomId, candidateIds);
      let selectionPool = limited;
      if (freshIds.length > 0) {
        const freshGroups = limited.filter((group) =>
          freshIds.includes(`card:${group.asset}`)
        );
        if (freshGroups.length > 0) {
          selectionPool = freshGroups;
        }
      }

      if (selectionPool.length > 0) {
        if (options?.deterministicSelection || selectionPool.length === 1) {
          selectedGroup = selectionPool[0];
        } else {
          const randomIndex = Math.floor(Math.random() * selectionPool.length);
          selectedGroup = selectionPool[randomIndex];
        }
      }
    }

    if (!selectedGroup) {
      return null;
    }

    if (selectedGroup) {
      markIdAsRecentlyUsed(roomId, `card:${selectedGroup.asset}`);
    }

    const orderedGroups = selectedGroup
      ? [selectedGroup, ...limited.filter((group) => group.asset !== selectedGroup.asset)]
      : limited;
    const topGroup = orderedGroups[0];
    let cardSummary: string | null = null;

    if (topGroup?.best) {
      cardSummary = await this.generateCardDiscoverySummary(
        query,
        topGroup.asset,
        topGroup.best
      );
    }

    const fallbackReason = topGroup
      ? this.buildCardReason(topGroup, false)
      : 'This card matches your clue.';
    const finalSummary =
      (cardSummary && cardSummary.trim().length > 0 ? cardSummary.trim() : fallbackReason);

    const latencyMs = Date.now() - startTime;
    return {
      story: '',
      sourcesLine: '',
      hasWikiOrMemory: true,
      primaryCardAsset: topGroup?.asset,
      cardSummary: finalSummary,
      cardMatches: orderedGroups.map((group) => ({
        asset: group.asset,
        reason: this.buildCardReason(group, false),
      })),
      metrics: {
        query,
        hits_raw: passages.length,
        hits_used: limited.reduce(
          (sum, group) => sum + group.passages.length,
          0
        ),
        clusters: limited.length,
        latency_ms: latencyMs,
        story_words: finalSummary.split(/\s+/).length,
      },
    };
  }

  private async generateCardDiscoverySummary(
    query: string,
    asset: string,
    passage: RetrievedPassage
  ): Promise<string | null> {
    const evidence =
      this.normalizeCardFactText(passage) ||
      (passage.text ? this.truncateSnippet(passage.text) : '');

    if (!evidence) {
      return null;
    }

    const modelName =
      process.env.CARD_DISCOVERY_SUMMARY_MODEL || process.env.OPENAI_SMALL_MODEL || 'gpt-4o-mini';
    const prompt = `You match user questions to Fake Rares cards.
User question: "${query}"
Selected card: "${asset}"
Supporting details: "${evidence}"

Write ONE short sentence (max 20 words) telling the user why this card fits the request. Mention the card name.`;

    try {
      const result = await callTextModel(this.runtime, {
        model: modelName,
        prompt,
        maxTokens: 60,
        temperature: 0.2,
        source: 'Card Discovery Summary',
      });

      // Replace literal \n strings with actual newlines, then normalize whitespace
      const withNewlines = result.text.replace(/\\n/g, '\n');
      const trimmed = withNewlines.trim().replace(/\s+/g, ' ');
      return trimmed.length > 0 ? trimmed : null;
    } catch (err) {
      logger.warn(
        { err },
        '[KnowledgeOrchestrator] Failed to generate card discovery summary'
      );
      return null;
    }
  }

  private formatCardFactSnippet(passage: RetrievedPassage): string {
    const label = this.mapCardBlockLabel(
      passage.cardBlockType,
      passage.cardBlockLabel
    );
    const normalized = this.normalizeCardFactText(passage);
    if (!normalized) {
      return label;
    }
    return `${label}: ${this.truncateSnippet(normalized)}`;
  }

  private mapCardBlockLabel(
    type: RetrievedPassage['cardBlockType'],
    fallback?: string
  ): string {
    if (fallback) return fallback;
    switch (type) {
      case 'text':
        return 'On-card text';
      case 'memetic':
        return 'Memetic vibe';
      case 'visual':
        return 'Visual summary';
      case 'raw':
        return 'Analysis snippet';
      case 'combined':
        return 'Card summary';
      default:
        return 'Details';
    }
  }

  private normalizeCardFactText(passage: RetrievedPassage): string {
    let text = (passage.text || '').trim();
    if (!text) return '';

    text = text.replace(/\*\*/g, '').replace(/[_`]/g, '').trim();

    switch (passage.cardBlockType) {
      case 'text': {
        return text.replace(/\s*\n\s*/g, ' | ');
      }
      case 'memetic': {
        const bullet = text
          .split(/\n+/)
          .map((line) => line.replace(/^[-•\s]+/, '').trim())
          .find(Boolean);
        return bullet || text;
      }
      case 'visual': {
        const sentences = text.split(/(?<=[.!?])\s+/);
        return sentences.find((s) => s.trim().length > 0) || text;
      }
      case 'raw': {
        const sections = text.split(/\n\n+/);
        const preferred = sections.find((section) =>
          /(TEXT ON CARD|VISUAL|MEMETIC)/i.test(section)
        );
        const cleaned = (preferred || sections[0] || '')
          .replace(/^[📝🎨🧬🎯]\s*/g, '')
          .trim();
        return cleaned || text;
      }
      default:
        return text;
    }
  }

  private collectPassageKeywords(
    passage: RetrievedPassage,
    normalizedSnippet: string
  ): CollectedPassageKeywords {
    const all = new Set<string>();
    const byType: KeywordMap = {};
    const blockType = this.getBlockTypeKey(passage.cardBlockType);

    const ingest = (token: string, type: CardBlockTypeKey) => {
      if (!this.isVisualOrText(type)) return;
      const normalized = this.normalizeSearchToken(token);
      if (!normalized) return;
      all.add(normalized);
      if (!byType[type]) {
        byType[type] = new Set<string>();
      }
      byType[type]!.add(normalized);
    };

    const collectTokens = (tokens: string[] | null | undefined, type: CardBlockTypeKey) => {
      if (!this.isVisualOrText(type)) return;
      if (!Array.isArray(tokens)) return;
      for (const token of tokens) {
        if (typeof token === 'string') {
          const lowercase = token.toLowerCase();
          if (lowercase) ingest(lowercase, type);
        }
      }
    };

    const metadata = passage.metadata as any;

    if (metadata?.keywords && this.isVisualOrText(blockType)) {
      collectTokens(metadata.keywords, blockType);
    }

    if (metadata?.visualKeywords) {
      collectTokens(metadata.visualKeywords, 'visual');
    }

    if (metadata?.textKeywords) {
      collectTokens(metadata.textKeywords, 'text');
    }

    if (typeof passage.cardBlockLabel === 'string') {
      if (this.isVisualOrText(blockType)) {
        const tokens = this.tokenizePhrase(passage.cardBlockLabel);
        tokens.forEach((token) => ingest(token, blockType));
      }
    }

    if (normalizedSnippet) {
      if (blockType === 'visual') {
        this.tokenizePhrase(normalizedSnippet).forEach((token) =>
          ingest(token, 'visual')
        );
      } else if (blockType === 'text' || blockType === 'combined') {
        this.tokenizePhrase(normalizedSnippet).forEach((token) => ingest(token, 'text'));
      }
    }

    return { all, byType };
  }

  private analyzeCardQueryIntent(query: string): CardQueryAnalysis {
    const literalMap = new Map<string, CardLiteralTerm>();
    const captureLiteral = (rawTerm?: string) => {
      if (!rawTerm) return;
      const normalizedPhrase = this.normalizeLiteralPhrase(rawTerm);
      if (!normalizedPhrase) return;
      if (!literalMap.has(normalizedPhrase)) {
        const tokens = this.tokenizePhrase(normalizedPhrase)
          .map((token) => this.normalizeSearchToken(token))
          .filter((token): token is string => !!token);
        literalMap.set(normalizedPhrase, {
          raw: rawTerm.trim(),
          normalized: normalizedPhrase,
          tokens,
        });
      }
    };

    for (const match of query.matchAll(/"([^"]+?)"/g)) {
      captureLiteral(match[1]);
    }

    const literalPatterns = [
      /\bword\s+([a-z0-9]+)/gi,
      /\bwith\s+the\s+word\s+([a-z0-9]+)/gi,
      /\bcontains?\s+([a-z0-9]+)/gi,
      /\bhas\s+the\s+word\s+([a-z0-9]+)/gi,
      /\btext\s+([a-z0-9]+)/gi,
      /\bspell(?:ed|s)?\s+([a-z0-9]+)/gi,
    ];

    for (const pattern of literalPatterns) {
      for (const match of query.matchAll(pattern)) {
        captureLiteral(match[1]);
      }
    }

    const literalTerms = Array.from(literalMap.values());

    const tokenSet = new Set<string>();
    const words = query.match(/\b[a-zA-Z0-9]{3,}\b/g) || [];

    for (const word of words) {
      const normalized = this.normalizeSearchToken(word);
      if (normalized) {
        tokenSet.add(normalized);
      }
    }

    for (const literal of literalTerms) {
      for (const token of literal.tokens) {
        tokenSet.add(token);
      }
    }

    const hasVisualTraitIntent = false;

    return {
      tokens: Array.from(tokenSet),
      literalTerms,
      hasVisualTraitIntent,
    };
  }

  private computeGroupRelevance(
    group: CardFactGroup,
    analysis: CardQueryAnalysis
  ): {
    boost: number;
    highlights: string[];
    literalMisses: number;
    tokenMissPenalty: number;
    visualMatches: number;
    keywordMatches: number;
  } {
    const keywordSet = group.keywordSet ?? new Set<string>();
    const keywordSetByType = group.keywordSetByType ?? {};
    const textSnippets = group.textSnippets ?? [];
    const textSnippetsByType = group.textSnippetsByType ?? {};

    const highlightTokens = new Set<string>();
    const matchesByType: Record<'visual' | 'text', Set<string>> = {
      visual: new Set<string>(),
      text: new Set<string>(),
    };
    const matchedTokenSet = new Set<string>();
    const typePriority: Array<'visual' | 'text'> = ['visual', 'text'];

    const tokenMatchesType = (token: string, type: CardBlockTypeKey): boolean => {
      if (!this.isVisualOrText(type)) return false;
      const keywordMatches = keywordSetByType[type]?.has(token);
      if (keywordMatches) {
        return true;
      }
      const snippetMatches = this.includesToken(textSnippetsByType[type], token);
      return snippetMatches;
    };

    for (const token of analysis.tokens) {
      let matchedType: CardBlockTypeKey | null = null;
      for (const type of typePriority) {
        if (tokenMatchesType(token, type)) {
          matchedType = type;
          matchesByType[type]!.add(token);
          matchedTokenSet.add(token);
          highlightTokens.add(this.formatHighlightToken(token, type));
          break;
        }
      }

      if (matchedType) {
        continue;
      }
    }

    let literalMisses = 0;
    let literalHits = 0;

    for (const literal of analysis.literalTerms) {
      let satisfied = false;

      if (literal.tokens.length > 0) {
        satisfied = literal.tokens.every((token) => {
          if (matchedTokenSet.has(token)) {
            return true;
          }
          for (const type of typePriority) {
            if (tokenMatchesType(token, type)) {
              matchesByType[type].add(token);
              matchedTokenSet.add(token);
              highlightTokens.add(this.formatHighlightToken(literal.raw, 'literal'));
              return true;
            }
          }
          return false;
        });
      }

      if (!satisfied && literal.normalized) {
        satisfied = textSnippets.some((snippet) => snippet.includes(literal.normalized));
        if (satisfied) {
          highlightTokens.add(this.formatHighlightToken(literal.raw, 'literal'));
        }
      }

      if (satisfied) {
        literalHits += 1;
      } else {
        literalMisses += 1;
      }
    }

    const visualBoost = matchesByType.visual.size * 18;
    const textBoost = matchesByType.text.size * 15;
    const literalBonus = literalHits * 35;

    const visualMatches = matchesByType.visual.size;
    const keywordMatches = matchedTokenSet.size;

    const boost =
      visualBoost +
      textBoost +
      literalBonus;

    const unmatchedTokens = analysis.tokens.filter((token) => !matchedTokenSet.has(token));
    let tokenMissPenalty = 0;
    if (analysis.tokens.length > 0 && matchedTokenSet.size === 0) {
      tokenMissPenalty = Math.max(60, analysis.tokens.length * 15);
    } else if (unmatchedTokens.length > 0) {
      tokenMissPenalty = unmatchedTokens.length * 6;
    }

    if (analysis.hasVisualTraitIntent && visualMatches === 0) {
      tokenMissPenalty += Math.max(120, analysis.tokens.length * 20);
    }

    return {
      boost,
      highlights: Array.from(highlightTokens).slice(0, 4),
      literalMisses,
      tokenMissPenalty,
      visualMatches,
      keywordMatches,
    };
  }

  private async rerankCardCandidatesWithLLM(
    query: string,
    groups: CardFactGroup[]
  ): Promise<Map<string, { score: number; reason?: string }> | null> {
    const rerankFlag = process.env.CARD_TRAIT_RERANK_ENABLED;
    if (
      rerankFlag &&
      rerankFlag.toLowerCase() !== 'true' &&
      rerankFlag !== '1'
    ) {
      logger.debug('🤖 [CardDiscovery.LLM] Reranker explicitly disabled via CARD_TRAIT_RERANK_ENABLED flag');
      return null;
    }

    const maxCandidates = Math.max(
      1,
      parseInt(process.env.CARD_TRAIT_RERANK_TOPK || '30', 10)
    );
    const prepared: TraitRerankCandidate[] = [];

    for (const group of groups) {
      const descriptor = this.buildTraitCandidateDescriptor(group);
      if (!descriptor) continue;
      prepared.push({
        asset: descriptor.asset,
        name: descriptor.name,
        description: this.truncateForPrompt(descriptor.visualSummary, 340),
        textOnCard: descriptor.textOnCard,
        keywords: Array.from(
          new Set([...descriptor.visualKeywords, ...descriptor.textKeywords])
        ).slice(0, 10),
      });
      if (prepared.length >= maxCandidates) {
        break;
      }
    }

    const candidateList = prepared.map((c) => c.asset);
    logger.info(
      `🤖 [CardDiscovery.LLM] Preparing ${prepared.length} candidates for "${query}": ${candidateList.join(', ')}`
    );

    if (prepared.length === 0) {
      return null;
    }

    const payload = {
      question: query,
      candidates: prepared,
    };

    const systemInstructions =
      'You rank Fake Rare trading cards by how well they match a user request about visual traits.\n' +
      'Focus ONLY on appearance: objects, characters, colors, environment, mood, visible text.\n' +
      'Ignore supply, rarity, lore, and other metadata not seen on the card.\n' +
      'Return strict JSON: {"ranked":[{"asset":"...","score":0-1,"reason":"..."}]}.\n' +
      'Scores must be between 0 and 1. Use 0 when a candidate clearly does NOT match.\n' +
      'Keep reasons short (<=20 words) and reference the visible cues that match or miss.';

    const prompt =
      `${systemInstructions}\n\n` +
      `Input JSON:\n${JSON.stringify(payload, null, 2)}\n\n` +
      'Respond with JSON only.';

    const modelTypePref = (process.env.CARD_TRAIT_RERANK_MODEL_TYPE || 'TEXT_LARGE')
      .toUpperCase()
      .trim();
    const chosenModelType =
      modelTypePref === 'TEXT_SMALL' ? ModelType.TEXT_SMALL : ModelType.TEXT_LARGE;
    const defaultModel =
      chosenModelType === ModelType.TEXT_SMALL
        ? process.env.OPENAI_SMALL_MODEL || 'gpt-4o-mini'
        : process.env.OPENAI_LARGE_MODEL || 'gpt-4o';
    const modelName = process.env.CARD_TRAIT_RERANK_MODEL || defaultModel;
    const maxTokens = Math.max(
      200,
      parseInt(process.env.CARD_TRAIT_RERANK_MAX_TOKENS || '600', 10)
    );

    try {
      const result = await callTextModel(this.runtime, {
        model: modelName,
        prompt,
        maxTokens,
        temperature: 0.2,
        source: 'Card Trait Rerank',
      });

      const raw = result?.text ?? '';

      // Some deployments (e.g., prod) wrap the JSON in Markdown code fences or extra text.
      // We attempt to unwrap ``` fences first, then fall back to raw extraction.
      const stripCodeFence = (text: string): string => {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match && match[1]) {
          return match[1];
        }
        return text;
      };

      const cleaned = stripCodeFence(raw);
      const jsonText =
        this.extractJsonObject(cleaned) ??
        this.extractJsonObject(cleaned.replace(/^[^{]*\{/, '{')) ??
        this.extractJsonObject(cleaned.replace(/\}[^}]*$/, '}')) ??
        this.extractJsonObject(raw);
      if (!jsonText) {
        // Try heuristic extraction if the JSON is truncated but still contains asset/score pairs.
      const heuristicMatches = Array.from(
        cleaned.matchAll(
          /["']?asset["']?\s*[:=]\s*["']?\s*([^"'\n\r,}]+)\s*["']?[\s\S]*?["']?score["']?\s*[:=]\s*["']?\s*([0-9.]+)\s*["']?(?:[\s\S]*?["']?reason["']?\s*[:=]\s*["']?\s*([^"']*)["']?)?/gi
        )
      );
        if (heuristicMatches.length > 0) {
          const heuristicMap = new Map<string, { score: number; reason?: string }>();
        for (const [, assetRaw, scoreRaw, reasonRaw] of heuristicMatches) {
            if (!assetRaw) continue;
          const normalizedAsset = assetRaw.replace(/["'\s]/g, '').toUpperCase();
          if (!normalizedAsset) continue;
          const score = parseFloat(scoreRaw ?? '');
            if (!Number.isFinite(score)) continue;
          heuristicMap.set(normalizedAsset, {
              score: Math.max(0, Math.min(1, score)),
              reason: reasonRaw?.trim() || 'Heuristic parse (truncated JSON)',
            });
          }
          if (heuristicMap.size > 0) {
            logger.warn({
              msg: '[CardTraitRerank] Heuristic parse used (JSON truncated)',
              extracted: Array.from(heuristicMap.entries()).map(([asset, { score }]) => `${asset}:${score}`),
            });
            return heuristicMap;
          }
        }

        logger.warn({
          msg: '[CardTraitRerank] Unable to parse LLM response',
          raw,
        });
        if (process.env.FALLBACK_CARD_TRAIT_ASSET) {
          const asset = process.env.FALLBACK_CARD_TRAIT_ASSET.toUpperCase();
          const fallbackMap = new Map<string, { score: number; reason?: string }>();
          fallbackMap.set(asset, { score: 1, reason: 'Fallback asset due to parse failure' });
          return fallbackMap;
        }
        return null;
      }

      logger.debug(
        `🤖 [CardDiscovery.LLM] Raw response for "${query}": ${this.truncateForPrompt(
          jsonText,
          500
        )}`
      );

      const parsed = JSON.parse(jsonText) as {
        ranked?: Array<{ asset: string; score?: number; reason?: string }>;
      };

      if (!Array.isArray(parsed.ranked)) {
        return null;
      }

      const map = new Map<string, { score: number; reason?: string }>();
      for (const entry of parsed.ranked) {
        if (!entry || typeof entry.asset !== 'string') continue;
        const score =
          typeof entry.score === 'number'
            ? entry.score
            : parseFloat(String(entry.score));
        if (!Number.isFinite(score)) continue;
        const normalizedScore = Math.max(0, Math.min(1, score));
        const reason =
          typeof entry.reason === 'string' ? entry.reason.trim() : undefined;
        map.set(entry.asset.toUpperCase(), { score: normalizedScore, reason });
      }

      return map.size > 0 ? map : null;
    } catch (err) {
      logger.warn({ err, msg: '[CardTraitRerank] LLM rerank failed' });
      return null;
    }
  }

  private buildTraitCandidateDescriptor(group: CardFactGroup): TraitCandidateDescriptor | null {
    const descriptor: TraitCandidateDescriptor = {
      asset: group.asset,
      name: group.asset,
      visualSummary: '',
      textOnCard: [],
      visualKeywords: [],
      textKeywords: [],
    };

    for (const passage of group.passages) {
      const metadata = passage.metadata ?? {};
      if (!descriptor.visualSummary && typeof (metadata as any).visualSummaryShort === 'string') {
        descriptor.visualSummary = ((metadata as any).visualSummaryShort as string).trim();
      } else if (
        !descriptor.visualSummary &&
        typeof (metadata as any).visualSummary === 'string'
      ) {
        descriptor.visualSummary = ((metadata as any).visualSummary as string).trim();
      }

      if (Array.isArray((metadata as any).textOnCard)) {
        (metadata as any).textOnCard.forEach((line: any) => {
          if (typeof line === 'string' && line.trim().length > 0) {
            descriptor.textOnCard.push(line.trim());
          }
        });
      }

      if (Array.isArray((metadata as any).visualKeywords)) {
        (metadata as any).visualKeywords.forEach((kw: any) => {
          if (typeof kw === 'string' && kw.trim().length > 0) {
            descriptor.visualKeywords.push(kw.trim());
          }
        });
      }

      if (Array.isArray((metadata as any).textKeywords)) {
        (metadata as any).textKeywords.forEach((kw: any) => {
          if (typeof kw === 'string' && kw.trim().length > 0) {
            descriptor.textKeywords.push(kw.trim());
          }
        });
      }
    }

    if (!descriptor.visualSummary) {
      const visualPassage = group.passages.find((p) => p.cardBlockType === 'visual');
      if (visualPassage) {
        descriptor.visualSummary = this.normalizeCardFactText(visualPassage);
      }
    }

    descriptor.visualSummary = descriptor.visualSummary.trim();
    descriptor.textOnCard = Array.from(new Set(descriptor.textOnCard)).slice(0, 4);
    descriptor.visualKeywords = Array.from(new Set(descriptor.visualKeywords)).slice(0, 10);
    descriptor.textKeywords = Array.from(new Set(descriptor.textKeywords)).slice(0, 10);

    if (!descriptor.visualSummary && descriptor.textOnCard.length === 0) {
      return null;
    }

    return descriptor;
  }

  private extractJsonObject(text: string): string | null {
    if (!text) return null;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    const candidate = text.slice(start, end + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      return null;
    }
  }

  private truncateForPrompt(text: string, maxLength: number): string {
    const trimmed = text.trim();
    if (trimmed.length <= maxLength) return trimmed;
    return `${trimmed.slice(0, maxLength - 1).trim()}…`;
  }

  private formatHighlightToken(token: string, type?: CardBlockTypeKey | 'literal'): string {
    const trimmed = token.trim();
    if (!trimmed) return trimmed;
    const display =
      trimmed.length <= 4
        ? trimmed.toUpperCase()
        : trimmed.replace(/\b\w/g, (char) => char.toUpperCase());

    const label = (() => {
      switch (type) {
        case 'visual':
          return 'Visual';
        case 'text':
          return 'On-card';
        case 'memetic':
          return 'Memetic';
        case 'combined':
          return 'Summary';
        case 'raw':
          return 'Analysis';
        case 'literal':
          return 'Literal';
        case 'other':
        case 'unknown':
        default:
          return null;
      }
    })();

    return label ? `${label}: ${display}` : display;
  }

  private mergeKeywordMaps(target: KeywordMap, source?: KeywordMap): void {
    if (!source) return;
    for (const key of Object.keys(source) as CardBlockTypeKey[]) {
      const values = source[key];
      if (!values) continue;
      if (!target[key]) {
        target[key] = new Set<string>();
      }
      values.forEach((value) => target[key]!.add(value));
    }
  }

  private cloneKeywordMap(source?: KeywordMap): KeywordMap {
    const clone: KeywordMap = {};
    if (!source) return clone;
    for (const key of Object.keys(source) as CardBlockTypeKey[]) {
      const values = source[key];
      if (values && values.size > 0) {
        clone[key] = new Set(values);
      }
    }
    return clone;
  }

  private createSnippetMap(type: CardBlockTypeKey, snippet?: string): SnippetMap {
    const map: SnippetMap = {};
    if (snippet && this.isVisualOrText(type)) {
      map[type] = [snippet];
    }
    return map;
  }

  private addSnippetToMap(target: SnippetMap, type: CardBlockTypeKey, snippet: string): void {
    if (!this.isVisualOrText(type)) return;
    if (!snippet) return;
    if (!target[type]) {
      target[type] = [];
    }
    if (!target[type]!.includes(snippet)) {
      target[type]!.push(snippet);
    }
  }

  private tokenizePhrase(phrase: string): string[] {
    return phrase
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
  }

  private normalizeSearchToken(token: string): string | null {
    if (!token) return null;
    let normalized = token
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    if (!normalized) return null;
    normalized = this.simpleStem(normalized);

    if (normalized.length < 3) return null;
    if (KnowledgeOrchestratorService.CARD_QUERY_STOP_WORDS.has(normalized)) return null;
    return normalized;
  }

  private simpleStem(token: string): string {
    let result = token;

    if (result.endsWith('iest') && result.length > 5) {
      result = result.slice(0, -4) + 'y';
    } else if (result.endsWith('ies') && result.length > 4) {
      result = result.slice(0, -3) + 'y';
    } else if (result.endsWith('ing') && result.length > 5) {
      result = result.slice(0, -3);
    } else if (result.endsWith('ers') && result.length > 5) {
      result = result.slice(0, -3);
    } else if (result.endsWith('er') && result.length > 4) {
      result = result.slice(0, -2);
    } else if (result.endsWith('est') && result.length > 4) {
      result = result.slice(0, -3);
    } else if (result.endsWith('ed') && result.length > 4) {
      result = result.slice(0, -2);
    } else if (result.endsWith('es') && result.length > 4) {
      result = result.slice(0, -2);
    } else if (result.endsWith('s') && result.length > 4) {
      result = result.slice(0, -1);
    }

    return result;
  }

  private normalizeLiteralPhrase(phrase: string): string {
    return phrase
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private includesToken(snippets: string[] | undefined, token: string): boolean {
    if (!snippets || snippets.length === 0) return false;
    return snippets.some((snippet) => snippet.includes(token));
  }

  private getBlockTypeKey(type?: RetrievedPassage['cardBlockType']): CardBlockTypeKey {
    switch (type) {
      case 'visual':
      case 'text':
      case 'memetic':
      case 'combined':
      case 'raw':
      case 'other':
        return type;
      default:
        return 'unknown';
    }
  }

  private isVisualOrText(type: CardBlockTypeKey): type is 'visual' | 'text' {
    return type === 'visual' || type === 'text';
  }

  private truncateSnippet(text: string, maxLength = 180): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1).trimEnd() + '…';
  }

  private buildCardReason(group: CardFactGroup, includeAsset: boolean): string {
    const prefix = includeAsset ? `**${group.asset}** ` : '';

    if (group.llmReason && group.llmReason.trim().length > 0) {
      const reason = this.removeCardAnnotations(group.llmReason.trim());
      if (reason) {
        return `${prefix}${reason.endsWith('.') ? reason : `${reason}.`}`;
      }
    }

    const snippet =
      this.extractSnippetFromGroup(group, [
        'visual',
        'memetic',
        'combined',
        'raw',
        'text',
      ]) || 'it nails the vibe you described.';

    const trimmed = this.truncateSnippet(this.removeCardAnnotations(snippet).trim());
    const ensured = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
    const lowered = ensured.charAt(0).toLowerCase() + ensured.slice(1);
    const highlightSuffix =
      group.matchHighlights && group.matchHighlights.length > 0
        ? ` It hits your cues: ${group.matchHighlights.join(', ')}.`
        : '';
    const combined = `${prefix}${lowered}${highlightSuffix}`.trim();
    return combined || `${prefix}Fits what you asked for.`;
  }

  private removeCardAnnotations(text: string): string {
    return text
      .replace(/\*\*/g, '')
      .replace(/\[CARD:[^\]]+\]/gi, '')
      .replace(/\[CARDFACT:[^\]]+\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatCardMeta(passage: RetrievedPassage): string {
    const metadata = passage.metadata || {};
    const parts: string[] = [];

    if (metadata.series !== undefined && metadata.series !== null) {
      const series = typeof metadata.series === 'number' ? metadata.series : parseInt(metadata.series, 10);
      if (!Number.isNaN(series)) {
        parts.push(`Series ${series}`);
      }
    }

    if (metadata.cardNumber !== undefined && metadata.cardNumber !== null) {
      const cardNumber = typeof metadata.cardNumber === 'number' ? metadata.cardNumber : parseInt(metadata.cardNumber, 10);
      if (!Number.isNaN(cardNumber)) {
        parts.push(`Card ${cardNumber}`);
      }
    }

    if (metadata.artist) {
      parts.push(`by ${metadata.artist}`);
    }

    if (metadata.collection && !parts.includes(metadata.collection)) {
      parts.unshift(metadata.collection);
    }

    return parts.join(' • ');
  }

  private extractSnippetFromGroup(
    group: CardFactGroup,
    preferredTypes: Array<RetrievedPassage['cardBlockType']>
  ): string | null {
    for (const type of preferredTypes) {
      const passage = group.passages.find(
        (p) => p.cardBlockType === type && this.normalizeCardFactText(p).length > 0
      );
      if (passage) {
        return this.normalizeCardFactText(passage);
      }
    }

    const bestNormalized = this.normalizeCardFactText(group.best);
    return bestNormalized || null;
  }

  private detectPrimaryCardAsset(query: string): string | undefined {
    const words = query.match(/\b[A-Za-z]{3,}[A-Za-z0-9]*\b/g) || [];
    const lower = query.toLowerCase();
    // Avoid card detection for global policy/FAQ questions
    const globalFactTerms = ['submission', 'rules', 'requirements', 'fee', 'fees', 'cost', 'price', 'format', 'size', 'spec', 'specs', 'guide'];
    if (globalFactTerms.some(t => lower.includes(t))) {
      return undefined;
    }

    for (const word of words) {
      const upper = word.toUpperCase();
      if (isInFullIndex(upper)) {
        return upper;
      }
    }

    return undefined;
  }

  private isMatchingWikiOrMemory(
    passage: RetrievedPassage,
    targetAsset?: string
  ): boolean {
    if (!(passage.sourceType === 'memory' || passage.sourceType === 'wiki')) {
      return false;
    }

    if (!targetAsset) {
      return true;
    }

    return this.passageMatchesCard(passage, targetAsset);
  }

  private passageMatchesCard(
    passage: RetrievedPassage,
    asset: string
  ): boolean {
    const upperAsset = asset.toUpperCase();
    const normalize = (value?: string | null) =>
      typeof value === 'string' ? value.toUpperCase() : undefined;

    if (normalize(passage.cardAsset) === upperAsset) {
      return true;
    }

    const sourceRef = normalize(passage.sourceRef);
    if (sourceRef === upperAsset) {
      return true;
    }

    if (sourceRef?.startsWith('CARD:')) {
      const refAsset = sourceRef.slice(5);
      if (refAsset === upperAsset) {
        return true;
      }
    }

    const metadata = passage.metadata ?? {};
    const metaCandidates = [
      normalize((metadata as any).asset),
      normalize((metadata as any).cardAsset),
      normalize((metadata as any).card),
      normalize((metadata as any).cardName),
    ];

    if (metaCandidates.some((value) => value === upperAsset)) {
      return true;
    }

    const keywords = (metadata as any).keywords;
    if (
      Array.isArray(keywords) &&
      keywords.some((kw) => normalize(kw) === upperAsset)
    ) {
      return true;
    }

    const text = passage.text || '';
    if (text.includes(`[CARD:${upperAsset}]`)) {
      return true;
    }

    const escapedAsset = upperAsset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedAsset}\\b`, 'i');
    if (regex.test(text)) {
      return true;
    }

    return false;
  }

  private tryAnswerCardMetadata(
    query: string,
    primaryCardAsset: string | undefined,
    startTime: number,
    rawPassagesCount: number,
    topPassageCount: number
  ): KnowledgeRetrievalResult | null {
    if (!primaryCardAsset) return null;
    const isSupplyQuestion = /\b(supply|issuance|mint(?:ed)?|mint\s+count|copies|how many|how much)\b/i.test(query);
    if (!isSupplyQuestion) return null;

    const info = getCardInfo(primaryCardAsset);
    if (!info) return null;

    const parts: string[] = [];
    if (typeof info.supply !== 'undefined') {
      parts.push(`${primaryCardAsset} supply: ${info.supply}`);
    }
    if (typeof info.series === 'number' && typeof info.card === 'number') {
      parts.push(`Series ${info.series} • Card ${info.card}`);
    } else if (typeof info.series === 'number') {
      parts.push(`Series ${info.series}`);
    }
    if (info.artist) {
      parts.push(`by ${info.artist}`);
    }
    if (info.issuance) {
      parts.push(`Issued ${info.issuance}`);
    }

    if (parts.length === 0) {
      return null;
    }

    const story = parts.join(' | ');
    const latencyMs = Date.now() - startTime;
    return {
      story,
      sourcesLine: '',
      hasWikiOrMemory: false,
      metrics: {
        query,
        hits_raw: rawPassagesCount,
        hits_used: topPassageCount,
        clusters: 0,
        latency_ms: latencyMs,
        story_words: story.split(/\s+/).length,
      },
    };
  }

  private normalizeCardSummary(
    summary: string | null | undefined,
    fallbackReason: string,
    group: CardFactGroup | undefined,
    _query: string
  ): string {
    const trimmed = (summary || '').trim();
    if (!trimmed || /no factual data available yet/i.test(trimmed)) {
      const snippet = group
        ? this.extractSnippetFromGroup(group, ['text', 'combined', 'memetic', 'visual'])
        : null;
      if (snippet) {
        return `Not sure about that detail, but here is what stands out about ${group?.asset}: ${snippet}`;
      }
      return fallbackReason || `Not sure about that detail, but here is what I can share about ${group?.asset || 'this card'}.`;
    }
    return trimmed;
  }
}

type CardBlockTypeKey =
  | 'visual'
  | 'text'
  | 'memetic'
  | 'combined'
  | 'raw'
  | 'other'
  | 'unknown';

type KeywordMap = Partial<Record<CardBlockTypeKey, Set<string>>>;

type SnippetMap = Partial<Record<CardBlockTypeKey, string[]>>;

interface CollectedPassageKeywords {
  all: Set<string>;
  byType: KeywordMap;
}

interface CardLiteralTerm {
  raw: string;
  normalized: string;
  tokens: string[];
}

interface CardQueryAnalysis {
  tokens: string[];
  literalTerms: CardLiteralTerm[];
  hasVisualTraitIntent: boolean;
}

interface CardFactGroup {
  asset: string;
  passages: RetrievedPassage[];
  best: RetrievedPassage;
  score: number;
  heuristicScore?: number;
  llmScore?: number;
  llmReason?: string;
  rerankSource?: 'llm' | 'heuristic';
  keywordSet: Set<string>;
  keywordSetByType: KeywordMap;
  textSnippets: string[];
  textSnippetsByType: SnippetMap;
  matchHighlights?: string[];
  literalSatisfied?: boolean;
  totalKeywordMatches?: number;
  literalMisses?: number;
  tokenPenalty?: number;
  visualMatches?: number;
}

interface TraitCandidateDescriptor {
  asset: string;
  name: string;
  visualSummary: string;
  textOnCard: string[];
  visualKeywords: string[];
  textKeywords: string[];
}

interface TraitRerankCandidate {
  asset: string;
  name: string;
  description: string;
  textOnCard: string[];
  keywords: string[];
}
