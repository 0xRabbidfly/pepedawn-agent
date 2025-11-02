/**
 * User History Provider
 * 
 * Injects concise user context into conversation state for Bootstrap.
 * Provides smart summary of user's past interactions - NOT raw messages.
 * 
 * Size-constrained to avoid prompt bloat:
 * - Matches user's current message length
 * - Never exceeds tweet length (280 chars)
 */

import { type Provider, type IAgentRuntime, type Memory, logger } from '@elizaos/core';
import { FULL_CARD_INDEX } from '../data/fullCardIndex';

const TWEET_LENGTH = 280;
const MIN_MESSAGES_FOR_CONTEXT = 3; // Don't inject context for new users

/**
 * Extract card mentions from text
 */
function extractCardMentions(messages: any[]): Map<string, number> {
  const cardCounts = new Map<string, number>();
  const cardNames = new Set(FULL_CARD_INDEX.map(c => c.asset.toUpperCase()));
  
  for (const msg of messages) {
    const text = msg.content?.text || '';
    const words = text.match(/\b[A-Z]{3,}[A-Z0-9]*\b/g) || [];
    
    for (const word of words) {
      if (cardNames.has(word)) {
        cardCounts.set(word, (cardCounts.get(word) || 0) + 1);
      }
    }
  }
  
  return cardCounts;
}

/**
 * Summarize user's interests from message history
 */
function summarizeInterests(
  messages: any[], 
  username: string,
  maxLength: number
): string {
  if (messages.length < MIN_MESSAGES_FOR_CONTEXT) {
    return ''; // New user, no context needed
  }
  
  // Extract card mentions
  const cardMentions = extractCardMentions(messages);
  const topCards = Array.from(cardMentions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([card, count]) => count > 1 ? `${card} (${count}x)` : card);
  
  // Build concise summary
  const parts: string[] = [];
  
  // Message count (familiarity signal)
  if (messages.length >= 50) {
    parts.push('regular');
  } else if (messages.length >= 10) {
    parts.push('active');
  }
  
  // Card interests
  if (topCards.length > 0) {
    parts.push(`likes: ${topCards.join(', ')}`);
  }
  
  // Assemble within size limit
  let summary = parts.length > 0 
    ? `${username}: ${parts.join(' | ')}` 
    : '';
  
  // Enforce max length
  if (summary.length > maxLength) {
    summary = summary.substring(0, maxLength - 3) + '...';
  }
  
  return summary;
}

/**
 * User History Provider
 * 
 * Injects brief user context to enable natural conversation continuity.
 * Context is OPTIONAL - character decides when to reference it.
 */
export const userHistoryProvider: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory): Promise<string> => {
    try {
      // Skip for bot's own messages
      if (message.entityId === runtime.agentId) {
        return '';
      }
      
      // Get user's recent messages
      // Use a simple keyword search to avoid embedding issues
      let userOnly: any[] = [];
      
      try {
        // Search with a common word to get recent messages
        const recentMessages = await runtime.searchMemories({
          tableName: 'memories',
          roomId: message.roomId,
          query: 'the',  // Common word to get broad results
          count: 200,
          match_threshold: 0,
        } as any);
        
        // Filter to only this user's messages (exclude bot)
        userOnly = (recentMessages || []).filter((m: any) => 
          m.entityId === message.entityId && 
          m.entityId !== runtime.agentId &&
          m.type === 'messages'
        );
      } catch (searchErr) {
        logger.debug('[UserHistoryProvider] Search failed, trying fallback');
        
        // Fallback: just return empty (fail gracefully)
        return '';
      }
      
      if (userOnly.length < MIN_MESSAGES_FOR_CONTEXT) {
        return ''; // New user, no history to reference
      }
      
      // Extract username from message metadata or use fallback
      let username = 'anon';
      try {
        // Try to get from any message's metadata
        for (const msg of userOnly) {
          if (msg.content?.metadata?.username) {
            username = msg.content.metadata.username;
            break;
          }
        }
      } catch (err) {
        // Fallback to anon
      }
      
      // Calculate max size based on user's current message length
      const userMessageLength = (message.content.text || '').length;
      const maxContextLength = Math.min(
        TWEET_LENGTH,                    // Hard cap: tweet length
        Math.max(50, userMessageLength)  // Soft cap: match user's length (min 50)
      );
      
      // Generate smart summary
      const summary = summarizeInterests(userOnly, username, maxContextLength);
      
      if (!summary) {
        return '';
      }
      
      // Format as passive context (character decides to use or not)
      return `[User context: ${summary}]`;
      
    } catch (error) {
      logger.error('[UserHistoryProvider] Error:', error);
      return ''; // Fail gracefully
    }
  }
};

