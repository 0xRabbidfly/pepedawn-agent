import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State } from '@elizaos/core';
import { retrieveKnowledge } from '../services/knowledgeService';
import { LORE_CONFIG } from '../utils/loreConfig';

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
    const raw = message.content.text || '';
    const query = raw.replace(/^\s*\/fl\s*/i, '').trim() || 'Fake Rares lore history community';

    // Pre-classify query to detect unclear/ambiguous requests
    const { classifyQuery } = await import('../utils/queryClassifier');
    const queryType = classifyQuery(query);
    
    if (queryType === 'UNCERTAIN') {
      console.log(`[LoreCommand] UNCERTAIN query - routing to AI conversation instead of knowledge retrieval`);
      // Don't mark as handled - let bootstrap/AI handle it naturally
      // This allows AI to ask clarifying questions or understand context
      return { 
        success: true, 
        text: 'Uncertain query routed to conversation',
        data: { queryType: 'UNCERTAIN', routedToConversation: true }
      };
    }

    try {
      const result = await retrieveKnowledge(runtime, query, message.roomId, {
        includeMetrics: true,
      });

      let finalMessage = result.story + result.sourcesLine;

      if (finalMessage.length > LORE_CONFIG.TELEGRAM_MAX_LENGTH) {
        const truncatePoint = LORE_CONFIG.TELEGRAM_MAX_LENGTH - 50;
        finalMessage = finalMessage.slice(0, truncatePoint) + '...\n\n(continued in next message)';
        console.log(`⚠️  Truncated message to ${finalMessage.length} chars`);
      }

      if (callback) {
        await callback({ text: finalMessage });
      }

      return { 
        success: true, 
        text: 'Lore sent',
        metrics: result.metrics,
      };

    } catch (err) {
      console.error('❌ [LORE ERROR]', err);
      
      const errorMsg = err instanceof Error && err.message === 'No knowledge found for query'
        ? `Hmm, couldn't find any lore on "${query}". Try asking about:\n• Rare Scrilla\n• FREEDOMKEK\n• La Faka Nostra\n• Specific card names\n\nOr just ask me to tell you about Fake Rares in general! 🐸`
        : 'Bruh, something went wrong searching for that lore. Try again? 🐸';
      
      if (callback) await callback({ text: errorMsg });
      
      return { 
        success: false, 
        text: 'Lore error', 
        error: err as Error 
      };
    }
  },
};
