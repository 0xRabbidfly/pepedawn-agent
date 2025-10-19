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
          const text = (params?.message?.content?.text ?? '').toString().trim();
          const isFCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+[A-Za-z0-9_-]+)?$/i.test(text);
          
          // Only handle /f commands - let bootstrap handle everything else normally
          if (isFCommand) {
            console.log(`🎴 [/f] Processing card command`);
            
            const runtime = params.runtime;
            const message = params.message;
            const callback = params.callback;
            
            if (fakeRaresCardAction.validate && fakeRaresCardAction.handler) {
              const isValid = await fakeRaresCardAction.validate(runtime, message);
              
              if (isValid) {
                await fakeRaresCardAction.handler(runtime, message, params.state, {}, callback);
                console.log(`✅ [/f] Card sent`);
                return; // Done - bootstrap doesn't need to process this
              }
            }
          } else {
            // Not a /f command - manually call messageService (1.6.2 fix)
            console.log(`💬 [Bootstrap] Processing message via messageService`);
            
            const runtime = params.runtime;
            const message = params.message;
            const callback = params.callback;
            
            // Manually invoke messageService since bootstrap's handler is broken
            if (runtime?.messageService) {
              try {
                await runtime.messageService.handleMessage(runtime, message, callback);
              } catch (err) {
                console.error(`❌ [Bootstrap] Error:`, err);
              }
              return; // Prevent bootstrap's handler from also processing
            }
          }
          
        } catch (error) {
          console.error(`❌ [Plugin Error]`, error);
        }
      },
    ],
  },
  services: [],
};

