import { type Plugin } from '@elizaos/core';
import { fakeRaresCardAction, educateNewcomerAction, startCommand, helpCommand, loreCommand } from '../actions';
import { fakeRaresContextProvider } from '../providers';
import { loreDetectorEvaluator } from '../evaluators';
import { FULL_CARD_INDEX } from '../data/fullCardIndex';
import { startAutoRefresh } from '../utils/cardIndexRefresher';

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
    console.log('\n🎴 Initializing Fake Rares Plugin...');
    console.log(`📦 Loaded ${FULL_CARD_INDEX.length} cards from disk`);
    
    // Start auto-refresh from GitHub
    startAutoRefresh(FULL_CARD_INDEX);
    
    console.log('✅ Fake Rares Plugin initialized\n');
  },
  
  actions: [
    startCommand,
    helpCommand,
    fakeRaresCardAction,
    loreCommand,
  ],
  
  providers: [fakeRaresContextProvider],
  evaluators: [],
  
  events: {
    MESSAGE_RECEIVED: [
      async (params: any) => {
        try {
          const text = (params?.message?.content?.text ?? '').toString().trim();
          const globalSuppression = process.env.SUPPRESS_BOOTSTRAP === 'true';
          
          // Pattern detection
          const isFCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+[A-Za-z0-9_-]+)?$/i.test(text);
          const isLoreCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fl/i.test(text);
          const hasCapitalizedWord = /\b[A-Z]{2,}\b/.test(text);
          const hasBotMention = /@pepedawn_bot/i.test(text);
          const isReply = params?.message?.metadata?.isReply || params?.message?.content?.inReplyTo;
          
          const runtime = params.runtime;
          const message = params.message;

          console.log(`[FakeRaresPlugin] MESSAGE_RECEIVED text="${text}" isF=${/^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+[A-Za-z0-9_-]+)?$/i.test(text)} SUPPRESS_BOOTSTRAP=${globalSuppression}`);
          
          // === CUSTOM ACTION: /f COMMANDS ===
          if (isFCommand) {
            console.log('[FakeRaresPlugin] /f detected → applying strong suppression and invoking action');
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
                console.log('[FakeRaresPlugin] /f action completed');
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
          
          // === BOOTSTRAP ROUTING ===
          // Do not call messageService here to avoid double-callbacks.
          // Telegram platform will invoke messageService exactly once.
          // Keep logs for visibility only.
          const shouldRespond = hasBotMention || hasCapitalizedWord || isReply;
          if (globalSuppression) {
            console.log('[Suppress] SUPPRESS_BOOTSTRAP=true → platform will skip via handled flag when set');
          } else if (shouldRespond) {
            console.log(`[Info] Bootstrap allowed by platform for: "${text}"`);
          } else {
            console.log(`[Suppress] Not interesting: "${text}"`);
          }
          
        } catch (error) {
          console.error(`[Plugin Error]`, error);
        }
      },
    ],
  },
  
  services: [],
};

