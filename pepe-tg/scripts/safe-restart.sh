#!/bin/bash
# Safe bot restart script - prevents race conditions

cd "$(dirname "$0")/.." || exit 1

echo "🛑 Stopping bot..."
pkill -f "elizaos start" || echo "No running bot found"

echo "⏳ Waiting for cleanup (5 seconds)..."
sleep 5

# Verify all processes are dead
for i in {1..3}; do
  if pgrep -f "elizaos start" >/dev/null 2>&1; then
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

echo "✅ Cleanup complete"
echo "🚀 Starting bot..."
bun run start

