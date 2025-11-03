import { type Plugin, logger } from '@elizaos/core';
import { fakeRaresCardAction, fakeCommonsCardAction, rarePepesCardAction, educateNewcomerAction, startCommand, helpCommand, loreCommand, fakeRememberCommand, oddsCommand, costCommand, fakeVisualCommand, fakeTestCommand } from '../actions';
import { fakeMarketAction } from '../actions/fakeMarketAction';
import { fakeRaresContextProvider, userHistoryProvider } from '../providers';
import { loreDetectorEvaluator } from '../evaluators';
import { KnowledgeOrchestratorService } from '../services/KnowledgeOrchestratorService';
import { MemoryStorageService } from '../services/MemoryStorageService';
import { TelemetryService } from '../services/TelemetryService';
import { FULL_CARD_INDEX } from '../data/fullCardIndex';
import { startAutoRefresh } from '../utils/cardIndexRefresher';
import { classifyQuery } from '../utils/queryClassifier';
import { isOffTopic, getOffTopicReason } from '../utils/offTopicDetector';
import { detectMessagePatterns } from '../utils/messagePatterns';
import { calculateEngagementScore, shouldRespond } from '../utils/engagementScorer';
import { executeCommand, executeCommandAlways, type CommandHandlerParams } from '../utils/commandHandler';
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
        const source = params?.context || 'Conversation';
        
        // Console log for visibility (matches modelGateway format)
        logger.info(`🤖 LLM call: ${model} [${source}] (${tokensIn} → ${tokensOut} tokens, $${cost.toFixed(4)}, ${duration}ms)`);
        
        await telemetry.logModelUsage({
          timestamp: new Date().toISOString(),
          model,
          tokensIn,
          tokensOut,
          cost,
          source,
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
    fakeRememberCommand,
    oddsCommand,
    costCommand,
  ],
  
  providers: [fakeRaresContextProvider, userHistoryProvider],
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
          
          logger.info('━'.repeat(60));
          logger.info(`📩 "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
          
          logger.info('━━━━━━━━━━ STEP 1/5: PATTERN DETECTION ━━━━━━━━━━');
          
          // 🎯 STEP 1A: Determine if this is a reply to the bot (not just any reply)
          let isActuallyReplyToBot = false;
          const isReply = !!message.content?.inReplyTo;
          
          logger.debug(`[Reply Detection] inReplyTo=${!!message.content?.inReplyTo}, hasCtx=${!!params.ctx}, hasCtxMessage=${!!params.ctx?.message}, hasReplyToMessage=${!!params.ctx?.message?.reply_to_message}`);
          
          if (!isReply && params.ctx?.message?.reply_to_message) {
            logger.info(`   ⚠️  WARNING: Telegram reply detected but inReplyTo is missing!`);
          }
          
          if (!isReply && !params.ctx?.message?.reply_to_message) {
            logger.debug(`[Reply Detection] No reply context - this is normal for non-reply messages`);
          }
          
          logger.debug(`[Reply Debug Full] inReplyTo=${message.content?.inReplyTo}, ctx exists=${!!params.ctx}, message exists=${!!params.ctx?.message}, reply_to_message exists=${!!params.ctx?.message?.reply_to_message}`);
          
          if (isReply) {
            const rawMessage = params.ctx?.message;
            const replyToUserId = rawMessage?.reply_to_message?.from?.id;
            
            // Try to get bot ID from multiple sources
            let botUserId: number | undefined;
            
            // Method 1: From ctx.telegram.botInfo (Telegraf)
            if (params.ctx?.botInfo?.id) {
              botUserId = params.ctx.botInfo.id;
            }
            // Method 2: From ctx.telegram.bot.botInfo
            else if (params.ctx?.telegram?.botInfo?.id) {
              botUserId = params.ctx.telegram.botInfo.id;
            }
            // Method 3: From ctx.telegram.bot.me
            else if (params.ctx?.telegram?.me?.id) {
              botUserId = params.ctx.telegram.me.id;
            }
            // Method 4: From ctx.me (direct property)
            else if ((params.ctx as any)?.me?.id) {
              botUserId = (params.ctx as any).me.id;
            }
            // Method 5: From Telegram service
            else {
              try {
                const telegramService = runtime.services?.find(
                  (s: any) => s.serviceType === 'telegram'
                ) as any;
                botUserId = telegramService?.bot?.botInfo?.id || telegramService?.botInfo?.id;
              } catch (e) {
                // Couldn't get bot ID from service
              }
            }
            
            // Only mark as reply to bot if we can confirm it
            isActuallyReplyToBot = !!(replyToUserId && botUserId && replyToUserId === botUserId);
            
            logger.debug(`[Reply Detection] replyToUserId=${replyToUserId}, botUserId=${botUserId}, isReplyToBot=${isActuallyReplyToBot}`);
          }
          
          // Detect all patterns once - commands, triggers, metadata
          const patterns = detectMessagePatterns(text, params);
          let { commands, triggers } = patterns;
          
          // Override isReplyToBot with the accurate check
          triggers.isReplyToBot = isActuallyReplyToBot;
          
          // 🎯 AUTO-ROUTE: Single card name → treat as "/f CARDNAME"
          if (triggers.isFakeRareCard && patterns.metadata.wordCount === 1) {
            logger.info(`   Auto-route: Single card name "${text}" → converting to /f command`);
            
            // Prepend "/f " so the action handler can parse the card name correctly
            const originalText = text;
            message.content.text = `/f ${originalText}`;
            commands.isF = true;
          }
          
          // Extract for convenience
          const { isFakeRareCard, hasBotMention, hasRememberCommand } = triggers;
          const isReplyToBot = triggers.isReplyToBot;  // Use the corrected value
          const { isHelp, isStart, isF, isC, isP, isFv, isFt, isFl, isFr, isFm, isDawn, isFc } = commands;
          
          // Log routing factors
          logger.info(`   Triggers: reply=${!!isReplyToBot} | card=${isFakeRareCard} | @mention=${hasBotMention}`);

          logger.debug(`[FakeRaresPlugin] MESSAGE_RECEIVED text="${text}" isF=${isF} isC=${isC} isP=${isP} isFv=${isFv} isFt=${isFt} isLore=${isFl} isFr=${isFr} isFm=${isFm} isDawn=${isDawn} isHelp=${isHelp} isStart=${isStart} isCost=${isFc} SUPPRESS_BOOTSTRAP=${globalSuppression}`);
          
          logger.info('━━━━━━━━━━ STEP 2/5: COMMAND EXECUTION ━━━━━━━━━━');
          
          // === MEMORY CAPTURE: "remember" or "remember this" ===
          if ((isFakeRareCard || isReplyToBot || hasBotMention) && hasRememberCommand) {
            logger.debug('[FakeRaresPlugin] "remember" command detected → storing memory');
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
          
          // === STEP 2: COMMAND EXECUTION ===
          // Use command handler utility to reduce boilerplate
          const cmdParams: CommandHandlerParams = { runtime, message, state: params.state, callback: params.callback };
          
          // /help and /start commands (always mark as handled, even on validation failure)
          if (isHelp && await executeCommandAlways(helpCommand, cmdParams, '/help')) return;
          if (isStart && await executeCommandAlways(startCommand, cmdParams, '/start')) return;
          
          // Card and lore commands
          if (isF && await executeCommand(fakeRaresCardAction, cmdParams, '/f')) return;
          if (isC && await executeCommand(fakeCommonsCardAction, cmdParams, '/c')) return;
          if (isP && await executeCommand(rarePepesCardAction, cmdParams, '/p')) return;
          if (isFv && await executeCommand(fakeVisualCommand, cmdParams, '/fv')) return;
          if (isFt && await executeCommand(fakeTestCommand, cmdParams, '/ft')) return;
          if (isFl && await executeCommand(loreCommand, cmdParams, '/fl')) return;
          if (isFr && await executeCommand(fakeRememberCommand, cmdParams, '/fr')) return;
          if (isFm && await executeCommand(fakeMarketAction, cmdParams, '/fm')) return;
          if (isDawn && await executeCommand(oddsCommand, cmdParams, '/dawn')) return;
          
          // Admin-only command
          if (isFc) {
            const executed = await executeCommand(costCommand, cmdParams, '/fc');
            if (executed || !executed) {
              // Always mark as handled (whether admin or not)
              message.metadata = message.metadata || {};
              (message.metadata as any).__handledByCustom = true;
              return;
            }
          }
          
          logger.info('━━━━━━━━━━ STEP 3/5: CONTENT FILTERS ━━━━━━━━━━');
          
          // 🚨 Block FAKEASF burn messages
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
            if (message.metadata) {
              message.metadata.__handledByCustom = true;
            }
            return;
          }
          
          // 🚫 Filter off-topic messages
          if (isOffTopic(text)) {
            const reason = getOffTopicReason(text);
            logger.info(`[FakeRaresPlugin] 🚫 OFF-TOPIC detected, ignoring silently: ${reason}`);
            if (message.metadata) {
              message.metadata.__handledByCustom = true;
            }
            return;
          }
          
          logger.info('━━━━━━━━━━ STEP 4/5: ENGAGEMENT FILTER ━━━━━━━━━━');
          
          // Calculate engagement score to determine if bot should respond
          const engagementScore = calculateEngagementScore({
            text,
            hasBotMention,
            isReplyToBot,
            isFakeRareCard,
            userId: message.entityId,
            roomId: message.roomId,
          });
          
          if (!shouldRespond(engagementScore)) {
            logger.info(`   Decision: SUPPRESS (low engagement, score=${engagementScore})`);
            message.metadata = message.metadata || {};
            (message.metadata as any).__handledByCustom = true;
            return;
          }
          
          logger.info('━━━━━━━━━━ STEP 5/5: QUERY CLASSIFICATION ━━━━━━━━━━');
          
          // Only auto-route actual questions, not statements/announcements or replies to other users
          let queryType = classifyQuery(text);
          
          // 🎯 OVERRIDE: Card name + question → Force FACTS (wiki/memory only, no telegram noise)
          if (isFakeRareCard && patterns.metadata.hasQuestion) {
            logger.info('   Override: Card + question → forcing FACTS mode');
            queryType = 'FACTS';
          }
          
          logger.debug(`[FakeRaresPlugin] Query classification: ${queryType}`);
          
          // Skip auto-routing if this is a reply to another user (not the bot)
          // Replies to other users are conversation between humans, not questions for the bot
          if (isReply && !isReplyToBot) {
            logger.info(`   Decision: Skip auto-routing (reply to another user, not bot)`);
            logger.debug(`[FakeRaresPlugin] Skipping auto-routing - message is a reply to another user, not to the bot`);
            // IMPORTANT: Check global suppression before returning
            // If SUPPRESS_BOOTSTRAP=true, we need to mark as handled
            if (globalSuppression) {
              logger.info(`   Decision: SUPPRESS (global suppression active)`);
              logger.debug('[FakeRaresPlugin] Global suppression active - marking reply as handled');
              message.metadata = message.metadata || {};
              (message.metadata as any).__handledByCustom = true;
              return;
            }
            // Otherwise, let it go to bootstrap for natural conversation handling
            logger.info(`   Decision: ALLOW bootstrap (conversation between users)`);
            return;
          }
          
          // Comprehensive question detection
          const isQuestion = 
            text.includes('?') ||  // Explicit question mark
            /^(what|how|when|where|who|why|can|do|does|is|are|will|should|could)\s/i.test(text) ||  // Question words
            /^(tell|show|explain|describe|list|give)\s+(me|us)\s+(about|the|how)/i.test(text) ||  // Imperative requests
            /\b(need to know|want to know|wondering|curious)\b/i.test(text);  // Indirect questions
          
          if (queryType === 'FACTS' && isQuestion) {
            logger.info(`   Decision: Auto-route to FACTS (detected question)`);
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
              
              // Fall back to bootstrap if no wiki/memory sources found
              // Let the LLM handle it conversationally instead of returning "I don't know"
              if (!result.hasWikiOrMemory) {
                logger.info(`   Decision: FALLBACK to Bootstrap (FACTS question, no wiki/memory sources)`);
                // Throw to trigger catch block which falls through to bootstrap
                throw new Error('No knowledge hits - fallback to bootstrap');
              }
              
              const finalMessage = result.story + result.sourcesLine;
              
              // Detect if LLM couldn't answer from sources (returns "NO_ANSWER" signal)
              // If so, fall back to bootstrap for conversational response
              if (result.story.trim() === 'NO_ANSWER') {
                logger.info(`   Decision: FALLBACK to Bootstrap (FACTS returned NO_ANSWER)`);
                throw new Error('Knowledge sources not relevant - fallback to bootstrap');
              }
              
              if (actionCallback) {
                await actionCallback({ text: finalMessage });
              }
              
              // Log as conversation (auto-routed)
              const telemetry = runtime.getService('telemetry') as TelemetryService;
              if (telemetry && typeof telemetry.logConversation === 'function') {
                await telemetry.logConversation({
                  timestamp: new Date().toISOString(),
                  messageId: message.id,
                  source: 'auto-route',
                });
              }
              if (telemetry && typeof telemetry.logLoreQuery === 'function') {
                await telemetry.logLoreQuery({
                  timestamp: new Date().toISOString(),
                  queryId: message.id,
                  query: text,
                  source: 'auto-route',
                });
              }
              
              logger.debug(`[FakeRaresPlugin] ✅ Auto-routed knowledge response sent`);
              logger.debug(`   Hits: ${result.metrics.hits_used}, Latency: ${result.metrics.latency_ms}ms`);
              
              try {
                message.metadata = message.metadata || {};
                (message.metadata as any).__handledByCustom = true;
              } catch {}
              
              return;
            } catch (err) {
              // Expected fallback scenarios (not actual errors)
              const isFallback = err instanceof Error && 
                (err.message.includes('fallback to bootstrap') || 
                 err.message.includes('No knowledge hits'));
              
              if (isFallback) {
                logger.debug('[FakeRaresPlugin] Auto-route fallback triggered, using bootstrap');
              } else {
                logger.error('[FakeRaresPlugin] ❌ Auto-route failed, falling back to conversation:', err);
              }
              // Fall through to normal bootstrap flow
            }
          }
          
          logger.info('━━━━━━━━━━ STEP 4 (FINAL): BOOTSTRAP DECISION ━━━━━━━━━━');
          
          // At this point:
          // - Commands already handled and exited
          // - FAKEASF burn already filtered and exited
          // - Off-topic already filtered and exited
          // - FACTS queries already auto-routed and exited
          // - Replies to other users already filtered and exited (not replies to bot)
          //
          // Remaining messages: LORE/UNCERTAIN → Allow Bootstrap for natural conversation
          // (Bootstrap will use userHistoryProvider for context)
          
          if (globalSuppression) {
            logger.info('   Decision: SUPPRESS all (SUPPRESS_BOOTSTRAP=true)');
            logger.debug('[Suppress] SUPPRESS_BOOTSTRAP=true → suppressing all bootstrap');
            message.metadata = message.metadata || {};
            (message.metadata as any).__handledByCustom = true;
            return;
          }
          
          // Allow Bootstrap for all remaining messages
          logger.info(`   Decision: ALLOW bootstrap (normal conversation)`);
          logger.debug(`[Allow] Bootstrap allowed: reply=${!!isReplyToBot} card=${isFakeRareCard} mention=${hasBotMention} | "${text}"`);
          
          // Inject mentionContext to inform Bootstrap's shouldRespond logic
          // This allows Bootstrap to skip LLM evaluation and always respond to bot replies
          if (!message.content.mentionContext) {
            message.content.mentionContext = {
              isMention: hasBotMention,
              isReply: isActuallyReplyToBot
            };
          }
          
          // Log this as a conversation (once per user message, not per API call)
          // Guard for test environments where runtime.getService might not exist
          if (typeof runtime.getService === 'function') {
            const telemetry = runtime.getService('telemetry') as TelemetryService;
            if (telemetry && typeof telemetry.logConversation === 'function') {
              await telemetry.logConversation({
                timestamp: new Date().toISOString(),
                messageId: message.id,
                source: 'bootstrap',
              });
            }
          }
          
          // Let Bootstrap handle it naturally (don't mark as handled, let userHistoryProvider inject context)
          
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
          logger.info('━'.repeat(60) + '\n');
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

