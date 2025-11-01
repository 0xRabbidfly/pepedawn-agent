#!/bin/bash
# Safe bot restart script - prevents race conditions

cd "$(dirname "$0")/.." || exit 1

echo "🛑 Stopping bot..."

# Get bot PIDs using reliable detection
BOT_PIDS=$(ps aux | grep -E "elizaos start|bun.*elizaos.*start|node.*dist/index" | grep -v grep | awk '{print $2}' | tr '\n' ' ')

if [ -n "$BOT_PIDS" ]; then
    echo "   Found processes: $BOT_PIDS"
    # Send graceful shutdown
    for pid in $BOT_PIDS; do
        kill -TERM $pid 2>/dev/null || true
    done
else
    echo "   No running bot found"
fi

echo "⏳ Waiting for cleanup (5 seconds)..."
sleep 5

# Verify all processes are dead
for i in {1..3}; do
  REMAINING=$(ps aux | grep -E "elizaos start|bun.*elizaos.*start|node.*dist/index" | grep -v grep || true)
  if [ -n "$REMAINING" ]; then
    echo "⚠️  Bot still running, waiting... (attempt $i/3)"
    sleep 2
  else
    break
  fi
done

# Verify port is free
if lsof -ti:3000 >/dev/null 2>&1; then
  echo "⚠️  Port 3000 still in use, killing process..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# Clean up any stale lock files
if [ -f ".eliza/.elizadb/postmaster.pid" ]; then
  echo "🧹 Removing stale database lock files..."
  rm -f .eliza/.elizadb/postmaster.pid .eliza/.elizadb/postmaster.opts 2>/dev/null
fi

echo "✅ Cleanup complete"
echo "🚀 Starting bot..."
./scripts/start-bot.sh

