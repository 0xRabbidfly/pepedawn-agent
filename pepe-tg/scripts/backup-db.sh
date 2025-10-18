#!/bin/bash
# Backup ElizaDB (including embeddings and conversation history)
# Can run while bot is running (safe backup)

set -e

BACKUP_DIR="../backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_PATH=".eliza/.elizadb"
BACKUP_FILE="$BACKUP_DIR/elizadb-backup-$DATE.tar.gz"
LABEL="${1:-manual}"  # Optional label (e.g., "after-embeddings", "pre-upgrade")

echo "🔒 Creating ElizaDB backup ($LABEL)..."

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database exists
if [ ! -d "$DB_PATH" ]; then
    echo "❌ Database not found at $DB_PATH"
    echo "   Have you run the bot at least once?"
    exit 1
fi

# Warn if bot is running but allow backup
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "⚠️  Bot is running - creating live backup (may include in-progress writes)"
else
    echo "✅ Bot is stopped - creating clean backup"
fi

# Create backup with label in filename
if [ "$LABEL" != "manual" ]; then
    BACKUP_FILE="$BACKUP_DIR/elizadb-backup-${LABEL}-$DATE.tar.gz"
fi

echo "📦 Compressing database..."
tar -czf "$BACKUP_FILE" -C .eliza .elizadb/

# Show results
BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
DB_SIZE=$(du -sh "$DB_PATH" | cut -f1)

echo ""
echo "✅ Backup complete!"
echo "   Original DB: $DB_SIZE"
echo "   Backup file: $(basename $BACKUP_FILE)"
echo "   Compressed:  $BACKUP_SIZE"
echo "   Location:    $BACKUP_FILE"
echo ""
echo "📝 To restore:"
echo "   1. Stop the bot"
echo "   2. Run: tar -xzf $BACKUP_FILE -C .eliza/"
echo ""

# List recent backups
echo "📋 Recent backups:"
ls -lht "$BACKUP_DIR"/elizadb-backup-*.tar.gz | head -5 | awk '{print "   " $9 " (" $5 ")"}'
echo ""
echo "💾 Total backup storage: $(du -sh $BACKUP_DIR | cut -f1)"

