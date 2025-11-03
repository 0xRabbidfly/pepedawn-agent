#!/bin/bash
# Fix for broken @anthropic-ai/claude-code npm package
# The package.json says main is "sdk.mjs" but the file is missing from npm
# This creates a stub that allows elizaos CLI to start (only plugin upgrade commands need the real implementation)

STUB_FILE="node_modules/@anthropic-ai/claude-code/sdk.mjs"

if [ ! -f "$STUB_FILE" ]; then
  cat > "$STUB_FILE" << 'STUB'
// Stub file to fix broken @anthropic-ai/claude-code package
export function query() {
  throw new Error('@anthropic-ai/claude-code stub - only needed for plugin upgrade commands');
}
export default { query };
STUB
  echo "✅ Created stub file: $STUB_FILE"
else
  echo "✓ Stub file already exists: $STUB_FILE"
fi
