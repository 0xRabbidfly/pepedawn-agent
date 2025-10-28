/**
 * Query Classifier - Detect if user wants FACTS or LORE
 */

export type QueryType = 'FACTS' | 'LORE' | 'UNCERTAIN';

/**
 * Classify query as either:
 * - FACTS: Rules, requirements, specifications, how-to, what is X
 * - LORE: History, stories, community moments, vibes
 * - UNCERTAIN: No clear indicators, ambiguous queries (route to AI conversation)
 */
export function classifyQuery(query: string): QueryType {
  const lowerQuery = query.toLowerCase();
  
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
    return 'FACTS';
  }
  
  // Check if conversational wins (casual chat, not knowledge-seeking)
  if (conversationalScore > 0 && conversationalScore >= factScore && conversationalScore >= loreScore) {
    return 'UNCERTAIN';
  }
  
  // Default: If tied or no clear winner, check query length
  const wordCount = lowerQuery.trim().split(/\s+/).length;
  
  if (factScore > loreScore) {
    return 'FACTS';
  } else if (loreScore > factScore) {
    return 'LORE';
  } else {
    // No keywords matched
    if (factScore === 0 && loreScore === 0) {
      // Short queries (≤3 words) likely card/artist names → search knowledge
      // Long unclear queries → route to AI conversation
      return wordCount <= 4 ? 'LORE' : 'UNCERTAIN';
    }
    
    // Both have keywords but tied - use length heuristic
    return wordCount <= 6 ? 'LORE' : 'FACTS';
  }
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

