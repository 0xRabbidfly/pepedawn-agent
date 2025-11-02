/**
 * Parse Real Chat History Data - V2
 * 
 * Extracts features from 264k+ Telegram messages to create training dataset
 * for Monte Carlo optimization.
 * 
 * NEW CATEGORIZATION:
 * - bot_directed: 5% synthetic (simulates future @pepedawn_bot engagement)
 * - cards: Card mentions + legacy /f posts
 * - questions: Question patterns
 * - substantive: 6+ word conversations
 * - brief: 1-5 word comments (not generic)
 * - generic: gm/lol/emoji-only reactions
 * 
 * USER CONTEXT (simulated from historical timestamps):
 * - isNewcomer: First message from user
 * - isReturning: 24+ hours since user's last message
 * - isNewOrRarePoster: Users with only 1-2 total messages
 * 
 * Usage: node scripts/montecarlo/parse-real-data.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pause helper for review
async function pause(message = 'Press Enter to continue...') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  await new Promise(resolve => {
    rl.question(`\n${message}\n`, () => {
      rl.close();
      resolve();
    });
  });
}

// Paths
const CHAT_HISTORY_PATH = path.join(__dirname, '../../../backups/TG-chat-history-cleaned.json');
const CARD_DATA_PATH = path.join(__dirname, '../../src/data/fake-rares-data.json');
const OUTPUT_PATH = path.join(__dirname, 'parsed-messages.json');

// Generic reactions to detect
const GENERIC_REACTIONS = [
  'gm', 'gn', 'hi', 'hello', 'hey', 'sup', 'yo', 'kek', 'lol', 'lmao', 'rofl',
  'based', 'ngmi', 'wagmi', 'ser', 'fren', 'wen', 'soon', 'lfg', 'nice', 'ok', 
  'cool', 'thanks', 'ty', 'thx', 'yeah', 'yep', 'nope', 'nah', 'bruh', 'fr', 'frfr'
];

// Question patterns
const QUESTION_PATTERNS = [
  /\?$/,
  /^(what|how|when|where|why|who|which|can|could|would|should|do|does|did|is|are|was|were)\b/i,
  /^(tell|show|explain|describe|list|give)\s+(me|us)\s+(about|the|how)/i,
  /\b(need to know|want to know|wondering|curious|help me|can you)\b/i,
];

// Main async function
async function main() {
  console.log('📊 Parsing Real Chat History - V2 (Verbose Mode)\n');

  // Load card names
  console.log('═══════════════════════════════════════════════════════════');
  console.log('STEP 1: Loading card data...');
  console.log('═══════════════════════════════════════════════════════════\n');
  const cardData = JSON.parse(fs.readFileSync(CARD_DATA_PATH, 'utf-8'));
  const cardNames = new Set(cardData.map(card => card.asset.toUpperCase()));
  console.log(`✅ Loaded ${cardNames.size.toLocaleString()} card names`);
  console.log(`   Sample cards: ${[...cardNames].slice(0, 10).join(', ')}`);
  
  await pause('Review card data and press Enter to continue...');

  // Load chat history
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('STEP 2: Loading chat history (147MB)...');
  console.log('═══════════════════════════════════════════════════════════\n');
  const chatHistory = JSON.parse(fs.readFileSync(CHAT_HISTORY_PATH, 'utf-8'));
  const allMessages = chatHistory.messages;
  console.log(`✅ Loaded ${allMessages.length.toLocaleString()} total messages`);

  // Filter to actual messages (not service messages)
  const actualMessages = allMessages.filter(msg => msg.type === 'message' && msg.text);
  console.log(`✅ Found ${actualMessages.length.toLocaleString()} actual messages with text`);
  console.log(`   (Filtered out ${(allMessages.length - actualMessages.length).toLocaleString()} service/empty messages)`);
  
  await pause('Review message counts and press Enter to continue...');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('STEP 3: Extracting features from messages...');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Track user activity for newcomer and returning detection
  const userMessageCounts = {};
  const userLastMessageTime = {};  // Track last message timestamp per user
  const processedMessages = [];

  for (let i = 0; i < actualMessages.length; i++) {
    const msg = actualMessages[i];
  
  // Show progress
  if (i > 0 && i % 10000 === 0) {
    console.log(`  Processed ${i.toLocaleString()} / ${actualMessages.length.toLocaleString()} messages...`);
  }
  
  // Extract text (handle both string and array formats)
  let text = '';
  if (typeof msg.text === 'string') {
    text = msg.text;
  } else if (Array.isArray(msg.text)) {
    text = msg.text.map(part => typeof part === 'string' ? part : part.text || '').join('');
  } else if (typeof msg.text === 'object') {
    text = msg.text.text || '';
  }
  
  // Skip empty messages
  if (!text || text.trim().length === 0) continue;
  
  // Update user message count
  const userId = msg.from_id || 'unknown';
  const messageTimestamp = new Date(msg.date).getTime();
  
  // Detect newcomer (first message from this user)
  const isNewcomer = userMessageCounts[userId] === undefined;
  
  // Detect returning user (24+ hours since last message)
  const lastMessageTime = userLastMessageTime[userId];
  const isReturning = lastMessageTime !== undefined && 
                      (messageTimestamp - lastMessageTime) >= (24 * 60 * 60 * 1000);
  
  // Update tracking
  userMessageCounts[userId] = (userMessageCounts[userId] || 0) + 1;
  userLastMessageTime[userId] = messageTimestamp;
  
  // Extract features
  const features = {
    id: msg.id,
    text: text.substring(0, 500), // Truncate very long messages
    date: msg.date,
    userId: userId,
    
    // Core features
    wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
    charCount: text.length,
    
    // Detection flags
    hasQuestion: QUESTION_PATTERNS.some(pattern => pattern.test(text)),
    isLegacyFakeCommand: text.toLowerCase().trim().startsWith('/f'),
    
    // Card detection (check for any card name in uppercase)
    cardMentions: [],
    hasCard: false,
    
    // Generic reaction detection
    isGeneric: false,
    
    // Emoji detection
    emojiOnly: /^[\p{Emoji}\s]+$/u.test(text),
    
    // User context
    isNewcomer: isNewcomer,             // First message from user
    isReturning: isReturning,            // 24+ hours since last message
    isNewOrRarePoster: false,            // 1-2 total messages (set later)
    messageNumber: userMessageCounts[userId],
    
    // Bot engagement simulation (will be set later)
    isBotDirected: false,
  };
  
  // Check for card names
  const upperText = text.toUpperCase();
  const words = upperText.split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/[^A-Z0-9]/g, '');
    if (cardNames.has(cleanWord)) {
      features.cardMentions.push(cleanWord);
    }
  }
  // Cards include: explicit card names OR legacy /f posts
  features.hasCard = features.cardMentions.length > 0 || features.isLegacyFakeCommand;
  
  // Check if generic reaction
  const lowerText = text.toLowerCase().trim();
  features.isGeneric = GENERIC_REACTIONS.includes(lowerText) || features.emojiOnly;
  
    processedMessages.push(features);
  }

  console.log(`\n✅ Processed ${processedMessages.length.toLocaleString()} messages`);
  
  // Show feature samples
  console.log('\n📋 Sample Messages by Feature:');
  console.log('\n  Questions:');
  processedMessages.filter(m => m.hasQuestion).slice(0, 3).forEach(m => {
    console.log(`    "${m.text.substring(0, 80)}${m.text.length > 80 ? '...' : ''}"`);
  });
  
  console.log('\n  Card Mentions:');
  processedMessages.filter(m => m.hasCard).slice(0, 3).forEach(m => {
    console.log(`    "${m.text.substring(0, 80)}${m.text.length > 80 ? '...' : ''}" [${m.cardMentions.join(', ') || '/f'}]`);
  });
  
  console.log('\n  Generic:');
  processedMessages.filter(m => m.isGeneric).slice(0, 5).forEach(m => {
    console.log(`    "${m.text}"`);
  });
  
  await pause('Review feature extraction and press Enter to continue...');

  // Second pass: mark new/rare posters (users with 1-2 messages)
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('STEP 4: Marking new/rare posters (1-2 messages total)...');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  for (const msg of processedMessages) {
    msg.isNewOrRarePoster = userMessageCounts[msg.userId] <= 2;
  }
  
  const newRareCount = processedMessages.filter(m => m.isNewOrRarePoster).length;
  console.log(`✅ Found ${newRareCount.toLocaleString()} messages from new/rare posters (${(newRareCount/processedMessages.length*100).toFixed(1)}%)`);
  console.log(`   Unique users: ${Object.keys(userMessageCounts).length.toLocaleString()}`);
  console.log(`   Users with 1-2 messages: ${Object.values(userMessageCounts).filter(c => c <= 2).length.toLocaleString()}`);
  console.log(`   Users with 3+ messages: ${Object.values(userMessageCounts).filter(c => c >= 3).length.toLocaleString()}`);
  
  await pause('Review user stats and press Enter to continue...');

  // Third pass: simulate bot-directed engagement (5% of eligible messages)
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('STEP 5: Simulating bot-directed engagement (5% synthetic)...');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Only mark non-card, non-generic messages as bot-directed (to avoid double-categorization)
  const eligibleForBotDirected = processedMessages.filter(m => !m.hasCard && !m.isGeneric);
  const targetBotDirectedCount = Math.floor(eligibleForBotDirected.length * 0.05);

  console.log(`   Eligible messages: ${eligibleForBotDirected.length.toLocaleString()}`);
  console.log(`   Target 5%: ${targetBotDirectedCount.toLocaleString()}`);

  // Randomly select 5% of eligible messages
  const shuffled = [...eligibleForBotDirected].sort(() => Math.random() - 0.5);
  for (let i = 0; i < targetBotDirectedCount; i++) {
    shuffled[i].isBotDirected = true;
  }

  const botDirectedCount = processedMessages.filter(m => m.isBotDirected).length;
  console.log(`\n✅ Marked ${botDirectedCount.toLocaleString()} messages as bot-directed (${(botDirectedCount/processedMessages.length*100).toFixed(1)}%)`);
  
  console.log('\n📋 Sample bot-directed messages:');
  processedMessages.filter(m => m.isBotDirected).slice(0, 5).forEach(m => {
    console.log(`   "${m.text.substring(0, 80)}${m.text.length > 80 ? '...' : ''}"`);
  });
  
  await pause('Review bot-directed simulation and press Enter to continue...');

  // NEW: Categorize messages into final categories
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('STEP 6: Categorizing messages...');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const categories = {
    bot_directed: [],
    cards: [],
    questions: [],
    substantive: [],
    brief: [],
    generic: [],
  };
  
  for (const msg of processedMessages) {
    let category;
    
    // TIER 1: Simulated bot engagement
    if (msg.isBotDirected) {
      category = 'bot_directed';
    }
    // TIER 2: Card-related (including /f posts)
    else if (msg.hasCard) {
      category = 'cards';
    }
    // TIER 3: Questions
    else if (msg.hasQuestion) {
      category = 'questions';
    }
    // TIER 4: Generic
    else if (msg.isGeneric) {
      category = 'generic';
    }
    // TIER 5: Split by word count
    else if (msg.wordCount >= 6) {
      category = 'substantive';
    }
    else {
      category = 'brief';
    }
    
    msg.category = category;
    categories[category].push(msg);
  }
  
  console.log('Category Distribution:');
  for (const [cat, msgs] of Object.entries(categories)) {
    const pct = (msgs.length / processedMessages.length * 100).toFixed(1);
    console.log(`  ${cat.padEnd(15)}: ${msgs.length.toLocaleString().padStart(7)} (${pct}%)`);
  }
  
  console.log('\n📋 Sample Messages by Category:\n');
  
  for (const [cat, msgs] of Object.entries(categories)) {
    if (msgs.length === 0) continue;
    console.log(`  ${cat.toUpperCase()}:`);
    msgs.slice(0, 3).forEach(m => {
      console.log(`    "${m.text.substring(0, 70)}${m.text.length > 70 ? '...' : ''}"`);
    });
    console.log('');
  }
  
  await pause('Review categorization and press Enter to continue...');

  // Calculate statistics
  const stats = {
    totalMessages: processedMessages.length,
    uniqueUsers: Object.keys(userMessageCounts).length,
    
    // NEW: Category distribution
    categories: {
      bot_directed: categories.bot_directed.length,
      cards: categories.cards.length,
      questions: categories.questions.length,
      substantive: categories.substantive.length,
      brief: categories.brief.length,
      generic: categories.generic.length,
    },
    
    // Feature distribution
    withQuestions: processedMessages.filter(m => m.hasQuestion).length,
    withCards: processedMessages.filter(m => m.hasCard).length,
    genericReactions: processedMessages.filter(m => m.isGeneric).length,
    newcomers: processedMessages.filter(m => m.isNewcomer).length,
    returningUsers: processedMessages.filter(m => m.isReturning).length,
    newOrRarePosters: processedMessages.filter(m => m.isNewOrRarePoster).length,
    emojiOnly: processedMessages.filter(m => m.emojiOnly).length,
    legacyFakeCommands: processedMessages.filter(m => m.isLegacyFakeCommand).length,
    
    // Length distribution
    avgWordCount: (processedMessages.reduce((sum, m) => sum + m.wordCount, 0) / processedMessages.length).toFixed(1),
    shortMessages: processedMessages.filter(m => m.wordCount < 5).length,
    mediumMessages: processedMessages.filter(m => m.wordCount >= 5 && m.wordCount <= 15).length,
    longMessages: processedMessages.filter(m => m.wordCount > 15).length,
  };

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 FINAL DATASET STATISTICS');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`Total Messages: ${stats.totalMessages.toLocaleString()}`);
  console.log(`Unique Users: ${stats.uniqueUsers.toLocaleString()}\n`);

  console.log('NEW Category Distribution:');
  for (const [cat, count] of Object.entries(stats.categories)) {
    const pct = (count / stats.totalMessages * 100).toFixed(1);
    console.log(`  ${cat.padEnd(15)}: ${count.toLocaleString().padStart(7)} (${pct.padStart(5)}%)`);
  }

  console.log('\nFeature Distribution:');
  console.log(`  Questions:          ${stats.withQuestions.toLocaleString()} (${(stats.withQuestions/stats.totalMessages*100).toFixed(1)}%)`);
  console.log(`  Card Mentions:      ${stats.withCards.toLocaleString()} (${(stats.withCards/stats.totalMessages*100).toFixed(1)}%)`);
  console.log(`  Legacy /f commands: ${stats.legacyFakeCommands.toLocaleString()} (${(stats.legacyFakeCommands/stats.totalMessages*100).toFixed(1)}%)`);
  console.log(`  Generic Reactions:  ${stats.genericReactions.toLocaleString()} (${(stats.genericReactions/stats.totalMessages*100).toFixed(1)}%)`);
  console.log(`  Emoji Only:         ${stats.emojiOnly.toLocaleString()} (${(stats.emojiOnly/stats.totalMessages*100).toFixed(1)}%)\n`);
  
  console.log('User Context (Simulated from Historical Timestamps):');
  console.log(`  Newcomers (1st msg): ${stats.newcomers.toLocaleString()} (${(stats.newcomers/stats.totalMessages*100).toFixed(1)}%)`);
  console.log(`  Returning (24h+):    ${stats.returningUsers.toLocaleString()} (${(stats.returningUsers/stats.totalMessages*100).toFixed(1)}%)`);
  console.log(`  Rare Posters (1-2):  ${stats.newOrRarePosters.toLocaleString()} (${(stats.newOrRarePosters/stats.totalMessages*100).toFixed(1)}%)\n`);

  console.log('Length Distribution:');
  console.log(`  Avg Word Count: ${stats.avgWordCount}`);
  console.log(`  Short (<6 words):   ${stats.shortMessages.toLocaleString()} (${(stats.shortMessages/stats.totalMessages*100).toFixed(1)}%)`);
  console.log(`  Medium (6-15):      ${stats.mediumMessages.toLocaleString()} (${(stats.mediumMessages/stats.totalMessages*100).toFixed(1)}%)`);
  console.log(`  Long (>15):         ${stats.longMessages.toLocaleString()} (${(stats.longMessages/stats.totalMessages*100).toFixed(1)}%)\n`);

  await pause('Review final statistics and press Enter to save...');

  // Save processed data
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('STEP 7: Saving processed dataset...');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const output = {
    metadata: {
      processedAt: new Date().toISOString(),
      totalMessages: processedMessages.length,
      version: 2,
      stats: stats,
    },
    messages: processedMessages,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`✅ Saved to ${OUTPUT_PATH}`);

  const fileSizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`   File size: ${fileSizeMB} MB\n`);
  console.log('🎉 Done! Ready for Monte Carlo simulation.\n');
}

// Run main function
main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

