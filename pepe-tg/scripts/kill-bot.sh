#!/bin/bash

echo "🛑 Killing ElizaOS bot and port 3000..."
echo ""

# Kill ElizaOS processes
if pkill -f "elizaos start" 2>/dev/null; then
    echo "✅ ElizaOS bot stopped"
else
    echo "ℹ️  No ElizaOS process found"
fi

# Kill port 3000
if lsof -ti:3000 | xargs kill -9 2>/dev/null; then
    echo "✅ Port 3000 cleared"
else
    echo "ℹ️  Port 3000 was already free"
fi

echo ""
echo "🎯 All processes stopped!"
echo "💡 Ready to start bot with: cd pepe-tg && elizaos start"
