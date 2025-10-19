import { type Plugin } from '@elizaos/core';
import { fakeRaresCardAction, shareLoreAction, educateNewcomerAction, startCommand, helpCommand } from '../actions';
import { fakeRaresContextProvider } from '../providers';
import { loreDetectorEvaluator } from '../evaluators';

/**
 * Fake Rares Plugin - MINIMAL VERSION for 1.6.2 Debugging
 * Stripped down to essentials - just make /f work!
 */
export const fakeRaresPlugin: Plugin = {
  name: 'fake-rares',
  description: 'Custom actions for Fake Rares card display',
  priority: 1000,
  actions: [
    startCommand,
    helpCommand,
    fakeRaresCardAction,
  ],
  providers: [fakeRaresContextProvider],
  evaluators: [],
  
  // MINIMAL MESSAGE_RECEIVED: Just execute /f commands, nothing else
  events: {
    MESSAGE_RECEIVED: [
      async (params: any) => {
        try {
          const text = (params?.message?.content?.text ?? '').toString().trim();
          const isFCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+[A-Za-z0-9_-]+)?$/i.test(text);
          
          console.log(`[MINIMAL] Message: "${text}" | Is /f command: ${isFCommand}`);
          
          // If it's a /f command, manually execute the action
          if (isFCommand) {
            console.log(`[MINIMAL] Processing /f command manually`);
            
            const runtime = params.runtime;
            const message = params.message;
            const callback = params.callback;
            
            if (fakeRaresCardAction.validate && fakeRaresCardAction.handler) {
              const isValid = await fakeRaresCardAction.validate(runtime, message);
              console.log(`[MINIMAL] Validation: ${isValid}`);
              
              if (isValid) {
                console.log(`[MINIMAL] Executing handler`);
                await fakeRaresCardAction.handler(runtime, message, params.state, {}, callback);
                console.log(`[MINIMAL] Handler complete`);
                return; // Stop here - don't let bootstrap process it
              }
            }
          }
        } catch (error) {
          console.error(`[MINIMAL] Error:`, error);
        }
      },
    ],
  },
  services: [],
};

