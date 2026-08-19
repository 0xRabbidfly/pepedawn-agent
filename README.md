# PEPEDAWN - Fake Rares Telegram Bot

> An AI-powered Telegram bot that serves as the keeper of Fake Rares lore, community history, and card knowledge.

**PEPEDAWN** is built on [ElizaOS](https://elizaos.ai) and embodies the spirit of the Fake Rares community - knowing every card, every artist, and every meme from the movement that started when Rare Scrilla got banned and created La Faka Nostra.

[![ElizaOS](https://img.shields.io/badge/ElizaOS-v1.6.2-blue)](https://elizaos.ai)
[![Bun](https://img.shields.io/badge/Bun-v1.0+-orange)](https://bun.sh)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## ⚡ Quick Highlights

- 🎴 **890+ Fake Rares + 1813+ Fake Commons cards** with instant lookup and full metadata
- 🎠 **Interactive carousels** - Browse artist collections with prev/next buttons
- 📊 **Market monitoring** - Real-time Counterparty sales & listings tracker
- 💰 **XCP Dispensers** - Community-curated list of verified XCP dispenser links
- 🔍 **Visual analysis** - AI vision reads text + memetic commentary
- 🧠 **Smart typo correction** - `/f`, `/c`, `/p` auto-correct typos and offer tap-to-fill suggestions
- 🔄 **Auto-updating** - Hourly refresh from GitHub, no restart needed
- 🤖 **AI-powered** - Natural conversations with context awareness  
- 📚 **Knowledge base** - Optional: Search 264k+ embedded Telegram messages
- 💰 **Cost tracking** - Built-in token usage monitoring (admin-only)
- ⚡ **Performance optimized** - Unified CardDisplayService with caching & automatic GIF→MP4 conversion
- 📦 **Smart media handling** - File ID caching prevents re-uploads, oversized GIFs auto-convert
- 📊 **Production-ready** - Structured logging, type-safe, tested

---

## 🌟 Features

### 🎴 Card Viewing

#### Fake Rares (with Fuzzy Matching, Artist Search & Carousel)

**Commands:**
- **`/f CARDNAME`** - Display any card (e.g., `/f FREEDOMKEK`)
- **`/f ARTIST`** - Random card by artist (e.g., `/f Rare Scrilla`)
- **`/f c ARTIST`** - Browse artist's cards in carousel mode 🎠
- **`/f c SERIES`** - Browse series cards (e.g., `/f c 5`) ⭐**NEW**
- **`/f`** - Show a random card from 890+ collection

**Features:**
- Typo correction with fuzzy matching + inline suggestions (tap buttons to re-run)
- Artist name search with partial matches
- Interactive carousel with ⬅️ Prev / ➡️ Next buttons
- Series browsing (cards 1→50 in order)
- 890+ cards, auto-updated hourly

#### Fake Commons (Simple & Fast)

**Commands:**
- **`/c CARDNAME`** - Display any Commons card (e.g., `/c NOTAFAKERARE`)
- **`/c`** - Show a random card from 1813+ collection

**Features:**
- Fuzzy matching with inline suggestions (three closest cards)
- 1813 cards across 54 series
- Same metadata display as Fake Rares

#### Rare Pepes (Legacy Collection)

**Commands:**
- **`/p CARDNAME`** - Display any Rare Pepe card (e.g., `/p RAREPEPE`)
- **`/p`** - Show a random card from the classic Rare Pepe catalog

**Features:**
- Uses the same fuzzy-matching pipeline with tap-to-fill suggestions
- Supports the unified CardDisplayService (GIF→MP4, cached file_ids)
- Complements Fake Rares/Commons responses with classic metadata

---

### 📊 Market Transaction Monitoring

**Commands:**
- **`/fm`** - Recent sales + listings (default: last 10 transactions)
- **`/fm 20`** - Last 20 sales + listings
- **`/fm S 5`** - Last 5 sales only
- **`/fm L 15`** - Last 15 listings only
- **`/fm CARDNAME`** - Live dispensers for any card (e.g., `/fm FAKEASF`) ⭐**NEW**

**Live Dispenser Query:**
Query active dispensers for any card in real-time! The bot fetches current dispenser data directly from the Counterparty API, showing:
- Top 5 cheapest dispensers
- Price in BTC
- Available quantity / Total escrow
- Truncated address
- Direct link to TokenScan

**Real-time Telegram Notifications:**
The bot automatically monitors Counterparty blockchain for Fake Rare market activity and sends instant notifications to configured Telegram channels.

**Supported Transaction Types:**
- 💰 **Dispenser Sales** - When someone buys from a vending machine (🎰)
- ⚡ **DEX Atomic Swaps** - When someone completes a trustless trade (📊)
- 📋 **Dispenser Listings** - New vending machines posted (🎰)
- 🔄 **DEX Orders** - New swap offers posted (📊)

---

### 💰 XCP Dispenser List

**Commands:**
- **`/xcp`** - View verified XCP dispenser list

**Authorization:**
- Authorized users can update the list with `/xcp [content]`
- Anyone can view the current list with `/xcp`
- List includes verified dispensers shared by trusted community members

**Features:**
- ✅ Simple view/update system
- ✅ Shows last updated timestamp and user
- ✅ Complete replace operation on each update
- ✅ Persisted in JSON storage

---

### 💡 Periodic Content (Community Engagement)

**Automatic Features:**
The bot can periodically post helpful tips and card showcases to your Telegram channel to keep the community engaged and educated.

**What it posts:**
- 💡 **Helpful Tips** (60%) - Rotates through 11 curated tips about bot features
- 🎴 **Card Showcases** (40%) - Random cards from the 890+ collection

**Anti-Spam Protection:**
- Only posts if there's been user activity since the last periodic post
- Never posts back-to-back during periods of silence
- Configurable interval (default: 60 minutes)

**Setup:**
```bash
# In pepe-tg/.env
PERIODIC_CONTENT_ENABLED=true
PERIODIC_CONTENT_INTERVAL_MINUTES=60  # Optional, defaults to 60
TELEGRAM_CHANNEL_ID=-1001234567890    # Your channel/group ID
```

**Example Posts:**
- "💡 Fuzzy Card Matching: Did you know? I'm typo-friendly! Try `/f FREEDOMK`..."
- "🎴 Random Card: FREEDOMKEK" (with image and metadata)

**Notification Format:**
```
💰 SOLD: PEPENOPOULOS x1 | Paid: 0.0001 BTC
Oct 31 09:45 | Block 921,547 | 🔗 TokenScan 🎰
🐸 [celebration sticker]
```

**Configuration:**
```bash
# In .env
TELEGRAM_CHANNEL_ID=<group_id_1>,<group_id_2>  # Comma-separated for multiple channels
TELEGRAM_SALE_STICKER_ID=<sticker_id>          # Optional: sticker after sales
POLL_INTERVAL_SECONDS=180                       # Poll every 3 minutes (default)
```

**Features:**
- ✅ Multi-channel notifications (send to multiple groups simultaneously)
- ✅ Deduplication (never notifies same transaction twice)
- ✅ Explorer links (TokenScan for sales, Horizon Market for listings)
- ✅ 30-day transaction history queryable via `/fm`
- ✅ Database-backed (PGlite) with automatic schema migration
- ✅ Block-sequential scanning (never misses transactions)
- ✅ Fake Rare filter (only monitors collection assets)

**Database:**
All transactions are stored in PGlite database (`.eliza/.elizadb/`) alongside conversation history and embeddings. Included in standard database backups.

---

### 💰 Cost Monitoring (Admin Only)

**Commands:**
- **`/fc d`** - Today's token usage and costs
- **`/fc m`** - Current month's costs

Provides detailed breakdown:
- Total cost in USD
- Tokens in/out
- API call counts
- Per-model breakdown
- Per-feature breakdown (lore, card display, etc.)

**Access:** Only admins specified in `TELEGRAM_ADMIN_IDS` can use this command.

---

### 🔄 Auto-Updating System

**Hourly GitHub Refresh:**
1. Bot checks GitHub every hour for updated `fake-rares-data.json`
2. If new cards found, automatically updates in-memory index
3. **No restart required** - zero-downtime updates

**Automated Scraping via Github action update-fake-rares.yml :**

If manual then follow
```bash
# Scrape new cards from pepe.wtf and fakeraredirectory.com
node scripts/add-new-cards.js 18 19 20

# Commit and push
git add src/data/fake-rares-data.json
git commit -m "Add new cards from series 18-20"
git push
```

**Timeline:** New card released → Auto scraped → Pushed to GitHub as PR → Available to users within 1 hour

---

### 🧠 AI Intelligence

- Natural language conversations about Fake Rares
- Context-aware responses with community memory
- Artist and card knowledge (890+ cards, 200+ artists)
- Newcomer education and onboarding
- Optional: Knowledge base search across 264k+ Telegram messages

---

## 🚀 Quick Start

### Prerequisites

- **[Bun](https://bun.sh)** v1.0.0+ (required for ElizaOS)
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Node.js** v18+ (for some dependencies)
- **Git**

### Installation

```bash
# 1. Clone repository
git clone https://github.com/0xrabbidfly/pepedawn-agent.git
cd pepedawn-agent/pepe-tg

# 2. Install dependencies
bun install

# 3. Create environment file
cp .env.example .env
# Edit .env with your API keys (see below)
```

---

## 🔧 Environment Configuration

### Required Variables

Create `.env` file with these **required** settings:

```bash
# ========================================
# REQUIRED: AI Provider
# ========================================
OPENAI_API_KEY=sk-your-openai-key-here

# ========================================
# REQUIRED: Telegram Bot
# ========================================
TELEGRAM_BOT_TOKEN=your-bot-token-here

# ========================================
# REQUIRED: Admin Access (for /fc command)
# ========================================
TELEGRAM_ADMIN_IDS=your-telegram-user-id

# ========================================
# ========================================
REPLICATE_API_TOKEN=r8_your-replicate-token-here
```

**Get API Keys:**
- **OpenAI:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Telegram Bot Token:** Message [@BotFather](https://t.me/BotFather) → `/newbot` → Follow prompts
- **Your Telegram User ID:** Message [@userinfobot](https://t.me/userinfobot) to get your ID

### Optional Variables

```bash
# ========================================
# OPTIONAL: Model Configuration
# ========================================
OPENAI_SMALL_MODEL=gpt-4o-mini
OPENAI_LARGE_MODEL=gpt-4o
# See available models: https://platform.openai.com/docs/models

# ========================================
# OPTIONAL: Alternative AI Providers
# ========================================
ANTHROPIC_API_KEY=your-anthropic-key      # For Claude models
OPENROUTER_API_KEY=your-openrouter-key    # For 20% cost savings

# ========================================
# ========================================
# See "Knowledge Base Setup" section below
# KNOWLEDGE_PATH=./docs/chunks
# LOAD_DOCS_ON_STARTUP=true

# ========================================
# OPTIONAL: System Configuration
# ========================================
SUPPRESS_BOOTSTRAP=true                   # Reduce debug logs
LOG_LEVEL=info                            # debug | info | warn | error
FAKE_RARES_ARTIST_BUTTONS=true
#NODE_ENV=production
```

**Cost Optimization Tips:**
- Use `gpt-4o-mini` for both models → ~$1-3/month
- Use `gpt-4-turbo` for TEXT_MODEL + `gpt-4o-mini` for SMALL → ~$8/month (better quality)
- Use OpenRouter → 20% savings on same models

---

## 🎮 Bot Commands Setup

Message [@BotFather](https://t.me/BotFather) in Telegram:

```
/setcommands
```

Then paste this list:

```
f - View a Fake Rares card or random card by artist
fv - Analyze card visuals and memes with AI vision (reads text + commentary)
fm - View recent market activity (sales & listings)
fl - Get AI-powered lore stories from community history
odds - Check PEPEDAWN lottery stats and leaderboard
fc - View token costs (admin-only)
start - Welcome message and quick guide
help - Show detailed instructions
```

**Note:** The `/fc` (cost) command will only work if you have the necessary environment variables configured.

---

## 🏃 Running the Bot

### Development (Hot-reload)

```bash
cd pepe-tg
bun run dev
```

### Production

```bash
# 1. Build
bun run build

# 2. Start
bun run start
```

### Verify It's Working

In Telegram, message your bot:
```
/start
/f FREEDOMKEK
```

You should see the welcome message and the FREEDOMKEK card image.

---

## 📊 Card Data Setup

### Included: 890+ Cards

The repository includes `src/data/fake-rares-data.json` with **890+ pre-indexed cards** (Series 0-18).

**Data structure:**
```json
{
  "asset": "FREEDOMKEK",
  "series": 0,
  "card": 1,
  "ext": "jpeg",
  "artist": "Rare Scrilla",
  "artistSlug": "Rare-Scrilla",
  "supply": 298,
  "issuance": "October 2017"
}
```

**Optional fields:**
- `imageUri` - Override S3 URL with custom URL (for problematic assets)
- `videoUri` - Direct video URL (often on Arweave for MP4 files)
- `issues` - Data quality flags (e.g., `["no_artist", "no_supply"]`)

### Adding New Cards

**Method 1: Automated Scraping (Recommended)**

```bash
# Scrape specific series from pepe.wtf + fakeraredirectory.com
cd pepe-tg
node scripts/add-new-cards.js 19 20 21

# Review changes
git diff src/data/fake-rares-data.json

# Commit and push
git add src/data/fake-rares-data.json
git commit -m "Add new cards from series 19-21"
git push origin main
```

The bot automatically refreshes from GitHub every hour - new cards appear within 60 minutes!

**Method 2: Manual Entry**

Edit `src/data/fake-rares-data.json` and add card objects following the structure above.

### Fixing Problematic Assets

Some cards don't display properly through S3 (wrong format, WEBP issues, etc).

**Solution:**
1. Convert/fix the asset (e.g., WEBP → JPG, compress MP4)
2. Place in `pepe-tg/src/assets/images/` or `pepe-tg/src/assets/videos/`
3. Add override in `fake-rares-data.json`:

```json
{
  "asset": "THEBIGDEGEN",
  "imageUri": "https://raw.githubusercontent.com/YOUR_USERNAME/pepedawn-agent/master/pepe-tg/src/assets/images/THEBIGDEGEN.jpg"
}
```

See `pepe-tg/src/assets/README.md` for detailed instructions.

---

# You're ready! No action needed.
ls pepe-tg/src/data/card-embeddings.json
```

**If `card-embeddings.json` is missing:**

1. **Get Replicate API token:**
   ```bash
   # Sign up at replicate.com and get token
   # Add to .env:
   echo "REPLICATE_API_TOKEN=r8_your-token-here" >> pepe-tg/.env
   ```

2. **Generate embeddings** (one-time, ~5-10 minutes):
   ```bash
   cd pepe-tg
   bun run scripts/generate-card-embeddings.js
   ```
   This will:
   - Process all ~890 cards
   - Generate 512-D CLIP embeddings via Replicate
   - Create `src/data/card-embeddings.json` (~680KB)
   - Cost: ~$0.18 one-time ($0.0002 per image)

3. **Verify:**
   ```bash
   ls -lh src/data/card-embeddings.json
   # Should show ~680KB file
   ```

### How It Works

2. Bot generates CLIP embedding for image
3. Compares to all 890 card embeddings
4. Returns match classification:
   - **≥95%** = Exact match ("HA! NICE TRY!")
   - **≥85%** = High similarity ("SNEAKY!")
   - **30-84%** = Low similarity (shows closest match)
   - **<30%** = No match (full analysis)

### Adding New Cards

When you add cards, regenerate their embeddings:

```bash
# 1. Add new cards
node scripts/add-new-cards.js 19

# 2. Generate embeddings for new cards only
bun run scripts/generate-card-embeddings.js NEWCARD1 NEWCARD2 NEWCARD3

# 3. Or regenerate all (safe, idempotent)
bun run scripts/generate-card-embeddings.js

# 4. Commit both files
git add src/data/fake-rares-data.json src/data/card-embeddings.json
git commit -m "Add series 19 cards with embeddings"
```

**Note:** The `add-new-cards.js` script reminds you to regenerate embeddings at the end.

### What If I Skip This?

---

## 📚 Knowledge Base Setup (Optional)


### Quick Start (No Knowledge Base)

If you just want card display (`/f`), **skip this section entirely**. The bot works perfectly without it!

### Full Setup (With Lore Feature)

**Requirements:**
- Telegram chat export (JSON format)
- OR markdown/text documents you want to embed

**Steps:**

1. **Prepare your documents:**
   ```bash
   mkdir -p pepe-tg/docs/chunks
   # Place your .md or .txt files in docs/chunks/
   ```

2. **Add to `.env`:**
   ```bash
   KNOWLEDGE_PATH=./docs/chunks
   LOAD_DOCS_ON_STARTUP=true
   ```

3. **First run (generates embeddings):**
   ```bash
   bun run dev
   # Wait for "✅ Knowledge indexed" message
   # This can take 10-30 minutes for large datasets
   ```

4. **Database backup (important!):**
   ```bash
   ./scripts/backup-db.sh after-embeddings
   # Embeddings are stored in .eliza/.elizadb/
   # This database is NOT in git - back it up!
   ```

**Cost:** One-time embedding cost ~$2-3 for 260k messages (using `text-embedding-3-small`)

**See also:** `telegram_docs/PEPEDAWN_cost_analysis.md` for detailed cost breakdown.

---

## 🛠️ Available Scripts

All scripts are in `pepe-tg/scripts/` directory:

### Production Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `add-new-cards.js` | Scrape new cards from pepe.wtf | `node scripts/add-new-cards.js 19 20` |
| `backup-db.sh` | Manual database backup | `./scripts/backup-db.sh [label]` |
| `setup-backup-cron.sh` | Install automated weekly backups | `bash scripts/setup-backup-cron.sh` |
| `safe-restart.sh` | Gracefully restart bot | `./scripts/safe-restart.sh` |
| `deploy.sh` | SSH deploy to DigitalOcean | `./scripts/deploy.sh` |

### Development Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `install-test-deps.js` | Install Cypress/testing deps | Auto-runs via `bun test` |
| `test-all.sh` | Run full test suite | `./scripts/test-all.sh` |
| `kill-bot.sh` | Force kill bot process | `./scripts/kill-bot.sh` |

### Script Details

#### `add-new-cards.js` - Card Scraper

**Two-pass scraping process:**

**Pass 1:** Extract asset names from fakeraredirectory.com
- Gets: asset name, series, card number, fallback media URI

**Pass 2:** Extract full metadata from pepe.wtf (authoritative)
- Gets: artist, artistSlug, supply, issuance date, extension, media URIs

**Usage:**
```bash
# Scrape specific series
node scripts/add-new-cards.js 18 19 20

# Scrape single series
node scripts/add-new-cards.js 19

# Scrape all series (0-18 by default)
node scripts/add-new-cards.js
```

**Output:** Updates `src/data/fake-rares-data.json` with new/updated cards

---

#### `backup-db.sh` - Database Backup

Backs up `.eliza/.elizadb/` which contains:
- Embeddings (if knowledge base is configured)
- Conversation history
- Bot memory
- Transaction history (if market monitoring enabled)
- Telemetry logs

**Usage:**
```bash
# Simple backup
./scripts/backup-db.sh

# Labeled backup
./scripts/backup-db.sh pre-upgrade

# Output: ../backups/elizadb-backup-[label]-[timestamp].tar.gz
```

**Restore:**
```bash
cd pepe-tg
tar -xzf ../backups/elizadb-backup-*.tar.gz -C .eliza/
```

**Important:** Run backups before major changes and after embedding generation!

---

#### `setup-backup-cron.sh` - Automated Weekly Backups

**One-time setup for automated backups on production:**

```bash
# Install automated backup system
cd ~/pepedawn-agent/pepe-tg
bash scripts/setup-backup-cron.sh
```

**What it does:**
1. Creates weekly backup job (Sundays at 2 AM)
2. Auto-cleanup old backups (keeps last 4 weeks)
3. Logs to `logs/backup.log`
4. Installs cron job on the server

**Verify installation:**
```bash
crontab -l | grep ElizaDB
```

**Test manually:**
```bash
bash scripts/weekly-backup.sh
```

**Note:** This is for production servers. Not needed for local development.

---

#### `safe-restart.sh` - Graceful Restart for local dev

Safely restarts the bot:
1. Kills all `elizaos` processes
2. Waits for cleanup (5 seconds)
3. Verifies port 3000 is free
4. Starts fresh instance

**Usage:**
```bash
./scripts/safe-restart.sh
```

---

#### `deploy.sh` - DigitalOcean Deployment

<TODO>Automates SSH deployment to production server. Update `SERVER_IP` and `SSH_KEY` path in the script before using.</TODO>

**Usage:**
```bash
# Deploy with confirmation prompts
./scripts/deploy.sh

# Dry run (show what would execute)
./scripts/deploy.sh --dry-run
```

---

## 🚀 Production Deployment (DigitalOcean)

### Server Requirements

**Minimum specs:**
- **RAM:** 2GB (1.5GB for ElizaOS + embeddings, 500MB headroom)
- **Storage:** 5GB (1GB for code, 2-3GB for database/embeddings, 1GB headroom)
- **CPU:** 1 vCPU (sufficient for low-moderate traffic)

**Recommended DigitalOcean Droplet:**
- **Plan:** Basic ($12/month) - 2GB RAM, 1 vCPU, 50GB SSD
- **OS:** Ubuntu 22.04 LTS
- **Region:** Choose closest to your users

### Initial Server Setup

```bash
# 1. SSH into your server
ssh root@YOUR_SERVER_IP

# 2. Update system
apt-get update && apt-get upgrade -y
apt-get install -y curl git build-essential

# 3. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 4. Install Bun
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc

# 5. Install PM2 for process management
npm install -g pm2

# 6. Verify installations
node --version  # Should show v20.x
bun --version   # Should show v1.x
pm2 --version   # Should show latest
```

### Application Deployment

```bash
# 1. Clone repository
cd ~
git clone https://github.com/0xrabbidfly/pepedawn-agent.git
cd pepedawn-agent/pepe-tg

# 2. Install dependencies
bun install

# 3. Build application
bun run build

# 4. Configure environment
nano .env
# Add your API keys (see Environment Configuration section)
# Save and exit (Ctrl+X, Y, Enter)

# 5. Test manually first
bun run start
# Verify it works, then Ctrl+C to stop
```

### PM2 Production Setup

**Configure PM2 (if needed):**

Edit `ecosystem.config.cjs` and update the `cwd` path:

```javascript
cwd: '/root/pepedawn-agent/pepe-tg',  // Update to your actual path
```

**Start with PM2:**

```bash
# Start bot with PM2
pm2 start ecosystem.config.cjs

# Save PM2 configuration
pm2 save

# Setup auto-start on server reboot
pm2 startup
# ⚠️ IMPORTANT: Copy and run the command it shows!
```

**PM2 Features (Automatic):**
- 💓 Health monitoring (heartbeat logs every 30s in production)
- 🔄 Auto-restart on crashes
- 📊 Memory limit: Auto-restart if >1.5GB
- ⏰ Daily restart: 2 AM (prevents memory leaks)
- 📝 Log rotation: Automatic

### Verify Deployment

```bash
# Check PM2 status
pm2 status

# View live logs
pm2 logs pepe-tg --lines 50

# Test in Telegram
# Message your bot: /start
```

---

## 📊 Monitoring & Maintenance

### PM2 Management Commands

```bash
# View status
pm2 status

# View logs (live tail)
pm2 logs pepe-tg

# View last 50 log lines
pm2 logs pepe-tg --lines 50

# Restart bot
pm2 restart pepe-tg

# Stop bot
pm2 stop pepe-tg

# Monitor CPU/Memory
pm2 monit

# Clear old logs
pm2 flush
```

### Health Checks

**Built-in health monitoring:**
- 💓 Heartbeat logs every 30 seconds (production only)
- 🚨 Warns if no activity for 2+ minutes
- Automatic restart on crashes or memory limits

**Check if bot is healthy:**
```bash
# Look for recent heartbeats
pm2 logs pepe-tg | grep "HEARTBEAT" | tail -5

# Should see timestamps within last 30-60 seconds
```

**If bot appears frozen:**
```bash
pm2 restart pepe-tg
```

### Cost Monitoring

**View costs directly in Telegram:**
```
/fc d  → Today's costs
/fc m  → This month's costs
```

**Expected costs (100 messages/day):**
- GPT-4o-mini only: ~$1-3/month
- GPT-4-turbo + GPT-4o-mini: ~$8/month
- OpenRouter (20% savings): ~$6.50/month

**Set spending limits:**
- OpenAI: [platform.openai.com/account/limits](https://platform.openai.com/account/limits)
- Recommended: Set $10/month hard limit

### Updates & Maintenance

**Pull latest changes:**
```bash
cd ~/pepedawn-agent
git pull
cd pepe-tg
bun install          # Update dependencies if needed
bun run build        # Rebuild
pm2 restart pepe-tg  # Restart
```

**Database backup (before major changes):**
```bash
cd ~/pepedawn-agent/pepe-tg
./scripts/backup-db.sh pre-upgrade
```

**Check automated backups:**
```bash
# View backup logs
tail -20 logs/backup.log

# List backups (shows 4 most recent)
ls -lht ../backups/ | head -5
```

---

## 📁 Project Structure

```
pepe-tg/
├── 📂 src/
│   ├── 📂 actions/              # Bot commands and handlers
│   │   ├── fakeRaresCard.ts     # /f command (card display)
│   │   ├── fakeMarketAction.ts  # /fm command (market query) ✨
│   │   ├── costCommand.ts       # /fc command (cost tracking)
│   │   ├── oddsCommand.ts       # /odds command (lottery stats)
│   │   └── basicCommands.ts     # /start, /help
│   ├── 📂 plugins/
│   │   ├── fakeRaresPlugin.ts   # Main plugin + auto-refresh
│   │   └── marketTransactionReporterPlugin.ts  # Market monitoring ✨
│   ├── 📂 services/             # Business logic services ✨
│   │   ├── transactionMonitor.ts      # Blockchain polling
│   │   ├── transactionHistory.ts      # Database layer
│   │   ├── tokenscanClient.ts         # Counterparty API client
│   │   └── telegramNotification.ts    # TG notifications
│   ├── 📂 providers/
│   │   └── fakeRaresContext.ts  # Context detection provider
│   ├── 📂 evaluators/
│   │   └── loreDetector.ts      # Lore detection evaluator
│   ├── 📂 utils/
│   │   ├── cardIndexRefresher.ts  # GitHub hourly sync
│   │   ├── visionAnalyzer.ts      # Shared vision API utility
│   │   ├── tokenLogger.ts         # Cost tracking
│   │   ├── loreRetrieval.ts       # Knowledge base search (RAG)
│   │   ├── loreSummarize.ts       # Clustering & summarization
│   │   ├── storyComposer.ts       # LLM historian recounting
│   │   ├── loreConfig.ts          # Lore feature configuration
│   │   └── transactionUrls.ts     # URL building utilities ✨
│   ├── 📂 data/
│   │   ├── fake-rares-data.json   # 890+ cards database
│   │   ├── fullCardIndex.ts       # Card index loader
│   │   ├── cardSeriesMap.ts       # Series mapping
│   │   └── token-logs.jsonl       # Cost logs (gitignored)
│   ├── 📂 types/
│   │   └── transaction.ts         # Transaction type definitions ✨
│   ├── 📂 events/
│   │   └── transactionEvents.ts   # Event type definitions ✨
│   ├── 📂 assets/                 # GitHub-hosted assets
│   │   ├── images/                # Override S3 images
│   │   └── videos/                # Override S3 videos
│   ├── 📂 contracts/
│   │   └── PepedawnRaffle.abi.json  # Lottery contract ABI
│   ├── index.ts                   # Entry point
│   └── pepedawn.ts                # Character definition
├── 📂 scripts/                    # Utility scripts
│   ├── add-new-cards.js           # Card scraper
│   ├── backup-db.sh               # Manual database backup
│   ├── setup-backup-cron.sh       # Install automated backups
│   ├── weekly-backup.sh           # Weekly backup wrapper (auto-generated)
│   ├── cleanup-old-backups.sh     # Cleanup script (auto-generated)
│   ├── safe-restart.sh            # Safe restart
│   └── deploy.sh                  # Production deployment
├── 📂 docs/                       # Knowledge base (optional)
│   └── chunks/                    # Text files for embeddings
├── 📂 telegram_docs/              # Feature-specific documentation
│   ├── PEPEDAWN_cost_analysis.md  # Detailed cost breakdown
│   ├── PEPEDAWN_ODDS_SUMMARY.md   # Lottery feature docs
│   ├── ODDS_ARCHITECTURE.md       # Lottery technical details
│   ├── CACHE_*.md                 # Cache design docs (future)
│   └── *.sh, *.py                 # Utility scripts
├── .env                           # Environment config (create this!)
├── .env.example                   # Environment template
├── ecosystem.config.cjs           # PM2 configuration
├── Dockerfile                     # Docker deployment
├── docker-compose.yaml            # Docker Compose setup
├── package.json                   # Dependencies
└── tsconfig.json                  # TypeScript config
```

---

## 🏗️ Architecture & Performance

### Card Lookup Strategy

**Three-tier system:**

1. **Full Index (Instant)** - 890+ cards in-memory, O(1) lookup
   - Loads from `fake-rares-data.json` on startup
   - Hash map: `CARDNAME` → card metadata
   - ~200ms response time

2. **GitHub Auto-Refresh (Hourly)** 
   - Fetches latest `fake-rares-data.json` from GitHub
   - Updates in-memory index if changes detected
   - Zero-downtime updates

3. **HTTP Probing (Fallback)** - For unknown cards
   - Searches S3 across all series (0-18)
   - ~2-10s for first lookup
   - Caches result for future requests

### Fuzzy Matching

**Algorithm:** Levenshtein distance with optimized single-pass calculation

**Performance:** ~20ms to search all 890 cards

**Thresholds:**
```typescript
HIGH_CONFIDENCE: 0.75   // ≥75% → Auto-show
MODERATE: 0.55          // 55-74% → Show suggestions
ARTIST_FUZZY: 0.65      // 65% → Artist name matching
```

**Examples:**
- `FREEDOMK` → 83% match → Auto-shows FREEDOMKEK
- `WAGMI` → 60% match → Suggests: WAGMIWORLD, WAGMIPEPE
- `RARE` → Too generic → Returns error with search tips

### Auto-Refresh System

**How it works:**

1. On startup, loads `fake-rares-data.json` from disk (890 cards)
2. Every hour, fetches latest from GitHub:
   ```
   https://raw.githubusercontent.com/0xRabbidfly/pepedawn-agent/master/pepe-tg/src/data/fake-rares-data.json
   ```
3. If changes detected, updates in-memory index
4. Logs update: `"✅ Card index updated: 890 → 920 cards (+30)"`

**Configuration:** Edit `src/utils/cardIndexRefresher.ts`:
```typescript
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;  // 1 hour (default)
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/...';
```

### Lore Generation Pipeline (if knowledge base configured)


1. **Query Expansion** - Adds synonyms, context
2. **Vector Search** - Retrieves 24 relevant passages from knowledge base
3. **Query Classification** - Determines if FACTS (rules, specs), LORE (stories, history), or UNCERTAIN (ambiguous/casual)
4. **Selection Strategy:**
   - **FACTS mode:** Top-k by relevance (no diversity filtering - want best facts) ✅
   - **LORE mode:** MMR diversity selection (avoid repetition in storytelling)
   - **Note:** Fixed Nov 2025 - FACTS mode now correctly preserves memory ranking
5. **Processing:**
   - **FACTS:** Direct passages to LLM (no clustering)
   - **LORE:** Clustering and summarization
6. **Lore Recounting** - GPT-4-turbo recounts as witness/historian (80-120 words)
7. **Citation** - Adds compact source references

**Performance:** 1-3 seconds per lore request

---

## 💰 Cost Analysis

### Estimated Monthly Costs (100 messages/day)

| Component | Model | Monthly Cost |
|-----------|-------|--------------|
| **Card Display** | GPT-4-turbo | ~$3.00 |
| **Visual Analysis** (20/day) | GPT-4o Vision | ~$3.00 |
| **Lore Generation** (if enabled) | GPT-4-turbo | ~$4.00 |
| **Cost Tracking** | GPT-4o-mini | ~$0.02 |
| **Bot Responses** | GPT-4-turbo | ~$1.00 |
| **TOTAL (all features)** | | ~$11.00/month |
| **TOTAL (cards + vision)** | | ~$7.00/month |
| **TOTAL (cards only)** | | ~$4.00/month |

### Cost Optimization

**Use cheaper models:**
```bash
# In .env
OPENAI_SMALL_MODEL=gpt-4o-mini
OPENAI_LARGE_MODEL=gpt-4o
```

**Use OpenRouter (20% savings):**
```bash
# In .env
OPENROUTER_API_KEY=your-key
# Same models, 20% cheaper
```

**Track costs:**
```
/fc d  # Check daily spending
/fc m  # Check monthly total
```

---

## 🎯 Usage Examples

### Viewing Cards

```
/f FREEDOMKEK           → Genesis card by Rare Scrilla
/f WAGMIWORLD           → Interactive game card
/f PEPONACID            → Psychedelic masterpiece
/f                      → Random card
/f Rare Scrilla         → Random card by artist
/f indelible            → Random by Indelible (case-insensitive)
```

### Analyzing Cards

```
```

### Getting Lore (requires knowledge base)

```
```

### Admin Commands

```
/fc d                   → Today's costs
/fc m                   → This month's costs
```

### Natural Conversation

Just chat naturally! Ask about:
- "What are Fake Rares?"
- "Tell me about FREEDOMKEK"
- "Who is Rare Scrilla?"
- "What's La Faka Nostra?"

The bot understands context and remembers conversations.

---

## 🔍 Troubleshooting

### Bot Won't Start

```bash
# 1. Check dependencies
rm -rf node_modules && bun install

# 2. Verify API keys in .env
cat .env | grep API_KEY

# 3. Try rebuilding
bun run build
bun run start

# 4. Check for errors
# Look for specific error messages in console
```

### Bot Not Responding in Telegram

**Checklist:**
1. Verify `TELEGRAM_BOT_TOKEN` is correct in `.env`
2. Ensure `OPENAI_API_KEY` is set and valid
3. Check bot is running: `pm2 status` or `ps aux | grep elizaos`
4. Check logs: `pm2 logs pepe-tg` (if using PM2)
5. Test bot token: `curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe`

### Card Not Found

**Possible causes:**
- Spelling error (bot will suggest corrections if close match)
- Card doesn't exist in `fake-rares-data.json` yet
- Card is too new (wait for hourly refresh or run scraper)

**Solutions:**
```bash
# 1. Check if card exists
grep -i "CARDNAME" pepe-tg/src/data/fake-rares-data.json

# 2. If missing, scrape from pepe.wtf
cd pepe-tg
node scripts/add-new-cards.js 18  # Replace 18 with correct series

# 3. Restart bot (or wait up to 1 hour for auto-refresh)
pm2 restart pepe-tg
```

### High OpenAI Costs

**Check your model configuration:**
```bash
# View your .env
cat .env | grep TEXT_MODEL

# Recommended for cost savings:
TEXT_MODEL=gpt-4o-mini
SMALL_OPENAI_MODEL=gpt-4o-mini
```

**Check actual usage:**
```
/fc m  # In Telegram (admin only)
```

**Review OpenAI dashboard:**
[platform.openai.com/usage](https://platform.openai.com/usage)

### PM2 Issues

**Bot in zombie state (responding but frozen):**
```bash
# Check for heartbeat
pm2 logs pepe-tg | grep "HEARTBEAT" | tail -5

# If no recent heartbeats:
pm2 restart pepe-tg
```

**Memory leak detected:**
```bash
# Check memory usage
pm2 monit

# If >1.5GB, restart
pm2 restart pepe-tg
```

**Bot won't start with PM2:**
```bash
# Check PM2 logs
pm2 logs pepe-tg --err

# Common issues:
# 1. Wrong path in ecosystem.config.cjs
# 2. Missing .env file
# 3. Bun not in PATH

# Fix PATH for PM2:
pm2 delete pepe-tg
pm2 start ecosystem.config.cjs
```

### Database Issues

**Database not found:**
```bash
# Check if database exists
ls -la .eliza/.elizadb/

# If missing, first run will create it
bun run start
```

**Database corruption:**
```bash
# Stop bot
pm2 stop pepe-tg

# Restore from backup
tar -xzf ../backups/elizadb-backup-*.tar.gz -C .eliza/

# Restart
pm2 start pepe-tg
```

---

## 🧪 Testing

### Run Tests

```bash
# All custom tests
bun test

# Pre-commit test (runs via .git/hooks/pre-commit)
# Equivalent to: bun run test (see package.json "test:custom")
bun run test

# Visual commands tests
bun test src/__tests__/utils/visionAnalyzer.test.ts
bun test src/__tests__/integration/visual-commands.test.ts

# Knowledge & auto-routing tests
bun test src/__tests__/utils/queryClassifier.test.ts
bun test src/__tests__/utils/loreRetrieval.test.ts
bun test src/__tests__/utils/memoryStorage.test.ts
bun test src/__tests__/auto-routing.test.ts

# Smart router and plugin routing tests
bun test src/__tests__/services/smartRouterService.golden.test.ts
bun test src/__tests__/router/cardFastPath.test.ts
bun test src/__tests__/plugins/fakeRaresPlugin.memory-and-filters.test.ts

# Watch mode (auto-rerun on changes)
bun test --watch

# Coverage report
bun test --coverage
```

### Test Structure

The project has **19 custom unit/integration test files** (300+ tests total):

**1. Bootstrap Suppression** (pre-commit)
- `bootstrap-suppression.test.ts` – Validates Bootstrap AI suppression and routing handoff
- Runs automatically on every `git commit` via `.git/hooks/pre-commit` → `bun run test`

**2-5. Visual Commands** (4 files)
- `utils/visionAnalyzer.test.ts` – Shared vision API utility
- `integration/visual-commands.test.ts` – Plugin routing & command conflicts

**6-10. Knowledge & Auto-Routing** (5 files)
- `utils/queryClassifier.test.ts` – FACTS/LORE/UNCERTAIN classification
- `utils/loreRetrieval.test.ts` – Memory priority & source boost logic
- `utils/memoryStorage.test.ts` – Card detection & memory boost logic
- `auto-routing.test.ts` – Auto-routing logic & reply detection (20 tests)

**11-13. Smart Router & Plugin Routing** (3 files)
- `services/smartRouterService.test.ts` – Router history & transcript formatting
- `services/smartRouterService.golden.test.ts` – Golden classifier prompt + routing plans
- `plugins/fakeRaresPlugin.memory-and-filters.test.ts` – Memory capture, card intent hint, FAKEASF safety filter

**14. Card Fast-Path** (1 file)
- `router/cardFastPath.test.ts` – Card fast-path decision rules (dominance, similarity, card share)

**15-17. Market Monitoring** (3 files)
- `actions/fakeMarketAction.test.ts` – `/fm` command validation & parsing
- `services/transactionMonitor.test.ts` – Transaction polling & filtering
- `utils/transactionUrls.test.ts` – URL utilities (100% coverage)

> **Note:** Framework test files (ElizaOS boilerplate) are also present but focus on these custom tests for this project.

---

## 🎨 Customization

### Character Personality

Edit `src/pepedawn.ts` to customize:
- **System prompt** - Bot's personality and behavior rules
- **Bio** - Background and expertise areas
- **Topics** - Knowledge domains
- **Style** - Communication patterns
- **Message examples** - Training examples for LLM

### Auto-Refresh Configuration

Edit `src/utils/cardIndexRefresher.ts`:

```typescript
// Change refresh interval
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes instead of 60

// Change GitHub source (for forks)
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/pepe-tg/src/data/fake-rares-data.json';
```

### Lore Feature Configuration

Edit `src/utils/loreConfig.ts`:

```typescript
export const LORE_CONFIG = {
  RETRIEVAL_LIMIT: 24,              // Passages to retrieve
  STORY_LENGTH_WORDS: '80-120',     // Story length
  TEMPERATURE: 0.7,                  // LLM creativity (0-1)
  LRU_WINDOW_SIZE: 50,              // Recent lore memory
};
```

---

## 📚 Documentation

### Documentation Structure

```
pepedawn-agent/
│
├── 📘 README.md                    ⭐ You are here - Complete guide
├── 📗 SETUP_CHECKLIST.md           Step-by-step setup (Phase 1-4)
├── 📙 CONTRIBUTING.md              Developer guide + ElizaOS patterns
│
└── pepe-tg/
    ├── 📄 README.md                → Points to this file
    ├── scripts/README.md           All scripts documented
    └── telegram_docs/
        ├── README.md               Index
        ├── PEPEDAWN_cost_analysis.md       Detailed costs
        ├── PEPEDAWN_ODDS_SUMMARY.md        Lottery setup
        ├── ODDS_ARCHITECTURE.md            Lottery tech
        └── CACHE_*.md              Cache design (future)
```

### Quick Links

| What do you need? | Read this |
|-------------------|-----------|
| **Install the bot** | This README → [Quick Start](#-quick-start) |
| **Step-by-step setup** | [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md) |
| **Configure .env** | Copy `pepe-tg/.env.example` → `.env` |
| **Develop features** | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Understand costs** | [Cost Analysis](#-cost-analysis) or [telegram_docs/PEPEDAWN_cost_analysis.md](pepe-tg/telegram_docs/PEPEDAWN_cost_analysis.md) |
| **Set up lottery** | [telegram_docs/PEPEDAWN_ODDS_SUMMARY.md](pepe-tg/telegram_docs/PEPEDAWN_ODDS_SUMMARY.md) |
| **Use scripts** | [scripts/README.md](pepe-tg/scripts/README.md) |

### External Resources

- [ElizaOS Documentation](https://docs.elizaos.ai) - Framework docs
- [Telegram Bot API](https://core.telegram.org/bots/api) - API reference  
- [pepe.wtf](https://pepe.wtf) - Card explorer and marketplace
- [Fake Rares Official](https://fakerares.com) - Official website

---

## 🔧 Development Workflow

### Local Development

```bash
cd pepe-tg

# Start with hot-reload
bun run dev

# In another terminal, run tests on save
bun test --watch

# Lint/format code
bun run lint
```

### Code Quality

```bash
# Type checking
bun run type-check

# Format code
bun run format

# Check formatting
bun run format:check

# Run all checks
bun run check-all
```

### Adding a New Command

1. Create action in `src/actions/yourCommand.ts`
2. Export from `src/actions/index.ts`
3. Register in `src/plugins/fakeRaresPlugin.ts`:
   ```typescript
   import { yourCommand } from '../actions';
   
   export const fakeRaresPlugin: Plugin = {
     actions: [
       // ... existing actions
       yourCommand,  // Add here
     ],
   };
   ```
4. Update BotFather commands
5. Test and deploy

See `src/actions/costCommand.ts` for a simple example.

---

## 🐳 Docker Deployment (Alternative)

### Build and Run with Docker

```bash
cd pepe-tg

# Build image
docker build -t pepedawn-bot .

# Run container
docker run -d \
  --name pepedawn \
  --env-file .env \
  -p 3000:3000 \
  pepedawn-bot

# View logs
docker logs -f pepedawn

# Stop container
docker stop pepedawn
```

### Docker Compose (Not Recommended)

The included `docker-compose.yaml` sets up PostgreSQL with pgvector, but **PEPEDAWN uses PGlite (embedded database)** and doesn't need external Postgres.

<TODO>**Action needed:** Either update `docker-compose.yaml` for PEPEDAWN-specific setup or remove it.</TODO>

---

## 🤝 Contributing

Contributions welcome! To contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests: `bun test`
5. Format code: `bun run lint`
6. Commit: `git commit -m "feat: Add your feature"`
7. Push and create Pull Request

**Code Standards:**
- TypeScript strict mode
- ESM modules (not CommonJS)
- Prettier formatting (automatic on save)
- Test coverage for new features

---

## 🎯 Feature Roadmap

**Current Features:**
- ✅ Card display with fuzzy matching
- ✅ AI-powered lore stories (optional knowledge base)
- ✅ Cost tracking and monitoring
- ✅ Lottery stats integration (optional)
- ✅ Auto-updating from GitHub
- ✅ Smart artist search

**Potential Enhancements:**
- ⏳ GitHub Actions for automated card scraping
- ⏳ Card comparison feature (`/compare CARD1 CARD2`)
- ⏳ Artist spotlight action
- ⏳ Gallery browsing by series
- ⏳ Rarity stats and floor prices
- ⏳ Collection management (owned cards)

---

## ❓ FAQ

### Do I need the knowledge base for basic card display?

**No!** The bot works with just the card commands. The knowledge base powers lore and factual answers in conversation.

### How much does it cost to run?

**Minimum:** $1-3/month (cards only, gpt-4o-mini)  
**Recommended:** $8-12/month (cards + lore, gpt-4-turbo)  
**Plus:** $12/month DigitalOcean server  
**Total:** $13-24/month

### Can I run this on a cheaper server?

Minimum requirements:
- 2GB RAM (1GB might work without knowledge base)
- 1 vCPU (0.5 vCPU might be slow)

Try DigitalOcean Basic ($6/month, 1GB RAM) for cards-only deployment.

### How do I get my Telegram User ID?

Message [@userinfobot](https://t.me/userinfobot) - it will reply with your user ID.

### Where are embeddings stored?

In `.eliza/.elizadb/` directory (PGlite embedded database). This is NOT in git - back it up!

### How do I update ElizaOS version?

```bash
cd pepe-tg
bun update @elizaos/cli@latest @elizaos/core@latest @elizaos/plugin-telegram@latest
bun install
bun run build
bun test  # Verify everything works
```

### Can I use Anthropic/Claude instead of OpenAI?

Yes! Add to `.env`:
```bash
ANTHROPIC_API_KEY=your-anthropic-key
```

The bot will automatically use Claude if OpenAI is not configured.

### How do I change the bot's personality?

Edit `src/pepedawn.ts`:
- Change `system` prompt for behavior
- Modify `bio` for background
- Update `style` for tone
- Add `messageExamples` for training

---

## 📄 License

MIT License - Open source and free to use.

---

## 💬 Support & Community

- **Issues:** [GitHub Issues](https://github.com/0xrabbidfly/pepedawn-agent/issues)
- **Discussions:** [GitHub Discussions](https://github.com/0xrabbidfly/pepedawn-agent/discussions)
- **Fake Rares Community:** [Telegram](https://t.me/fakerares) | [Discord](https://discord.gg/fakerares)
- **Technical Docs:** See `pepe-tg/telegram_docs/` folder

---

## 🙏 Credits

**Built with:**
- [ElizaOS](https://elizaos.ai) - AI agent framework
- [Bun](https://bun.sh) - Fast all-in-one JavaScript runtime
- [Telegraf](https://telegraf.js.org) - Telegram bot framework
- [OpenAI](https://openai.com) - GPT models
- [Viem](https://viem.sh) - Ethereum interaction

**Data sources:**
- [pepe.wtf](https://pepe.wtf) - Card metadata and images
- [fakeraredirectory.com](https://fakeraredirectory.com) - Card directory

**Special thanks:**
- Rare Scrilla - For creating Fake Rares
- La Faka Nostra community - For the culture and vibes
- All Fake Rares artists - For the incredible art

---

## 🐸 WAGMI

Built with ❤️ for the Fake Rares community.

*gm anon! ☀️ WAGMI 🐸✨*

---

## Quick Reference Card

```
📦 Clone:       git clone https://github.com/0xrabbidfly/pepedawn-agent.git
📥 Install:     cd pepedawn-agent/pepe-tg && bun install
⚙️ Configure:   cp .env.example .env && nano .env
▶️ Run:         bun run dev (development) or bun run start (production)
🚀 Deploy:      pm2 start ecosystem.config.cjs
🔄 Auto-Backup: bash scripts/setup-backup-cron.sh (one-time setup)
📊 Monitor:     pm2 logs pepe-tg
💰 Costs:       /fc m (in Telegram)
🔄 Update:      node scripts/add-new-cards.js [series]
💾 Backup:      ./scripts/backup-db.sh (manual)
```

---

**Last Updated:** October 31, 2025  
**Version:** 3.0.0  
**Status:** Production Ready ✅
