/**
 * Query Classifier - Detect if user wants FACTS or LORE
 */

export type QueryType = 'FACTS' | 'LORE' | 'UNCERTAIN';

/**
 * Classify query as either:
 * - FACTS: Rules, requirements, specifications, how-to, what is X
 * - LORE: History, stories, community moments, vibes
 * - UNCERTAIN: No clear indicators (only returned if allowUncertain=true)
 */
export function classifyQuery(
  query: string,
  options?: { allowUncertain?: boolean }
): QueryType {
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
  
  // Count matches
  let factScore = 0;
  let loreScore = 0;
  
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
  
  // Special case: Questions with "?" are more likely to want facts
  // But only boost if there's already some fact indication (not standalone "?")
  if (lowerQuery.endsWith('?') && lowerQuery.split(' ').length <= 10 && factScore > 0) {
    factScore += 0.5;
  }
  
  // Special case: "submission rules" always = FACTS
  if (lowerQuery.includes('submission') && lowerQuery.includes('rule')) {
    return 'FACTS';
  }
  
  // Default: If tied or no clear winner, check query length
  const wordCount = lowerQuery.trim().split(/\s+/).length;
  
  if (factScore > loreScore) {
    return 'FACTS';
  } else if (loreScore > factScore) {
    return 'LORE';
  } else {
    // No keywords matched - uncertain
    if (factScore === 0 && loreScore === 0 && options?.allowUncertain) {
      return 'UNCERTAIN';
    }
    
    // Tie-breaker: short queries = lore (conversation), long queries = facts
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

