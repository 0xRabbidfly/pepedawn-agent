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

export interface KnowledgeRetrievalOptions {
  mode?: 'FACTS' | 'LORE';
  includeMetrics?: boolean;
  preferCardFacts?: boolean;
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

    logger.debug(`\n🔍 [KNOWLEDGE] Query: "${query}"`);
    logger.info(`STEP 1/5: Expanding query`);
    logger.debug('='.repeat(60));

    // STEP 1: Query expansion
    const expandedQuery = expandQuery(query);
    logger.debug(`📝 Expanded query: "${expandedQuery}"`);

    logger.info(`STEP 2/5: Retrieving passages`);
    // STEP 2: Retrieve passages
    const passages = await searchKnowledgeWithExpansion(
      this.runtime,
      expandedQuery,
      roomId
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
    
    logger.info(`STEP 2/5: Retrieved ${passages.length} passages (${sourceStr})`);

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
    const cardFactPassages = passages.filter(
      (p) => p.sourceType === 'card-fact' && p.cardAsset
    );
    if (preferCardFacts) {
      const cardIntentResult = await this.composeCardFactAnswer(
        query,
        cardFactPassages,
        roomId,
        startTime
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
    } else if (!hasWikiOrMemoryPassages) {
      const cardFactResult = await this.composeCardFactAnswer(
        query,
        cardFactPassages,
        roomId,
        startTime
      );
      if (cardFactResult) {
        logger.info(`🃏 [KNOWLEDGE] Card discovery fired (no wiki/memory hits, ${cardFactPassages.length} card-fact passages)`);
        return cardFactResult;
      }
    } else if (cardFactPassages.length > 0) {
      logger.info(`🧠 [KNOWLEDGE] Wiki/memory hits found – skipping card discovery despite ${cardFactPassages.length} card-fact passages.`);
    }

    const queryType = options?.mode || classifyQuery(query);
    logger.info(`STEP 3/5: Selecting passages (${queryType === 'FACTS' ? 'by relevance' : 'MMR diversity'})`);
    
    // Filter recently used (but ALWAYS preserve memories)
    const passageIds = passages.map(p => p.id);
    const filteredIds = filterOutRecentlyUsed(roomId, passageIds);
    
    let candidatePassages = passages;
    if (filteredIds.length >= LORE_CONFIG.MIN_HITS) {
      // Apply LRU filter BUT preserve all memories (user-contributed facts are sacred)
      candidatePassages = passages.filter(p => 
        p.sourceType === 'memory' || filteredIds.includes(p.id)
      );
      const memCount = candidatePassages.filter(p => p.sourceType === 'memory').length;
      logger.debug(`🔄 Filtered to ${candidatePassages.length} fresh passages (${memCount} memories always included)`);
    }

    const topK = Math.min(LORE_CONFIG.TOP_K_FOR_CLUSTERING, candidatePassages.length);
    const topPassages = candidatePassages.slice(0, topK);
    
    // Check if top result is a card memory - if so, reduce passage count for emphasis
    const topPassage = topPassages[0];
    const hasCardMemory = topPassage?.sourceType === 'memory' && 
                          topPassage?.sourceRef?.startsWith('card:');
    
    // Determine target passage count
    const targetPassageCount = hasCardMemory ? 5 : LORE_CONFIG.CLUSTER_TARGET_MAX * 2;
    
    // CRITICAL: Only apply MMR for LORE mode (FACTS needs pure relevance)
    let diversePassages: RetrievedPassage[];
    if (queryType === 'FACTS') {
      // FACTS mode: Use top passages by relevance (no diversity)
      diversePassages = topPassages.slice(0, Math.min(targetPassageCount, topK));
      logger.debug(`📋 FACTS mode: Skipping MMR, using top ${diversePassages.length} by relevance`);
    } else {
      // LORE mode: Apply MMR for diversity
      diversePassages = selectDiversePassages(
        topPassages,
        Math.min(targetPassageCount, topK)
      );
      logger.debug(`📖 LORE mode: Applied MMR for diversity`);
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
    
    logger.info(`STEP 3/5: Selected ${diversePassages.length} passages (${postSelectionStr})`);

    diversePassages.forEach(p => markIdAsRecentlyUsed(roomId, p.id));

    logger.info(`STEP 4/5: Composing response for ${queryType} mode`);
    logger.info(`STEP 4/5: Mode = ${queryType} ${queryType === 'FACTS' ? '📋' : '📖'}`);
    
    let story: string;
    let sourcesLine: string;
    let clusterCount = 0;
    let hasWikiOrMemory = false;  // Track if wiki/memory sources were found (for silent ignore logic)
    
    if (queryType === 'FACTS') {
      logger.debug('📋 FACTS mode: Using top wiki and memory passages directly');
      
      // Special-case: direct supply question for a card -> deterministic answer
      const isSupplyQuestion =
        /\b(supply|how many|how much)\b/i.test(query) &&
        !!primaryCardAsset;
      if (isSupplyQuestion && primaryCardAsset) {
        const info = getCardInfo(primaryCardAsset);
        if (info && info.supply) {
          const parts: string[] = [`${primaryCardAsset} supply: ${info.supply}`];
          if (typeof info.series === 'number' && typeof info.card === 'number') {
            parts.push(`Series ${info.series} • Card ${info.card}`);
          } else if (typeof info.series === 'number') {
            parts.push(`Series ${info.series}`);
          }
          if (info.artist) {
            parts.push(`by ${info.artist}`);
          }
          story = parts.join(' | ');
          sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' : '';
          hasWikiOrMemory = false;
          logger.debug('📋 FACTS mode: Answered supply using fullCardIndex');
          const latencyMs = Date.now() - startTime;
          return {
            story,
            sourcesLine,
            hasWikiOrMemory,
            metrics: {
              query,
              hits_raw: passages.length,
              hits_used: diversePassages.length,
              clusters: 0,
              latency_ms: latencyMs,
              story_words: story.split(/\s+/).length,
            }
          };
        }
      }
      
      const factsPassages = diversePassages.filter(p => p.sourceType === 'wiki' || p.sourceType === 'memory').slice(0, 5);
      const factsBreakdown = factsPassages.reduce((acc, p) => {
        const type = p.sourceType === 'memory' ? 'mem' : 'wiki';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const factsStr = Object.entries(factsBreakdown).map(([t, c]) => `${c} ${t}`).join(', ');
      logger.info(`   → FACTS: Using ${factsPassages.length} passages (${factsStr})`);
      
      hasWikiOrMemory = factsPassages.length > 0;
      
      if (factsPassages.length === 0) {
        const topPassages = diversePassages.slice(0, 5);
        story = await generatePersonaStory(this.runtime, query, [{
          id: 'direct',
          passageRefs: topPassages.map(p => p.id),
          summary: topPassages.map(p => p.text).join('\n\n'),
          citations: topPassages.map(p => formatCompactCitation(p))
        }]);
        sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' : 
          `\n\nSources:  ${topPassages.map(p => formatCompactCitation(p)).join('  ||  ')}`;
        clusterCount = 1;
      } else {
        story = await generatePersonaStory(this.runtime, query, [{
          id: 'facts',
          passageRefs: factsPassages.map(p => p.id),
          summary: factsPassages.map(p => p.text).join('\n\n'),
          citations: factsPassages.map(p => formatCompactCitation(p))
        }]);
        sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' : 
          `\n\nSources:  ${factsPassages.map(p => formatCompactCitation(p)).join('  ||  ')}`;
        clusterCount = 1;
      }
      logger.debug(`📋 Sent ${factsPassages.length || diversePassages.slice(0, 5).length} passages directly (no clustering)`);
    } else {
      logger.debug('📖 LORE mode: Using clustering and summarization');
      
      // Separate card memories from other sources for dedicated treatment
      const cardMemories = diversePassages.filter(p => 
        p.sourceType === 'memory' && p.sourceRef?.startsWith('card:')
      );
      const otherPassages = diversePassages.filter(p => 
        !(p.sourceType === 'memory' && p.sourceRef?.startsWith('card:'))
      );
      
      let summaries: any[] = [];
      
      if (cardMemories.length > 0) {
        logger.debug(`🎨 Found ${cardMemories.length} card memories - creating dedicated cluster`);
        
        // Card memories get their own cluster with NO LLM summarization (preserve exact words)
        const cardCluster = {
          id: 'card-memories',
          passageRefs: cardMemories.map(p => p.id),
          summary: cardMemories.map(p => p.text).join('\n\n'), // Raw text
          citations: cardMemories.map(p => formatCompactCitation(p))
        };
        
        // Cluster the rest normally
        const otherClusters = otherPassages.length > 0 
          ? await clusterAndSummarize(this.runtime, otherPassages, query)
          : [];
        
        // Card cluster FIRST (highest prominence in story)
        summaries = [cardCluster, ...otherClusters];
        logger.info(`   → LORE: ${summaries.length} clusters (1 card + ${otherClusters.length} other)`);
      } else {
        // No card memories, normal clustering
        summaries = await clusterAndSummarize(this.runtime, diversePassages, query);
        logger.info(`   → LORE: ${summaries.length} clusters generated`);
      }
      
      clusterCount = summaries.length;
      
      story = await generatePersonaStory(this.runtime, query, summaries);
      sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' : formatSourcesLine(summaries);
    }
    
    // Robust fallback: if story is empty or too short (e.g., 1 word), synthesize from top passages
    const wordCount = (story || '').trim().split(/\s+/).filter(Boolean).length;
    if (!story || story.trim().length === 0 || wordCount < 4) {
      const take = (arr: RetrievedPassage[], n: number) => arr.slice(0, Math.max(0, n));
      const pickFacts = diversePassages.filter(p => p.sourceType === 'wiki' || p.sourceType === 'memory');
      const fallbackSet = (queryType === 'FACTS'
        ? (pickFacts.length > 0 ? take(pickFacts, 3) : take(diversePassages, 3))
        : take(diversePassages, 3));
      
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
    logger.info(`STEP 5/5: Story generated (${story.split(/\s+/).length} words)`);

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
    startTime: number
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
      const asset =
        passage.cardAsset ??
        (passage.sourceRef?.startsWith('card:')
          ? passage.sourceRef.slice(5)
          : undefined);
      if (!asset) continue;

      const normalizedAsset = asset.toUpperCase();
      const existing = groups.get(normalizedAsset);
      if (existing) {
        existing.passages.push(passage);
      } else {
        groups.set(normalizedAsset, {
          asset: normalizedAsset,
          passages: [passage],
          best: passage,
          score:
            (passage.cardBlockPriority ?? 0) * 10 + passage.score,
        });
      }
    }

    if (groups.size === 0) {
      return null;
    }

    const ranked = Array.from(groups.values())
      .map((group) => {
        const best = group.passages[0];
        const score =
          (best.cardBlockPriority ?? 0) * 10 + best.score;
        return { ...group, best, score };
      })
      .sort((a, b) => b.score - a.score);

    const limited = ranked.slice(0, Math.min(3, ranked.length));

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

    let selectedGroup = selectionPool[0];
    if (selectionPool.length > 1) {
      const randomIndex = Math.floor(Math.random() * selectionPool.length);
      selectedGroup = selectionPool[randomIndex];
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
      ? this.buildCardReason(topGroup)
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
        reason: this.buildCardReason(group),
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
      process.env.CARD_DISCOVERY_SUMMARY_MODEL || 'o3-mini';
    const prompt = `You match user questions to Fake Rares cards.
User question: "${query}"
Selected card: "${asset}"
Supporting details: "${evidence}"

Write ONE short sentence (max 20 words) telling the user why this card fits the request. Mention the card name.`;

    try {
      const result = await this.runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
        maxTokens: 60,
        temperature: 0.2,
        context: 'Card Discovery Summary',
        model: modelName,
      });

      const summary =
        typeof result === 'string'
          ? result
          : (result as any)?.text ??
            (result as any)?.toString?.() ??
            '';
      // Replace literal \n strings with actual newlines, then normalize whitespace
      const withNewlines = summary.replace(/\\n/g, '\n');
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

  private truncateSnippet(text: string, maxLength = 180): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1).trimEnd() + '…';
  }

  private buildCardReason(group: CardFactGroup): string {
    const snippet =
      this.extractSnippetFromGroup(group, [
        'visual',
        'memetic',
        'combined',
        'raw',
        'text',
      ]) || 'it nails the vibe you described.';

    const trimmed = this.truncateSnippet(snippet.replace(/\*\*/g, '').trim());
    const ensured = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
    const lowered = ensured.charAt(0).toLowerCase() + ensured.slice(1);
    return `**${group.asset}** fits because ${lowered}`;
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
}

interface CardFactGroup {
  asset: string;
  passages: RetrievedPassage[];
  best: RetrievedPassage;
  score: number;
}
