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
  actions: [
    startCommand,             // /start command
    helpCommand,              // /help command
    fakeRaresCardAction,      // /f command for card display
    shareLoreAction,          // Proactive lore sharing
    educateNewcomerAction,    // Newcomer detection and onboarding
  ],
  providers: [
    fakeRaresContextProvider,  // Detects card mentions and community context
  ],
  evaluators: [
    loreDetectorEvaluator,     // Detects and curates new lore from conversations
  ],
  services: [],
};

