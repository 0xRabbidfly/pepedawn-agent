import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State } from '@elizaos/core';
import { searchKnowledgeWithExpansion, selectDiversePassages, expandQuery } from '../utils/loreRetrieval';
import { clusterAndSummarize, formatSourcesLine, formatCompactCitation } from '../utils/loreSummarize';
import { generatePersonaStory } from '../utils/storyComposer';
import { filterOutRecentlyUsed, markIdAsRecentlyUsed } from '../utils/lru';
import { LORE_CONFIG } from '../utils/loreConfig';
import { setCallContext, clearCallContext } from '../utils/tokenLogger';

/**
 * /fl command - LLM-LORE: Knowledge-backed lore with RAG, clustering, and historian recounting
 * Usage: /fl <topic or card name or question>
 * 
 * Pipeline:
 * 1. Parse query and expand with synonyms
 * 2. Retrieve passages from vector KB (with fallback expansion)
 * 3. Apply MMR for diversity
 * 4. Cluster and summarize with citations
 * 5. Generate historian-style lore recounting (80-120 words)
 * 6. Format with compact sources line
 */
export const loreCommand: Action = {
  name: 'LORE_COMMAND',
  description: 'Handles /fl command to return knowledge-backed lore with persona storytelling',
  similes: ['LORE', 'KNOWLEDGE'],
  examples: [],

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.trim().toLowerCase() || '';
    return text.startsWith('/fl');
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback
  ) => {
    const startTime = Date.now();
    const raw = message.content.text || '';
    const query = raw.replace(/^\s*\/fl\s*/i, '').trim() || 'Fake Rares lore history community';

    console.log(`\n🔍 [LORE] Query: "${query}"`);
    console.log('='  .repeat(60));

    try {
      // STEP 1: Query expansion
      const expandedQuery = expandQuery(query);
      console.log(`📝 Expanded query: "${expandedQuery}"`);

      // STEP 2: Retrieve passages (with automatic fallback expansion)
      const passages = await searchKnowledgeWithExpansion(
        runtime,
        expandedQuery,
        message.roomId
      );

      console.log(`📚 Retrieved ${passages.length} passages`);
      
      // Source type breakdown for debugging
      const sourceBreakdown = passages.reduce((acc, p) => {
        const type = p.sourceType === 'telegram' ? 'tg' : 
                     p.sourceType === 'wiki' ? 'wiki' :
                     p.sourceType === 'memory' ? 'Mem' : 'other';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`📊 Sources: ${JSON.stringify(sourceBreakdown)}`);

      if (passages.length === 0) {
        const fallbackMsg = `Hmm, couldn't find any lore on "${query}". Try asking about:\n• Rare Scrilla\n• FREEDOMKEK\n• La Faka Nostra\n• Specific card names\n\nOr just ask me to tell you about Fake Rares in general! 🐸`;
        
        if (callback) await callback({ text: fallbackMsg });
        return { success: true, text: 'No results found' };
      }

      // STEP 3: Apply MMR for diversity and filter recently used
      const passageIds = passages.map(p => p.id);
      const filteredIds = filterOutRecentlyUsed(message.roomId, passageIds);
      
      // Prefer passages that haven't been shown recently
      let candidatePassages = passages;
      if (filteredIds.length >= LORE_CONFIG.MIN_HITS) {
        candidatePassages = passages.filter(p => filteredIds.includes(p.id));
        console.log(`🔄 Filtered to ${candidatePassages.length} fresh passages`);
      }

      const topK = Math.min(LORE_CONFIG.TOP_K_FOR_CLUSTERING, candidatePassages.length);
      const topPassages = candidatePassages.slice(0, topK);
      
      const diversePassages = selectDiversePassages(
        topPassages,
        Math.min(LORE_CONFIG.CLUSTER_TARGET_MAX * 2, topK)
      );
      
      console.log(`🎯 Selected ${diversePassages.length} diverse passages via MMR`);

      // Mark passages as recently used
      diversePassages.forEach(p => markIdAsRecentlyUsed(message.roomId, p.id));

      // STEP 4: Different flow for FACTS vs LORE
      setCallContext('Lore calls'); // Set context for all lore operations
      
      // Classify query type
      const { classifyQuery } = await import('../utils/queryClassifier');
      const queryType = classifyQuery(query);
      console.log(`🎯 Query type: ${queryType}`);
      
      let story: string;
      let sourcesLine: string;
      let clusterCount = 0;
      
      if (queryType === 'FACTS') {
        // FACTS mode: Take top wiki and memory passages and send directly to LLM (no clustering/summarization)
        console.log('📋 FACTS mode: Using top wiki and memory passages directly');
        
        // Filter to wiki and memory sources only (prioritize authoritative sources) and take top 5
        const factsPassages = diversePassages.filter(p => p.sourceType === 'wiki' || p.sourceType === 'memory').slice(0, 5);
        
        if (factsPassages.length === 0) {
          // Fallback to any source if no wiki or memory
          const topPassages = diversePassages.slice(0, 5);
          story = await generatePersonaStory(runtime, query, [{
            id: 'direct',
            passageRefs: topPassages.map(p => p.id),
            summary: topPassages.map(p => p.text).join('\n\n'),
            citations: topPassages.map(p => formatCompactCitation(p))
          }]);
          sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' : 
            `\n\nSources:  ${topPassages.map(p => formatCompactCitation(p)).join('  ||  ')}`;
          clusterCount = 1; // Single direct passage cluster
        } else {
          // Use wiki and memory passages directly
          story = await generatePersonaStory(runtime, query, [{
            id: 'facts',
            passageRefs: factsPassages.map(p => p.id),
            summary: factsPassages.map(p => p.text).join('\n\n'),
            citations: factsPassages.map(p => formatCompactCitation(p))
          }]);
          sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' : 
            `\n\nSources:  ${factsPassages.map(p => formatCompactCitation(p)).join('  ||  ')}`;
          clusterCount = 1; // Single facts cluster (wiki + memories)
        }
        console.log(`📋 Sent ${factsPassages.length || diversePassages.slice(0, 5).length} passages directly (no clustering)`);
      } else {
        // LORE mode: Use full clustering and summarization pipeline
        console.log('📖 LORE mode: Using clustering and summarization');
        const summaries = await clusterAndSummarize(runtime, diversePassages, query);
        clusterCount = summaries.length;
        console.log(`📊 Generated ${summaries.length} cluster summaries`);
        
        story = await generatePersonaStory(runtime, query, summaries);
        sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' : formatSourcesLine(summaries);
      }
      
      console.log(`✍️  Generated story (${story.split(/\s+/).length} words)`);
      clearCallContext(); // Clear after lore flow complete

      // STEP 6: Format with sources
      let finalMessage = story + sourcesLine;

      // Truncate if needed (Telegram limit)
      if (finalMessage.length > LORE_CONFIG.TELEGRAM_MAX_LENGTH) {
        const truncatePoint = LORE_CONFIG.TELEGRAM_MAX_LENGTH - 50;
        finalMessage = finalMessage.slice(0, truncatePoint) + '...\n\n(continued in next message)';
        console.log(`⚠️  Truncated message to ${finalMessage.length} chars`);
      }

      // STEP 7: Log observability metrics
      const latencyMs = Date.now() - startTime;
      console.log(`\n📈 [METRICS]`);
      console.log(`   Query: "${query}"`);
      console.log(`   Hits raw: ${passages.length}`);
      console.log(`   Hits used: ${diversePassages.length}`);
      console.log(`   Clusters: ${clusterCount}`);
      console.log(`   Latency: ${latencyMs}ms`);
      console.log(`   Story length: ${story.split(/\s+/).length} words`);
      console.log('='  .repeat(60) + '\n');

      // STEP 8: Send to user
      if (callback) {
        await callback({ text: finalMessage });
      }

      return { 
        success: true, 
        text: 'Lore sent',
        metrics: {
          query,
          hits_raw: passages.length,
          hits_used: diversePassages.length,
          clusters: clusterCount,
          latency_ms: latencyMs,
          story_words: story.split(/\s+/).length,
        }
      };

    } catch (err) {
      console.error('❌ [LORE ERROR]', err);
      
      const errorMsg = 'Bruh, something went wrong searching for that lore. Try again? 🐸';
      
      if (callback) await callback({ text: errorMsg });
      
      return { 
        success: false, 
        text: 'Lore error', 
        error: err as Error 
      };
    }
  },
};
