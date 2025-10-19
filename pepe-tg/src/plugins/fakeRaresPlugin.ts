import { type Plugin } from '@elizaos/core';
import { fakeRaresCardAction, shareLoreAction, educateNewcomerAction, startCommand, helpCommand } from '../actions';
import { fakeRaresContextProvider } from '../providers';
import { loreDetectorEvaluator } from '../evaluators';

/**
 * Fake Rares Plugin - Rebuilt for Bootstrap 1.6.2
 * 
 * Key Changes from 1.6.1:
 * - Manually executes /f commands (bypasses broken DefaultMessageService)
 * - Clean suppression logic for bootstrap responses
 * - Fast and maintainable
 */
export const fakeRaresPlugin: Plugin = {
  name: 'fake-rares',
  description: 'Custom actions for Fake Rares card display and community features',
  priority: 1000,
  actions: [
    startCommand,
    helpCommand,
    fakeRaresCardAction,
  ],
  providers: [fakeRaresContextProvider],
  evaluators: [],
  
  events: {
    MESSAGE_RECEIVED: [
      async (params: any) => {
        try {
          // Extract message text
          const text = (params?.message?.content?.text ?? '').toString().trim();
          
          // Pattern detection
          const isFCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+[A-Za-z0-9_-]+)?$/i.test(text);
          const hasCapitalizedText = /\b[A-Z]{2,}\b/.test(text); // Card names like PEPE, FREEDOMKEK
          const hasBotMention = /@pepedawn_bot/i.test(text);
          
          // Check global suppression mode (env var)
          const globalSuppression = process.env.SUPPRESS_BOOTSTRAP === 'true';
          
          // Log once on first message if global suppression is active
          if (globalSuppression && !params._globalSuppressionLogged) {
            console.log(`🛡️ [SUPPRESS_BOOTSTRAP=true] Only /f commands will work, all bootstrap responses blocked`);
            params._globalSuppressionLogged = true;
          }
          
          // Decision: Should we suppress bootstrap for this message?
          // Suppress if: (1) global mode, (2) /f command, or (3) no caps and no mention
          const shouldSuppress = globalSuppression || isFCommand || (!hasCapitalizedText && !hasBotMention);
          
          // === /F COMMAND HANDLING ===
          // Always process /f commands manually (1.6.2 fix)
          if (isFCommand) {
            console.log(`🎴 [/f] Processing card command`);
            
            const runtime = params.runtime;
            const message = params.message;
            const callback = params.callback;
            
            if (fakeRaresCardAction.validate && fakeRaresCardAction.handler) {
              const isValid = await fakeRaresCardAction.validate(runtime, message);
              
              if (isValid) {
                await fakeRaresCardAction.handler(runtime, message, params.state, {}, callback);
                console.log(`✅ [/f] Card sent successfully`);
                return; // Exit early - action handled, don't let bootstrap process
              }
            }
          }
          
          // === BOOTSTRAP SUPPRESSION ===
          // For non-/f messages, decide if bootstrap should respond
          if (shouldSuppress) {
            const reason = globalSuppression 
              ? 'global mode' 
              : isFCommand 
                ? '/f command' 
                : 'no caps/mention';
            console.log(`🛡️ [Suppress] Blocking bootstrap (${reason})`);
            
            // Wrap callback to prevent bootstrap from sending
            const originalCallback = params.callback;
            if (typeof originalCallback === 'function') {
              params.callback = async (content: any, files?: any) => {
                console.log(`🚫 [Suppress] Blocked bootstrap response`);
                return []; // Don't send anything
              };
            }
          } else {
            // Allow bootstrap to respond
            const reason = hasBotMention ? '@mention' : 'capitalized text';
            console.log(`✅ [Allow] Bootstrap can respond (${reason})`);
          }
          
        } catch (error) {
          console.error(`❌ [Plugin Error]`, error);
        }
      },
    ],
  },
  services: [],
};

