/**
 * Daily Chat Simulation - 100-200 messages
 * 
 * Simulates realistic Telegram chat to validate engagement scoring
 */

// OPTIMAL CONFIG from comprehensive Monte Carlo
const CONFIG = {
  threshold: 31,
  returningBoost: 20,
  quietBoost: 30,
  cardBoost: 20,
  questionBoost: 35,
  multiwordBoost: 10,
  genericPenalty: 10,
  shortPenalty: 5,
};

const GENERIC_REACTIONS = [
  'gm', 'gn', 'hi', 'hello', 'hey', 'sup', 'yo', 'kek', 'lol', 'based', 'ngmi', 
  'wagmi', 'ser', 'fren', 'wen', 'soon', 'lfg', 'nice', 'ok', 'cool', 'thanks', 'ty'
];

function isGenericReaction(text) {
  const lowerText = text.toLowerCase().trim();
  return GENERIC_REACTIONS.includes(lowerText) || /^[\p{Emoji}\s]+$/u.test(text);
}

const QUESTION_PATTERNS = [
  /\?$/,
  /^(what|how|when|where|why|who|which|can|could|would|should|do|does|did|is|are|was|were)\b/i,
  /^(tell|show|explain|describe|list|give)\s+(me|us)\s+(about|the|how)/i,
  /\b(need to know|want to know|wondering|curious)\b/i,
];

function isQuestion(text) {
  return QUESTION_PATTERNS.some(pattern => pattern.test(text.trim()));
}

function containsCard(text) {
  const cardNames = ['PEPEDAWN', 'FREEDOMKEK', 'WAGMIWORLD', 'FAKEPARTY', 'KEKGRAM', 'PEPONACID'];
  return cardNames.some(card => text.toUpperCase().includes(card));
}

function calculateScore(msg, returning, quiet) {
  let score = 0;
  const wordCount = msg.text.split(/\s+/).filter(w => w.length > 0).length;
  
  // Context
  if (returning) score += CONFIG.returningBoost;
  if (quiet) score += CONFIG.quietBoost;
  
  // High priority
  if (msg.mention) score += 100;
  if (msg.reply) score += 100;
  
  // Medium priority
  if (msg.card || containsCard(msg.text)) score += CONFIG.cardBoost;
  if (msg.question || isQuestion(msg.text)) score += CONFIG.questionBoost;
  if (wordCount > 7) score += CONFIG.multiwordBoost;
  
  // Penalties
  if (wordCount < 5 && !msg.mention && !msg.reply) score -= CONFIG.shortPenalty;
  if (isGenericReaction(msg.text)) score -= CONFIG.genericPenalty;
  
  return score;
}

// Realistic message distribution for a day (100-200 messages)
const MESSAGE_TYPES = [
  // Noise (60% of messages)
  { type: 'generic_gm', text: 'gm', card: false, question: false, mention: false, reply: false, weight: 15 },
  { type: 'generic_nice', text: 'nice', card: false, question: false, mention: false, reply: false, weight: 10 },
  { type: 'emoji', text: '🔥', card: false, question: false, mention: false, reply: false, weight: 10 },
  { type: 'lol', text: 'lol', card: false, question: false, mention: false, reply: false, weight: 8 },
  { type: 'based', text: 'based', card: false, question: false, mention: false, reply: false, weight: 8 },
  { type: 'wagmi', text: 'wagmi', card: false, question: false, mention: false, reply: false, weight: 5 },
  { type: 'lfg', text: 'lfg', card: false, question: false, mention: false, reply: false, weight: 4 },
  
  // Card mentions (20% of messages)
  { type: 'card_single', text: 'PEPEDAWN', card: true, question: false, mention: false, reply: false, weight: 8 },
  { type: 'card_statement', text: 'FREEDOMKEK is amazing', card: true, question: false, mention: false, reply: false, weight: 5 },
  { type: 'card_opinion', text: 'just bought PEPEDAWN', card: true, question: false, mention: false, reply: false, weight: 4 },
  { type: 'card_announcement', text: 'FAKEPARTY for sale, 0.1 BTC', card: true, question: false, mention: false, reply: false, weight: 3 },
  
  // Questions (10% of messages)
  { type: 'card_question', text: 'what is PEPEDAWN?', card: true, question: true, mention: false, reply: false, weight: 4 },
  { type: 'general_question', text: 'how do I submit?', card: false, question: true, mention: false, reply: false, weight: 3 },
  { type: 'submission_question', text: 'what are the submission rules?', card: false, question: true, mention: false, reply: false, weight: 2 },
  { type: 'imperative', text: 'tell me about the fees', card: false, question: true, mention: false, reply: false, weight: 1 },
  
  // Direct engagement (5% of messages)
  { type: 'mention', text: '@pepedawn_bot help', card: false, question: false, mention: true, reply: false, weight: 2 },
  { type: 'mention_question', text: '@pepedawn_bot what is FREEDOMKEK?', card: true, question: true, mention: true, reply: false, weight: 2 },
  { type: 'reply_thanks', text: 'thanks', card: false, question: false, mention: false, reply: true, weight: 1 },
  
  // Conversation (5% of messages)
  { type: 'long_message', text: 'I really love this collection and want to learn more', card: false, question: false, mention: false, reply: false, weight: 2 },
  { type: 'casual_chat', text: 'anyone going to the event?', card: false, question: true, mention: false, reply: false, weight: 2 },
  { type: 'appreciation', text: 'this project is incredible', card: false, question: false, mention: false, reply: false, weight: 1 },
];

// Generate daily messages (150 average)
function generateDailyMessages(count = 150) {
  const messages = [];
  const totalWeight = MESSAGE_TYPES.reduce((sum, t) => sum + t.weight, 0);
  
  for (let i = 0; i < count; i++) {
    // Weighted random selection
    let rand = Math.random() * totalWeight;
    for (const msgType of MESSAGE_TYPES) {
      rand -= msgType.weight;
      if (rand <= 0) {
        messages.push({ ...msgType, id: i });
        break;
      }
    }
  }
  
  return messages;
}

// Simulate a day
console.log('🌅 DAILY SIMULATION: 150 messages over 24 hours\n');

const messages = generateDailyMessages(150);
const userLastSeen = {};
const roomLastMessage = {};
let botResponses = 0;
const responseDetails = { noise: 0, cards: 0, questions: 0, mentions: 0, conversation: 0 };

// Simulate 24 hours (1440 minutes)
const MINUTES_IN_DAY = 1440;
const messagesPerMinute = messages.map((msg, i) => ({
  ...msg,
  timestamp: Math.floor((i / messages.length) * MINUTES_IN_DAY),
  userId: `user${Math.floor(Math.random() * 20) + 1}`, // 20 unique users
}));

for (let i = 0; i < messagesPerMinute.length; i++) {
  const msg = messagesPerMinute[i];
  const now = msg.timestamp;
  
  // Check if user is returning (hasn't posted in 24h = 1440 minutes)
  const lastSeen = userLastSeen[msg.userId] || (now - 1500); // Start with users being "away"
  const minutesSinceLastSeen = now - lastSeen;
  const returning = minutesSinceLastSeen >= 1440;
  
  // Check if thread is quiet (no message in 5+ minutes)
  const lastMessage = roomLastMessage['main'] || (now - 10);
  const minutesSinceLastMessage = now - lastMessage;
  const quiet = minutesSinceLastMessage >= 5;
  
  // Calculate score
  const score = calculateScore(msg, returning, quiet);
  const shouldRespond = score >= CONFIG.threshold;
  
  // Update tracking
  userLastSeen[msg.userId] = now;
  roomLastMessage['main'] = now;
  
  if (shouldRespond) {
    botResponses++;
    
    // Categorize response
    if (msg.mention || msg.reply) responseDetails.mentions++;
    else if (msg.question) responseDetails.questions++;
    else if (msg.card) responseDetails.cards++;
    else if (msg.text.split(/\s+/).length > 7) responseDetails.conversation++;
    else responseDetails.noise++;
  }
}

const responseRate = ((botResponses / messages.length) * 100).toFixed(1);

console.log('═══════════════════════════════════════════════════════════');
console.log('📊 DAILY STATS');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`📨 Total Messages: ${messages.length}`);
console.log(`🤖 Bot Responses: ${botResponses} (${responseRate}%)\n`);

console.log('📋 Breakdown by Message Type:');
const typeCounts = {};
for (const msg of messages) {
  typeCounts[msg.type] = (typeCounts[msg.type] || 0) + 1;
}

const sortedTypes = Object.entries(typeCounts).sort(([,a], [,b]) => b - a);
for (const [type, count] of sortedTypes) {
  const pct = ((count / messages.length) * 100).toFixed(1);
  console.log(`   ${type.padEnd(25)} ${count.toString().padStart(3)} (${pct}%)`);
}

console.log('\n🤖 Bot Responses by Category:');
console.log(`   @mentions/replies:  ${responseDetails.mentions} (always respond)`);
console.log(`   Questions:          ${responseDetails.questions}`);
console.log(`   Card discussions:   ${responseDetails.cards}`);
console.log(`   Conversation:       ${responseDetails.conversation}`);
console.log(`   Noise:              ${responseDetails.noise} (false positives)`);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('💡 INTERPRETATION');
console.log('═══════════════════════════════════════════════════════════\n');

if (responseRate < 20) {
  console.log('✅ EXCELLENT - Bot is selective, responds only to meaningful messages');
} else if (responseRate < 40) {
  console.log('✅ GOOD - Balanced engagement, not too chatty');
} else if (responseRate < 60) {
  console.log('⚠️  MODERATE - Bot is fairly active, might be too chatty');
} else {
  console.log('❌ TOO HIGH - Bot is over-responding, likely spamming');
}

console.log(`\n📈 Expected daily:
   - In a 150-message day: ~${botResponses} bot responses
   - Noise filtered: ${((1 - (responseDetails.noise / botResponses)) * 100).toFixed(1)}%
   - Signal-to-noise: ${(botResponses - responseDetails.noise)}:${responseDetails.noise}
`);

console.log('═══════════════════════════════════════════════════════════\n');

