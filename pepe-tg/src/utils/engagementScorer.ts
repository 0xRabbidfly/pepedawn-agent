/**
 * Engagement Scorer
 * 
 * Calculates an engagement score (0-100+) to determine if the bot should respond.
 * Uses multiple signals: mentions, replies, card names, questions, message length, etc.
 * 
 * Score >= threshold → Respond
 * Score < threshold → Silent ignore
 */

import { logger } from '@elizaos/core';

export interface EngagementParams {
  text: string;
  hasBotMention: boolean;
  isReplyToBot: boolean;
  isFakeRareCard: boolean;
  userId: string;
  roomId: string;
}

// Track user activity
const userLastSeen: { [userId: string]: number } = {};
const HOURS_FOR_RETURNING_BOOST = 24;
const RETURNING_USER_BOOST = 25;  // Optimized: 20 → 25 (Monte Carlo on 264k messages)
const NEWCOMER_BOOST = 100;  // First-time users get high priority

// Track room activity
const roomLastMessage: { [roomId: string]: number } = {};
const MINUTES_FOR_QUIET_BOOST = 5;
const QUIET_THREAD_BOOST = 20;  // Optimized: 30 → 20 (Monte Carlo on 264k messages)

/**
 * Generic reaction patterns that typically don't need bot responses
 */
const GENERIC_REACTIONS = [
  'gm', 'gn', 'gma', 'gme', 'gmc',  // Greetings
  'kek', 'lol', 'lmao', 'rofl', 'haha', 'hehe',  // Laughter
  'based', 'ngmi', 'wagmi', 'ser', 'fren', 'frens',  // Crypto slang
  'nice', 'cool', 'neat', 'dope', 'sick',  // Generic approval
  'bruh', 'oof', 'rip', 'f',  // Generic reactions
];

/**
 * Question indicators
 * Includes imperative requests and indirect questions
 */
const QUESTION_PATTERNS = [
  /\?$/,  // Ends with ?
  /^(what|how|when|where|why|who|which|can|could|would|should|do|does|did|is|are|was|were)\b/i,
  /^(tell|show|explain|describe|list|give)\s+(me|us)\s+(about|the|how)/i,  // "tell me about X"
  /\b(need to know|want to know|wondering|curious)\b/i,  // "I need to know about X"
];

/**
 * Check if message is a question (including imperative requests)
 */
function isQuestion(text: string): boolean {
  return QUESTION_PATTERNS.some(pattern => pattern.test(text.trim()));
}

/**
 * Check if message is a generic reaction
 */
function isGenericReaction(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  
  // Check exact matches
  if (GENERIC_REACTIONS.includes(normalized)) return true;
  
  // Check emoji-only messages
  const emojiOnly = /^[\p{Emoji}\s]+$/u;
  if (emojiOnly.test(text)) return true;
  
  return false;
}

/**
 * Calculate engagement score for a message
 * 
 * @param params Message context and triggers
 * @returns Engagement score (0-100+, can exceed 100 for high-priority messages)
 */
export function calculateEngagementScore(params: EngagementParams): number {
  let score = 0;
  const scoreBreakdown: string[] = [];
  const wordCount = params.text.split(/\s+/).filter(w => w.length > 0).length;
  const now = Date.now();
  
  // === CONTEXT BOOSTS ===
  
  // Check if user is new or returning
  const lastSeen = userLastSeen[params.userId];
  if (lastSeen === undefined) {
    // First-time user → Welcome them!
    score += NEWCOMER_BOOST;
    scoreBreakdown.push(`newcomer=+${NEWCOMER_BOOST}`);
  } else {
    // Returning user → Check if they've been away
    const hoursSinceLastSeen = (now - lastSeen) / (1000 * 60 * 60);
    if (hoursSinceLastSeen >= HOURS_FOR_RETURNING_BOOST) {
      score += RETURNING_USER_BOOST;
      scoreBreakdown.push(`returning(${Math.floor(hoursSinceLastSeen)}h)=+${RETURNING_USER_BOOST}`);
    }
  }
  
  // Thread has gone quiet for 5+ minutes → Break the silence
  // Only apply if room was previously tracked (ignore first message in room)
  const lastMessage = roomLastMessage[params.roomId];
  if (lastMessage !== undefined) {
    const minutesSinceLastMessage = (now - lastMessage) / (1000 * 60);
    if (minutesSinceLastMessage >= MINUTES_FOR_QUIET_BOOST) {
      score += QUIET_THREAD_BOOST;
      scoreBreakdown.push(`quiet(${Math.floor(minutesSinceLastMessage)}m)=+${QUIET_THREAD_BOOST}`);
    }
  }
  
  // Update activity tracking
  userLastSeen[params.userId] = now;
  roomLastMessage[params.roomId] = now;
  
  // === HIGH PRIORITY (auto-respond) ===
  
  // Direct @mention → Always respond
  if (params.hasBotMention) {
    score += 100;
    scoreBreakdown.push('@mention=+100');
  }
  
  // Reply to bot → Always respond
  if (params.isReplyToBot) {
    score += 100;
    scoreBreakdown.push('reply=+100');
  }
  
  // === MEDIUM PRIORITY (contextual) ===
  
  // Fake Rare card name mentioned → Discussing specific cards
  if (params.isFakeRareCard) {
    score += 15;  // Optimized: 20 → 15 (Monte Carlo V2: 72k configs, 264k messages)
    scoreBreakdown.push('card=+15');
  }
  
  // Question asked → Seeking information
  if (isQuestion(params.text)) {
    score += 30;  // Optimized: 35 → 30 (Monte Carlo V2: 72k configs, 264k messages)
    scoreBreakdown.push('question=+30');
  }
  
  // Multi-word message → More substantive than reactions
  if (wordCount > 7) {
    score += 5;  // Optimized: 10 → 5 (Monte Carlo V2: 72k configs, 264k messages)
    scoreBreakdown.push(`multiword(${wordCount})=+5`);
  }
  
  // === LOW PRIORITY (penalties) ===
  
  // Short messages → Often reactions/noise
  if (wordCount < 5 && !params.hasBotMention && !params.isReplyToBot) {
    score -= 10;  // Optimized: 5 → 10 (Monte Carlo V2: 72k configs, 264k messages)
    scoreBreakdown.push(`short(${wordCount})=-10`);
  }
  
  // Generic reactions → Low value
  if (isGenericReaction(params.text)) {
    score -= 15;  // Optimized: 10 → 15 (Monte Carlo V2: 72k configs, 264k messages)
    scoreBreakdown.push('generic=-15');
  }
  
  // Log engagement calculation with visual marker
  const breakdown = scoreBreakdown.length > 0 ? ` (${scoreBreakdown.join(', ')})` : '';
  logger.info(`   Engagement: score=${score}${breakdown}`);
  
  return score;
}

/**
 * Engagement threshold - minimum score required to respond
 * Optimized via Monte Carlo V2 simulation:
 * - 72,000 configurations tested
 * - 264,323 real messages analyzed
 * - Target: 10-20% overall engagement
 * Configurable via ENGAGEMENT_THRESHOLD env var (default: 25)
 */
const ENGAGEMENT_THRESHOLD = parseInt(process.env.ENGAGEMENT_THRESHOLD || '25', 10);

/**
 * Check if message meets engagement threshold
 */
export function shouldRespond(score: number): boolean {
  return score >= ENGAGEMENT_THRESHOLD;
}

/**
 * Get the current engagement threshold (for logging/debugging)
 */
export function getEngagementThreshold(): number {
  return ENGAGEMENT_THRESHOLD;
}

/**
 * Reset activity tracking (for testing)
 */
export function resetEngagementTracking(): void {
  Object.keys(userLastSeen).forEach(key => delete userLastSeen[key]);
  Object.keys(roomLastMessage).forEach(key => delete roomLastMessage[key]);
}

