#!/usr/bin/env node
/**
 * Post-install script to add mentionContext to Telegram plugin
 * This fixes short response filtering by telling bootstrap about replies/mentions
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_FILE = path.join(__dirname, '../node_modules/@elizaos/plugin-telegram/dist/index.js');

// Check if file exists
if (!fs.existsSync(PLUGIN_FILE)) {
  console.log('⚠️  Telegram plugin not found - skipping mentionContext fix');
  process.exit(0);
}

let content = fs.readFileSync(PLUGIN_FILE, 'utf8');

// Check if already applied
if (content.includes('mentionContext:')) {
  console.log('✅ mentionContext already in place');
  process.exit(0);
}

console.log('🔧 Adding mentionContext to Telegram plugin...');

// Find and replace the inReplyTo line in the content object
const pattern = /(inReplyTo: "reply_to_message" in message && message\.reply_to_message \? createUniqueUuid\(this\.runtime, message\.reply_to_message\.message_id\.toString\(\)\) : void 0)\n(\s+)\},/g;

const replacement = `$1,
$2  mentionContext: {
$2    isMention: message.text?.includes(\`@\${this.bot.botInfo?.username}\`) || false,
$2    isReply: ("reply_to_message" in message && message.reply_to_message?.from?.id === this.bot.botInfo?.id) || false
$2  }
$2},`;

const newContent = content.replace(pattern, replacement);

if (newContent === content) {
  console.log('❌ Could not find pattern to replace');
  console.log('   The plugin may have been updated or format changed');
  process.exit(1);
}

fs.writeFileSync(PLUGIN_FILE, newContent, 'utf8');
console.log('✅ mentionContext added to message.content');
console.log('   This will fix short response filtering in groups!');

