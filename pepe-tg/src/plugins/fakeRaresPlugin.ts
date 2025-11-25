import { type Plugin, logger, ModelType, type HandlerCallback } from '@elizaos/core';
import { fakeRaresCardAction, fakeCommonsCardAction, rarePepesCardAction, educateNewcomerAction, startCommand, helpCommand, loreCommand, fakeRememberCommand, oddsCommand, costCommand, fakeVisualCommand, fakeTestCommand, xcpCommand } from '../actions';
import { fakeMarketAction } from '../actions/fakeMarketAction';
import { fakeRaresCarouselAction } from '../actions/fakeRaresCarousel';
import { fakeRaresContextProvider, userHistoryProvider } from '../providers';
import { loreDetectorEvaluator } from '../evaluators';
import { KnowledgeOrchestratorService } from '../services/KnowledgeOrchestratorService';
import { MemoryStorageService } from '../services/MemoryStorageService';
import { TelemetryService, type SmartRouterDecisionLog } from '../services/TelemetryService';
import { CardDisplayService } from '../services/CardDisplayService';
import { SmartRouterService, type SmartRoutingPlan } from '../services/SmartRouterService';
import { SMART_ROUTER_CONFIG } from '../config/smartRouterConfig';
import { FULL_CARD_INDEX } from '../data/fullCardIndex';
import { startAutoRefresh } from '../utils/cardIndexRefresher';
import { detectMessagePatterns } from '../utils/messagePatterns';
import { calculateEngagementScore, shouldRespond } from '../utils/engagementScorer';
import { executeCommand, executeCommandAlways, type CommandHandlerParams } from '../utils/commandHandler';
import { stripCardNamePrefix } from '../utils/cardNamePrefixSanitizer';
import type { IAgentRuntime } from '@elizaos/core';
import { isBareBitcoinAddress, looksLikeAddressCallout } from '../utils/bitcoinAddress';

// Track patched runtimes to avoid double-patching
const patchedRuntimes = new WeakSet<any>();

const OWNER_BITCOIN_ADDRESS = '1L17y13ty6pvZjX8PhWiF89wf5AW7AfFZN';

function sanitizeOutgoingPayload(payload: any): void {
  if (payload && typeof payload.text === 'string') {
    payload.text = stripCardNamePrefix(payload.text);
  }
}

function wrapHandlerCallback(callback: HandlerCallback | null | undefined): HandlerCallback | null {
  if (!callback) return null;
  return (async (payload: any) => {
    sanitizeOutgoingPayload(payload);
    return callback(payload);
  }) as HandlerCallback;
}

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

interface SmartRouterExecutionContext {
  runtime: IAgentRuntime;
  smartRouter: SmartRouterService;
  plan: SmartRoutingPlan;
  message: any;
  params: any;
  text: string;
  telemetry?: TelemetryService;
  telemetryDetails?: SmartRouterTelemetryDetails;
}

type SmartRouterTelemetryDetails = Omit<SmartRouterDecisionLog, 'timestamp' | 'handled' | 'result'>;

function createSmartRouterTelemetryDetails(
  plan: SmartRoutingPlan,
  text: string,
  messageId: string
): SmartRouterTelemetryDetails {
  return {
    messageId,
    userText: text,
    intent: plan.intent,
    kind: plan.kind,
    reason: plan.reason,
    command: plan.command,
    emoji: plan.emoji,
    fastPath: plan.fastPath
      ? {
          score: plan.fastPath.score,
          asset: plan.fastPath.primaryCandidate?.card_asset,
          metrics: plan.fastPath.metrics,
        }
      : undefined,
    retrieval: plan.retrieval
      ? {
          totalPassages: plan.retrieval.metrics.totalPassages,
          totalCandidates: plan.retrieval.metrics.totalCandidates,
          countsBySource: plan.retrieval.metrics.countsBySource,
          weightedBySource: plan.retrieval.metrics.weightedBySource,
        }
      : undefined,
  };
}

async function runRouterCommand(command: string, context: SmartRouterExecutionContext): Promise<boolean> {
  const { runtime, message, params, smartRouter } = context;
  const trimmed = command.trim();
  if (!trimmed.startsWith('/')) {
    logger.warn(`[SmartRouter] CMDROUTE ignored non-slash command "${command}"`);
    return false;
  }

  const [base, ...rest] = trimmed.split(/\s+/);
  const baseLower = base.toLowerCase();

  const commandMap: Record<
    string,
    { action: any; always?: boolean }
  > = {
    '/f': { action: fakeRaresCardAction },
    '/fc': { action: costCommand, always: true },
    '/fm': { action: fakeMarketAction },
    '/fr': { action: fakeRememberCommand },
    '/fl': { action: loreCommand },
    '/fv': { action: fakeVisualCommand },
    '/ft': { action: fakeTestCommand },
    '/c': { action: fakeCommonsCardAction },
    '/p': { action: rarePepesCardAction },
    '/xcp': { action: xcpCommand },
    '/dawn': { action: oddsCommand },
    '/help': { action: helpCommand, always: true },
    '/start': { action: startCommand, always: true },
  };

  const mapping = commandMap[baseLower];
  if (!mapping) {
    logger.warn(`[SmartRouter] CMDROUTE has no handler for "${baseLower}"`);
    return false;
  }

  const syntheticMessage = {
    ...message,
    content: {
      ...message.content,
      text: [baseLower, ...rest].join(' ').trim(),
    },
  };

  const originalCallback = wrapHandlerCallback(
    typeof params.callback === 'function' ? (params.callback as HandlerCallback) : null
  );
  const wrappedCallback = originalCallback
    ? async (response: any) => {
        await originalCallback(response);
        if (typeof response?.text === 'string') {
          smartRouter.recordBotTurn(message.roomId, response.text);
        }
      }
    : undefined;

  const commandParams: CommandHandlerParams = {
    runtime,
    message: syntheticMessage,
    state: params.state,
    callback: wrappedCallback,
  };

  if (mapping.always) {
    return executeCommandAlways(mapping.action, commandParams, baseLower);
  }
  return executeCommand(mapping.action, commandParams, baseLower);
}

function getDisplayName(params: any, message: any): string {
  const tgMessage = params?.ctx?.message ?? params?.ctx?.callbackQuery?.message;
  const from = tgMessage?.from;
  if (from) {
    const firstName = from.first_name ?? '';
    const lastName = from.last_name ?? '';
    const combined = `${firstName} ${lastName}`.trim();
    if (combined) return combined;
    if (from.username) return `@${from.username}`;
  }
  if (typeof message?.entityId === 'string' || typeof message?.entityId === 'number') {
    return `User ${message.entityId}`;
  }
  return 'User';
}

async function executeSmartRouterPlan(context: SmartRouterExecutionContext): Promise<boolean> {
  const { runtime, plan, message, params, text } = context;
  const baseCallback = wrapHandlerCallback(
    typeof params.callback === 'function' ? (params.callback as HandlerCallback) : null
  );
  const actionCallback = baseCallback;
  const telemetry =
    context.telemetry ??
    (typeof runtime.getService === 'function'
      ? (runtime.getService('telemetry') as TelemetryService | undefined)
      : undefined);
  const baseDetails: SmartRouterTelemetryDetails =
    context.telemetryDetails ?? createSmartRouterTelemetryDetails(plan, text, message.id);

  const markHandled = () => {
    try {
      message.metadata = message.metadata || {};
      (message.metadata as any).__handledByCustom = true;
    } catch {}
  };

  const sendTelemetry = async (options: { logLore?: boolean }) => {
    if (!telemetry) return;
    try {
      if (typeof telemetry.logConversation === 'function') {
        await telemetry.logConversation({
          timestamp: new Date().toISOString(),
          messageId: message.id,
          source: 'auto-route',
        });
      }
      if (options.logLore && typeof telemetry.logLoreQuery === 'function') {
        await telemetry.logLoreQuery({
          timestamp: new Date().toISOString(),
          queryId: message.id,
          query: text,
          source: 'auto-route',
        });
      }
    } catch (err) {
      logger.debug({ error: err }, '[SmartRouter] Telemetry logging failed');
    }
  };

  const logDecision = async (result: 'handled' | 'fallback' | 'skipped') => {
    if (!telemetry?.logSmartRouterDecision) return;
    const payload: SmartRouterDecisionLog = {
      ...baseDetails,
      timestamp: new Date().toISOString(),
      handled: result === 'handled',
      result,
    };
    await telemetry.logSmartRouterDecision(payload);
  };

  const recordBotTurn = async (outgoingText: string | undefined) => {
    if (!outgoingText) return;
    const trimmed = outgoingText.trim();
    if (!trimmed) return;
    context.smartRouter.recordBotTurn(message.roomId, trimmed);
  };

  const fallbackCandidates =
    plan.selectedCandidates && plan.selectedCandidates.length > 0
      ? plan.selectedCandidates
      : plan.retrieval?.candidates?.slice(0, 3) ?? [];

  const sendTelemetryLoreFlag = plan.intent === 'FACTS' || plan.intent === 'LORE';

  try {
    switch (plan.kind) {
      case 'FAST_PATH_CARD': {
        const candidate = plan.fastPath?.primaryCandidate;
        if (!candidate?.card_asset) {
          await logDecision('fallback');
          return false;
        }

        const preview =
          candidate.text_preview?.replace(/\s+/g, ' ').trim() ||
          candidate.full_text?.replace(/\s+/g, ' ').trim() ||
          '';
        const explanation =
          preview.length > 0
            ? `Pulling up ${candidate.card_asset} — ${preview.slice(0, 200)}${preview.length > 200 ? '…' : ''}`
            : `Pulling up ${candidate.card_asset} for you.`;

        if (actionCallback) {
          await actionCallback({
            text: explanation,
            __fromAction: 'smart_router_fastpath',
          });
          await recordBotTurn(explanation);
        }

        markHandled();
        await sendTelemetry({ logLore: true });
        await logDecision('handled');

        const cardCallback: HandlerCallback | undefined =
          actionCallback != null
            ? (async (payload: any) => {
                const result = await actionCallback(payload);
                if (typeof payload?.text === 'string') {
                  await recordBotTurn(payload.text);
                }
                return Array.isArray(result) ? result : [];
              }) as HandlerCallback
            : undefined;

        const cardMessage = {
          ...message,
          content: {
            ...message.content,
            text: `/f ${candidate.card_asset}`,
          },
        };

        try {
          await fakeRaresCardAction.handler(
            runtime,
            cardMessage,
            params.state,
            {},
            cardCallback
          );
        } catch (error) {
          logger.error({ error }, '[SmartRouter] Fast-path card display failed');
        }

        logger.info('[SmartRouter] Fast-path card response executed.');
        return true;
      }

      case 'CARD_RECOMMEND': {
        const summary =
          plan.cardSummary?.trim().replace(/^["“”]+/, '').replace(/["“”]+$/, '') ||
          plan.story?.trim() ||
          'Here’s a card that nails the vibe you described.';
        if (actionCallback && summary) {
          await actionCallback({
            text: summary,
            __fromAction: 'smart_router_card_recommend',
          });
          await recordBotTurn(summary);
        }

        if (Array.isArray(plan.cardMatches) && plan.cardMatches.length > 0) {
          const list = plan.cardMatches
            .map((match, idx) => {
              const reasonSnippet = match.reason
                ? match.reason.replace(/\s+/g, ' ').slice(0, 80)
                : '';
              return `#${idx + 1} ${match.asset}${reasonSnippet ? ` — ${reasonSnippet}` : ''}`;
            })
            .join('  |  ');
          logger.info(`[CardDiscovery] Ranked candidates => ${list}`);
        }

        if (plan.primaryCardAsset) {
          const cardCallback: HandlerCallback | undefined =
            actionCallback != null
              ? (async (payload: any) => {
                  const result = await actionCallback(payload);
                  if (typeof payload?.text === 'string') {
                    await recordBotTurn(payload.text);
                  }
                  return Array.isArray(result) ? result : [];
                }) as HandlerCallback
              : undefined;

          const cardMessage = {
            ...message,
            content: {
              ...message.content,
              text: `/f ${plan.primaryCardAsset}`,
            },
          };

          try {
            await fakeRaresCardAction.handler(
              runtime,
              cardMessage,
              params.state,
              {},
              cardCallback
            );
          } catch (error) {
            logger.error({ error }, '[SmartRouter] Card recommendation display failed');
          }
        }

        markHandled();
        await sendTelemetry({ logLore: true });
        await logDecision('handled');
        logger.info('[SmartRouter] CARD_RECOMMEND response delivered.');
        return true;
      }

      case 'FACTS':
      case 'LORE': {
        const story = plan.story?.trim();
        if (!story) {
          await logDecision('fallback');
          return false;
        }

        if (actionCallback) {
          await actionCallback({
            text: story,
            __fromAction: plan.kind === 'FACTS' ? 'smart_router_facts' : 'smart_router_lore',
          });
          await recordBotTurn(story);
          if (plan.sources?.trim()) {
            await actionCallback({
              text: plan.sources,
              __fromAction: plan.kind === 'FACTS' ? 'smart_router_facts_sources' : 'smart_router_lore_sources',
            });
            await recordBotTurn(plan.sources);
          }
        }

        markHandled();
        await sendTelemetry({ logLore: sendTelemetryLoreFlag });
        logger.info(`[SmartRouter] ${plan.kind} response delivered via router plan.`);
        await logDecision('handled');
        return true;
      }

      case 'CHAT': {
        const response = plan.chatResponse?.trim();
        if (!response) {
          await logDecision('fallback');
          return false;
        }

        if (actionCallback) {
          await actionCallback({
            text: response,
            __fromAction: 'smart_router_chat',
          });
          await recordBotTurn(response);
        }

        markHandled();
        await sendTelemetry({ logLore: false });
        logger.info('[SmartRouter] CHAT response delivered via router plan.');
        await logDecision('handled');
        return true;
      }

      case 'NORESPONSE': {
        markHandled();
        await sendTelemetry({ logLore: false });
        await logDecision('handled');
        logger.info('[SmartRouter] NORESPONSE plan acknowledged silently (no emoji).');
        return true;
      }

      case 'CMDROUTE': {
        const command = plan.command;
        if (!command) {
          await logDecision('fallback');
          return false;
        }

        const executed = await runRouterCommand(command, context);
        if (executed) {
          markHandled();
          await sendTelemetry({ logLore: false });
          await logDecision('handled');
          logger.info(`[SmartRouter] CMDROUTE executed command "${command}".`);
          return true;
        }

        logger.warn(`[SmartRouter] CMDROUTE could not execute command "${command}".`);
        await logDecision('fallback');
        return false;
      }

      default:
        await logDecision('fallback');
        return false;
    }
  } catch (error) {
    logger.error({ error }, '[SmartRouter] Failed to execute router plan');
    await logDecision('fallback');
    return false;
  }
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
    fakeRaresCarouselAction,
    fakeCommonsCardAction,
    rarePepesCardAction,
    fakeVisualCommand,
    fakeTestCommand,
    loreCommand,
    fakeRememberCommand,
    fakeMarketAction,
    oddsCommand,
    costCommand,
    xcpCommand,
  ],
  
  providers: [fakeRaresContextProvider, userHistoryProvider],
  evaluators: [],
  services: [KnowledgeOrchestratorService, MemoryStorageService, TelemetryService, CardDisplayService, SmartRouterService],
  
  events: {
    MESSAGE_RECEIVED: [
      async (params: any) => {
        let baseCallback: HandlerCallback | null = null;
        try {
          const runtime = params.runtime;
          const message = params.message;
          
          // Patch runtime to track ALL AI calls for accurate token/cost tracking
          // MODEL_USED event doesn't provide params/result, so we need the monkey-patch
          patchRuntimeForTelemetry(runtime);
          
          const text = (params?.message?.content?.text ?? '').toString().trim();
          baseCallback = wrapHandlerCallback(
            typeof params.callback === 'function' ? (params.callback as HandlerCallback) : null
          );
          const globalSuppression = process.env.SUPPRESS_BOOTSTRAP === 'true';
          
          logger.info('━'.repeat(60));
          logger.info(`📩 "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
          
          const smartRouter =
            typeof runtime.getService === 'function'
              ? (runtime.getService(SmartRouterService.serviceType) as SmartRouterService | undefined)
              : undefined;
          
          if (smartRouter && text.length > 0) {
            smartRouter.recordUserTurn(message.roomId, text, getDisplayName(params, message));
          }
          
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
          const { isHelp, isStart, isF, isFCarousel, isC, isP, isFv, isFt, isFl, isFr, isFm, isDawn, isFc, isXcp } = commands;
          
          // Log routing factors
          logger.info(`   Triggers: reply=${!!isReplyToBot} | card=${isFakeRareCard} | @mention=${hasBotMention}`);

          const textLower = text.toLowerCase();
          const hasCardKeyword =
            /\b(card|cards|fake|fakes|fake rare|fake rares|rake rare|rare fake|rare card|rare cards|rare|rares)\b/i.test(textLower) ||
            /\bpepes?\b/i.test(textLower) ||
            /\brare pepes?\b/i.test(textLower);
          let hasCardDiscoveryIntent = hasCardKeyword;
          // Do not treat collection-level policy questions as card discovery
          if (/\bsubmission\b/i.test(textLower) && /\brules?\b/i.test(textLower)) {
            hasCardDiscoveryIntent = false;
          }
          const isSubmissionRulesQuery =
            /\bsubmission\b/i.test(textLower) && /\brules?\b/i.test(textLower);

          const hasReplyContext = isReply || !!params.ctx?.message?.reply_to_message;
          const isAddressCallout = looksLikeAddressCallout(text);
          const isBareBitcoinDrop = isBareBitcoinAddress(text);

          if (isAddressCallout && !hasReplyContext) {
            logger.info('[FakeRaresPlugin] Address call detected → replying with collector address');
            if (baseCallback) {
              await baseCallback({
                text: OWNER_BITCOIN_ADDRESS,
                __fromAction: 'artist_address_drop',
              });
            } else {
              logger.warn('[FakeRaresPlugin] Address call detected but no callback available to respond.');
            }
            if (smartRouter) {
              smartRouter.recordBotTurn(message.roomId, OWNER_BITCOIN_ADDRESS);
            }
            message.metadata = message.metadata || {};
            (message.metadata as any).__handledByCustom = true;
            return;
          }

          if (isBareBitcoinDrop) {
            logger.info('[FakeRaresPlugin] Suppressing bare bitcoin address drop');
            message.metadata = message.metadata || {};
            (message.metadata as any).__handledByCustom = true;
            return;
          }

          logger.debug(`[FakeRaresPlugin] MESSAGE_RECEIVED text="${text}" isF=${isF} isC=${isC} isP=${isP} isFv=${isFv} isFt=${isFt} isLore=${isFl} isFr=${isFr} isFm=${isFm} isDawn=${isDawn} isHelp=${isHelp} isStart=${isStart} isCost=${isFc} SUPPRESS_BOOTSTRAP=${globalSuppression}`);
          
          logger.info('━━━━━━━━━━ STEP 2/5: COMMAND EXECUTION ━━━━━━━━━━');
          
          // === MEMORY CAPTURE: "remember" or "remember this" ===
          if ((isFakeRareCard || isReplyToBot || hasBotMention) && hasRememberCommand) {
            logger.debug('[FakeRaresPlugin] "remember" command detected → storing memory');
            const actionCallback = baseCallback;
            
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
          const cmdParams: CommandHandlerParams = { runtime, message, state: params.state, callback: baseCallback ?? undefined };
          
          // /help and /start commands (always mark as handled, even on validation failure)
          if (isHelp && await executeCommandAlways(helpCommand, cmdParams, '/help')) return;
          if (isStart && await executeCommandAlways(startCommand, cmdParams, '/start')) return;
          
          // Card and lore commands  
          if (isFCarousel && await executeCommand(fakeRaresCarouselAction, cmdParams, '/f c')) return;
          if (isF && await executeCommand(fakeRaresCardAction, cmdParams, '/f')) return;
          if (isC && await executeCommand(fakeCommonsCardAction, cmdParams, '/c')) return;
          if (isP && await executeCommand(rarePepesCardAction, cmdParams, '/p')) return;
          if (isFv && await executeCommand(fakeVisualCommand, cmdParams, '/fv')) return;
          if (isFt && await executeCommand(fakeTestCommand, cmdParams, '/ft')) return;
          if (isFl && await executeCommand(loreCommand, cmdParams, '/fl')) return;
          if (isFr && await executeCommand(fakeRememberCommand, cmdParams, '/fr')) return;
          if (isFm && await executeCommand(fakeMarketAction, cmdParams, '/fm')) return;
          if (isDawn && await executeCommand(oddsCommand, cmdParams, '/dawn')) return;
          if (isXcp && await executeCommand(xcpCommand, cmdParams, '/xcp')) return;
          
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
            const callback = baseCallback;
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
          
          const engagementAllowsResponse = shouldRespond(engagementScore);
          const engagementOverride = !engagementAllowsResponse && (hasCardDiscoveryIntent || isSubmissionRulesQuery);
          const engagementSuppressed = !engagementAllowsResponse && !engagementOverride;

          if (engagementSuppressed) {
            logger.info(`   Engagement below threshold (score=${engagementScore}) → evaluating smart router before suppressing`);
          } else if (engagementOverride) {
            logger.info(`   Engagement below threshold (${engagementScore}) but overriding due to ${hasCardDiscoveryIntent ? 'card intent' : 'submission rules query'}`);
          }
          
          logger.info('━━━━━━━━━━ STEP 5/5: QUERY CLASSIFICATION ━━━━━━━━━━');

          let smartRouterHandled = false;
          const shouldUseSmartRouter =
            SMART_ROUTER_CONFIG.rollout.enabled &&
            (SMART_ROUTER_CONFIG.rollout.percentage ?? 0) >= 100
              ? true
              : SMART_ROUTER_CONFIG.rollout.enabled &&
                Math.random() * 100 < (SMART_ROUTER_CONFIG.rollout.percentage ?? 0);

          if (shouldUseSmartRouter && smartRouter) {
            const runPlanWithTelemetry = async (plan: SmartRoutingPlan): Promise<boolean> => {
              const telemetry = runtime.getService('telemetry') as TelemetryService | undefined;
              const details = createSmartRouterTelemetryDetails(plan, text, message.id);
              if (telemetry?.logSmartRouterDecision) {
                await telemetry.logSmartRouterDecision({
                  ...details,
                  timestamp: new Date().toISOString(),
                  handled: false,
                  result: 'pending',
                });
              }
              return executeSmartRouterPlan({
                runtime,
                smartRouter,
                plan,
                message,
                params,
                text,
                telemetry,
                telemetryDetails: details,
              });
            };

            try {
              if (hasCardDiscoveryIntent && !isFl && !isFakeRareCard) {
                const descriptorPlan = await smartRouter.planRouting(text, message.roomId, {
                  forceCardFacts: true,
                });
                smartRouterHandled = await runPlanWithTelemetry(descriptorPlan);
              }

              if (!smartRouterHandled) {
                const plan = await smartRouter.planRouting(text, message.roomId);
                smartRouterHandled = await runPlanWithTelemetry(plan);
              }
            } catch (routerErr) {
              logger.error({ error: routerErr }, '[SmartRouter] Failed to evaluate routing plan');
            }
          }

          if (!smartRouterHandled && engagementSuppressed) {
            logger.info('   Decision: SUPPRESS (smart router had no actionable plan and engagement below threshold)');
            message.metadata = message.metadata || {};
            (message.metadata as any).__handledByCustom = true;
            return;
          }

          if (smartRouterHandled) {
            return;
          }

          logger.info('━━━━━━━━━━ STEP 6/6: BOOTSTRAP HANDOFF ━━━━━━━━━━');

          if (globalSuppression) {
            logger.info('   Decision: SUPPRESS all (SUPPRESS_BOOTSTRAP=true)');
            logger.debug('[Suppress] SUPPRESS_BOOTSTRAP=true → suppressing all bootstrap');
            message.metadata = message.metadata || {};
            (message.metadata as any).__handledByCustom = true;
            return;
          }

          // Allow Bootstrap to handle anything the Smart Router declined
          logger.info('   Decision: ALLOW bootstrap (router declined to handle message)');
          logger.debug(
            `[Allow] Bootstrap allowed: reply=${!!isReplyToBot} card=${isFakeRareCard} mention=${hasBotMention} | "${text}"`
          );

          if (!message.content.mentionContext) {
            message.content.mentionContext = {
              isMention: hasBotMention,
              isReply: isActuallyReplyToBot,
            };
          }

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
          
        } catch (error) {
          logger.error(`[Plugin Error]`, error);
          
          // Send error response to prevent hanging
          try {
            if (baseCallback) {
              await baseCallback({
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
        logger.error(
          {
            modelType: params.modelType,
            provider: params.provider,
            error: params.error?.message,
          },
          '[Plugin] Model call failed'
        );
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
          logger.debug(
            {
              actionName,
              success: params.result?.success ?? true,
            },
            '[Plugin] Action completed'
          );
        }
      },
    ],
    
    ACTION_FAILED: [
      async (params: any) => {
        const actionName = params.action?.name || params.actionName || 'unknown';
        logger.error(
          {
            actionName,
            error: params.error?.message || 'Unknown error',
          },
          '[Plugin] Action failed'
        );
      },
    ],
  },
};

