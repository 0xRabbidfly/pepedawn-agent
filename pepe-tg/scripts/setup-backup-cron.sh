#!/bin/bash
# Setup weekly ElizaDB backup cron job
# Run this once to install the cron job on your production server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-db.sh"
CLEANUP_SCRIPT="$SCRIPT_DIR/cleanup-old-backups.sh"

echo "🔧 Setting up weekly ElizaDB backup cron job..."
echo ""
echo "   Project: $PROJECT_DIR"
echo "   Backup script: $BACKUP_SCRIPT"
echo "   Cleanup script: $CLEANUP_SCRIPT"
echo ""

# Check if scripts exist
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "❌ Backup script not found at $BACKUP_SCRIPT"
    exit 1
fi

if [ ! -f "$CLEANUP_SCRIPT" ]; then
    echo "⚠️  Cleanup script not found - creating it..."
    cat > "$CLEANUP_SCRIPT" << 'CLEANUP_EOF'
#!/bin/bash
# Cleanup old ElizaDB backups (keep last 4 weeks)

set -e

BACKUP_DIR="../backups"
KEEP_COUNT=4  # Keep last 4 weekly backups

cd "$(dirname "$0")"

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
CLEANUP_EOF
    chmod +x "$CLEANUP_SCRIPT"
fi

# Make scripts executable
chmod +x "$BACKUP_SCRIPT"
chmod +x "$CLEANUP_SCRIPT"

# Create wrapper script that handles both backup and cleanup
WRAPPER_SCRIPT="$SCRIPT_DIR/weekly-backup.sh"
cat > "$WRAPPER_SCRIPT" << EOF
#!/bin/bash
# Weekly backup wrapper - runs backup then cleanup
set -e

cd "$PROJECT_DIR"

echo "============================================"
echo "Weekly ElizaDB Backup - \$(date)"
echo "============================================"

# Run backup
bash "$BACKUP_SCRIPT" "weekly-auto"

# If backup succeeded, cleanup old backups
if [ \$? -eq 0 ]; then
    echo ""
    bash "$CLEANUP_SCRIPT"
else
    echo "❌ Backup failed - skipping cleanup"
    exit 1
fi

echo ""
echo "✅ Weekly backup job complete"
echo "============================================"
EOF

chmod +x "$WRAPPER_SCRIPT"

# Add cron job (every Sunday at 2 AM)
CRON_LINE="0 2 * * 0 cd $PROJECT_DIR && bash $WRAPPER_SCRIPT >> $PROJECT_DIR/logs/backup.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$WRAPPER_SCRIPT"; then
    echo "⚠️  Cron job already exists - skipping installation"
    echo ""
    echo "Current cron job:"
    crontab -l | grep "$WRAPPER_SCRIPT"
else
    # Add to crontab
    (crontab -l 2>/dev/null; echo "# ElizaDB weekly backup (Sundays at 2 AM)") | crontab -
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
    
    echo "✅ Cron job installed successfully!"
    echo ""
    echo "📅 Schedule: Every Sunday at 2:00 AM"
    echo "📝 Log file: $PROJECT_DIR/logs/backup.log"
    echo ""
fi

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

echo "📋 Current crontab:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
crontab -l | grep -A1 "ElizaDB"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Setup complete!"
echo ""
echo "💡 To test the backup manually:"
echo "   cd $PROJECT_DIR && bash $WRAPPER_SCRIPT"
echo ""
echo "💡 To remove the cron job:"
echo "   crontab -e  # then delete the ElizaDB backup lines"
echo ""

