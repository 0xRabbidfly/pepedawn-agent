#!/bin/bash
# Backup ElizaDB embeddings
# Run this AFTER stopping the bot to ensure clean backup

set -e

BACKUP_DIR="backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_PATH="pepe-tg/.eliza/.elizadb"
BACKUP_FILE="$BACKUP_DIR/elizadb-backup-$DATE.tar.gz"

echo "🔒 Creating backup of ElizaDB embeddings..."

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if bot is running
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "⚠️  WARNING: Bot is still running on port 3000!"
    echo "   For a clean backup, stop the bot first with Ctrl+C"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Backup cancelled."
        exit 1
    fi
fi

# Create backup
echo "📦 Compressing database..."
tar -czf "$BACKUP_FILE" -C pepe-tg/.eliza .elizadb/

# Show results
BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
DB_SIZE=$(du -sh "$DB_PATH" | cut -f1)

echo ""
echo "✅ Backup complete!"
echo "   Original DB: $DB_SIZE"
echo "   Backup file: $BACKUP_FILE"
echo "   Compressed:  $BACKUP_SIZE"
echo ""
echo "📝 To restore: tar -xzf $BACKUP_FILE -C pepe-tg/.eliza/"

