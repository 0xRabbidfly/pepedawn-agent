# PEPEDAWN - Fake Rares Telegram Bot

> An AI-powered Telegram bot that serves as the keeper of Fake Rares lore, community history, and card knowledge.

**PEPEDAWN** is built on [ElizaOS](https://elizaos.ai) and embodies the spirit of the Fake Rares community - knowing every card, every artist, and every meme from the movement that started when Rare Scrilla got banned and created La Faka Nostra.

## ⚡ Quick Highlights

- 🎴 **950+ Fake Rares cards** with instant lookup and full metadata
- 🧠 **Smart typo correction** - Fuzzy matching with 3-tier intelligence
- 🔄 **Auto-updating** - New cards appear within hours, no restart needed
- 🤖 **AI-powered** - Natural conversations with context awareness
- ⚡ **Performance optimized** - Refactored for speed and maintainability
- 📊 **Production-ready** - Structured logging, type-safe, tested

## 🌟 Features

### 📚 LLM-LORE: AI-Powered Lore Storytelling

**New Feature:** Get personalized, grounded stories from 3+ years of community history!

**Commands:**
- **`/lore TOPIC`** - AI generates unique stories from Telegram history + pepe.wtf wiki
- **`/lore`** - Random lore from the community vault

**How it works:**
1. Searches local vector database (Telegram messages + wiki)
2. Clusters relevant passages for diversity
3. Generates PEPEDAWN-persona story (120-180 words)
4. Includes compact source citations (e.g., `tg:1234, wiki:purple-era`)
5. Each telling is unique while staying grounded in real history

**Examples:**
- `/lore purple subasset era` → Stories about that specific time
- `/lore Rare Scrilla` → Lore about the founder
- `/lore FREEDOMKEK` → The genesis card's history
- `/lore` → Surprise me with community history!

### 🎴 Card Viewing with Fuzzy Matching

**Commands:**
- **`/f CARDNAME`** - Display any card (e.g., `/f FREEDOMKEK`)
- **`/f`** - Show a random card from the collection

**Smart Typo Correction:**
- **High confidence (≥75%)** → Auto-shows correct card with playful message
- **Moderate (50-74%)** → Suggests top 3 possible matches
- **Low (<50%)** → Shows helpful error with pepe.wtf link

**Clean Preview Display:**
- Card image/video preview displays inline
- No asset URLs shown (clean, professional presentation)
- Includes: Artist, supply, issuance date, series info, artist profile button
- Fallback: Shows card metadata if preview fails (no broken URLs)

### 🔄 Auto-Updating System

**Completely automated new card discovery:**

1. **GitHub Action** runs daily at 12pm UTC
2. **Scrapes** series 18-25 from pepe.wtf and fakeraredirectory.com
3. **Creates PR** only if new cards found
4. **You review & merge** the changes
5. **Bot auto-refreshes** every hour from GitHub (no restart needed!)

**Timeline:** New card released → Discovered within 24h → Available to users within 1h of merge

### 🧠 AI Intelligence

- Natural language conversations about Fake Rares
- Context-aware responses with community memory
- Automatic lore sharing when cards mentioned
- Newcomer education and onboarding
- Knowledge base search across Telegram history

---

## 🚀 Quick Start

### Prerequisites

- **[Bun](https://bun.sh)** v1.0.0+ (`curl -fsSL https://bun.sh/install | bash`)
- **Node.js** v18+ (for some dependencies)
- **Git**

### Installation

```bash
# 1. Clone repository
git clone https://github.com/0xrabbidfly/pepedawn-agent.git
cd pepedawn-agent/pepe-tg

# 2. Install dependencies
bun install

# 3. Create .env file
touch .env
```

### Environment Configuration

Add to `.env`:

```bash
# REQUIRED: AI Provider (choose one)
OPENAI_API_KEY=sk-your-key-here           # Recommended
# ANTHROPIC_API_KEY=your-key-here         # Alternative
# OPENROUTER_API_KEY=your-key-here        # Alternative

# REQUIRED: Telegram
TELEGRAM_BOT_TOKEN=your-bot-token-here

# OPTIONAL: Cost optimization
TEXT_MODEL=gpt-4o-mini                    # Cheaper model
SMALL_OPENAI_MODEL=gpt-4o-mini
```

**Get API Keys:**
- **OpenAI:** [platform.openai.com](https://platform.openai.com/api-keys)
- **Telegram:** Message [@BotFather](https://t.me/BotFather) → `/newbot`

### Setup Bot Commands

Message [@BotFather](https://t.me/BotFather) in Telegram:

```
/setcommands
```

Then paste:
```
f - View a Fake Rares card or random card
lore - Get AI-powered lore stories from community history
start - Welcome message and quick guide
help - Show detailed instructions
```

### Run

```bash
# Development (with hot-reload)
bun run dev

# Production
bun run build
bun run start
```

---

## 🎯 Usage

### Commands

```
/f FREEDOMKEK      → Shows FREEDOMKEK card with metadata
/f PEEP            → Auto-corrects to PEPE (fuzzy matching)
/f FREEDOMK        → Suggests: FREEDOMKEK, FREEDOMWAR, KINGFAKE
/f                 → Random card from collection
/lore purple subasset era → AI-powered lore story from chat history
/lore Rare Scrilla → Get stories about specific topics
/lore              → Random lore from community history
/start             → Welcome message
/help              → Usage guide
```

### Natural Conversation

Just chat naturally! Ask about:
- "What are Fake Rares?"
- "Tell me about FREEDOMKEK"
- "Who is Rare Scrilla?"
- "What's La Faka Nostra?"

The bot understands context and remembers past conversations.

---

## 📁 Project Structure

```
pepe-tg/
├── src/
│   ├── actions/              # Bot commands and handlers
│   │   ├── fakeRaresCard.ts  # /f command (refactored, optimized)
│   │   └── basicCommands.ts  # /start, /help
│   ├── plugins/              # Plugin system
│   │   └── fakeRaresPlugin.ts # Main plugin + auto-refresh
│   ├── data/                 # Card database
│   │   ├── fake-rares-data.json # 950+ cards
│   │   └── fullCardIndex.ts  # Index loader
│   ├── utils/                # Utilities
│   │   └── cardIndexRefresher.ts # GitHub sync
│   └── pepedawn.ts           # Character definition
├── .github/workflows/
│   └── update-fake-rares.yml # Auto-scraper
├── scripts/
│   └── add-new-cards.js      # Web scraper
└── .env                      # Your config (create this)
```

---

## 🔧 Advanced Configuration

### Adding New Cards

**Automatic (Recommended):**
- GitHub Action runs daily
- Creates PR when new cards found
- Merge PR → Bot updates within 1 hour

**Manual:**
```bash
# Scrape specific series
node scripts/add-new-cards.js 18 19 20

# Commit and push
git add src/data/fake-rares-data.json
git commit -m "Add new cards"
git push
```

Bot refreshes automatically within 1 hour (or restart for immediate update).

### Character Customization

Edit `src/pepedawn.ts` to customize:
- System prompt (personality and behavior)
- Bio (background and expertise)
- Topics (knowledge areas)
- Style (communication patterns)

### Auto-Refresh Configuration

Edit `src/utils/cardIndexRefresher.ts`:

```typescript
// Change refresh interval
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes

// Change GitHub source
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/...';
```

---

## 🚀 Production Deployment

### DigitalOcean Setup

**1. Create Droplet**
- Ubuntu 22.04 LTS
- Basic plan: $6/month (1GB RAM, 1 vCPU)
- Note your server IP

**2. Install Dependencies**
```bash
ssh root@YOUR_SERVER_IP

# System update
apt-get update && apt-get upgrade -y
apt-get install -y curl git build-essential

# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Bun
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

# PM2 for process management
npm install -g pm2
```

**3. Deploy Application**
```bash
# Clone
git clone https://github.com/0xrabbidfly/pepedawn-agent.git
cd pepedawn-agent/pepe-tg

# Install and build
bun install
bun run build

# Create .env (add your keys)
nano .env

# Start with PM2
pm2 start "bun run start" --name pepedawn
pm2 save
pm2 startup  # Follow the command it shows
```

**4. Verify**
```bash
pm2 status
pm2 logs pepedawn
```

Test in Telegram: Send `/start` to your bot

### PM2 Management

```bash
pm2 status              # Check status
pm2 logs pepedawn       # View logs
pm2 restart pepedawn    # Restart
pm2 stop pepedawn       # Stop
pm2 monit               # Real-time monitoring
```

### Updates

```bash
cd ~/pepedawn-agent
git pull
cd pepe-tg
bun install
bun run build
pm2 restart pepedawn
```

---

## 📊 Available Scripts

```bash
# Development
bun run dev              # Start with hot-reload
bun run build            # Build TypeScript
bun run start            # Production mode

# Testing
bun run test             # Run all tests
bun run test:e2e         # End-to-end tests
bun run lint             # Format code

# Card Management
node scripts/add-new-cards.js 18 19 20  # Scrape new cards
./scripts/backup-db.sh                   # Backup database
```

---

## 🏗️ Technical Architecture

### Card Lookup Performance

**Three-layer strategy:**
1. **Full Index** (Instant) - In-memory hash map, O(1) lookup
2. **Runtime Cache** (Fast ~200ms) - Previously discovered cards
3. **HTTP Probing** (Slow 2-10s) - Fallback for unknown cards

### Fuzzy Matching

**Algorithm:** Levenshtein distance with optimized single-pass calculation

**Performance:** ~20ms to search all 950 cards (50% faster after refactoring)

**Thresholds:**
```typescript
HIGH_CONFIDENCE: 0.75   // Auto-show
MODERATE: 0.5           // Suggest
TOP_SUGGESTIONS: 3      // Number of suggestions
```

### Auto-Update Components

**1. Web Scraper** (`scripts/add-new-cards.js`)
- Two-pass: Structure → Metadata
- Handles tokenscan.io, custom URIs, misspelled S3 assets
- Smart deduplication

**2. GitHub Action** (`.github/workflows/update-fake-rares.yml`)
- Scheduled: Daily 12pm UTC
- Monitors: Series 18-25
- Output: PR only if changes detected

**3. Real-Time Refresher** (`src/utils/cardIndexRefresher.ts`)
- Fetches from GitHub hourly
- Updates in-memory index
- Zero-downtime, graceful fallback

### Code Quality

**Recent Refactoring:**
- Main handler: 356 → 92 lines (-74% complexity)
- Dead code removed: ~160 lines
- Strong TypeScript typing throughout
- Structured JSON logging
- 13 testable functions (vs. 1 monolithic handler)

---

## 🔍 Troubleshooting

### Bot Won't Start

```bash
# Check dependencies
rm -rf node_modules && bun install

# Verify API keys
cat .env | grep API_KEY

# Check logs
tail -f logs/*.log
```

### Bot Not Responding

1. Verify `TELEGRAM_BOT_TOKEN` in `.env`
2. Ensure at least one AI provider key is set
3. Check bot is running: `pm2 status` or `ps aux | grep bun`

### Card Not Found

- Check spelling (fuzzy matching helps but has limits)
- Verify card exists on [pepe.wtf](https://pepe.wtf)
- For new cards: Wait for auto-update or run scraper manually

### GitHub Action Not Running

1. Check Actions tab: `https://github.com/0xrabbidfly/pepedawn-agent/actions`
2. Verify workflow file exists: `.github/workflows/update-fake-rares.yml`
3. Check you have Actions enabled in repo settings

---

## 📚 Documentation

- **[Telegram Setup Guide](pepe-tg/telegram_docs/TELEGRAM_SETUP.md)** - Detailed Telegram bot configuration
- **[User Guide](pepe-tg/telegram_docs/PEPEDAWN_USER_GUIDE.md)** - Guide for bot users
- **[Technical Handover](pepe-tg/telegram_docs/TECHNICAL_HANDOVER.md)** - Technical architecture

### External Resources

- [ElizaOS Documentation](https://elizaos.github.io/eliza/) - Framework docs
- [Telegram Bot API](https://core.telegram.org/bots/api) - API reference
- [pepe.wtf](https://pepe.wtf) - Card explorer and marketplace
- [Fake Rares Official](https://fakerares.com) - Official website

---

## 💰 Costs

**Estimated monthly costs:**
- DigitalOcean Droplet (Basic): **$6/month**
- OpenAI API (GPT-4o Mini): **$1-3/month**
- **Total: $7-9/month**

**Set spending limits:**
- OpenAI: [platform.openai.com/account/limits](https://platform.openai.com/account/limits)
- Set monthly limit to $5-10

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

MIT License - Open source and free to use.

---

## 💬 Support

- **Issues**: Open a GitHub issue
- **Setup Help**: Check `telegram_docs/` folder
- **Technical Questions**: See `TECHNICAL_HANDOVER.md`

---

## 🐸 WAGMI

Built with ❤️ for the Fake Rares community.

*gm anon! ☀️ WAGMI 🐸✨*
