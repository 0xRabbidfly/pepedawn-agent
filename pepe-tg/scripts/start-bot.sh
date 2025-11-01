#!/bin/bash
# Safe bot startup script - ensures clean state before starting

cd "$(dirname "$0")/.." || exit 1

echo "🚀 Starting ElizaOS bot safely..."
echo ""

# Step 1: Check if bot is already running
BOT_PROCS=$(ps aux | grep -E "elizaos start|bun.*elizaos.*start|node.*dist/index" | grep -v grep || true)
if [ -n "$BOT_PROCS" ]; then
    echo "⚠️  Bot is already running!"
    echo ""
    echo "$BOT_PROCS" | awk '{print "   PID " $2 ": " $11 " " $12 " " $13}'
    echo ""
    echo "💡 Options:"
    echo "   • To restart: ./scripts/safe-restart.sh"
    echo "   • To stop:    ./scripts/kill-bot.sh"
    echo ""
    exit 1
fi

# Step 2: Clean up any stale lock files
if [ -f ".eliza/.elizadb/postmaster.pid" ]; then
    echo "🧹 Found stale database lock file..."
    rm -f .eliza/.elizadb/postmaster.pid .eliza/.elizadb/postmaster.opts 2>/dev/null
    echo "✅ Lock files cleaned"
    echo ""
fi

# Step 3: Verify port 3000 is free
if lsof -ti:3000 >/dev/null 2>&1; then
    echo "⚠️  Port 3000 is already in use!"
    PORT_PID=$(lsof -ti:3000)
    echo "   Process ID: $PORT_PID"
    echo ""
    echo "💡 Run: ./scripts/kill-bot.sh to clear the port"
    echo ""
    exit 1
fi

# Step 4: Verify .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "   Copy .env.example and configure your API keys"
    echo ""
    exit 1
fi

# Step 5: Check if database directory exists
if [ ! -d ".eliza" ]; then
    echo "📁 First run detected - database will be initialized..."
fi

# Step 6: Start the bot
echo "✅ All pre-flight checks passed"
echo "🚀 Starting bot..."
echo ""
elizaos start

