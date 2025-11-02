/**
 * Off-Topic Detection
 * 
 * Detects questions/topics outside PEPEDAWN's scope.
 * Used to silently ignore off-topic messages (no response, no auto-routing).
 */

const OFF_TOPIC_KEYWORDS = [
  // Personal advice
  'relationship', 'girlfriend', 'boyfriend', 'partner', 'marriage', 'divorce',
  'dating', 'love', 'breakup', 'homophobic', 'sexuality', 'sexual', 'sex', 'gay', 'straight',
  'preference', 'orientation', 'gender',
  
  // Medical/health
  'medical', 'doctor', 'hospital', 'prescription', 'medication', 'therapy',
  'mental health', 'depression', 'anxiety', 'suicide',
  
  // Legal
  'lawyer', 'attorney', 'lawsuit', 'legal advice', 'court', 'sue',
 
  // Politics (non-crypto)
  'democrat', 'republican', 'election', 'vote for', 'president', 'congress',
  'liberal', 'conservative', 'political party',
  
  // Religion
  'bible', 'jesus', 'allah', 'religious', 'church', 'mosque', 'temple',
  
  // Explicit/NSFW content
  'cock', 'dick', 'pussy', 'porn', 'nsfw', 'xxx', 'explicit', 
  'masturbate', 'masturbation', 'orgasm', 'erotic',
  
  // Other random
  'weather', 'sports', 'football', 'basketball', 'recipe', 'cooking',
];

// Topics that ARE on-topic (crypto/art related keywords)
const ON_TOPIC_KEYWORDS = [
  'pepe', 'rare', 'fake', 'card', 'artist', 'nft', 'collection',
  'bitcoin', 'counterparty', 'xcp', 'crypto', 'blockchain', 'meme',
  'art', 'series', 'scrilla', 'dawn', 'kek', 'faka', 'nostra',
  'submit', 'mint', 'token', 'wallet', 'dispenser', 'sale', 'listing',
];

/**
 * Detect if a message is off-topic and should be ignored
 * 
 * @param text - Message text to analyze
 * @returns true if message is off-topic and should be ignored
 */
export function isOffTopic(text: string): boolean {
  const lower = text.toLowerCase();
  
  // Skip detection for very short messages (greetings, etc.)
  if (text.length < 10) {
    return false;
  }
  
  // Skip if message contains ANY on-topic keywords
  const hasOnTopicKeyword = ON_TOPIC_KEYWORDS.some(keyword => 
    lower.includes(keyword.toLowerCase())
  );
  
  if (hasOnTopicKeyword) {
    return false; // Has on-topic content, process normally
  }
  
  // Check for off-topic keywords
  const hasOffTopicKeyword = OFF_TOPIC_KEYWORDS.some(keyword => 
    lower.includes(keyword.toLowerCase())
  );
  
  if (hasOffTopicKeyword) {
    return true; // Off-topic, ignore
  }
  
  // Check for generic life advice patterns
  const lifeAdvicePatterns = [
    /how (?:can|do|should) i (?:be|become|get|fix|deal with|handle)/i,
    /what should i do (?:about|with|if)/i,
    /(?:need|want) (?:advice|help) (?:with|about|on)/i,
    /can you (?:help|advise) (?:me )?(?:with|about|on)/i,
  ];
  
  const matchesLifeAdvice = lifeAdvicePatterns.some(pattern => pattern.test(text));
  
  if (matchesLifeAdvice && !hasOnTopicKeyword) {
    return true; // Generic advice seeking without crypto/art context
  }
  
  return false; // Assume on-topic if nothing triggered
}

/**
 * Get reason why message was flagged as off-topic (for logging)
 */
export function getOffTopicReason(text: string): string | null {
  const lower = text.toLowerCase();
  
  for (const keyword of OFF_TOPIC_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      return `Contains off-topic keyword: "${keyword}"`;
    }
  }
  
  const lifeAdvicePatterns = [
    { pattern: /how (?:can|do|should) i (?:be|become|get|fix)/i, reason: 'Generic life advice pattern' },
    { pattern: /what should i do about/i, reason: 'Advice seeking pattern' },
  ];
  
  for (const { pattern, reason } of lifeAdvicePatterns) {
    if (pattern.test(text)) {
      return reason;
    }
  }
  
  return null;
}

