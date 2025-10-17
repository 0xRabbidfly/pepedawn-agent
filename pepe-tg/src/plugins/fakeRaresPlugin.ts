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
    // shareLoreAction,       // DISABLED: Bootstrap handles natural language + embeddings better
    // educateNewcomerAction, // DISABLED: Bootstrap handles this naturally
  ],
  providers: [
    fakeRaresContextProvider,  // Detects card mentions and community context (pure string matching - safe)
  ],
  evaluators: [
    // loreDetectorEvaluator,  // DISABLED: Uses LLM calls that hang when multiple actions compete
  ],
  services: [],
};

