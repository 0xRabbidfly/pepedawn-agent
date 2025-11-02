import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State } from '@elizaos/core';
import { KnowledgeOrchestratorService } from '../services/KnowledgeOrchestratorService';
import { LORE_CONFIG } from '../utils/loreConfig';
import { createLogger } from '../utils/actionLogger';

const logger = createLogger("FakeLore");

/**
 * /fl command - LLM-LORE: Knowledge-backed lore with RAG, clustering, and historian recounting
 * Usage: /fl <topic or card name or question>
 * 
 * Pipeline:
 * 1. Parse query and expand with synonyms
 * 2. Retrieve passages from vector KB (with fallback expansion)
 * 3. Conditional selection:
 *    - FACTS: Top-k by relevance (preserves memories)
 *    - LORE: Apply MMR for diversity
 * 4. Cluster and summarize with citations
 * 5. Generate historian-style lore recounting (80-120 words)
 * 6. Format with compact sources line
 */

// Shared clarification message for uncertain/no-results queries
export const CLARIFICATION_MESSAGE = '🤔 Not sure what you\'re looking for. Try:\n\n' +
                                     '• `/fl CARDNAME` - Get card lore\n' +
                                     '• `/fl what is X` - Get facts\n' +
                                     '• `/fl tell me about Y` - Get stories';
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
    const query = raw.replace(/^\s*\/fl(?:@[A-Za-z0-9_]+)?\s*/i, '').trim() || 'Fake Rares lore history community';
    logger.info(`━━━━━ /fl ━━━━━ ${query}`);

    try {
      logger.info("   STEP 1/2: Validating query");
      
      // Pre-classify query to detect unclear/ambiguous requests
      const { classifyQuery } = await import('../utils/queryClassifier');
      const queryType = classifyQuery(query);
      
      if (queryType === 'UNCERTAIN') {
        logger.info(`   ⚠️  Query unclear - sending clarification`);
        
        if (callback) {
          await callback({ text: CLARIFICATION_MESSAGE });
        }
        
        return { 
          success: true, 
          text: 'Clarification sent for uncertain query'
        };
      }

      // Log this lore query (once per query, not per API call)
      const telemetry = runtime.getService('telemetry');
      if (telemetry && typeof (telemetry as any).logLoreQuery === 'function') {
        await (telemetry as any).logLoreQuery({
          timestamp: new Date().toISOString(),
          queryId: message.id,
          query,
          source: 'fl-command',
        });
      }
      
      logger.info("   STEP 2/2: Retrieving knowledge");
      
      // Get the KnowledgeOrchestratorService from runtime
      const knowledgeService = runtime.getService(
        KnowledgeOrchestratorService.serviceType
      ) as KnowledgeOrchestratorService;
      
      if (!knowledgeService) {
        throw new Error('KnowledgeOrchestratorService not available');
      }
      
      const result = await knowledgeService.retrieveKnowledge(query, message.roomId, {
        includeMetrics: true,
      });
      
      const wordCount = result.story.split(/\s+/).length;
      logger.info(`   /fl complete: ${result.metrics.hits_used} sources, ${wordCount} words, ${result.metrics.latency_ms}ms`);

      let finalMessage = result.story + result.sourcesLine;

      if (finalMessage.length > LORE_CONFIG.TELEGRAM_MAX_LENGTH) {
        const truncatePoint = LORE_CONFIG.TELEGRAM_MAX_LENGTH - 50;
        finalMessage = finalMessage.slice(0, truncatePoint) + '...\n\n(continued in next message)';
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
      logger.error(`   ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      
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
