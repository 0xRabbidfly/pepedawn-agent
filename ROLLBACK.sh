#!/bin/bash
# Emergency Rollback to Working Minimal Version
# Use this if the rebuilt version has issues

echo "🔄 Rolling back to minimal working version (60 lines)..."
echo ""

# Go to project root
cd /home/nuno/projects/Fake-Rare-TG-Agent

# Show current status
echo "Current commit:"
git log --oneline -1
echo ""

# Rollback to the minimal version that worked
echo "Rolling back to commit: 42e8039 (minimal version)"
git reset --hard 42e8039

echo ""
echo "✅ Rollback complete!"
echo ""
echo "File is now at 60 lines (minimal working version)"
wc -l pepe-tg/src/plugins/fakeRaresPlugin.ts
echo ""
echo "To apply changes, restart the bot:"
echo "  cd pepe-tg && bun run start"

