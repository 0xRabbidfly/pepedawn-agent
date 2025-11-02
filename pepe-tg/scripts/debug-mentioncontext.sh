#!/bin/bash
# Add debug logging to mentionContext creation

PLUGIN_FILE="node_modules/@elizaos/plugin-telegram/dist/index.js"

echo "🔍 Adding debug logging to mentionContext..."

node -e "
const fs = require('fs');
const file = '$PLUGIN_FILE';
let content = fs.readFileSync(file, 'utf8');

const searchString = '      // Build mentionContext so bootstrap knows this is a reply/mention';

if (!content.includes(searchString)) {
  console.error('❌ mentionContext code not found - fix not applied!');
  process.exit(1);
}

// Add logging after mentionContext creation
const old = \`      const mentionContext = (isMention || isReplyToBot) ? {
        isMention: !!isMention,
        isReply: !!isReplyToBot
      } : undefined;
      
      await this.runtime.messageService.handleMessage(this.runtime, memory, callback, mentionContext);\`;

const withLogging = \`      const mentionContext = (isMention || isReplyToBot) ? {
        isMention: !!isMention,
        isReply: !!isReplyToBot
      } : undefined;
      
      logger2.info(\\\`📨 [Telegram->Bootstrap] Passing mentionContext: \\\${JSON.stringify(mentionContext)}\\\`);
      
      await this.runtime.messageService.handleMessage(this.runtime, memory, callback, mentionContext);\`;

content = content.replace(old, withLogging);
fs.writeFileSync(file, content, 'utf8');
console.log('✅ Debug logging added');
"

echo "✅ Done - rebuild and restart to see mentionContext values in logs"

