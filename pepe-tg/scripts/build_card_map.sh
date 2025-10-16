#!/bin/bash
# Quick script to discover and map cards from your knowledge base

echo "🐸 Building Fake Rares Card Series Map from Knowledge Base"
echo ""

cd "$(dirname "$0")/.."

# Search your docs/chunks for card mentions
echo "Scanning knowledge base for card mentions..."

# This will extract card names from your chat history
# Adjust the grep pattern based on your actual data
grep -hoiP '(?<=/f\s)[A-Z0-9]{4,}' docs/chunks/*.txt 2>/dev/null | \
  sort -u | \
  head -50

echo ""
echo "💡 Tip: Manually add these to src/data/cardSeriesMap.ts"
echo "   Then run the bot to auto-discover their series numbers"

