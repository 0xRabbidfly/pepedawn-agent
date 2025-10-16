# PEPEDAWN Bot - Technical Handover Brief

**Project:** Fake Rares Telegram Bot (PEPEDAWN)  
**Framework:** ElizaOS v1.6.1  
**Status:** Production Ready ✅  
**Date:** 2025-10-16 (Updated)

---

## Project Overview

PEPEDAWN is an AI-powered Telegram bot for the Fake Rares community that:
- Displays card images via `/f <CARDNAME>` command
- Shares community lore proactively
- Auto-educates newcomers
- Learns from community contributions
- Searches 264,500+ embedded chat messages

---

## Current Status

### ✅ Completed
1. **Core Infrastructure**
   - ElizaOS project initialized
   - Telegram integration configured
   - PGlite database setup
   - Environment variables configured

2. **Data Preparation**
   - 147MB chat export cleaned to 44MB
   - Split into 529 chunks (500 messages each)
   - Embeddings generation: **COMPLETE** ✅ (763MB database)

3. **Custom Plugin Development**
   - Created `fakeRaresPlugin` with 5 actions, 1 provider, 1 evaluator
   - All components tested and linter-clean

### ✅ Production Ready
- All embeddings complete (763MB database)
- Bot tested and working in Telegram
- Dynamic card discovery implemented
- Image attachments working perfectly

### 📋 Optional Enhancements
1. Configure BotFather commands (cosmetic)
2. Deploy to production server
3. Monitor performance and usage

---

## Architecture

### Technology Stack

```
ElizaOS (AI Agent Framework)
├── Runtime: Node.js with Bun
├── Database: PGlite (embedded PostgreSQL)
├── Embeddings: OpenAI text-embedding-3-small
├── LLM: GPT-4-turbo (responses) + GPT-3.5-turbo (decisions)
└── Platform: Telegram via @elizaos/plugin-telegram
```

### Project Structure

```
pepe-tg/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── pepedawn.ts                 # Character definition
│   ├── plugins/
│   │   └── fakeRaresPlugin.ts      # Custom plugin (main file)
│   ├── actions/                    # Bot actions (what it can DO)
│   │   ├── fakeRaresCard.ts        # /f command implementation
│   │   ├── shareLore.ts            # Proactive lore sharing
│   │   ├── educateNewcomer.ts      # Auto-onboarding
│   │   └── basicCommands.ts        # /start, /help
│   ├── providers/                  # Context detection (runs before actions)
│   │   └── fakeRaresContext.ts     # Detects card mentions
│   ├── evaluators/                 # Post-processing (runs after responses)
│   │   └── loreDetector.ts         # Curates community knowledge
│   └── data/
│       └── cardSeriesMap.ts        # Card → series mapping (performance)
├── docs/
│   ├── chunks/                     # 529 message chunks (embedded)
│   └── *.md                        # Documentation
├── scripts/
│   ├── split_telegram_history.py  # Data cleaning script
│   └── scrape_card_series.py      # Card mapping scraper
├── .env                            # Configuration (see below)
└── package.json
```

---

## Key Components

### 1. Character Definition (`pepedawn.ts`)

**What it is:** Defines the bot's personality, knowledge, and behavior

**Key sections:**
- `name`: "PEPEDAWN"
- `system`: AI prompt defining the bot's role as OG Fake Rares community member
- `bio`: Background and expertise
- `topics`: What it knows about (cards, artists, lore, culture)
- `messageExamples`: Training examples for LLM
- `style`: How it communicates (degen language, community vibes)
- `plugins`: Only string references to published plugins

**Important:** Character files contain personality, NOT custom actions. Custom actions go in plugins.

---

### 2. Custom Plugin (`fakeRaresPlugin.ts`)

**What it is:** Container for all custom functionality

```typescript
export const fakeRaresPlugin: Plugin = {
  name: 'fake-rares',
  actions: [
    startCommand,             // /start
    helpCommand,              // /help  
    fakeRaresCardAction,      // /f CARDNAME
    shareLoreAction,          // Proactive lore (LLM-decided)
    educateNewcomerAction,    // Auto-onboarding
  ],
  providers: [
    fakeRaresContextProvider, // Detects card mentions
  ],
  evaluators: [
    loreDetectorEvaluator,    // Curates new lore
  ],
  services: [],               // None currently
};
```

**Registered in:** `src/index.ts` as `projectAgent.plugins`

---

### 3. Actions (What the Bot Can Do)

#### **A. `/f` Command (`fakeRaresCard.ts`)**

**Purpose:** Display Fake Rares card images

**Flow:**
1. User types: `/f FREEDOMKEK`
2. Validates: Regex `/^\/f\s+[a-z0-9]+/i`
3. Progress feedback: 🔍 Searching... → 📚 Fetching lore... → 🎨 Loading...
4. Searches knowledge base for card lore
5. Finds image URL from S3
6. Returns image + lore to Telegram

**Performance:**
- **Known cards:** ~200ms (cached series lookup)
- **Unknown cards:** ~2-10s (searches series 0-18, then caches)

**URL Pattern:**
```
https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/{SERIES}/{CARDNAME}.{jpg|jpeg|gif}
```

**Key functions:**
- `findCardImage()`: HTTP HEAD requests to locate card
- `getCardSeries()`: Fast lookup from `CARD_SERIES_MAP`
- `addCardToMap()`: Runtime caching of discovered cards

**Optimization opportunity:** Populate `CARD_SERIES_MAP` from pepe.wtf (19 series × 50 cards = 950 total)

---

#### **B. Proactive Lore Sharing (`shareLore.ts`)**

**Purpose:** Intelligently share lore when relevant

**How it works:**
1. **Validation:** Triggers when Fake Rares keywords detected
2. **LLM Decision:** Asks GPT-3.5: "Should I share lore here?" (YES/NO)
3. **Search:** If YES, queries knowledge base
4. **Share:** Posts relevant lore

**Example:**
```
User: "I heard FREEDOMKEK is important?"
Bot (internal): LLM decides YES
Bot: "Absolutely ser! FREEDOMKEK is the genesis card..."
```

**Cost:** ~$0.0001 per decision (GPT-3.5-turbo, ~300 tokens)

---

#### **C. Newcomer Education (`educateNewcomer.ts`)**

**Purpose:** Auto-detect and onboard new users

**Detection patterns:**
- "what is", "new here", "just joined", "how do i"
- Combined with Fake Rares topic mentions

**Knowledge levels:**
1. `ABSOLUTE_BEGINNER` - Full intro + quick start
2. `KNOWS_RARE_PEPES` - Comparison to Rare Pepes
3. `TECHNICAL_QUESTION` - Trading/collecting info

**Flow:**
1. Detects newcomer pattern
2. LLM assesses knowledge level
3. Searches knowledge base for relevant intro content
4. Tailored welcome message

---

#### **D. Basic Commands (`basicCommands.ts`)**

- `/start` - Welcome message for new users
- `/help` - Usage guide and examples

**Maps to BotFather commands** (see Telegram Setup below)

---

### 4. Provider (`fakeRaresContext.ts`)

**What it is:** Runs BEFORE actions to enrich state with contextual data

**What it detects:**
- Mentioned cards: `['FREEDOMKEK', 'WAGMIWORLD']`
- Community terms: `['wagmi', 'la faka nostra', 'degen']`
- Conversation type: card-specific vs general

**Output:**
```typescript
{
  text: "Cards mentioned: WAGMIWORLD",
  data: {
    mentionedCards: ['WAGMIWORLD'],
    hasFakeRaresContext: true,
    isCardSpecific: true
  },
  values: { ... }
}
```

**Used by:** Actions receive this in their `state` parameter

**Cost:** $0 (pure JavaScript string matching)

---

### 5. Evaluator (`loreDetector.ts`)

**What it is:** Runs AFTER conversations to extract new lore

**Flow:**
1. User shares: "WAGMIWORLD had 770 players during launch!"
2. Bot responds (or doesn't)
3. **Evaluator runs:**
   - LLM analyzes: "Does this contain factual lore?"
   - If YES: Extracts card name, type, summary
   - Stores in `lore_repository` table
   - Auto-embedded for future searches

**Lore types:**
- HISTORICAL (creation stories, dates)
- TECHNICAL (features, mechanics)
- CULTURAL (meanings, significance)
- ANECDOTE (community stories)

**Result:** Community knowledge grows automatically!

**Cost:** ~$0.0001 per analysis (GPT-3.5-turbo)

---

## Data Flow

### Message Processing Pipeline

```
1. Message arrives from Telegram
   ↓
2. Runtime validates all actions
   ├─> startCommand.validate()
   ├─> fakeRaresCardAction.validate()  ✅ MATCHES "/f FREEDOMKEK"
   ├─> shareLoreAction.validate()
   └─> educateNewcomerAction.validate()
   ↓
3. Provider runs (enriches state)
   └─> fakeRaresContext.get()
       Returns: { mentionedCards: ['FREEDOMKEK'], ... }
   ↓
4. Action handler executes
   └─> fakeRaresCardAction.handler()
       ├─> Sends: "🔍 Searching..."
       ├─> Searches knowledge base
       ├─> Finds card image
       ├─> Sends: card + lore + image
       └─> Returns: { success: true, data: {...} }
   ↓
5. Evaluator runs (after response)
   └─> loreDetector.handler()
       └─> Checks if message contained new lore
   ↓
6. Runtime completes
```

---

## Environment Configuration

### Critical `.env` Settings

```bash
# OpenAI API
OPENAI_API_KEY=sk-proj-...

# Telegram
TELEGRAM_BOT_TOKEN=8462258734:...
TELEGRAM_ADMIN_IDS=6773748098

# Database
PGLITE_DATA_DIR=/path/to/.eliza/.elizadb

# Knowledge Plugin
CTX_KNOWLEDGE_ENABLED=false          # Disable expensive enrichment
KNOWLEDGE_PATH=./docs/chunks
LOAD_DOCS_ON_STARTUP=true

# Embeddings (Cost-optimized)
EMBEDDING_PROVIDER=openai
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
TEXT_EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536
OPENAI_EMBEDDING_DIMENSIONS=1536

# LLM
TEXT_PROVIDER=openai
TEXT_MODEL=gpt-4-turbo              # For bot responses

# Rate Limits (Optimized)
MAX_INPUT_TOKENS=8000
MAX_OUTPUT_TOKENS=4096
MAX_CONCURRENT_REQUESTS=10
REQUESTS_PER_MINUTE=400
TOKENS_PER_MINUTE=900000
```

**Important:**
- `CTX_KNOWLEDGE_ENABLED=false` - Saves ~$3/day vs GPT-4 enrichment
- `text-embedding-3-small` - 6.5x cheaper than `text-embedding-3-large`
- Rate limits tuned for 529 chunks × ~60 embeddings each

---

## Cost Analysis

### One-Time Costs
- **Embeddings:** ~$2-3 (264,500 messages, one-time)

### Monthly Operating Costs
| Component | Usage | Cost/Month |
|-----------|-------|------------|
| Bot responses (gpt-4-turbo) | ~50/day | $15-45 |
| Lore sharing decisions (gpt-3.5) | ~20/day | $0.06 |
| Newcomer assessments (gpt-3.5) | ~5/day | $0.02 |
| Lore detection (gpt-3.5) | ~5/day | $0.02 |
| **Total** | | **~$15-45/month** |

**Enhancements add:** < $0.10/month (negligible!)

---

## Performance Characteristics

### Response Times
- `/f` known card: ~200ms
- `/f` unknown card: ~2-10s (first time only)
- Natural questions: ~1-3s (LLM generation)
- Lore sharing: +0.1-0.3s (decision overhead)

### Database
- **Type:** PGlite (embedded PostgreSQL)
- **Location:** `.eliza/.elizadb/`
- **Size:** Grows with embeddings (~1-2GB for 264k messages)
- **Backup:** Important! Contains all embeddings

### Memory
- **Runtime cache:** `CARD_SERIES_MAP` (~950 cards max)
- **Knowledge base:** 264,500 messages embedded
- **Bot memory:** Conversation history per room

---

## Testing Checklist

### After Embeddings Complete:

1. **Start bot:**
   ```bash
   cd pepe-tg
   elizaos start
   ```

2. **Test /f command:**
   ```
   /f FREEDOMKEK
   ```
   - Should show progress messages
   - Should display card image
   - Should include lore snippet

3. **Test proactive lore:**
   ```
   User: "Tell me about WAGMIWORLD"
   ```
   - Bot should search knowledge and respond

4. **Test newcomer education:**
   ```
   User: "Just joined, what are Fake Rares?"
   ```
   - Bot should provide tailored welcome

5. **Test lore detection:**
   ```
   User: "Fun fact: WAGMIWORLD had 770 players!"
   ```
   - Check console for "✅ New lore detected"

6. **Test /start and /help:**
   ```
   /start
   /help
   ```
   - Should show formatted messages

---

## Telegram Setup

### BotFather Commands

In Telegram, message `@BotFather`:
1. `/setcommands`
2. Select your bot
3. Paste:
```
f - View a Fake Rares card (usage: /f CARDNAME)
start - Start the bot and see welcome message
help - Show how to use PEPEDAWN
```

---

## Deployment

### Requirements
- Node.js 18+ or Bun
- 2GB RAM minimum (for embeddings)
- 5GB disk space (for database)
- Stable internet (for OpenAI API)

### Start Commands
```bash
# Development
elizaos dev

# Production
elizaos start

# Build first
bun run build
elizaos start
```

### Monitoring
- Check console for errors
- Monitor OpenAI API usage (platform.openai.com)
- Watch database size growth
- Test in Telegram regularly

---

## Known Issues & Limitations

### Current Limitations
1. **Card Series Map:** Only 2 cards pre-populated
   - **Fix:** Scrape pepe.wtf for all 950 cards
   - **Script:** `scripts/scrape_card_series.py`

2. **No persistence across restarts:** Discovered cards lost on restart
   - **Fix:** Could persist `CARD_SERIES_MAP` to database

3. **Image search slow for new cards:** Up to 57 HTTP requests
   - **Fix:** Pre-populate series map (see #1)

### Future Enhancements
- Persist card series map to database
- Add `/lore CARDNAME` command to view curated lore
- Implement card comparison feature
- Add artist spotlight action
- Create gallery/collection browsing

---

## Troubleshooting

### Bot not responding
- Check `.env` has correct `TELEGRAM_BOT_TOKEN`
- Verify bot is running: `elizaos start`
- Check console for errors

### /f command slow
- First lookup for card is slow (normal)
- Populate `CARD_SERIES_MAP` for instant lookups
- Check S3 is accessible

### No lore in responses
- Ensure embeddings completed
- Check `LOAD_DOCS_ON_STARTUP=true`
- Verify `KNOWLEDGE_PATH=./docs/chunks`

### Lore detection not working
- Check console for evaluator logs
- Verify `loreDetectorEvaluator` in plugin
- Test with factual statements about cards

### High OpenAI costs
- Check `CTX_KNOWLEDGE_ENABLED=false`
- Verify using `text-embedding-3-small`
- Monitor `TEXT_MODEL` (should be `gpt-4-turbo`)

---

## Key Files Reference

| File | Purpose | Edit Frequency |
|------|---------|----------------|
| `.env` | Configuration | Often (settings) |
| `src/pepedawn.ts` | Personality | Occasionally (character updates) |
| `src/plugins/fakeRaresPlugin.ts` | Plugin definition | Rare (add new components) |
| `src/actions/fakeRaresCard.ts` | /f command logic | Rare (bug fixes) |
| `src/data/cardSeriesMap.ts` | Card mappings | Often (add new cards) |
| `docs/chunks/` | Embedded data | Never (generated) |
| `.eliza/.elizadb/` | Database | Never (managed by runtime) |

---

## Code Conventions

### Action Pattern
```typescript
export const myAction: Action = {
  name: 'MY_ACTION',           // ALL_CAPS
  description: '...',
  similes: ['...'],
  examples: [...],
  validate: async (...) => boolean,
  handler: async (...) => ActionResult  // MUST return { success: boolean }
};
```

### Provider Pattern
```typescript
export const myProvider: Provider = {
  name: 'MY_PROVIDER',
  get: async (...) => ProviderResult  // { text, data, values }
};
```

### Evaluator Pattern
```typescript
export const myEvaluator: Evaluator = {
  name: 'MY_EVALUATOR',
  validate: async (...) => boolean,
  handler: async (...) => void  // No return needed
};
```

---

## Resources

### Documentation
- ElizaOS Docs: https://docs.elizaos.ai
- Plugin Components: https://docs.elizaos.ai/plugins/components
- Action Patterns: https://docs.elizaos.ai/plugins/patterns

### External Resources
- Pepe.wtf: https://pepe.wtf/collection/Fake-Rares
- Fake Rares Cards: https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/{SERIES}/{CARD}.{ext}

### Project Docs
- `docs/TECHNICAL_HANDOVER.md` - This file
- `docs/CARD_MAP_OPTIMIZATION.md` - Performance optimization guide
- `telegram_docs/TELEGRAM_SETUP.md` - Telegram configuration
- `telegram_docs/PEPEDAWN_USER_GUIDE.md` - User-facing guide

---

## Contact & Support

For questions about this implementation:
1. Review console logs first
2. Check ElizaOS documentation
3. Review action/provider/evaluator code
4. Test in isolation with minimal examples

**Remember:** The bot is learning from the community. Encourage users to share facts and stories - they become part of PEPEDAWN's knowledge!

**WAGMI** 🐸✨

---

**Last Updated:** 2025-10-16  
**Version:** 1.0  
**Status:** Production Ready (pending embeddings completion)

