/**
 * Monte Carlo Simulation with Real Data - V2
 * 
 * Tests parameter combinations against 264k real messages with NEW categories:
 * - bot_directed (4.2%): Simulated @pepedawn_bot mentions + replies
 * - cards (9.4%): Card mentions + legacy /f posts
 * - questions (7.9%): Explicit questions
 * - substantive (31.1%): 6+ word thoughtful conversation
 * - brief (41.6%): 1-5 word quick comments
 * - generic (5.7%): gm/lol/emoji spam
 * 
 * PERFORMANCE OPTIMIZATION:
 * - Pre-categorizes messages once (not per config)
 * - Pre-computes fixed scores (bot_directed +100, newcomers +100)
 * - Single-pass counting per config
 * - Parameter space: 72,000 combinations (~12-18 min runtime)
 * 
 * Usage: node scripts/montecarlo/monte-carlo-real-data.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const PARSED_DATA_PATH = path.join(__dirname, 'parsed-messages.json');
const OUTPUT_PATH = path.join(__dirname, 'monte-carlo-results.json');

// Check if parsed data exists
if (!fs.existsSync(PARSED_DATA_PATH)) {
  console.error('❌ Parsed data not found!');
  console.error('   Run: node scripts/montecarlo/parse-real-data.js first\n');
  process.exit(1);
}

console.log('🎲 Monte Carlo Simulation - Real Data Edition V2\n');
console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 1: Loading parsed messages...');
console.log('═══════════════════════════════════════════════════════════\n');

const parsedData = JSON.parse(fs.readFileSync(PARSED_DATA_PATH, 'utf-8'));
const messages = parsedData.messages;
console.log(`✅ Loaded ${messages.length.toLocaleString()} messages`);
console.log(`   Version: ${parsedData.metadata.version || 1}`);
console.log(`   Processed: ${parsedData.metadata.processedAt}`);

// Show category distribution from parsed data
console.log('\n📊 Category Distribution (from parsed data):');
const catCounts = {};
for (const msg of messages) {
  catCounts[msg.category] = (catCounts[msg.category] || 0) + 1;
}
for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
  const pct = (count / messages.length * 100).toFixed(1);
  console.log(`   ${cat.padEnd(15)}: ${count.toLocaleString().padStart(7)} (${pct.padStart(5)}%)`);
}

// Show user context distribution
const newcomerCount = messages.filter(m => m.isNewcomer).length;
const returningCount = messages.filter(m => m.isReturning).length;
console.log('\n👥 User Context (from parsed data):');
console.log(`   Newcomers:  ${newcomerCount.toLocaleString()} (${(newcomerCount/messages.length*100).toFixed(1)}%)`);
console.log(`   Returning:  ${returningCount.toLocaleString()} (${(returningCount/messages.length*100).toFixed(1)}%)`);
console.log('');

// ═══════════════════════════════════════════════════════════
// STEP 2: Thread Activity Detection (Sliding Window)
// ═══════════════════════════════════════════════════════════
console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 2: Calculating thread activity metrics...');
console.log('═══════════════════════════════════════════════════════════\n');
const QUIET_WINDOW = 5 * 60; // 5 minutes in seconds

// Step 1: Create timestamp-indexed array
console.log('  [1/3] Indexing timestamps...');
const messagesWithTimestamps = messages.map(msg => ({
  msg: msg,
  timestamp: new Date(msg.date).getTime() / 1000,
}));
console.log(`     ✅ Indexed ${messagesWithTimestamps.length.toLocaleString()} messages`);

// Step 2: Sort by timestamp (O(n log n) - much better than O(n²)!)
console.log('\n  [2/3] Sorting messages by time...');
const sortStart = Date.now();
messagesWithTimestamps.sort((a, b) => a.timestamp - b.timestamp);
const sortTime = ((Date.now() - sortStart) / 1000).toFixed(2);
console.log(`     ✅ Sorted in ${sortTime}s`);

// Step 3: Sliding window to count nearby messages (O(n))
console.log('\n  [3/3] Detecting quiet periods with sliding window...');
console.log(`     Window: ±${QUIET_WINDOW / 60} minutes (${QUIET_WINDOW}s)`);
console.log(`     Threshold: ≤3 messages in window = quiet\n`);
let quietCount = 0;

for (let i = 0; i < messagesWithTimestamps.length; i++) {
  const current = messagesWithTimestamps[i];
  const windowStart = current.timestamp - QUIET_WINDOW;
  const windowEnd = current.timestamp + QUIET_WINDOW;
  
  // Count messages in [windowStart, windowEnd]
  let count = 0;
  
  // Scan backwards from current position
  for (let j = i; j >= 0; j--) {
    if (messagesWithTimestamps[j].timestamp < windowStart) break;
    count++;
  }
  
  // Scan forwards from current position + 1
  for (let j = i + 1; j < messagesWithTimestamps.length; j++) {
    if (messagesWithTimestamps[j].timestamp > windowEnd) break;
    count++;
  }
  
  current.msg.isQuietPeriod = count <= 3;
  if (current.msg.isQuietPeriod) quietCount++;
  
  // Progress every 50k messages
  if ((i + 1) % 50000 === 0) {
    const pct = (((i + 1) / messagesWithTimestamps.length) * 100).toFixed(1);
    console.log(`     Processed ${(i + 1).toLocaleString()} / ${messagesWithTimestamps.length.toLocaleString()} (${pct}%)`);
  }
}

console.log(`\n     ✅ Analyzed thread activity: ${quietCount.toLocaleString()} quiet messages (${(quietCount/messages.length*100).toFixed(1)}%)\n`);

// ═══════════════════════════════════════════════════════════
// STEP 3: PRE-PROCESSING (Once at startup)
// ═══════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 3: Pre-processing messages for optimization...');
console.log('═══════════════════════════════════════════════════════════\n');

// 1.1: Categorize messages (use categories from parsed data)
console.log('  [1/2] Categorizing messages...');
const messageCategories = new Map();
const categoryCounts = {
  bot_directed: 0,
  cards: 0,
  questions: 0,
  substantive: 0,
  brief: 0,
  generic: 0,
};

for (const msg of messages) {
  // Use category from parsed data (already computed)
  const category = msg.category || 'brief';  // fallback to brief if missing
  messageCategories.set(msg.id, category);
  categoryCounts[category]++;
}

console.log('     ✅ Categories:');
console.log(`        Bot-Directed: ${categoryCounts.bot_directed.toLocaleString()}`);
console.log(`        Cards: ${categoryCounts.cards.toLocaleString()}`);
console.log(`        Questions: ${categoryCounts.questions.toLocaleString()}`);
console.log(`        Substantive: ${categoryCounts.substantive.toLocaleString()}`);
console.log(`        Brief: ${categoryCounts.brief.toLocaleString()}`);
console.log(`        Generic: ${categoryCounts.generic.toLocaleString()}\n`);

// 1.2: Pre-calculate fixed score components
console.log('  [2/2] Pre-computing static score components...');
const staticScores = messages.map(msg => ({
  id: msg.id,
  category: messageCategories.get(msg.id),
  
  // Fixed scores (never change across configs)
  // Bot-directed (simulated mentions + replies) → always +100
  // Newcomers (first message) → always +100
  fixedScore: (msg.isBotDirected ? 100 : 0) + (msg.isNewcomer ? 100 : 0),
  
  // Flags for conditional scoring (variable parts to optimize)
  hasCard: msg.hasCard,
  hasQuestion: msg.hasQuestion,
  isMultiword: msg.wordCount > 7,
  needsShortPenalty: msg.wordCount < 5 && !msg.isBotDirected,
  isGeneric: msg.isGeneric,
  isReturning: msg.isReturning,        // 24+ hours since last message
  isQuiet: msg.isQuietPeriod,          // Thread quiet for 5+ min
}));

const memoryMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
console.log(`     ✅ Pre-computed ${staticScores.length.toLocaleString()} score records`);
console.log(`     Memory usage: ${memoryMB} MB`);

// Show sample of fixed scores
console.log('\n📋 Sample Fixed Scores:');
const botDirectedSamples = staticScores.filter(m => m.fixedScore >= 100).slice(0, 3);
botDirectedSamples.forEach((m, i) => {
  const msg = messages.find(msg => msg.id === m.id);
  console.log(`   ${i + 1}. fixedScore=${m.fixedScore} "${msg.text.substring(0, 60)}..."`);
});
console.log('');

console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 4: MONTE CARLO SIMULATION');
console.log('═══════════════════════════════════════════════════════════\n');

// Evaluate a configuration (OPTIMIZED - single pass)
function evaluateConfig(params) {
  // Initialize category counters
  const engagement = {
    bot_directed: { total: categoryCounts.bot_directed, responses: 0 },
    cards: { total: categoryCounts.cards, responses: 0 },
    questions: { total: categoryCounts.questions, responses: 0 },
    substantive: { total: categoryCounts.substantive, responses: 0 },
    brief: { total: categoryCounts.brief, responses: 0 },
    generic: { total: categoryCounts.generic, responses: 0 },
  };
  
  let totalResponses = 0;
  
  // SINGLE PASS through messages
  for (const msg of staticScores) {
    // Calculate score (fixed + variable parts)
    let score = msg.fixedScore;  // bot_directed +100, newcomers +100
    
    // Context boosts
    if (msg.isReturning) score += params.returningBoost;
    if (msg.isQuiet) score += params.quietBoost;
    
    // Content boosts
    if (msg.hasCard) score += params.cardBoost;
    if (msg.hasQuestion) score += params.questionBoost;
    if (msg.isMultiword) score += params.multiwordBoost;
    
    // Penalties
    if (msg.needsShortPenalty) score -= params.shortPenalty;
    if (msg.isGeneric) score -= params.genericPenalty;
    
    // Increment response counter if score meets threshold
    if (score >= params.threshold) {
      engagement[msg.category].responses++;
      totalResponses++;
    }
  }
  
  // Calculate engagement rates
  for (const category of Object.keys(engagement)) {
    const e = engagement[category];
    e.rate = e.total > 0 ? (e.responses / e.total) * 100 : 0;
  }
  
  engagement.overall = {
    total: messages.length,
    responses: totalResponses,
    rate: (totalResponses / messages.length) * 100,
  };
  
  // Scoring: how close are we to ideal engagement rates?
  // NEW Target rates for V2 categories:
  // - Bot-Directed: 95-100% (simulated @mentions + replies)
  // - Questions: 70-90% (help-seeking)
  // - Cards: 40-60% (card discussion)
  // - Substantive: 20-35% (quality 6+ word conversation)
  // - Brief: 5-15% (quick 1-5 word comments)
  // - Generic: 0-5% (gm/lol spam - mostly ignore)
  // - Overall: 10-20% (total engagement)
  
  const targets = {
    bot_directed: { min: 95, max: 100, weight: 10 },
    questions: { min: 70, max: 90, weight: 8 },
    cards: { min: 40, max: 60, weight: 6 },
    substantive: { min: 20, max: 35, weight: 7 },
    brief: { min: 5, max: 15, weight: 6 },
    generic: { min: 0, max: 5, weight: 9 },
    overall: { min: 10, max: 20, weight: 7 },
  };
  
  let fitnessScore = 0;
  const deviations = {};
  
  for (const [category, target] of Object.entries(targets)) {
    const rate = engagement[category].rate;
    let deviation = 0;
    
    if (rate < target.min) {
      deviation = target.min - rate;
    } else if (rate > target.max) {
      deviation = rate - target.max;
    }
    
    deviations[category] = deviation;
    fitnessScore -= deviation * target.weight;
  }
  
  return {
    params: params,
    engagement: engagement,
    fitnessScore: fitnessScore,
    deviations: deviations,
  };
}

// Parameter ranges to test (OPTIMIZED - focused around production values)
const ranges = {
  // Current prod: 31, test focused range
  threshold: [25, 30, 35, 40, 45],                        // 5 values (was 7)
  
  // Context boosts
  returningBoost: [15, 20, 25, 30],                       // 4 values (prod: 20)
  quietBoost: [20, 25, 30, 35, 40],                       // 5 values (prod: 30)
  
  // Content boosts
  cardBoost: [15, 20, 25, 30, 35],                        // 5 values (prod: 20)
  questionBoost: [30, 35, 40, 45],                        // 4 values (prod: 35)
  multiwordBoost: [5, 10, 15],                            // 3 values (prod: 10)
  
  // Penalties
  genericPenalty: [5, 10, 15, 20],                        // 4 values (prod: 10)
  shortPenalty: [0, 5, 10],                               // 3 values (prod: 5)
};

console.log('📊 Parameter Ranges (testing around production values):\n');
for (const [param, values] of Object.entries(ranges)) {
  console.log(`  ${param.padEnd(16)}: [${values.join(', ')}]  (${values.length} values)`);
}

const totalCombinations = Object.values(ranges).reduce((acc, arr) => acc * arr.length, 1);
console.log(`\n🔢 Total combinations (OPTIMIZED):`);
console.log(`  = 5 × 4 × 5 × 5 × 4 × 3 × 4 × 3`);
console.log(`  = ${totalCombinations.toLocaleString()} parameter configurations`);
console.log(`  (Reduced from 987,840 - 90% faster!)\n`);

console.log('🎯 Target Engagement Rates:');
console.log(`  Bot-Directed: 95-100%  (always respond to @mentions)`);
console.log(`  Questions:    70-90%   (help-seeking)`);
console.log(`  Cards:        40-60%   (card discussion)`);
console.log(`  Substantive:  20-35%   (quality conversation)`);
console.log(`  Brief:         5-15%   (quick comments)`);
console.log(`  Generic:       0-5%    (ignore spam)`);
console.log(`  Overall:      10-20%   (total engagement)\n`);

console.log('🚀 Starting Monte Carlo simulation...');
console.log(`   Estimated time: ~12-18 minutes at 90-120 configs/sec`);
console.log(`   Progress updates every 10,000 iterations\n`);

const startTime = Date.now();
let iterations = 0;
const topConfigs = [];
const TOP_N = 20;

// Test all combinations
for (const threshold of ranges.threshold) {
  for (const returningBoost of ranges.returningBoost) {
    for (const quietBoost of ranges.quietBoost) {
      for (const cardBoost of ranges.cardBoost) {
        for (const questionBoost of ranges.questionBoost) {
          for (const multiwordBoost of ranges.multiwordBoost) {
            for (const genericPenalty of ranges.genericPenalty) {
              for (const shortPenalty of ranges.shortPenalty) {
                iterations++;
                
                const params = {
                  threshold,
                  returningBoost,
                  quietBoost,
                  cardBoost,
                  questionBoost,
                  multiwordBoost,
                  genericPenalty,
                  shortPenalty,
                };
                
                const result = evaluateConfig(params);
                
                // Keep top N configs
                topConfigs.push(result);
                topConfigs.sort((a, b) => b.fitnessScore - a.fitnessScore);
                if (topConfigs.length > TOP_N) {
                  topConfigs.pop();
                }
                
                // Progress indicator (every 1% or 10k iterations)
                if (iterations % 10000 === 0 || iterations === totalCombinations) {
                  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                  const pct = ((iterations / totalCombinations) * 100).toFixed(1);
                  const rate = (iterations / (Date.now() - startTime) * 1000).toFixed(0);
                  console.log(`  ${iterations.toLocaleString()} / ${totalCombinations.toLocaleString()} (${pct}%) - ${elapsed}s - ${rate} configs/sec`);
                }
              }
            }
          }
        }
      }
    }
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const avgRate = (iterations / (Date.now() - startTime) * 1000).toFixed(0);

console.log(`\n✅ Tested ${iterations.toLocaleString()} configurations in ${elapsed}s (avg ${avgRate} configs/sec)\n`);

// Display top configs
console.log('═══════════════════════════════════════════════════════════');
console.log(`🏆 TOP ${TOP_N} CONFIGURATIONS`);
console.log('═══════════════════════════════════════════════════════════\n');

for (let i = 0; i < topConfigs.length; i++) {
  const config = topConfigs[i];
  const rank = i + 1;
  
  console.log(`\n━━━ Rank #${rank} (Fitness: ${config.fitnessScore.toFixed(1)}) ━━━\n`);
  
  console.log('Parameters:');
  console.log(`  threshold=${config.params.threshold}, cardBoost=${config.params.cardBoost}, questionBoost=${config.params.questionBoost}`);
  console.log(`  multiwordBoost=${config.params.multiwordBoost}, returningBoost=${config.params.returningBoost}, quietBoost=${config.params.quietBoost}`);
  console.log(`  genericPenalty=${config.params.genericPenalty}, shortPenalty=${config.params.shortPenalty}\n`);
  
  console.log('Engagement Rates:');
  console.log(`  🤖 Bot-Directed:  ${config.engagement.bot_directed.rate.toFixed(1)}% (${config.engagement.bot_directed.responses.toLocaleString()} / ${config.engagement.bot_directed.total.toLocaleString()})`);
  console.log(`  ❓ Questions:     ${config.engagement.questions.rate.toFixed(1)}% (${config.engagement.questions.responses.toLocaleString()} / ${config.engagement.questions.total.toLocaleString()})`);
  console.log(`  🎴 Cards:         ${config.engagement.cards.rate.toFixed(1)}% (${config.engagement.cards.responses.toLocaleString()} / ${config.engagement.cards.total.toLocaleString()})`);
  console.log(`  💬 Substantive:   ${config.engagement.substantive.rate.toFixed(1)}% (${config.engagement.substantive.responses.toLocaleString()} / ${config.engagement.substantive.total.toLocaleString()})`);
  console.log(`  💨 Brief:         ${config.engagement.brief.rate.toFixed(1)}% (${config.engagement.brief.responses.toLocaleString()} / ${config.engagement.brief.total.toLocaleString()})`);
  console.log(`  🚫 Generic:       ${config.engagement.generic.rate.toFixed(1)}% (${config.engagement.generic.responses.toLocaleString()} / ${config.engagement.generic.total.toLocaleString()})`);
  console.log(`  📊 OVERALL:       ${config.engagement.overall.rate.toFixed(1)}% (${config.engagement.overall.responses.toLocaleString()} / ${config.engagement.overall.total.toLocaleString()})`);
  
  // Only show top 5 in detail
  if (rank === 5) {
    console.log('\n... (see monte-carlo-results.json for full top 20) ...');
    break;
  }
}

console.log('\n═══════════════════════════════════════════════════════════\n');

// Save results
console.log('Saving results...');
const output = {
  metadata: {
    completedAt: new Date().toISOString(),
    totalIterations: iterations,
    elapsedSeconds: parseFloat(elapsed),
    messagesAnalyzed: messages.length,
  },
  topConfigs: topConfigs,
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
console.log(`✅ Saved top ${TOP_N} configs to ${OUTPUT_PATH}\n`);

console.log('🎉 Monte Carlo simulation complete!\n');
console.log('💡 Next steps:');
console.log('   1. Review the top configs above');
console.log('   2. Run: node scripts/montecarlo/analyze-engagement.js <rank>');
console.log('      to see detailed examples for any config\n');

