/**
 * Query Classifier - Detect if user wants FACTS or LORE
 */

import { logger } from '@elizaos/core';

export type QueryType = 'FACTS' | 'LORE' | 'UNCERTAIN';

/**
 * Classify query as either:
 * - FACTS: Rules, requirements, specifications, how-to, what is X
 * - LORE: History, stories, community moments, vibes
 * - UNCERTAIN: No clear indicators, ambiguous queries (route to AI conversation)
 */
export function classifyQuery(query: string): QueryType {
  const lowerQuery = query.toLowerCase();
  
  // Skip slash commands - they're handled by specific actions
  if (/^\/[a-z]+/i.test(lowerQuery.trim())) {
    logger.info(`   QueryClassifier: UNCERTAIN (slash command)`);
    return 'UNCERTAIN';
  }

  // Card discovery intent: inquisitive language + mention of cards/fakes
  const hasCardKeyword = /\b(card|cards|fake|fakes|fake rare|fake rares|rake rare|rare fake|rare card|rare cards)\b/.test(lowerQuery);
  const hasInquisitive =
    /\b(show|find|looking|search|need|want|which|what|who|how|can|where|is|are|do|does|any|recommend|suggest|tell|give|got)\b/.test(lowerQuery) ||
    lowerQuery.includes('?');
  if (hasCardKeyword && hasInquisitive) {
    logger.info(`   QueryClassifier: FACTS (card discovery intent)`);
    return 'FACTS';
  }
  
  // FACTS indicators - looking for concrete information
  const factKeywords = [
    // Direct questions
    'what are', 'what is', 'how do', 'how to', 'how many', 'how much',
    'when can', 'where do', 'which', 'can i', 'do i need',
    
    // Rules and requirements
    'rules', 'requirements', 'requirement', 'submission', 'submit',
    'fee', 'cost', 'price', 'destroy', 'burn', 'sacrifice',
    'size', 'format', 'specifications', 'specs',
    'minimum', 'maximum', 'must', 'need to',
    
    // Technical details
    'locked', 'divisible', 'issuance', 'supply', 'tokens',
    'xcp', 'pepecash',
    'process', 'steps', 'instructions', 'guide',
    
    // Definitions
    'define', 'definition', 'meaning', 'explain',
  ];
  
  // LORE indicators - looking for stories/history
  const loreKeywords = [
    // Story requests
    'tell me about', 'history of', 'story of', 'who created',
    'origin', 'beginning', 'started', 'began',
    
    // Community/cultural
    'community', 'vibe', 'culture', 'scene',
    'famous', 'legendary', 'notable', 'memorable',
    'remember when', 'back when',
    
    // People and moments
    'who is', 'who was', 'what happened', 'why did',
  ];
  
  // CONVERSATIONAL indicators - casual chat, not knowledge-seeking
  const conversationalKeywords = [
    // Greetings
    'gm', 'gn', 'hi', 'hello', 'hey', 'sup', 'yo',
    
    // Thanks/reactions
    'thanks', 'thank you', 'ty', 'thx',
    'nice', 'cool', 'awesome', 'great', 'sweet', 
    
    // Memes/slang
    'lol', 'lmao', 'haha', 'kek', 'based',
    'wagmi', 'ngmi', 'wen', 'ser', 'fren', 'rekt',
    
    // Agreement/acknowledgment
    'ok', 'okay', 'yes', 'yeah', 'yep', 'yup', 'nope',
  ];
  
  // Count matches
  let factScore = 0;
  let loreScore = 0;
  let conversationalScore = 0;
  
  for (const keyword of factKeywords) {
    if (lowerQuery.includes(keyword)) {
      factScore++;
    }
  }
  
  for (const keyword of loreKeywords) {
    if (lowerQuery.includes(keyword)) {
      loreScore++;
    }
  }
  
  for (const keyword of conversationalKeywords) {
    // Use word boundary for single-word conversational keywords to avoid false matches
    // (e.g., "this" shouldn't match "hi")
    const wordBoundaryRegex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (wordBoundaryRegex.test(lowerQuery)) {
      conversationalScore++;
    }
  }
  
  // Special case: Questions with "?" are more likely to want facts
  // But only boost if there's already some fact indication (not standalone "?")
  if (lowerQuery.endsWith('?') && lowerQuery.split(' ').length <= 10 && factScore > 0) {
    factScore += 0.5;
  }
  
  // Special case: "submission rules" always = FACTS
  if (lowerQuery.includes('submission') && lowerQuery.includes('rule')) {
    logger.info(`   QueryClassifier: FACTS (submission rules keyword)`);
    return 'FACTS';
  }
  
  // Check if conversational wins (casual chat, not knowledge-seeking)
  if (conversationalScore > 0 && conversationalScore >= factScore && conversationalScore >= loreScore) {
    logger.info(`   QueryClassifier: UNCERTAIN (conversational, score=${conversationalScore})`);
    return 'UNCERTAIN';
  }
  
  // Default: If tied or no clear winner, check query length
  const wordCount = lowerQuery.trim().split(/\s+/).length;
  
  let result: QueryType;
  let reason: string;
  
  if (factScore > loreScore) {
    result = 'FACTS';
    reason = `fact=${factScore} > lore=${loreScore}`;
  } else if (loreScore > factScore) {
    result = 'LORE';
    reason = `lore=${loreScore} > fact=${factScore}`;
  } else {
    // No keywords matched
    if (factScore === 0 && loreScore === 0) {
      // Short queries (≤3 words) likely card/artist names → search knowledge
      // Long unclear queries → route to AI conversation
      result = wordCount <= 4 ? 'LORE' : 'UNCERTAIN';
      reason = factScore === 0 && loreScore === 0 ? `no keywords, ${wordCount} words` : `tied, ${wordCount} words`;
    } else {
      // Both have keywords but tied - use length heuristic
      result = wordCount <= 6 ? 'LORE' : 'FACTS';
      reason = `tied at ${factScore}, ${wordCount} words`;
    }
  }
  
  logger.info(`   QueryClassifier: ${result} (${reason})`);
  return result;
}

/**
 * Examples for testing:
 * 
 * FACTS queries:
 * - "what are the fake rares submission rules?"
 * - "how do I submit a fake rare?"
 * - "what is the fee to submit?"
 * - "what size do fakes need to be?"
 * - "do I need to lock issuance?"
 * - "how many tokens minimum?"
 * 
 * LORE queries:
 * - "tell me about fake rares"
 * - "who created fake rares?"
 * - "what's the fake rares community like?"
 * - "history of fake rares"
 * - "what happened with matt furie?"
 */

