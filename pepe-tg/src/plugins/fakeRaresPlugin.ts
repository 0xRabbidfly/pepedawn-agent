import { type Plugin } from '@elizaos/core';
import { fakeRaresCardAction, shareLoreAction, educateNewcomerAction, startCommand, helpCommand } from '../actions';
import { fakeRaresContextProvider } from '../providers';
import { loreDetectorEvaluator } from '../evaluators';

/**
 * Fake Rares Plugin - Bootstrap 1.6.2 Compatible
 * 
 * This plugin bridges the gap between Telegram (1.0.10) and Bootstrap (1.6.2).
 * Bootstrap 1.6.2 removed its MESSAGE_RECEIVED handler, so we provide one that:
 * 1. Manually executes /f commands (our custom action)
 * 2. Routes all other messages to runtime.messageService (bootstrap's new architecture)
 */
export const fakeRaresPlugin: Plugin = {
  name: 'fake-rares',
  description: 'Fake Rares card display and community features',
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
          
          // Pattern detection
          const isFCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+[A-Za-z0-9_-]+)?$/i.test(text);
          const hasCapitalizedWord = /\b[A-Z]{2,}\b/.test(text);
          const hasBotMention = /@pepedawn_bot/i.test(text);
          const mentionsScrilla = /scrilla/i.test(text);
          const isReply = params?.message?.metadata?.isReply || params?.message?.content?.inReplyTo;
          
          const runtime = params.runtime;
          const message = params.message;
          const callback = params.callback;
          
          // === CUSTOM ACTION: /f COMMANDS ===
          if (isFCommand) {
            if (fakeRaresCardAction.validate && fakeRaresCardAction.handler) {
              const isValid = await fakeRaresCardAction.validate(runtime, message);
              if (isValid) {
                await fakeRaresCardAction.handler(runtime, message, params.state, {}, callback);
                return; // Done
              }
            }
          }
          
          // === BOOTSTRAP: Interesting Messages Only ===
          // Respond if: @mention OR scrilla OR capitalized words OR reply to bot
          const shouldRespond = hasBotMention || mentionsScrilla || hasCapitalizedWord || isReply;
          
          if (shouldRespond) {
            console.log(`[Route] Message matches criteria: "${text}"`);
            
            // Force response by marking message as if it's a reply to the bot
            // This tricks shouldRespond() into always returning true
            if (message.content) {
              message.content.inReplyTo = message.content.inReplyTo || 'force-response';
            }
            
            if (runtime?.messageService) {
              const result = await runtime.messageService.handleMessage(runtime, message, callback);
              console.log(`[Result] didRespond:${result.didRespond}, mode:${result.mode}`);
            }
          } else {
            console.log(`[Suppress] Ignoring: "${text}"`);
          }
          // Suppressed messages don't get routed to messageService
          
        } catch (error) {
          console.error(`[Plugin Error]`, error);
        }
      },
    ],
  },
  
  services: [],
};

