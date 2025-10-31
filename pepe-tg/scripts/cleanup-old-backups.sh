#!/bin/bash
# Cleanup old ElizaDB backups (keep last 4 weeks)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/../backups"
KEEP_COUNT=4  # Keep last 4 weekly backups

echo "🧹 Cleaning up old backups..."
echo "   Keeping last $KEEP_COUNT backups"

# Count existing backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/elizadb-backup-*.tar.gz 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -le "$KEEP_COUNT" ]; then
    echo "✅ Only $BACKUP_COUNT backups found - nothing to delete"
    exit 0
fi

# Delete oldest backups (keep newest KEEP_COUNT)
DELETE_COUNT=$((BACKUP_COUNT - KEEP_COUNT))
echo "📦 Found $BACKUP_COUNT backups - deleting oldest $DELETE_COUNT"

ls -1t "$BACKUP_DIR"/elizadb-backup-*.tar.gz | tail -n "$DELETE_COUNT" | while read -r file; do
    SIZE=$(du -sh "$file" | cut -f1)
    echo "   Deleting: $(basename "$file") ($SIZE)"
    rm -f "$file"
done

echo "✅ Cleanup complete - $KEEP_COUNT backups remaining"
