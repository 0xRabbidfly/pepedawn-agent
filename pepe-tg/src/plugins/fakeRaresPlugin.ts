import { type Plugin } from '@elizaos/core';
import { fakeRaresCardAction, shareLoreAction, educateNewcomerAction, startCommand, helpCommand } from '../actions';
import { fakeRaresContextProvider } from '../providers';
import { loreDetectorEvaluator } from '../evaluators';

/**
 * Fake Rares Plugin
 * Provides custom actions for the Fake Rares community
 */
export const fakeRaresPlugin: Plugin = {
  name: 'fake-rares',
  description: 'Custom actions for Fake Rares card display and community features',
  // Run before generic handlers to ensure /f is captured decisively
  priority: 1000,
  actions: [
    startCommand,             // /start command
    helpCommand,              // /help command
    fakeRaresCardAction,      // /f command for card display
    // shareLoreAction,       // DISABLED: Bootstrap handles natural language + embeddings better
    // educateNewcomerAction, // DISABLED: Bootstrap handles this naturally
  ],
  providers: [
    fakeRaresContextProvider,  // Detects card mentions and community context (pure string matching - safe)
  ],
  evaluators: [
    // loreDetectorEvaluator,  // DISABLED: Uses LLM calls that hang when multiple actions compete
  ],
  events: {
    MESSAGE_RECEIVED: [
      async (params: any) => {
        try {
          // Production suppression guard for Telegram:
          // - Global mode (SUPPRESS_BOOTSTRAP=true): Only allow /f commands, suppress all bootstrap
          // - Per-message mode: Detects /f commands and suppresses bootstrap for those messages only
          // - Wraps Telegram callback to allow exactly one send (from our /f action)
          // - Sanitizes out internal markers before sending/persisting
          // - Drops any subsequent sends (e.g., bootstrap follow-ups) when suppressed
          
          const globalSuppression = process.env.SUPPRESS_BOOTSTRAP === 'true';
          
          // Log global suppression status on first run
          if (globalSuppression && !params._loggedGlobalSuppression) {
            console.log(`🛡️  [Suppression] GLOBAL MODE ACTIVE - Only /f commands will work, all other messages suppressed`);
            params._loggedGlobalSuppression = true;
          }
          
          const text = (
            params?.message?.content?.text ??
            params?.content?.text ??
            params?.text ??
            ''
          )
            .toString()
            .trim();

          // Accept /f, /f@bot, and variants with leading mentions
          const isFCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+[A-Za-z0-9_-]+)?$/i.test(text);
          
          // Check if message contains capitalized text (2+ uppercase letters in a row)
          const hasCapitalizedText = /\b[A-Z]{2,}\b/.test(text);
          
          // Check if bot is explicitly mentioned with @pepedawn_bot
          const hasBotMention = /@pepedawn_bot/i.test(text);
          
          // Determine if suppression should be active for this message
          // Suppress if: global flag is on, OR it's /f command, OR (no capitalized text AND no @mention)
          // Allow if: has capitalized text OR has @pepedawn_bot mention
          const shouldSuppress = globalSuppression || isFCommand || (!hasCapitalizedText && !hasBotMention);
          
          if (shouldSuppress) {
            const source = globalSuppression 
              ? 'GLOBAL_ENV_FLAG' 
              : isFCommand 
                ? '/f command' 
                : 'no capitalized text or @mention';
            console.log(`🛡️  [Suppression] Active for message: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" (source: ${source})`);
            
            // Tag state so downstream layers can detect suppression intent
            const state = params?.state ?? {};
            state.suppressBootstrap = true;
            state.suppressSource = globalSuppression 
              ? 'global_env_flag' 
              : isFCommand 
                ? 'message_received:/f' 
                : 'message_received:no_caps_or_mention';
            params.state = state;

            // Wrap callback to allow the first response (our action) and suppress follow-ups
            const originalCallback = params.callback;
            let hasSentOnce = false;
            if (typeof originalCallback === 'function') {
              params.callback = async (content: any, files?: any) => {
                const fromAction = content?.__fromAction === 'fakeRaresCard';
                // Sanitize content to avoid persisting internal markers
                const sanitized = content && typeof content === 'object'
                  ? (() => { const c = { ...content }; delete (c as any).__fromAction; delete (c as any).suppressBootstrap; return c; })()
                  : content;
                if (!hasSentOnce) {
                  // Only allow the first send if it originated from our action
                  if (fromAction) {
                    console.log(`✅ [Suppression] Allowing send from fakeRaresCard action`);
                    hasSentOnce = true;
                    return originalCallback(sanitized, files);
                  }
                  // Not from our action: if suppression is active, drop it
                  if (params?.state?.suppressBootstrap || content?.suppressBootstrap) {
                    console.log(`🚫 [Suppression] Dropped first send (not from /f action, suppression active)`);
                    return [];
                  }
                  // Otherwise allow
                  console.log(`✅ [Suppression] Allowing first send (no suppression flag)`);
                  hasSentOnce = true;
                  return originalCallback(sanitized, files);
                }
                // After the first send, suppress any further sends when flagged
                if (params?.state?.suppressBootstrap || content?.suppressBootstrap) {
                  // Allow only our action content if it appears again (unlikely)
                  if (fromAction) {
                    console.log(`✅ [Suppression] Allowing additional send from fakeRaresCard action`);
                    return originalCallback(sanitized, files);
                  }
                  console.log(`🚫 [Suppression] Dropped follow-up send (bootstrap or other handler)`);
                  return [];
                }
                console.log(`✅ [Suppression] Allowing follow-up send (no suppression)`);
                return originalCallback(sanitized, files);
              };
            }
          } else {
            // No suppression - message has capitalized text or @mention, and is not /f command
            const reason = hasBotMention ? 'bot mentioned with @pepedawn_bot' : 'has capitalized text';
            console.log(`📨 [Suppression] No suppression for message: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" - ${reason}, bootstrap allowed`);
          }
        } catch (_e) {
          // best-effort tagging; never throw
        }
      },
    ],
  },
  services: [],
};

