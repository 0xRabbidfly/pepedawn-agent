import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State } from '@elizaos/core';
import { KnowledgeOrchestratorService, type KnowledgeRetrievalOptions } from '../services/KnowledgeOrchestratorService';
import { LORE_CONFIG } from '../utils/loreConfig';
import { createLogger } from '../utils/actionLogger';
import { decodeEscapedNewlines } from '../utils/loreRetrieval';

const logger = createLogger("FakeLore");

const RANDOM_LORE_PROMPTS = [
  'FREEDOMKEK genesis lore',
  'Rare Scrilla origin story',
  'Fake Commons market drama',
  'purple subasset era highlights',
  'La Faka Nostra crew history',
  'FAKEASF burn saga',
  'Counterparty 2016 auction night',
  'X COPY Fake Rare submissions',
  'TCF OG chat moments',
  'Terry Trad vs Rare Pepe feud',
  'Nakamoto card myths',
  'PepeDawn early telegram logs',
  'Card 21 printing drama',
  'Remember this community captures',
  'Barter Town underground trades',
];

function pickRandomLorePrompt(): string {
  const idx = Math.floor(Math.random() * RANDOM_LORE_PROMPTS.length);
  return RANDOM_LORE_PROMPTS[idx] || 'Fake Rares lore highlights';
}

function sanitizeForTelegram(text: string): string {
  // Just return trimmed text - no escaping needed for plain text messages
  return (text || '').trim();
}

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
    const parsed = raw.replace(/^\s*\/fl(?:@[A-Za-z0-9_]+)?\s*/i, '').trim();
    const usedRandomSeed = parsed.length === 0;
    const query = usedRandomSeed ? pickRandomLorePrompt() : parsed;
    logger.info(`━━━━━ /fl ━━━━━ ${query}`);

    try {
      logger.info("   STEP 1/2: Validating query");
      
      // Check for empty/unclear queries (only for non-random seeds)
      if (!usedRandomSeed && (!query || query.trim().length === 0)) {
        logger.info(`   ⚠️  Query empty - sending clarification`);
        
        if (callback) {
          await callback({ text: CLARIFICATION_MESSAGE });
        }
        
        return { 
          success: true, 
          text: 'Clarification sent for empty query'
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
      
      const retrievalOptions: KnowledgeRetrievalOptions = {
        includeMetrics: true,
        suppressCardDiscovery: true,
        mode: 'LORE', // /fl is always for lore retrieval, regardless of query classification
      };

      const result = await knowledgeService.retrieveKnowledge(
        query,
        message.roomId,
        retrievalOptions
      );
      
      const wordCount = (result.story || '').split(/\s+/).filter(Boolean).length;
      logger.info(`   /fl complete: ${result.metrics.hits_used} sources, ${wordCount} words, ${result.metrics.latency_ms}ms`);

      // Build final message with robust fallbacks to avoid empty Telegram payloads
      let finalMessageRaw = '';
      const story = (result.story || '').trim();
      const sourcesLine = (result.sourcesLine || '').trim();
      
      if (story.length > 0) {
        finalMessageRaw = decodeEscapedNewlines(story + (sourcesLine ? sourcesLine : ''));
      } else if ((result as any)?.cardSummary) {
        // Card discovery path: use cardSummary and candidates
        const summary = ((result as any)?.cardSummary as string || '').trim();
        finalMessageRaw = summary;
      } else {
        // Last-resort clarification
        finalMessageRaw = CLARIFICATION_MESSAGE;
      }

      let finalMessage = sanitizeForTelegram(finalMessageRaw);

      if (finalMessage.length > LORE_CONFIG.TELEGRAM_MAX_LENGTH) {
        const truncatePoint = LORE_CONFIG.TELEGRAM_MAX_LENGTH - 50;
        finalMessage = finalMessage.slice(0, truncatePoint) + '...\n\n(continued in next message)';
      }

      if (callback) {
        // Guard: Telegram requires non-empty text
        await callback({ text: finalMessage && finalMessage.trim().length > 0 ? finalMessage : sanitizeForTelegram(CLARIFICATION_MESSAGE) });
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
