#!/bin/bash
# Safe deployment script for mentionContext fix
# Adds mentionContext parameter to bootstrap handleMessage call

set -e  # Exit on error

PLUGIN_FILE="node_modules/@elizaos/plugin-telegram/dist/index.js"
BACKUP_FILE="/tmp/telegram-plugin-$(date +%s).backup.js"

echo "🔍 Checking if fix is needed..."

# Check if already applied
if grep -q "mentionContext" "$PLUGIN_FILE"; then
  echo "✅ Fix already applied - nothing to do!"
  exit 0
fi

echo "📦 Creating backup at $BACKUP_FILE"
cp "$PLUGIN_FILE" "$BACKUP_FILE"

echo "🔧 Applying mentionContext fix..."

# Apply the fix using Node.js
node -e "
const fs = require('fs');
const file = '$PLUGIN_FILE';
let content = fs.readFileSync(file, 'utf8');

const searchString = '      await this.runtime.messageService.handleMessage(this.runtime, memory, callback);';

if (!content.includes(searchString)) {
  console.error('❌ ERROR: Could not find target code to patch');
  console.error('The plugin may have been updated or the patch already applied differently');
  process.exit(1);
}

const replacement = \`      // Build mentionContext so bootstrap knows this is a reply/mention
      const isMention = message.text?.includes(\\\`@\\\${this.bot.botInfo?.username}\\\`);
      const isReplyToBot = message.reply_to_message?.from?.id === this.bot.botInfo?.id;
      const mentionContext = (isMention || isReplyToBot) ? {
        isMention: !!isMention,
        isReply: !!isReplyToBot
      } : undefined;
      
      await this.runtime.messageService.handleMessage(this.runtime, memory, callback, mentionContext);\`;

content = content.replace(searchString, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('✅ Fix applied successfully');
" || {
  echo "❌ Fix failed - restoring backup"
  cp "$BACKUP_FILE" "$PLUGIN_FILE"
  exit 1
}

# Verify the fix
if grep -q "mentionContext" "$PLUGIN_FILE"; then
  echo "✅ Verification successful - mentionContext is present"
  echo "📍 Backup saved at: $BACKUP_FILE"
  echo ""
  echo "Next steps:"
  echo "  1. bun run build"
  echo "  2. ./scripts/safe-restart.sh"
else
  echo "❌ Verification failed - restoring backup"
  cp "$BACKUP_FILE" "$PLUGIN_FILE"
  exit 1
fi

