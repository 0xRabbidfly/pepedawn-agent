# Scripts Directory

Utility scripts for PEPEDAWN bot maintenance and deployment.

---

## 📦 Production Scripts

### `add-new-cards.js` - Card Database Scraper

**Purpose:** Scrape new Fake Rares cards from pepe.wtf and fakeraredirectory.com

**Two-pass scraping:**
1. **Pass 1:** Extract asset names from fakeraredirectory.com (structure data)
2. **Pass 2:** Extract full metadata from pepe.wtf (authoritative source)

**Usage:**
```bash
# Scrape specific series
node scripts/add-new-cards.js 18 19 20

# Scrape single series
node scripts/add-new-cards.js 19

# Scrape all series (0-18 by default)
node scripts/add-new-cards.js
```

**Output:**
- Updates `src/data/fake-rares-data.json`
- Shows diff summary (X new cards, Y updated cards)
- Auto-deduplicates existing entries

**What it scrapes:**
- Asset name, series, card number
- Artist, artist slug
- Supply, issuance date
- File extension
- Direct media URIs (for videos/problematic assets)

**Requirements:**
- Playwright (auto-installed via `bun install`)
- Internet connection
- ~30-60 seconds per series

**Example output:**
```
🚀 ADD NEW FAKE RARES CARDS
============================================================
📋 Series to scrape: 18, 19, 20

📖 Loaded 890 existing cards

📦 PASS 1 - Series 18
  Loading: https://fakeraredirectory.com/series-18/
  Found 25 cards

📋 PASS 2 - Series 18
  Loading: https://pepe.wtf/collection/Fake-Rares/cards?series=18
  Scraped 25/25 cards

💾 Saving results...
  Total cards: 915 (+25 new)

✅ Done! Updated fake-rares-data.json
```

---

### `backup-db.sh` - Database Backup

**Purpose:** Create compressed backup of ElizaDB (embeddings + conversation history)

**Usage:**
```bash
# Simple backup
./scripts/backup-db.sh

# Labeled backup
./scripts/backup-db.sh pre-upgrade

# Labeled backup examples
./scripts/backup-db.sh after-embeddings
./scripts/backup-db.sh before-deletion
./scripts/backup-db.sh production-initial
```

**Output:**
- Creates: `../backups/elizadb-backup-[label]-[timestamp].tar.gz`
- Shows backup size and location
- Lists 5 most recent backups

**What it backs up:**
- `.eliza/.elizadb/` directory (entire PGlite database)
- Embeddings (if knowledge base configured)
- Conversation history
- Bot memory

**Features:**
- Safe to run while bot is running (live backup)
- Compression (~50-70% size reduction)
- Timestamp in filename

**Restore:**
```bash
# Stop bot first
pm2 stop pepe-tg  # Or Ctrl+C if running manually

# Extract backup
tar -xzf ../backups/elizadb-backup-[timestamp].tar.gz -C .eliza/

# Restart bot
pm2 start pepe-tg  # Or bun run start
```

**Example output:**
```
🔒 Creating ElizaDB backup (pre-upgrade)...
✅ Bot is stopped - creating clean backup
📦 Compressing database...

✅ Backup complete!
   Original DB: 2.1G
   Backup file: elizadb-backup-pre-upgrade-20251023_143022.tar.gz
   Compressed:  890M
   Location:    ../backups/elizadb-backup-pre-upgrade-20251023_143022.tar.gz

📝 To restore:
   1. Stop the bot
   2. Run: tar -xzf ../backups/elizadb-backup-pre-upgrade-20251023_143022.tar.gz -C .eliza/

📋 Recent backups:
   elizadb-backup-pre-upgrade-20251023_143022.tar.gz (890M)
   elizadb-backup-after-embeddings-20251021_120000.tar.gz (856M)
   ...
```

---

### `safe-restart.sh` - Graceful Bot Restart

**Purpose:** Safely restart the bot without race conditions or port conflicts

**What it does:**
1. Kills all `elizaos start` processes
2. Waits 5 seconds for cleanup
3. Verifies processes are dead (up to 3 attempts)
4. Checks port 3000 is free
5. Force-kills port 3000 process if needed
6. Starts fresh bot instance

**Usage:**
```bash
./scripts/safe-restart.sh
```

**When to use:**
- After code changes (if not using `bun run dev`)
- After .env changes
- After updating dependencies
- When bot appears frozen/unresponsive

**Note:** This is for development/manual restarts. In production, use `pm2 restart pepe-tg` instead.

**Example output:**
```
🛑 Stopping bot...
⏳ Waiting for cleanup (5 seconds)...
✅ Cleanup complete
🚀 Starting bot...
[Bot starts...]
```

---

### `deploy.sh` - Production Deployment Automation

**Purpose:** Automate SSH deployment to DigitalOcean server

**Features:**
- SSH retry logic (3 attempts)
- Git pull latest changes
- Manual confirmation before restart
- PM2 restart
- Log display

**Configuration:**
Edit script to set your values:
```bash
SERVER_IP="YOUR_SERVER_IP"      # Your DigitalOcean IP
SSH_KEY="~/.ssh/your-key"        # Your SSH key path
PROJECT_DIR="pepedawn-agent/pepe-tg"
```

**Usage:**
```bash
# Deploy with confirmation prompts
./scripts/deploy.sh

# Dry run (show what would execute)
./scripts/deploy.sh --dry-run

# Quick mode (skip confirmations)
./scripts/deploy.sh --quick
```

**Deployment steps:**
1. SSH connect to server
2. Navigate to project directory
3. Check git status
4. Pull latest changes
5. Prompt for manual patch check
6. Restart PM2
7. Show status and recent logs

**Example output:**
```
🚀 Starting PEPEDAWN bot deployment...
[14:30:22] Step 1: Connecting to server 134.122.45.20...
[14:30:23] ✅ Connected to server
[14:30:23] Step 2: Navigating to project directory...
[14:30:24] Step 3: Checking git status...
[14:30:25] Step 4: Pulling latest changes...
[14:30:27] Step 5: Checking if patches need updating...
⚠️ Manual check required: Do patches need updating? (y/n)
Continue with restart? (y/n): y
[14:30:30] Step 6: Restarting PM2...
[14:30:32] ✅ PM2 restarted
[14:30:32] Step 7: Checking PM2 status...
[Shows PM2 status table]
[14:30:33] 🎉 Deployment completed successfully!
```

**Security note:** Never commit this script with real credentials. Update SERVER_IP after cloning.

---

## 🧪 Development Scripts

### `install-test-deps.js` - Test Dependencies Installer

**Purpose:** Auto-install Cypress and testing dependencies when running tests

**What it installs:**
- `@cypress/react` - Cypress React testing
- `@cypress/vite-dev-server` - Vite dev server for Cypress
- `@testing-library/cypress` - Testing utilities
- `cypress` - E2E testing framework

**Usage:**
```bash
# Manual run (usually auto-runs)
node scripts/install-test-deps.js

# Auto-runs when you use:
bun test
bun run cy:open
```

**Smart behavior:**
- Checks if already installed
- Only installs missing dependencies
- Uses Bun for faster installation

---

### `test-all.sh` - Full Test Suite Runner

**Purpose:** Run complete test suite (component + e2e + type-check)

**What it runs:**
1. Type checking (`tsc --noEmit`)
2. Format checking (`prettier --check`)
3. Component tests (`bun test`)
4. E2E tests (`bun test e2e/`)

**Usage:**
```bash
./scripts/test-all.sh
```

**Equivalent to:**
```bash
bun run check-all
```

---

### `kill-bot.sh` - Force Kill Bot

**Purpose:** Force-kill all bot processes (emergency use)

**Usage:**
```bash
./scripts/kill-bot.sh
```

**What it does:**
- Kills all `elizaos start` processes
- Kills all processes on port 3000
- More aggressive than `safe-restart.sh`

**When to use:**
- Bot is completely frozen
- Multiple bot instances running
- Port 3000 is stuck

**Note:** Prefer `safe-restart.sh` for normal restarts.

---

## 📚 Script Workflow Examples

### Adding New Cards (Complete Workflow)

```bash
cd pepe-tg

# 1. Scrape new series
node scripts/add-new-cards.js 19

# 2. Review changes
git diff src/data/fake-rares-data.json

# 3. Test locally
bun run dev
# Test in Telegram: /f [NEW_CARD_NAME]

# 4. Commit changes
git add src/data/fake-rares-data.json
git commit -m "Add series 19 cards"
git push origin main

# 5. Deploy to production
./scripts/deploy.sh
# Or wait up to 1 hour for auto-refresh from GitHub
```

---

### Database Maintenance

```bash
# Before major changes
./scripts/backup-db.sh pre-upgrade

# Make changes...

# If something breaks, restore:
pm2 stop pepe-tg
tar -xzf ../backups/elizadb-backup-pre-upgrade-*.tar.gz -C .eliza/
pm2 start pepe-tg
```

---

### Emergency Recovery

```bash
# 1. Force kill everything
./scripts/kill-bot.sh

# 2. Restore last good backup
tar -xzf ../backups/elizadb-backup-production-*.tar.gz -C .eliza/

# 3. Safe restart
./scripts/safe-restart.sh
```

---

## 🔧 Script Maintenance

### Updating Server IP (for deploy.sh)

```bash
nano scripts/deploy.sh

# Update these lines:
SERVER_IP="YOUR_NEW_IP"
SSH_KEY="~/.ssh/your-key"
```

### Adding New Scripts

When creating new scripts:

1. **Make executable:**
   ```bash
   chmod +x scripts/your-script.sh
   ```

2. **Add shebang:**
   ```bash
   #!/bin/bash
   # Description of what script does
   ```

3. **Document here** in this README

4. **Test thoroughly** before using in production

---

## ⚠️ Important Notes

### Backup Scripts
- **Always backup before major changes**
- Database is NOT in git - backups are critical
- Store backups outside the repository (on external drive/cloud)
- Embeddings cannot be easily regenerated

### Deployment Scripts
- Update `SERVER_IP` and `SSH_KEY` for your server
- Never commit real credentials
- Test in dry-run mode first: `./scripts/deploy.sh --dry-run`

### Scraper Scripts
- Rate limit: Don't scrape too frequently (respect site ToS)
- Verify data after scraping (check for missing metadata)
- Commit scraped data to git for version control

---

## 📞 Getting Help

If a script fails:

1. Check error message carefully
2. Verify file paths are correct
3. Check permissions: `ls -la scripts/`
4. Read script comments (they explain behavior)
5. Search GitHub issues

---

## 📝 Script Development Guidelines

When modifying scripts:

**Bash scripts:**
- Use `set -e` to exit on errors
- Add descriptive comments
- Echo progress messages
- Provide usage help

**Node scripts:**
- Handle errors gracefully
- Log progress clearly
- Validate inputs
- Document CLI arguments

**Testing:**
- Test on development first
- Use dry-run mode when available
- Backup before testing destructive operations

---

**Questions about scripts?** See main [README.md](../README.md) or [CONTRIBUTING.md](../../CONTRIBUTING.md)

