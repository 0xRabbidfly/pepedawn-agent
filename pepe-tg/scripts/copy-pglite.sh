#!/bin/bash
# Post-build script to copy PGLite WASM files to dist/
# This ensures PGLite files are available when running from dist/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
PGLITE_DIST="$PROJECT_ROOT/node_modules/@electric-sql/pglite/dist"

if [ ! -d "$DIST_DIR" ]; then
  echo "⚠ dist/ directory not found, skipping PGLite copy"
  exit 0
fi

if [ ! -d "$PGLITE_DIST" ]; then
  echo "⚠ PGLite dist directory not found at $PGLITE_DIST"
  exit 0
fi

echo "📦 Copying PGLite WASM files to dist/..."

if [ -f "$PGLITE_DIST/pglite.wasm" ]; then
  cp "$PGLITE_DIST/pglite.wasm" "$DIST_DIR/pglite.wasm"
  echo "✓ Copied pglite.wasm"
else
  echo "⚠ pglite.wasm not found"
fi

if [ -f "$PGLITE_DIST/pglite.data" ]; then
  cp "$PGLITE_DIST/pglite.data" "$DIST_DIR/pglite.data"
  echo "✓ Copied pglite.data"
else
  echo "⚠ pglite.data not found"
fi

