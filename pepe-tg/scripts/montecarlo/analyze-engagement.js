/**
 * Analyze Engagement Configuration
 * 
 * Deep dive into a specific Monte Carlo configuration to see
 * detailed examples of what messages would/wouldn't trigger responses.
 * 
 * Usage: node scripts/montecarlo/analyze-engagement.js [rank]
 *        (rank defaults to 1 if not specified)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const RESULTS_PATH = path.join(__dirname, 'monte-carlo-results.json');
const PARSED_DATA_PATH = path.join(__dirname, 'parsed-messages.json');

// Check if results exist
if (!fs.existsSync(RESULTS_PATH)) {
  console.error('❌ Results not found!');
  console.error('   Run: node scripts/montecarlo/monte-carlo-real-data.js first\n');
  process.exit(1);
}

// Get rank from command line (default to 1)
const rank = parseInt(process.argv[2] || '1');
if (rank < 1 || rank > 20) {
  console.error('❌ Invalid rank! Must be between 1 and 20\n');
  process.exit(1);
}

console.log(`\n📊 Analyzing Configuration #${rank}\n`);

// Load results and parsed data
const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8'));
const parsedData = JSON.parse(fs.readFileSync(PARSED_DATA_PATH, 'utf-8'));
const messages = parsedData.messages;

const config = results.topConfigs[rank - 1];
if (!config) {
  console.error(`❌ Config rank #${rank} not found!\n`);
  process.exit(1);
}

const params = config.params;

// Pre-calculate thread activity (same as monte-carlo script)
const QUIET_WINDOW = 5 * 60;
const messagesByDate = {};

for (const msg of messages) {
  const timestamp = new Date(msg.date).getTime() / 1000;
  messagesByDate[msg.id] = timestamp;
}

for (const msg of messages) {
  const timestamp = messagesByDate[msg.id];
  const nearbyMessages = messages.filter(m => {
    const mTimestamp = messagesByDate[m.id];
    return Math.abs(mTimestamp - timestamp) <= QUIET_WINDOW;
  });
  msg.isQuietPeriod = nearbyMessages.length <= 3;
}

// Scoring function
function calculateScore(msg, params) {
  let score = 0;
  
  if (msg.isReturningUser) score += params.returningBoost;
  if (msg.isQuietPeriod) score += params.quietBoost;
  
  if (msg.hasMention) score += 100;
  if (msg.isReply) score += 100;
  
  if (msg.hasCard) score += params.cardBoost;
  if (msg.hasQuestion) score += params.questionBoost;
  if (msg.wordCount > 7) score += params.multiwordBoost;
  
  if (msg.wordCount < 5 && !msg.hasMention && !msg.isReply) {
    score -= params.shortPenalty;
  }
  if (msg.isGeneric) score -= params.genericPenalty;
  
  return score;
}

// Display config
console.log('═══════════════════════════════════════════════════════════');
console.log('⚙️  CONFIGURATION');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('Parameters:');
console.log(`  ENGAGEMENT_THRESHOLD = ${params.threshold}`);
console.log(`  CARD_BOOST = ${params.cardBoost}`);
console.log(`  QUESTION_BOOST = ${params.questionBoost}`);
console.log(`  MULTIWORD_BOOST = ${params.multiwordBoost}`);
console.log(`  RETURNING_USER_BOOST = ${params.returningBoost}`);
console.log(`  QUIET_THREAD_BOOST = ${params.quietBoost}`);
console.log(`  GENERIC_PENALTY = ${params.genericPenalty}`);
console.log(`  SHORT_PENALTY = ${params.shortPenalty}`);
console.log(`  MENTION_BOOST = 100 (fixed)`);
console.log(`  REPLY_BOOST = 100 (fixed)\n`);

console.log('Engagement Summary:');
console.log(`  Fitness Score: ${config.fitnessScore.toFixed(1)}`);
console.log(`  Overall Rate: ${config.engagement.overall.rate.toFixed(1)}%`);
console.log(`  Total Responses: ${config.engagement.overall.responses.toLocaleString()} / ${config.engagement.overall.total.toLocaleString()}\n`);

console.log('Engagement by Category:');
console.log(`  @Mentions:     ${config.engagement.mentions.rate.toFixed(1)}%`);
console.log(`  Replies:       ${config.engagement.replies.rate.toFixed(1)}%`);
console.log(`  Questions:     ${config.engagement.questions.rate.toFixed(1)}%`);
console.log(`  Card Mentions: ${config.engagement.cards.rate.toFixed(1)}%`);
console.log(`  Generic:       ${config.engagement.generic.rate.toFixed(1)}%`);

// Show sample messages
console.log('\n═══════════════════════════════════════════════════════════');
console.log('📝 SAMPLE MESSAGES');
console.log('═══════════════════════════════════════════════════════════\n');

// Categories to sample
const categories = [
  { name: 'Mentions (@pepedawn_bot)', filter: m => m.hasMention, limit: 10 },
  { name: 'Replies to Bot', filter: m => m.isReply && !m.hasMention, limit: 10 },
  { name: 'Questions', filter: m => m.hasQuestion && !m.hasMention && !m.isReply, limit: 15 },
  { name: 'Card Mentions', filter: m => m.hasCard && !m.hasQuestion && !m.hasMention && !m.isReply, limit: 15 },
  { name: 'Generic Reactions', filter: m => m.isGeneric && !m.hasCard && !m.hasQuestion && !m.hasMention && !m.isReply, limit: 15 },
  { name: 'Other Messages', filter: m => !m.isGeneric && !m.hasCard && !m.hasQuestion && !m.hasMention && !m.isReply, limit: 10 },
];

for (const category of categories) {
  console.log(`\n━━━ ${category.name} ━━━\n`);
  
  const filtered = messages.filter(category.filter);
  
  // Sample messages (mix of responds and suppresses)
  const scored = filtered.map(msg => ({
    msg: msg,
    score: calculateScore(msg, params),
    decision: calculateScore(msg, params) >= params.threshold ? 'RESPOND' : 'SUPPRESS',
  }));
  
  // Get diverse samples
  const responds = scored.filter(s => s.decision === 'RESPOND').slice(0, Math.ceil(category.limit / 2));
  const suppresses = scored.filter(s => s.decision === 'SUPPRESS').slice(0, Math.floor(category.limit / 2));
  const samples = [...responds, ...suppresses].sort(() => Math.random() - 0.5).slice(0, category.limit);
  
  if (samples.length === 0) {
    console.log('  (no messages in this category)\n');
    continue;
  }
  
  for (const sample of samples) {
    const icon = sample.decision === 'RESPOND' ? '✅' : '❌';
    const text = sample.msg.text.substring(0, 80).replace(/\n/g, ' ');
    console.log(`${icon} [score=${sample.score}] "${text}${sample.msg.text.length > 80 ? '...' : ''}"`);
  }
}

// Score distribution analysis
console.log('\n═══════════════════════════════════════════════════════════');
console.log('📊 SCORE DISTRIBUTION');
console.log('═══════════════════════════════════════════════════════════\n');

const allScores = messages.map(msg => calculateScore(msg, params));
const scoreBuckets = {};

for (const score of allScores) {
  const bucket = Math.floor(score / 10) * 10;
  scoreBuckets[bucket] = (scoreBuckets[bucket] || 0) + 1;
}

const sortedBuckets = Object.entries(scoreBuckets).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

console.log('Score Range          Count       Percentage    Decision');
console.log('─────────────────────────────────────────────────────────');
for (const [bucket, count] of sortedBuckets) {
  const bucketNum = parseInt(bucket);
  const pct = ((count / messages.length) * 100).toFixed(1);
  const decision = bucketNum >= params.threshold ? 'RESPOND' : 'SUPPRESS';
  const bar = '█'.repeat(Math.floor(pct / 2));
  console.log(`${bucket.toString().padStart(4)} to ${(bucketNum + 9).toString().padEnd(4)}    ${count.toString().padStart(8)}    ${pct.padStart(5)}%    ${decision.padEnd(8)} ${bar}`);
}

console.log('\n═══════════════════════════════════════════════════════════\n');

// Recommendations
console.log('💡 OBSERVATIONS\n');

const mentionRate = config.engagement.mentions.rate;
const replyRate = config.engagement.replies.rate;
const questionRate = config.engagement.questions.rate;
const cardRate = config.engagement.cards.rate;
const genericRate = config.engagement.generic.rate;
const overallRate = config.engagement.overall.rate;

if (mentionRate < 95) {
  console.log(`⚠️  Mention response rate is ${mentionRate.toFixed(1)}% (should be 95-100%)`);
}
if (replyRate < 95) {
  console.log(`⚠️  Reply response rate is ${replyRate.toFixed(1)}% (should be 95-100%)`);
}
if (questionRate < 70 || questionRate > 90) {
  console.log(`⚠️  Question response rate is ${questionRate.toFixed(1)}% (ideal: 70-90%)`);
}
if (cardRate < 40 || cardRate > 60) {
  console.log(`💡 Card mention rate is ${cardRate.toFixed(1)}% (ideal: 40-60%)`);
}
if (genericRate > 10) {
  console.log(`⚠️  Generic reaction rate is ${genericRate.toFixed(1)}% (should be <10%)`);
}
if (overallRate < 10 || overallRate > 20) {
  console.log(`💡 Overall engagement is ${overallRate.toFixed(1)}% (ideal: 10-20%)`);
}

console.log('\n🎯 SUGGESTED NEW HEURISTICS TO CONSIDER\n');

// Analyze patterns in the data
const longMessagesWithCards = messages.filter(m => m.hasCard && m.wordCount > 20);
const longMessagesWithCardsResponding = longMessagesWithCards.filter(m => calculateScore(m, params) >= params.threshold).length;
const longCardRate = longMessagesWithCards.length > 0 ? (longMessagesWithCardsResponding / longMessagesWithCards.length) * 100 : 0;

const veryShortMessages = messages.filter(m => m.wordCount <= 2);
const veryShortResponding = veryShortMessages.filter(m => calculateScore(m, params) >= params.threshold).length;
const veryShortRate = veryShortMessages.length > 0 ? (veryShortResponding / veryShortMessages.length) * 100 : 0;

const multiCardMessages = messages.filter(m => m.cardMentions.length >= 2);
const multiCardResponding = multiCardMessages.filter(m => calculateScore(m, params) >= params.threshold).length;
const multiCardRate = multiCardMessages.length > 0 ? (multiCardResponding / multiCardMessages.length) * 100 : 0;

console.log('1. SUBSTANTIVE_MESSAGE_BOOST (for long thoughtful messages)');
console.log(`   Current: Long messages with cards → ${longCardRate.toFixed(1)}% response`);
console.log(`   Could add: +15-20 boost for messages >20 words that aren\'t generic`);
console.log(`   Rationale: Detailed discussions deserve engagement\n`);

console.log('2. MULTI_CARD_BOOST (for messages mentioning multiple cards)');
console.log(`   Current: Multi-card messages → ${multiCardRate.toFixed(1)}% response`);
console.log(`   Could add: +10-15 boost per additional card mentioned`);
console.log(`   Rationale: Comparing cards shows deeper engagement\n`);

console.log('3. ULTRA_SHORT_PENALTY (for 1-2 word messages)');
console.log(`   Current: Very short messages → ${veryShortRate.toFixed(1)}% response`);
console.log(`   Could add: Extra -10 penalty for messages <=2 words`);
console.log(`   Rationale: "gm" and "nice" rarely need bot response\n`);

console.log('═══════════════════════════════════════════════════════════\n');

