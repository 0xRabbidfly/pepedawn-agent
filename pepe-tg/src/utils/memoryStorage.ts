/**
 * Memory Storage Utilities
 * 
 * Extracted utility functions for memory content processing.
 * Used by MemoryStorageService and available for testing.
 */

import { FULL_CARD_INDEX } from '../data/fullCardIndex';
import type { MemoryContent } from '../types/memory';

// Build card index once for O(1) lookups
const cardIndex = new Set(FULL_CARD_INDEX.map(c => c.asset.toUpperCase()));

/**
 * Detect card name in first sentence (uses cached card index for O(1) lookup)
 */
export function detectCardForMemory(text: string): string | null {
  const firstSentence = text.split(/[.!?]/)[0];
  const capitalWords = firstSentence.match(/\b[A-Z]{3,}[A-Z0-9]*\b/g) || [];
  
  for (const word of capitalWords) {
    if (cardIndex.has(word.toUpperCase())) {
      return word.toUpperCase();
    }
  }
  
  return null;
}

/**
 * Extract content to be remembered from the message
 */
export function extractMemoryContent(
  messageText: string,
  isReply: boolean,
  originalMessage?: string
): MemoryContent {
  // Remove "remember" or "remember this" trigger phrase and extract content
  const cleanText = messageText.replace(/remember(?:\s+this)?[:\s]*/i, '').trim();
  
  if (isReply && originalMessage) {
    // REPLY flow: combine original bot message + user's comment
    const userComment = cleanText || messageText.trim();
    const combinedText = `${originalMessage}\n\nUser comment: ${userComment}`;
    
    return {
      text: combinedText,
      isReplyContext: true,
      originalMessage: originalMessage,
      userComment: userComment
    };
  } else {
    // Direct command: just use the text after "remember this"
    return {
      text: cleanText,
      isReplyContext: false,
      userComment: cleanText
    };
  }
}

/**
 * Validate memory content before storage
 */
export function validateMemoryContent(content: MemoryContent): {
  valid: boolean;
  reason?: 'empty_content' | 'too_long' | 'invalid_format';
} {
  // Check for empty or whitespace-only content
  if (!content.text || content.text.trim().length === 0) {
    return {
      valid: false,
      reason: 'empty_content'
    };
  }
  
  // Check for excessively long content (reasonable limit: 10k chars)
  if (content.text.length > 10000) {
    return {
      valid: false,
      reason: 'too_long'
    };
  }
  
  return {
    valid: true
  };
}

