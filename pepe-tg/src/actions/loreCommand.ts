import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State } from '@elizaos/core';
import { searchKnowledgeWithExpansion, selectDiversePassages, expandQuery } from '../utils/loreRetrieval';
import { clusterAndSummarize, formatSourcesLine } from '../utils/loreSummarize';
import { generatePersonaStory } from '../utils/storyComposer';
import { filterOutRecentlyUsed, markIdAsRecentlyUsed } from '../utils/lru';
import { LORE_CONFIG } from '../utils/loreConfig';
import { setCallContext, clearCallContext } from '../utils/tokenLogger';

/**
 * /fl command - LLM-LORE: Knowledge-backed lore with RAG, clustering, and persona storytelling
 * Usage: /fl <topic or card name or question>
 * 
 * Pipeline:
 * 1. Parse query and expand with synonyms
 * 2. Retrieve passages from vector KB (with fallback expansion)
 * 3. Apply MMR for diversity
 * 4. Cluster and summarize with citations
 * 5. Generate persona-aligned story (120-180 words)
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

      // STEP 4: Cluster and summarize
      setCallContext('Lore calls'); // Set context for all lore operations
      const summaries = await clusterAndSummarize(runtime, diversePassages);
      console.log(`📊 Generated ${summaries.length} cluster summaries`);

      // STEP 5: Generate persona story
      const story = await generatePersonaStory(runtime, query, summaries);
      console.log(`✍️  Generated story (${story.split(/\s+/).length} words)`);
      
      clearCallContext(); // Clear after lore flow complete

      // STEP 6: Format with sources
      const sourcesLine = process.env.HIDE_LORE_SOURCES === 'true' ? '' : formatSourcesLine(summaries);
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
      console.log(`   Clusters: ${summaries.length}`);
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
          clusters: summaries.length,
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
