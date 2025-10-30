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
 */

import { Service, type IAgentRuntime } from '@elizaos/core';
import { searchKnowledgeWithExpansion, selectDiversePassages, expandQuery } from '../utils/loreRetrieval';
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
    logger.debug('='.repeat(60));

    // STEP 1: Query expansion
    const expandedQuery = expandQuery(query);
    logger.debug(`📝 Expanded query: "${expandedQuery}"`);

    // STEP 2: Retrieve passages
    const passages = await searchKnowledgeWithExpansion(
      this.runtime,
      expandedQuery,
      roomId
    );

    logger.debug(`📚 Retrieved ${passages.length} passages`);
    
    const sourceBreakdown = passages.reduce((acc, p) => {
      const type = p.sourceType === 'telegram' ? 'tg' : 
                   p.sourceType === 'wiki' ? 'wiki' :
                   p.sourceType === 'memory' ? 'Mem' : 'other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    logger.debug(`📊 Sources: ${JSON.stringify(sourceBreakdown)}`);

    if (passages.length === 0) {
      logger.debug('⚠️  No passages found - returning clarification message');
      
      return {
        story: CLARIFICATION_MESSAGE,
        sourcesLine: '',
        metrics: {
          query,
          hits_raw: 0,
          hits_used: 0,
          clusters: 0,
          latency_ms: Date.now() - startTime,
          story_words: CLARIFICATION_MESSAGE.split(/\s+/).length,
        }
      };
    }

    // STEP 3: Apply MMR for diversity and filter recently used
    const passageIds = passages.map(p => p.id);
    const filteredIds = filterOutRecentlyUsed(roomId, passageIds);
    
    let candidatePassages = passages;
    if (filteredIds.length >= LORE_CONFIG.MIN_HITS) {
      candidatePassages = passages.filter(p => filteredIds.includes(p.id));
      logger.debug(`🔄 Filtered to ${candidatePassages.length} fresh passages`);
    }

    const topK = Math.min(LORE_CONFIG.TOP_K_FOR_CLUSTERING, candidatePassages.length);
    const topPassages = candidatePassages.slice(0, topK);
    
    // Check if top result is a card memory - if so, reduce passage count for emphasis
    const topPassage = topPassages[0];
    const hasCardMemory = topPassage?.sourceType === 'memory' && 
                          topPassage?.sourceRef?.startsWith('card:');
    
    // Reduce passages when card memory present (less dilution in clustering)
    const targetPassageCount = hasCardMemory ? 5 : LORE_CONFIG.CLUSTER_TARGET_MAX * 2;
    
    const diversePassages = selectDiversePassages(
      topPassages,
      Math.min(targetPassageCount, topK)
    );
    
    logger.debug(`🎯 Selected ${diversePassages.length} diverse passages via MMR${hasCardMemory ? ' (reduced for card memory emphasis)' : ''}`);

    diversePassages.forEach(p => markIdAsRecentlyUsed(roomId, p.id));

    // STEP 4: Classify or use provided mode
    const queryType = options?.mode || classifyQuery(query);
    logger.debug(`🎯 Query type: ${queryType}`);
    
    let story: string;
    let sourcesLine: string;
    let clusterCount = 0;
    
    if (queryType === 'FACTS') {
      logger.debug('📋 FACTS mode: Using top wiki and memory passages directly');
      
      const factsPassages = diversePassages.filter(p => p.sourceType === 'wiki' || p.sourceType === 'memory').slice(0, 5);
      
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
        logger.debug(`📊 Created 1 card cluster + ${otherClusters.length} other clusters`);
      } else {
        // No card memories, normal clustering
        summaries = await clusterAndSummarize(this.runtime, diversePassages, query);
        logger.debug(`📊 Generated ${summaries.length} cluster summaries`);
      }
      
      clusterCount = summaries.length;
      
      story = await generatePersonaStory(this.runtime, query, summaries);
      sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' : formatSourcesLine(summaries);
    }
    
    logger.debug(`✍️  Generated story (${story.split(/\s+/).length} words)`);

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

