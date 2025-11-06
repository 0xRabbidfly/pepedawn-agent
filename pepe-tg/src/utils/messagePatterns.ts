/**
 * Message Pattern Detection
 * 
 * Consolidates all pattern matching logic for incoming messages.
 * Returns structured data about what patterns were detected.
 */

import { FULL_CARD_INDEX } from '../data/fullCardIndex';

// Cache card names for O(1) lookup
const cardNameCache = new Set(FULL_CARD_INDEX.map(c => c.asset.toUpperCase()));

/**
 * Check if message contains a valid Fake Rare card name (case-insensitive)
 */
function containsFakeRareCard(text: string): boolean {
  // Extract all words (3+ letters, case-insensitive)
  const allWords = text.match(/\b[A-Za-z]{3,}[A-Za-z0-9]*\b/g) || [];
  return allWords.some(word => cardNameCache.has(word.toUpperCase()));
}

export interface MessagePatterns {
  // Slash commands
  commands: {
    isHelp: boolean;
    isStart: boolean;
    isF: boolean;
    isFCarousel: boolean;
    isC: boolean;
    isP: boolean;
    isFv: boolean;
    isFt: boolean;
    isFl: boolean;
    isFr: boolean;
    isFm: boolean;
    isDawn: boolean;
    isFc: boolean;
    isXcp: boolean;
  };
  
  // Triggers for routing
  triggers: {
    isFakeRareCard: boolean;       // Message contains a valid Fake Rare card name
    hasBotMention: boolean;        // @pepedawn_bot
    isReplyToBot: boolean;         // User replied to bot's message
    hasRememberCommand: boolean;   // "remember" or "remember this"
  };
  
  // Message metadata
  metadata: {
    wordCount: number;
    hasQuestion: boolean;
  };
}

/**
 * Detect all patterns in a message
 * 
 * @param text Message text
 * @param messageParams ElizaOS message parameters (for reply detection)
 * @returns Structured pattern detection results
 */
export function detectMessagePatterns(
  text: string,
  messageParams?: { message?: { content?: { inReplyTo?: any } } }
): MessagePatterns {
  // Slash commands (with optional @botname prefix/suffix)
  const commands = {
    isHelp: /^(?:@[A-Za-z0-9_]+\s+)?\/help(?:@[A-Za-z0-9_]+)?$/i.test(text),
    isStart: /^(?:@[A-Za-z0-9_]+\s+)?\/start(?:@[A-Za-z0-9_]+)?$/i.test(text),
    isFCarousel: /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?\s+c\s+.+$/i.test(text),
    isF: /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+.+)?$/i.test(text),
    isC: /^(?:@[A-Za-z0-9_]+\s+)?\/c(?:@[A-Za-z0-9_]+)?(?:\s+.+)?$/i.test(text),
    isP: /^(?:@[A-Za-z0-9_]+\s+)?\/p(?:@[A-Za-z0-9_]+)?(?:\s+.+)?$/i.test(text),
    isFv: /^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text),
    isFt: /^(?:@[A-Za-z0-9_]+\s+)?\/ft(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text),
    isFl: /^(?:@[A-Za-z0-9_]+\s+)?\/fl(?:@[A-Za-z0-9_]+)?/i.test(text),
    isFr: /^(?:@[A-Za-z0-9_]+\s+)?\/fr(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text),
    isFm: /^(?:@[A-Za-z0-9_]+\s+)?\/fm(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text),
    isDawn: /^(?:@[A-Za-z0-9_]+\s+)?\/dawn(?:@[A-Za-z0-9_]+)?$/i.test(text),
    isFc: /^(?:@[A-Za-z0-9_]+\s+)?\/fc/i.test(text),
    isXcp: /^(?:@[A-Za-z0-9_]+\s+)?\/xcp(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text),
  };
  
  // Routing triggers
  const triggers = {
    isFakeRareCard: containsFakeRareCard(text),
    hasBotMention: /@pepedawn_bot/i.test(text),
    isReplyToBot: !!(messageParams?.message?.content?.inReplyTo),
    hasRememberCommand: /remember(?:\s+this)?/i.test(text),
  };
  
  // Message metadata
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  const hasQuestion = /\?$/.test(text.trim()) || 
    /^(what|how|when|where|why|who|which|can|could|would|should|do|does|did|is|are|was|were)\b/i.test(text);
  
  return {
    commands,
    triggers,
    metadata: {
      wordCount,
      hasQuestion,
    },
  };
}

/**
 * Check if any command was detected
 */
export function hasAnyCommand(patterns: MessagePatterns): boolean {
  return Object.values(patterns.commands).some(v => v);
}

/**
 * Check if any trigger was detected
 */
export function hasAnyTrigger(patterns: MessagePatterns): boolean {
  return Object.values(patterns.triggers).some(v => v);
}

