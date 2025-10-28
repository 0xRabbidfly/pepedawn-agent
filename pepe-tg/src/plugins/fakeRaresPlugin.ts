import { type Plugin } from '@elizaos/core';
import { fakeRaresCardAction, educateNewcomerAction, startCommand, helpCommand, loreCommand, oddsCommand, costCommand, fakeVisualCommand, fakeTestCommand } from '../actions';
import { fakeRaresContextProvider } from '../providers';
import { loreDetectorEvaluator } from '../evaluators';
import { FULL_CARD_INDEX } from '../data/fullCardIndex';
import { startAutoRefresh } from '../utils/cardIndexRefresher';
import { patchRuntimeForTracking } from '../utils/tokenLogger';
import { storeUserMemory } from '../utils/memoryStorage';
import { classifyQuery } from '../utils/queryClassifier';
import { retrieveKnowledge } from '../services/knowledgeService';

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
    fakeVisualCommand,
    fakeTestCommand,
    loreCommand,
    costCommand,
  ],
  
  providers: [fakeRaresContextProvider],
  evaluators: [],
  
  events: {
    MESSAGE_RECEIVED: [
      async (params: any) => {
        try {
          const runtime = params.runtime;
          const message = params.message;
          
          // Patch runtime to track ALL AI calls (including bootstrap)
          patchRuntimeForTracking(runtime);
          
          const text = (params?.message?.content?.text ?? '').toString().trim();
          const globalSuppression = process.env.SUPPRESS_BOOTSTRAP === 'true';
          
          // 🚨 CRITICAL: Block FAKEASF burn messages BEFORE LLM sees them
          const mentionsFakeasf = /fakeasf/i.test(text);
          const mentionsBurn = /burn|burning/i.test(text);
          if (mentionsFakeasf && mentionsBurn) {
            console.log('[FakeRaresPlugin] 🚨 BLOCKED FAKEASF BURN QUERY - responding without LLM');
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
          const isDawnCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/dawn$/i.test(text);
          const isHelpCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/help$/i.test(text);
          const isStartCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/start$/i.test(text);
          const isCostCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fc/i.test(text);
          const hasCapitalizedWord = /\b[A-Z]{3,}[A-Z0-9]*\b/.test(text); // 3+ caps (likely card names)
          const hasBotMention = /@pepedawn_bot/i.test(text);
          const isReplyToBot = params?.message?.content?.inReplyTo; // User replied to bot's message
          const hasRememberThis = /remember\s+this/i.test(text);

          console.log(`[FakeRaresPlugin] MESSAGE_RECEIVED text="${text}" isF=${isFCommand} isFv=${isFvCommand} isFt=${isFtCommand} isLore=${isLoreCommand} isDawn=${isDawnCommand} isHelp=${isHelpCommand} isStart=${isStartCommand} isCost=${isCostCommand} SUPPRESS_BOOTSTRAP=${globalSuppression}`);
          
          // === MEMORY CAPTURE: "remember this" ===
          if ((hasCapitalizedWord || isReplyToBot || hasBotMention) && hasRememberThis) {
            console.log('[FakeRaresPlugin] "remember this" detected → storing memory');
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            
            try {
              const result = await storeUserMemory(runtime, message, params.ctx?.message);
              
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
                console.log('[FakeRaresPlugin] Memory stored successfully');
                return; // Done
              } else if (result.ignoredReason) {
                // Silent ignore (empty content, etc.)
                console.debug(`[FakeRaresPlugin] Memory ignored: ${result.ignoredReason}`);
                // Don't respond, don't mark as handled, let flow continue
              } else if (result.error) {
                // Storage failed
                console.error(`[FakeRaresPlugin] Memory storage failed: ${result.error}`);
                if (actionCallback) {
                  await actionCallback({
                    text: `❌ Failed to store memory: ${result.error}`
                  });
                }
                return; // Done (with error)
              }
            } catch (error) {
              console.error('[FakeRaresPlugin] Memory storage exception:', error);
              // Continue to normal flow on exception
            }
          }
          
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
          
          // === CUSTOM ACTION: /fv COMMANDS ===
          if (isFvCommand) {
            console.log('[FakeRaresPlugin] /fv detected → applying strong suppression and invoking action');
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
                console.log('[FakeRaresPlugin] /fv action completed');
                return; // Done
              }
            }
          }
          
          // === CUSTOM ACTION: /ft COMMANDS ===
          if (isFtCommand) {
            console.log('[FakeRaresPlugin] /ft detected → applying strong suppression and invoking action');
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
                console.log('[FakeRaresPlugin] /ft action completed');
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
          
          // === CUSTOM ACTION: /dawn COMMANDS ===
          if (isDawnCommand) {
            console.log('[FakeRaresPlugin] /dawn detected → applying strong suppression and invoking action');
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
                console.log('[FakeRaresPlugin] /dawn action completed');
                return; // Done
              } else {
                console.log('[FakeRaresPlugin] /dawn validation failed');
              }
            }
          }
          
          // === CUSTOM ACTION: /help COMMANDS ===
          if (isHelpCommand) {
            console.log('[FakeRaresPlugin] /help detected → applying strong suppression and invoking action');
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
                console.log('[FakeRaresPlugin] /help action completed');
                return; // Done - exit entire function
              } else {
                console.log('[FakeRaresPlugin] /help validation failed, but still marking as handled');
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
            console.log('[FakeRaresPlugin] /start detected → applying strong suppression and invoking action');
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
                console.log('[FakeRaresPlugin] /start action completed');
                return; // Done - exit entire function
              } else {
                console.log('[FakeRaresPlugin] /start validation failed, but still marking as handled');
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
            console.log('[FakeRaresPlugin] /fc detected → applying strong suppression and invoking action');
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
                console.log('[FakeRaresPlugin] /fc action completed');
                return; // Done - exit entire function
              } else {
                console.log('[FakeRaresPlugin] /fc validation failed (not admin), suppressing');
                try {
                  message.metadata = message.metadata || {};
                  (message.metadata as any).__handledByCustom = true;
                } catch {}
                return; // Done - exit entire function
              }
            }
          }
          
          // === AUTO-ROUTE FACTS QUESTIONS ===
          // Detect fact questions and route to knowledge retrieval
          const queryType = classifyQuery(text, { allowUncertain: true });
          console.log(`[FakeRaresPlugin] Query classification: ${queryType}`);
          
          if (queryType === 'FACTS') {
            console.log(`[FakeRaresPlugin] 📚 Auto-routing FACTS query to knowledge retrieval`);
            const actionCallback = typeof params.callback === 'function' ? params.callback : null;
            params.callback = async () => [];
            
            try {
              const result = await retrieveKnowledge(runtime, text, message.roomId, {
                mode: 'FACTS',
                includeMetrics: true,
              });
              
              const finalMessage = result.story + result.sourcesLine;
              
              if (actionCallback) {
                await actionCallback({ text: finalMessage });
              }
              
              console.log(`[FakeRaresPlugin] ✅ Auto-routed knowledge response sent`);
              console.log(`   Hits: ${result.metrics.hits_used}, Latency: ${result.metrics.latency_ms}ms`);
              
              try {
                message.metadata = message.metadata || {};
                (message.metadata as any).__handledByCustom = true;
              } catch {}
              
              return;
            } catch (err) {
              console.error('[FakeRaresPlugin] ❌ Auto-route failed, falling back to conversation:', err);
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
            console.log('[Suppress] SUPPRESS_BOOTSTRAP=true → suppressing all bootstrap');
            message.metadata = message.metadata || {};
            (message.metadata as any).__handledByCustom = true;
            return;
          }
          
          if (shouldAllowBootstrap) {
            console.log(`[Allow] Bootstrap allowed: reply=${!!isReplyToBot} caps=${hasCapitalizedWord} mention=${hasBotMention} | "${text}"`);
            // Let bootstrap handle it - do NOT mark as handled
          } else {
            console.log(`[Suppress] Bootstrap blocked (no trigger): "${text}"`);
            
            // CRITICAL: Strip image attachments to prevent Bootstrap from auto-analyzing them
            // (Only when Bootstrap would be suppressed anyway - doesn't affect @mentions or replies)
            // PRESERVE attachments for /fv and /ft commands which need them
            const hasAttachments = message.content.attachments && message.content.attachments.length > 0;
            if (hasAttachments && !isFvCommand && !isFtCommand) {
              console.log('[FakeRaresPlugin] Clearing image attachment (Bootstrap suppressed, not /fv or /ft command)');
              message.content.attachments = [];
            }
            
            // Mark as handled to suppress bootstrap
            message.metadata = message.metadata || {};
            (message.metadata as any).__handledByCustom = true;
          }
          
        } catch (error) {
          console.error(`[Plugin Error]`, error);
          
          // Send error response to prevent hanging
          try {
            if (params.callback && typeof params.callback === 'function') {
              await params.callback({
                text: `❌ Sorry, I encountered an error processing your message. Please try again.`,
                suppressBootstrap: true,
              });
            }
          } catch (callbackError) {
            console.error(`[Plugin Error] Callback failed:`, callbackError);
          }
        }
      },
    ],
  },
  
  services: [],
};

