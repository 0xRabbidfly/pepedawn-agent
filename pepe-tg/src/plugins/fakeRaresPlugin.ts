import { type Plugin, logger } from '@elizaos/core';
import { fakeRaresCardAction, educateNewcomerAction, startCommand, helpCommand, loreCommand, oddsCommand, costCommand, fakeVisualCommand, fakeTestCommand } from '../actions';
import { fakeMarketAction } from '../actions/fakeMarketAction';
import { fakeRaresContextProvider } from '../providers';
import { loreDetectorEvaluator } from '../evaluators';
import { KnowledgeOrchestratorService } from '../services/KnowledgeOrchestratorService';
import { MemoryStorageService } from '../services/MemoryStorageService';
import { TelemetryService } from '../services/TelemetryService';
import { FULL_CARD_INDEX } from '../data/fullCardIndex';
import { startAutoRefresh } from '../utils/cardIndexRefresher';
import { classifyQuery } from '../utils/queryClassifier';
import type { IAgentRuntime } from '@elizaos/core';

// Track patched runtimes to avoid double-patching
const patchedRuntimes = new WeakSet<any>();

/**
 * Patch runtime.useModel to track all LLM calls via TelemetryService
 * 
 * Why we need this: MODEL_USED event doesn't include params/result in payload,
 * making it impossible to calculate accurate token counts for cost tracking.
 * 
 * This intercepts runtime.useModel() calls and logs to TelemetryService.
 */
function patchRuntimeForTelemetry(runtime: IAgentRuntime): void {
  if (patchedRuntimes.has(runtime)) return;
  if (!runtime.useModel || typeof runtime.useModel !== 'function') return;
  
  patchedRuntimes.add(runtime);
  
  const originalUseModel = runtime.useModel.bind(runtime);
  (runtime as any).useModel = async function(modelType: any, params: any) {
    // Skip embeddings (tracked separately)
    if (modelType && (modelType.includes('EMBEDDING') || modelType === 'TEXT_EMBEDDING')) {
      return await originalUseModel(modelType, params);
    }
    
    const startTime = Date.now();
    const prompt = params?.prompt || params?.text || '';
    
    try {
      const result = await originalUseModel(modelType, params);
      const duration = Date.now() - startTime;
      
      // Get telemetry service
      const telemetry = runtime.getService('telemetry') as TelemetryService;
      
      if (telemetry) {
        const resultText = typeof result === 'string' 
          ? result 
          : (result as any)?.text || result?.toString?.() || '';
        
        const tokensIn = telemetry.estimateTokens(prompt);
        const tokensOut = telemetry.estimateTokens(resultText);
        
        // Determine model from env vars
        let model: string;
        if (modelType === 'TEXT_SMALL' || modelType?.includes?.('SMALL')) {
          model = process.env.OPENAI_SMALL_MODEL || 'gpt-4o-mini';
        } else if (modelType === 'TEXT_LARGE' || modelType?.includes?.('LARGE')) {
          model = process.env.OPENAI_LARGE_MODEL || 'gpt-4o';
        } else {
          model = process.env.TEXT_MODEL || 'gpt-4o-mini';
        }
        
        const cost = telemetry.calculateCost(model, tokensIn, tokensOut);
        
        await telemetry.logModelUsage({
          timestamp: new Date().toISOString(),
          model,
          tokensIn,
          tokensOut,
          cost,
          source: params?.context || 'Conversation',
          duration,
        });
      }
      
      return result;
    } catch (err) {
        logger.error({ error: err }, '[Runtime Patch] Model call error');
      throw err;
    }
  };
}

/**
 * Fake Rares Plugin - Bootstrap 1.6.2 Compatible
 * 
 * This plugin bridges the gap between Telegram (1.0.10) and Bootstrap (1.6.2).
 * Bootstrap 1.6.2 removed its MESSAGE_RECEIVED handler, so we provide one that:
 * 1. Manually executes /f commands (our custom action)
 * 2. Routes all other messages to runtime.messageService (bootstrap's new architecture)
 * 
 * Features:
 * - Auto-refreshes card index from GitHub every hour
 * - Zero-downtime updates when new cards are added
 */
export const fakeRaresPlugin: Plugin = {
  name: 'fake-rares',
  description: 'Fake Rares card display and community features with auto-updating index',
  // Ensure this plugin's MESSAGE_RECEIVED handler runs before bootstrap routing
  priority: 1000000,
  
  // Initialize auto-refresh on plugin load
  init: async () => {
    logger.info('\n🎴 Initializing Fake Rares Plugin...');
    logger.info(`📦 Loaded ${FULL_CARD_INDEX.length} cards from disk`);
    
    // Start auto-refresh from GitHub
    startAutoRefresh(FULL_CARD_INDEX);
    
    logger.info('✅ Fake Rares Plugin initialized\n');
  },
  
  actions: [
    startCommand,
    helpCommand,
    fakeRaresCardAction,
    fakeVisualCommand,
    fakeTestCommand,
    loreCommand,
    costCommand,
  ],
  
  providers: [fakeRaresContextProvider],
  evaluators: [],
  services: [KnowledgeOrchestratorService, MemoryStorageService, TelemetryService],
  
  events: {
    MESSAGE_RECEIVED: [
      async (params: any) => {
        try {
          const runtime = params.runtime;
          const message = params.message;
          
          // Patch runtime to track ALL AI calls for accurate token/cost tracking
          // MODEL_USED event doesn't provide params/result, so we need the monkey-patch
          patchRuntimeForTelemetry(runtime);
          
          const text = (params?.message?.content?.text ?? '').toString().trim();
          const globalSuppression = process.env.SUPPRESS_BOOTSTRAP === 'true';
          
          logger.info(`\n📩 TG Post: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}}"`);
          
          // 🚨 CRITICAL: Block FAKEASF burn messages BEFORE LLM sees them
          const mentionsFakeasf = /fakeasf/i.test(text);
          const mentionsBurn = /burn|burning/i.test(text);
          if (mentionsFakeasf && mentionsBurn) {
            logger.info('[FakeRaresPlugin] 🚨 BLOCKED FAKEASF BURN QUERY - responding without LLM');
            const callback = params.callback;
            if (callback) {
              await callback({
                text: "I can't help with FAKEASF destroying or burning, fam. There are strict sacred rules I'm not privy to. Connect with Scrilla or someone who knows the exact ritual.\n\nRead them carefully at https://wiki.pepe.wtf/chapter-2-the-rare-pepe-project/fake-rares-and-dank-rares/fake-rares-submission-rules",
                __fromAction: 'fakeasf_burn_blocker',
              });
            }
            // Mark as handled so bootstrap doesn't process it
            if (message.metadata) {
              message.metadata.__handledByCustom = true;
            }
            return;
          }
          
          // Pattern detection
          const isFCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+.+)?$/i.test(text);
          const isFvCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:\s|$)/i.test(text);
          const isFtCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/ft(?:\s|$)/i.test(text);
          const isLoreCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fl/i.test(text);
          const isFmCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fm(?:\s|$)/i.test(text);
          const isDawnCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/dawn$/i.test(text);
          const isHelpCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/help$/i.test(text);
          const isStartCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/start$/i.test(text);
          const isCostCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fc/i.test(text);
          const hasCapitalizedWord = /\b[A-Z]{3,}[A-Z0-9]*\b/.test(text); // 3+ caps (likely card names)
          const hasBotMention = /@pepedawn_bot/i.test(text);
          const isReplyToBot = params?.message?.content?.inReplyTo; // User replied to bot's message
          const hasRememberThis = /remember\s+this/i.test(text);
          
          // Log routing factors
          logger.info(`   Triggers: reply=${!!isReplyToBot} | CAPS=${hasCapitalizedWord} | @mention=${hasBotMention}`);

          logger.debug(`[FakeRaresPlugin] MESSAGE_RECEIVED text="${text}" isF=${isFCommand} isFv=${isFvCommand} isFt=${isFtCommand} isLore=${isLoreCommand} isFm=${isFmCommand} isDawn=${isDawnCommand} isHelp=${isHelpCommand} isStart=${isStartCommand} isCost=${isCostCommand} SUPPRESS_BOOTSTRAP=${globalSuppression}`);
          
          // === MEMORY CAPTURE: "remember this" ===
          if ((hasCapitalizedWord || isReplyToBot || hasBotMention) && hasRememberThis) {
            logger.debug('[FakeRaresPlugin] "remember this" detected → storing memory');
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            
            try {
              const memoryService = runtime.getService(
                MemoryStorageService.serviceType
              ) as MemoryStorageService;
              
              if (!memoryService) {
                throw new Error('MemoryStorageService not available');
              }
              
              const result = await memoryService.storeMemory(message, params.ctx?.message);
              
              if (result.success && !result.ignoredReason) {
                // Memory stored successfully
                if (actionCallback) {
                  await actionCallback({
                    text: 'storing the memory... to access this in the future ensure you use the /fl fake lore method'
                  });
                }
                // Mark as handled to prevent bootstrap processing
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                logger.debug('[FakeRaresPlugin] Memory stored successfully');
                return; // Done
              } else if (result.ignoredReason) {
                // Silent ignore (empty content, etc.)
                logger.debug(`[FakeRaresPlugin] Memory ignored: ${result.ignoredReason}`);
                // Don't respond, don't mark as handled, let flow continue
              } else if (result.error) {
                // Storage failed
                logger.error(`[FakeRaresPlugin] Memory storage failed: ${result.error}`);
                if (actionCallback) {
                  await actionCallback({
                    text: `❌ Failed to store memory: ${result.error}`
                  });
                }
                return; // Done (with error)
              }
            } catch (error) {
              logger.error('[FakeRaresPlugin] Memory storage exception:', error);
              // Continue to normal flow on exception
            }
          }
          
          // === CUSTOM ACTION: /f COMMANDS ===
          if (isFCommand) {
            logger.debug('[FakeRaresPlugin] /f detected → applying strong suppression and invoking action');
            // Strong suppression: route all subsequent callbacks to a no-op
            // Keep a reference to the original callback for our action only
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            params.callback = async () => [];
            
            if (fakeRaresCardAction.validate && fakeRaresCardAction.handler) {
              const isValid = await fakeRaresCardAction.validate(runtime, message);
              if (isValid) {
                await fakeRaresCardAction.handler(runtime, message, params.state, {}, actionCallback ?? undefined);
                // Mark as handled so platform can skip bootstrap/messageService
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                logger.debug('[FakeRaresPlugin] /f action completed');
                return; // Done
              }
            }
          }
          
          // === CUSTOM ACTION: /fv COMMANDS ===
          if (isFvCommand) {
            logger.debug('[FakeRaresPlugin] /fv detected → applying strong suppression and invoking action');
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            params.callback = async () => [];
            
            if (fakeVisualCommand.validate && fakeVisualCommand.handler) {
              const isValid = await fakeVisualCommand.validate(runtime, message);
              if (isValid) {
                await fakeVisualCommand.handler(runtime, message, params.state, {}, actionCallback ?? undefined);
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                logger.debug('[FakeRaresPlugin] /fv action completed');
                return; // Done
              }
            }
          }
          
          // === CUSTOM ACTION: /ft COMMANDS ===
          if (isFtCommand) {
            logger.debug('[FakeRaresPlugin] /ft detected → applying strong suppression and invoking action');
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            params.callback = async () => [];
            
            if (fakeTestCommand.validate && fakeTestCommand.handler) {
              const isValid = await fakeTestCommand.validate(runtime, message);
              if (isValid) {
                await fakeTestCommand.handler(runtime, message, params.state, {}, actionCallback ?? undefined);
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                logger.debug('[FakeRaresPlugin] /ft action completed');
                return; // Done
              }
            }
          }
          
          // === CUSTOM ACTION: /fl COMMANDS ===
          if (isLoreCommand) {
            // Apply the same suppression pattern as /f
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            params.callback = async () => [];

            if (loreCommand.validate && loreCommand.handler) {
              const isValid = await loreCommand.validate(runtime, message);
              if (isValid) {
                await loreCommand.handler(runtime, message, params.state, {}, actionCallback ?? undefined);
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                return; // Done
              }
            }
          }
          
          // === CUSTOM ACTION: /fm COMMANDS ===
          if (isFmCommand) {
            logger.debug('[FakeRaresPlugin] /fm detected → applying strong suppression and invoking action');
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            params.callback = async () => [];

            if (fakeMarketAction.validate && fakeMarketAction.handler) {
              const isValid = await fakeMarketAction.validate(runtime, message);
              if (isValid) {
                await fakeMarketAction.handler(runtime, message, params.state, {}, actionCallback ?? undefined);
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                logger.debug('[FakeRaresPlugin] /fm action completed');
                return; // Done
              }
            }
          }
          
          // === CUSTOM ACTION: /dawn COMMANDS ===
          if (isDawnCommand) {
            logger.debug('[FakeRaresPlugin] /dawn detected → applying strong suppression and invoking action');
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            params.callback = async () => [];

            if (oddsCommand.validate && oddsCommand.handler) {
              const isValid = await oddsCommand.validate(runtime, message);
              if (isValid) {
                await oddsCommand.handler(runtime, message, params.state, {}, actionCallback ?? undefined);
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                logger.debug('[FakeRaresPlugin] /dawn action completed');
                return; // Done
              } else {
                logger.debug('[FakeRaresPlugin] /dawn validation failed');
              }
            }
          }
          
          // === CUSTOM ACTION: /help COMMANDS ===
          if (isHelpCommand) {
            logger.debug('[FakeRaresPlugin] /help detected → applying strong suppression and invoking action');
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            params.callback = async () => [];

            if (helpCommand.validate && helpCommand.handler) {
              const isValid = await helpCommand.validate(runtime, message);
              if (isValid) {
                await helpCommand.handler(runtime, message, params.state, {}, actionCallback ?? undefined);
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                logger.debug('[FakeRaresPlugin] /help action completed');
                return; // Done - exit entire function
              } else {
                logger.debug('[FakeRaresPlugin] /help validation failed, but still marking as handled');
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                return; // Done - exit entire function
              }
            }
          }
          
          // === CUSTOM ACTION: /start COMMANDS ===
          if (isStartCommand) {
            logger.debug('[FakeRaresPlugin] /start detected → applying strong suppression and invoking action');
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            params.callback = async () => [];

            if (startCommand.validate && startCommand.handler) {
              const isValid = await startCommand.validate(runtime, message);
              if (isValid) {
                await startCommand.handler(runtime, message, params.state, {}, actionCallback ?? undefined);
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                logger.debug('[FakeRaresPlugin] /start action completed');
                return; // Done - exit entire function
              } else {
                logger.debug('[FakeRaresPlugin] /start validation failed, but still marking as handled');
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                return; // Done - exit entire function
              }
            }
          }
          
          // === CUSTOM ACTION: /fc COMMANDS (admin-only) ===
          if (isCostCommand) {
            logger.debug('[FakeRaresPlugin] /fc detected → applying strong suppression and invoking action');
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            params.callback = async () => [];

            if (costCommand.validate && costCommand.handler) {
              const isValid = await costCommand.validate(runtime, message);
              if (isValid) {
                await costCommand.handler(runtime, message, params.state, {}, actionCallback ?? undefined);
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                logger.debug('[FakeRaresPlugin] /fc action completed');
                return; // Done - exit entire function
              } else {
                logger.debug('[FakeRaresPlugin] /fc validation failed (not admin), suppressing');
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                return; // Done - exit entire function
              }
            }
          }
          
          // === AUTO-ROUTE FACTS QUESTIONS ===
          // Only auto-route actual questions, not statements/announcements or replies to other users
          const queryType = classifyQuery(text);
          logger.debug(`[FakeRaresPlugin] Query classification: ${queryType}`);
          
          // Skip auto-routing if this is a reply to another user (not the bot)
          // Replies to other users are conversation between humans, not questions for the bot
          const isReply = !!message.content?.inReplyTo;
          if (isReply) {
            // Try to determine if this is a reply to the bot or another user
            const rawMessage = params.ctx?.message;
            const replyToUserId = rawMessage?.reply_to_message?.from?.id;
            
            // Try to get bot ID from ctx or Telegram service
            let botUserId: number | undefined;
            if (params.ctx?.telegram?.bot?.botInfo?.id) {
              botUserId = params.ctx.telegram.bot.botInfo.id;
            } else if (params.ctx?.telegram?.bot?.me?.id) {
              botUserId = params.ctx.telegram.bot.me.id;
            } else {
              // Fallback: try to get Telegram service from runtime
              try {
                const telegramService = runtime.services?.find(
                  (s: any) => s.serviceType === 'telegram'
                );
                botUserId = telegramService?.bot?.botInfo?.id || telegramService?.bot?.me?.id;
              } catch (e) {
                // If we can't get bot ID, assume it's a reply to another user (safer default)
              }
            }
            
            // Skip auto-routing if:
            // 1. We can't determine who it's replying to, OR
            // 2. It's clearly replying to someone other than the bot
            if (!replyToUserId || !botUserId || replyToUserId !== botUserId) {
              logger.debug(`[FakeRaresPlugin] Skipping auto-routing - message is a reply ${replyToUserId && botUserId ? `to user ${replyToUserId} (not bot ${botUserId})` : '(unknown target)'}`);
              // IMPORTANT: Check global suppression before returning
              // If SUPPRESS_BOOTSTRAP=true, we need to mark as handled
              if (globalSuppression) {
                logger.debug('[FakeRaresPlugin] Global suppression active - marking reply as handled');
                message.metadata = message.metadata || {};
                (message.metadata as any).__handledByCustom = true;
                return;
              }
              // Otherwise, let it go to bootstrap for natural conversation handling
              return;
            }
            // If it IS a reply to the bot, continue with auto-routing check below
            logger.debug(`[FakeRaresPlugin] Message is a reply to bot, checking if it's a question`);
          }
          
          // Comprehensive question detection
          const isQuestion = 
            text.includes('?') ||  // Explicit question mark
            /^(what|how|when|where|who|why|can|do|does|is|are|will|should|could)\s/i.test(text) ||  // Question words
            /^(tell|show|explain|describe|list|give)\s+(me|us)\s+(about|the|how)/i.test(text) ||  // Imperative requests
            /\b(need to know|want to know|wondering|curious)\b/i.test(text);  // Indirect questions
          
          if (queryType === 'FACTS' && isQuestion) {
            logger.info(`   Decision: Auto-route to FACTS (detected question)`);
            logger.info(`\n━━━━━ /fl (auto-routed FACTS) ━━━━━ ${text}`);
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            params.callback = async () => [];
            
            try {
              const knowledgeService = runtime.getService(
                KnowledgeOrchestratorService.serviceType
              ) as KnowledgeOrchestratorService;
              
              if (!knowledgeService) {
                throw new Error('KnowledgeOrchestratorService not available');
              }
              
              const result = await knowledgeService.retrieveKnowledge(text, message.roomId, {
                mode: 'FACTS',
                includeMetrics: true,
              });
              
              const finalMessage = result.story + result.sourcesLine;
              
              if (actionCallback) {
                await actionCallback({ text: finalMessage });
              }
              
              logger.debug(`[FakeRaresPlugin] ✅ Auto-routed knowledge response sent`);
              logger.debug(`   Hits: ${result.metrics.hits_used}, Latency: ${result.metrics.latency_ms}ms`);
              
              try {
                message.metadata = message.metadata || {};
                (message.metadata as any).__handledByCustom = true;
              } catch {}
              
              return;
            } catch (err) {
              logger.error('[FakeRaresPlugin] ❌ Auto-route failed, falling back to conversation:', err);
              // Fall through to normal bootstrap flow
            }
          }
          
          // === BOOTSTRAP ROUTING ===
          // CLEAR LOGIC: Bootstrap replies ONLY when:
          // 1. Someone replied to the bot
          // 2. Someone used capitals (3+ letter word)
          // 3. Someone mentioned @pepedawn_bot
          // 4. NOT a FACTS query (already handled above)
          //
          // Otherwise, suppress bootstrap (mark as handled)
          
          const shouldAllowBootstrap = (isReplyToBot || hasCapitalizedWord || hasBotMention) && queryType !== 'FACTS';
          
          if (globalSuppression) {
            logger.info('   Decision: SUPPRESS all (SUPPRESS_BOOTSTRAP=true)');
            logger.debug('[Suppress] SUPPRESS_BOOTSTRAP=true → suppressing all bootstrap');
            message.metadata = message.metadata || {};
            (message.metadata as any).__handledByCustom = true;
            return;
          }
          
          if (shouldAllowBootstrap) {
            logger.info(`   Decision: ALLOW bootstrap (normal conversation)`);
            logger.debug(`[Allow] Bootstrap allowed: reply=${!!isReplyToBot} caps=${hasCapitalizedWord} mention=${hasBotMention} | "${text}"`);
            // Let bootstrap handle it - do NOT mark as handled
          } else {
            logger.info(`   Decision: SUPPRESS bootstrap (no trigger)`);
            logger.debug(`[Suppress] Bootstrap blocked (no trigger): "${text}"`);
            
            // CRITICAL: Strip image attachments to prevent Bootstrap from auto-analyzing them
            // (Only when Bootstrap would be suppressed anyway - doesn't affect @mentions or replies)
            // PRESERVE attachments for /fv and /ft commands which need them
            const hasAttachments = message.content.attachments && message.content.attachments.length > 0;
            if (hasAttachments && !isFvCommand && !isFtCommand) {
              logger.debug('[FakeRaresPlugin] Clearing image attachment (Bootstrap suppressed, not /fv or /ft command)');
              message.content.attachments = [];
            }
            
            // Mark as handled to suppress bootstrap
            message.metadata = message.metadata || {};
            (message.metadata as any).__handledByCustom = true;
          }
          
        } catch (error) {
          logger.error(`[Plugin Error]`, error);
          
          // Send error response to prevent hanging
          try {
            if (params.callback && typeof params.callback === 'function') {
              await params.callback({
                text: `❌ Sorry, I encountered an error processing your message. Please try again.`,
                suppressBootstrap: true,
              });
            }
          } catch (callbackError) {
            logger.error(`[Plugin Error] Callback failed:`, callbackError);
          }
        } finally {
          // Log message completion separator
          logger.info(`━━━━━━━━━━ Message complete ━━━━━━━━━━`);
        }
      },
    ],
    
    // MODEL_USED event is not useful - ElizaOS doesn't populate params/result
    // We use monkey-patch for accurate cost tracking instead
    
    MODEL_FAILED: [
      async (params: any) => {
        logger.error('[Plugin] Model call failed:', {
          modelType: params.modelType,
          provider: params.provider,
          error: params.error?.message,
        });
      },
    ],
    
    // Track action execution for /fc metrics
    ACTION_STARTED: [
      async (params: any) => {
        const actionName = params.action?.name || params.actionName || 'unknown';
        if (actionName !== 'unknown') {
          logger.debug(`[Plugin] Action started: ${actionName}`);
        }
      },
    ],
    
    ACTION_COMPLETED: [
      async (params: any) => {
        const actionName = params.action?.name || params.actionName || 'unknown';
        if (actionName !== 'unknown') {
          logger.debug(`[Plugin] Action completed: ${actionName}`, {
            success: params.result?.success ?? true,
          });
        }
      },
    ],
    
    ACTION_FAILED: [
      async (params: any) => {
        const actionName = params.action?.name || params.actionName || 'unknown';
        logger.error(`[Plugin] Action failed: ${actionName}`, {
          error: params.error?.message || 'Unknown error',
        });
      },
    ],
  },
};

