#!/bin/bash
# Safe bot shutdown script - prevents database corruption

cd "$(dirname "$0")/.." || exit 1

echo "🛑 Stopping ElizaOS bot safely..."
echo ""

# Step 1: Try graceful shutdown (SIGTERM)
BOT_PIDS=$(ps aux | grep -E "elizaos start|bun.*elizaos.*start|node.*dist/index" | grep -v grep | awk '{print $2}' | tr '\n' ' ')

if [ -n "$BOT_PIDS" ]; then
    echo "📤 Sending graceful shutdown signal (SIGTERM)..."
    echo "   Process IDs: $BOT_PIDS"
    
    # Send SIGTERM to all bot processes
    for pid in $BOT_PIDS; do
        kill -TERM $pid 2>/dev/null || true
    done
    
    # Wait up to 10 seconds for graceful shutdown
    for i in {1..10}; do
        REMAINING=$(ps aux | grep -E "elizaos start|bun.*elizaos.*start|node.*dist/index" | grep -v grep || true)
        if [ -z "$REMAINING" ]; then
            echo "✅ Bot stopped gracefully after ${i}s"
            break
        fi
        if [ $i -eq 10 ]; then
            echo "⚠️  Bot didn't stop gracefully, forcing shutdown..."
            for pid in $BOT_PIDS; do
                kill -9 $pid 2>/dev/null || true
            done
            sleep 2
            echo "✅ Bot force-stopped"
        else
            sleep 1
            echo "   ⏳ Waiting for shutdown... ${i}s"
        fi
    done
else
    echo "ℹ️  No ElizaOS process found"
fi

# Step 2: Check and clear port 3000
if lsof -ti:3000 >/dev/null 2>&1; then
    echo ""
    echo "⚠️  Port 3000 still in use, checking process..."
    PORT_PID=$(lsof -ti:3000)
    echo "   Process ID: $PORT_PID"
    
    # Try graceful kill first
    kill -TERM $PORT_PID 2>/dev/null
    sleep 2
    
    if lsof -ti:3000 >/dev/null 2>&1; then
        echo "   Forcing port 3000 process to stop..."
        kill -9 $PORT_PID 2>/dev/null
        sleep 1
        echo "✅ Port 3000 cleared (forced)"
    else
        echo "✅ Port 3000 cleared (gracefully)"
    fi
else
    echo "ℹ️  Port 3000 was already free"
fi

# Step 3: Clean up any stale lock files
if [ -f ".eliza/.elizadb/postmaster.pid" ]; then
    echo ""
    echo "🧹 Removing stale database lock files..."
    rm -f .eliza/.elizadb/postmaster.pid .eliza/.elizadb/postmaster.opts 2>/dev/null
    echo "✅ Lock files removed"
fi

echo ""
echo "🎯 All processes stopped safely!"
echo "💡 Database is now safe to query with: npm run db:query"
echo "💡 Restart bot with: ./scripts/safe-restart.sh"
