/**
 * Shown when a lore or facts query is too ambiguous to answer.
 *
 * Previously lived in actions/loreCommand.ts and instructed people to use /fl.
 * That command is gone and lore is auto-routed now, so it asks in plain language
 * instead.
 */
export const CLARIFICATION_MESSAGE =
  "Not sure what you're after. Name a card, or ask me about an artist, a series, or a bit of history.";
