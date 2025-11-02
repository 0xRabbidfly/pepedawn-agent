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

import { Service, type IAgentRuntime, logger } from '@elizaos/core';
import { searchKnowledgeWithExpansion, selectDiversePassages, expandQuery, type RetrievedPassage } from '../utils/loreRetrieval';
import { clusterAndSummarize, formatSourcesLine, formatCompactCitation } from '../utils/loreSummarize';
import { generatePersonaStory } from '../utils/storyComposer';
import { filterOutRecentlyUsed, markIdAsRecentlyUsed } from '../utils/lru';
import { LORE_CONFIG } from '../utils/loreConfig';
import { classifyQuery } from '../utils/queryClassifier';
import { CLARIFICATION_MESSAGE } from '../actions/loreCommand';

export interface KnowledgeRetrievalOptions {
  mode?: 'FACTS' | 'LORE';
  includeMetrics?: boolean;
}

export interface KnowledgeRetrievalResult {
  story: string;
  sourcesLine: string;
  hasWikiOrMemory?: boolean;  // True if wiki/memory sources were found (for silent ignore logic)
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

    const sourceBreakdown = passages.reduce((acc, p) => {
      const type = p.sourceType === 'telegram' ? 'tg' : 
                   p.sourceType === 'wiki' ? 'wiki' :
                   p.sourceType === 'memory' ? 'mem' : 'other';
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
                   p.sourceType === 'memory' ? 'mem' : 'other';
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
}

