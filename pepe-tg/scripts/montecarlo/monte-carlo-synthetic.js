/**
 * Comprehensive Monte Carlo Simulation - ALL VARIABLES
 * 
 * Tests 100,000+ combinations to find globally optimal engagement settings
 */

// Expanded test scenarios with real-world cases
const scenarios = [
  // === CRITICAL: MUST RESPOND ===
  { name: '@mention greeting', text: '@pepedawn_bot gm', returning: false, quiet: false, card: false, question: false, mention: true, reply: false, expected: 'RESPOND', weight: 10 },
  { name: 'Reply to bot', text: 'thanks', returning: false, quiet: false, card: false, question: false, mention: false, reply: true, expected: 'RESPOND', weight: 10 },
  { name: '@mention question', text: '@pepedawn_bot what is PEPEDAWN?', returning: false, quiet: false, card: true, question: true, mention: true, reply: false, expected: 'RESPOND', weight: 10 },
  
  // === HIGH VALUE: SHOULD RESPOND ===
  { name: 'Card question', text: 'what is PEPEDAWN?', returning: false, quiet: false, card: true, question: true, mention: false, reply: false, expected: 'RESPOND', weight: 8 },
  { name: 'General question', text: 'how do I submit a card?', returning: false, quiet: false, card: false, question: true, mention: false, reply: false, expected: 'RESPOND', weight: 8 },
  { name: 'Imperative request', text: 'tell me about the submission fees', returning: false, quiet: false, card: false, question: true, mention: false, reply: false, expected: 'RESPOND', weight: 8 },
  { name: 'Indirect question', text: 'I need to know about locking issuance', returning: false, quiet: false, card: false, question: true, mention: false, reply: false, expected: 'RESPOND', weight: 8 },
  { name: 'Returning user greeting (quiet)', text: 'hey', returning: true, quiet: true, card: false, question: false, mention: false, reply: false, expected: 'RESPOND', weight: 7 },
  { name: 'Returning user casual question', text: 'hey whats up?', returning: true, quiet: false, card: false, question: true, mention: false, reply: false, expected: 'RESPOND', weight: 7 },
  
  // === MEDIUM VALUE: CONTEXTUAL ===
  { name: 'Single card name (quiet)', text: 'PEPEDAWN', returning: false, quiet: true, card: true, question: false, mention: false, reply: false, expected: 'RESPOND', weight: 6 },
  { name: 'Single card name (active)', text: 'PEPEDAWN', returning: false, quiet: false, card: true, question: false, mention: false, reply: false, expected: 'RESPOND', weight: 5 },
  { name: 'Card statement (quiet)', text: 'PEPEDAWN is amazing', returning: false, quiet: true, card: true, question: false, mention: false, reply: false, expected: 'RESPOND', weight: 4 },
  { name: 'Long substantive message', text: 'I really love this collection and want to learn more about the history', returning: false, quiet: false, card: false, question: false, mention: false, reply: false, expected: 'RESPOND', weight: 5 },
  { name: 'Returning user card mention', text: 'FREEDOMKEK', returning: true, quiet: false, card: true, question: false, mention: false, reply: false, expected: 'RESPOND', weight: 6 },
  
  // === LOW VALUE: SHOULD SUPPRESS ===
  { name: 'Generic gm (active)', text: 'gm', returning: false, quiet: false, card: false, question: false, mention: false, reply: false, expected: 'SUPPRESS', weight: 10 },
  { name: 'Generic nice', text: 'nice', returning: false, quiet: false, card: false, question: false, mention: false, reply: false, expected: 'SUPPRESS', weight: 10 },
  { name: 'Emoji only', text: '🔥', returning: false, quiet: false, card: false, question: false, mention: false, reply: false, expected: 'SUPPRESS', weight: 9 },
  { name: 'Spam lol', text: 'lol lol lol', returning: false, quiet: false, card: false, question: false, mention: false, reply: false, expected: 'SUPPRESS', weight: 9 },
  { name: 'Short reaction', text: 'based', returning: false, quiet: false, card: false, question: false, mention: false, reply: false, expected: 'SUPPRESS', weight: 9 },
  { name: 'Returning user gm (active)', text: 'gm', returning: true, quiet: false, card: false, question: false, mention: false, reply: false, expected: 'SUPPRESS', weight: 8 },
  { name: 'Quiet thread noise', text: 'lol', returning: false, quiet: true, card: false, question: false, mention: false, reply: false, expected: 'SUPPRESS', weight: 8 },
  { name: 'Generic nice (quiet)', text: 'nice', returning: false, quiet: true, card: false, question: false, mention: false, reply: false, expected: 'SUPPRESS', weight: 7 },
  
  // === EDGE CASES ===
  { name: 'Card announcement (sale)', text: 'Three grails for sale. FAKEPARTY 1/1, supply 44. Send 0.01 BTC.', returning: false, quiet: false, card: true, question: false, mention: false, reply: false, expected: 'SUPPRESS', weight: 6 },
  { name: 'Card statement (active)', text: 'FAKEPARTY is divisible', returning: false, quiet: false, card: true, question: false, mention: false, reply: false, expected: 'SUPPRESS', weight: 6 },
  { name: 'Short question (vague)', text: 'what?', returning: false, quiet: false, card: false, question: true, mention: false, reply: false, expected: 'SUPPRESS', weight: 5 },
  { name: 'Meta question about bot', text: 'why are you replying to me', returning: false, quiet: false, card: false, question: true, mention: false, reply: false, expected: 'SUPPRESS', weight: 4 },
];

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

function calculateScore(scenario, params) {
  let score = 0;
  const wordCount = scenario.text.split(/\s+/).filter(w => w.length > 0).length;
  
  // Context boosts
  if (scenario.returning) score += params.returningBoost;
  if (scenario.quiet) score += params.quietBoost;
  
  // High priority (keep at 100)
  if (scenario.mention) score += 100;
  if (scenario.reply) score += 100;
  
  // Medium priority (NOW VARIABLE)
  if (scenario.card) score += params.cardBoost;
  if (scenario.question || isQuestion(scenario.text)) score += params.questionBoost;
  if (wordCount > 7) score += params.multiwordBoost;
  
  // Penalties
  if (wordCount < 5 && !scenario.mention && !scenario.reply) score -= params.shortPenalty;
  if (isGenericReaction(scenario.text)) score -= params.genericPenalty;
  
  return score;
}

function evaluateConfig(params) {
  let correct = 0;
  let totalWeight = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  const errors = [];
  
  for (const scenario of scenarios) {
    const score = calculateScore(scenario, params);
    const decision = score >= params.threshold ? 'RESPOND' : 'SUPPRESS';
    const isCorrect = decision === scenario.expected;
    
    totalWeight += scenario.weight;
    if (isCorrect) {
      correct += scenario.weight;
    } else {
      if (decision === 'RESPOND' && scenario.expected === 'SUPPRESS') {
        falsePositives += scenario.weight;
        errors.push({ type: 'FP', scenario: scenario.name, score, text: scenario.text });
      } else {
        falseNegatives += scenario.weight;
        errors.push({ type: 'FN', scenario: scenario.name, score, text: scenario.text });
      }
    }
  }
  
  const accuracy = (correct / totalWeight) * 100;
  
  // Penalty weights: False positives (spam) are 3x worse than false negatives (missed engagement)
  const fpPenalty = falsePositives * 3;
  const fnPenalty = falseNegatives * 1;
  const fitness = accuracy - (fpPenalty + fnPenalty);
  
  return { accuracy, falsePositives, falseNegatives, fitness, errors };
}

console.log('🎲 Running COMPREHENSIVE Monte Carlo simulation...\n');
console.log('Testing ALL variables with expanded scenarios\n');

const ranges = {
  threshold: [20, 25, 30, 35, 40, 45, 50],
  returningBoost: [15, 20, 25, 30, 35],
  quietBoost: [15, 20, 25, 30, 35],
  cardBoost: [20, 25, 30, 35, 40, 45, 50],  // NOW VARIABLE
  questionBoost: [20, 25, 30, 35, 40],      // NOW VARIABLE
  multiwordBoost: [10, 15, 20, 25, 30],     // NOW VARIABLE
  genericPenalty: [10, 15, 20, 25, 30, 35],
  shortPenalty: [5, 10, 15, 20, 25],
};

let bestConfig = null;
let bestFitness = -Infinity;
let iterations = 0;
const startTime = Date.now();

// Generate all combinations (will be 100k+)
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
                  threshold, returningBoost, quietBoost, 
                  cardBoost, questionBoost, multiwordBoost,
                  genericPenalty, shortPenalty 
                };
                const result = evaluateConfig(params);
                
                if (result.fitness > bestFitness) {
                  bestFitness = result.fitness;
                  bestConfig = { ...params, ...result };
                }
              }
            }
          }
        }
      }
    }
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

console.log(`✅ Tested ${iterations.toLocaleString()} configurations in ${elapsed}s\n`);
console.log('═══════════════════════════════════════════════════════════');
console.log('🏆 GLOBALLY OPTIMAL CONFIGURATION');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('📊 Core Scoring:');
console.log(`   CARD_BOOST = ${bestConfig.cardBoost}`);
console.log(`   QUESTION_BOOST = ${bestConfig.questionBoost}`);
console.log(`   MULTIWORD_BOOST = ${bestConfig.multiwordBoost}`);
console.log(`   MENTION_BOOST = 100 (fixed)`);
console.log(`   REPLY_BOOST = 100 (fixed)\n`);

console.log('📊 Context Boosts:');
console.log(`   RETURNING_USER_BOOST = ${bestConfig.returningBoost}`);
console.log(`   QUIET_THREAD_BOOST = ${bestConfig.quietBoost}\n`);

console.log('📊 Penalties:');
console.log(`   GENERIC_PENALTY = ${bestConfig.genericPenalty}`);
console.log(`   SHORT_PENALTY = ${bestConfig.shortPenalty}\n`);

console.log('📊 Decision:');
console.log(`   ENGAGEMENT_THRESHOLD = ${bestConfig.threshold}\n`);

console.log('📈 Performance:');
console.log(`   Accuracy: ${bestConfig.accuracy.toFixed(1)}%`);
console.log(`   False Positives: ${bestConfig.falsePositives} (spam responses)`);
console.log(`   False Negatives: ${bestConfig.falseNegatives} (missed engagement)`);
console.log(`   Fitness Score: ${bestConfig.fitness.toFixed(1)}\n`);

if (bestConfig.errors.length > 0) {
  console.log('⚠️  Errors:');
  for (const err of bestConfig.errors.slice(0, 5)) {
    console.log(`   [${err.type}] "${err.text}" (score=${err.score})`);
  }
  if (bestConfig.errors.length > 5) {
    console.log(`   ... and ${bestConfig.errors.length - 5} more\n`);
  } else {
    console.log('');
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('🧪 TEST RESULTS WITH OPTIMAL CONFIG');
console.log('═══════════════════════════════════════════════════════════\n');

for (const scenario of scenarios) {
  const score = calculateScore(scenario, bestConfig);
  const decision = score >= bestConfig.threshold ? 'RESPOND ✅' : 'SUPPRESS ❌';
  const correct = (decision.includes('RESPOND') === scenario.expected.includes('RESPOND')) ? '✓' : '✗';
  const priority = scenario.weight >= 8 ? '🔴' : scenario.weight >= 5 ? '🟡' : '🟢';
  
  console.log(`${correct} ${priority} ${scenario.name}`);
  console.log(`   "${scenario.text.substring(0, 60)}${scenario.text.length > 60 ? '...' : ''}"`);
  console.log(`   Score: ${score} → ${decision} (expected: ${scenario.expected})\n`);
}

console.log('═══════════════════════════════════════════════════════════\n');

console.log('📊 Response Rate Estimate:');
const totalRespond = scenarios.filter((s, i) => {
  const score = calculateScore(s, bestConfig);
  return score >= bestConfig.threshold;
}).length;
console.log(`   ${totalRespond}/${scenarios.length} scenarios trigger response (${((totalRespond/scenarios.length)*100).toFixed(1)}%)\n`);

