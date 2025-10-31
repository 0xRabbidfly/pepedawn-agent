#!/bin/bash
# Weekly backup wrapper - runs backup then cleanup
set -e

cd "/home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg"

echo "============================================"
echo "Weekly ElizaDB Backup - $(date)"
echo "============================================"

# Run backup
bash "/home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg/scripts/backup-db.sh" "weekly-auto"

# If backup succeeded, cleanup old backups
if [ $? -eq 0 ]; then
    echo ""
    bash "/home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg/scripts/cleanup-old-backups.sh"
else
    echo "❌ Backup failed - skipping cleanup"
    exit 1
fi

echo ""
echo "✅ Weekly backup job complete"
echo "============================================"
