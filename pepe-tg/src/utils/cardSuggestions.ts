import type { FuzzyMatch } from "./fuzzyMatch";
import { escapeTelegramMarkdown } from "./telegramMarkdown";

export interface SuggestionResponse {
  primaryText: string;
  fallbackText: string;
  buttons: Array<{ text: string; switch_inline_query_current_chat: string }>;
}

export interface SuggestionOptions {
  assetName: string;
  matches: FuzzyMatch[];
  collectionLabel: string;
  commandPrefix: string;
}

export function buildSuggestionResponse({
  assetName,
  matches,
  collectionLabel,
  commandPrefix,
}: SuggestionOptions): SuggestionResponse {
  const suggestionLines = matches.map((m) => `• ${m.name}`).join("\n");

  let message = `❌ Could not find "${assetName}" in the ${collectionLabel}.\n\n`;
  if (suggestionLines) {
    message += `🤔 Did you mean:\n${suggestionLines}\n\n`;
    message += `Tap a suggestion below to fill the command.`;
  } else {
    message += `Double-check the asset name or browse on pepe.wtf.`;
  }

  const fallbackSuggestionText =
    matches.length > 0
      ? `Suggestions: ${matches.map((m) => m.name).join(", ")}`
      : "";

  const fallbackMessage = fallbackSuggestionText
    ? `Could not find ${assetName}. ${fallbackSuggestionText}`
    : `Could not find ${assetName}.`;

  const buttons = matches.map((match) => ({
    text: match.name,
    switch_inline_query_current_chat: `${commandPrefix} ${match.name}`,
  }));

  return {
    primaryText: escapeTelegramMarkdown(message),
    fallbackText: escapeTelegramMarkdown(fallbackMessage),
    buttons,
  };
}

