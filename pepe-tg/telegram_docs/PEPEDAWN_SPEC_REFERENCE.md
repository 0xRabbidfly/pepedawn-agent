# PEPEDAWN Quick Reference 🐸

> ⚠️ **Superseded by v5 (2026-08-19).** This document describes the pre-v5
> architecture. Removed since: the `/fl`, `/fv`, `/ft`, `/dawn` and `/educate`
> commands, ElizaOS bootstrap handoff, the engagement-score filter, card
> discovery, and LORE as a separate mode.
>
> Current design: [`design_docs/PEPEDAWN_CHAT_V5.md`](design_docs/PEPEDAWN_CHAT_V5.md).
> Live command list: the `/help` handler in `src/actions/basicCommands.ts`.


> **One-page visual guide for all commands and features**

---

## 🎴 Commands Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    PEPEDAWN BOT COMMANDS                        │
└─────────────────────────────────────────────────────────────────┘

/f CARDNAME          →  📷 View any card
/f ARTIST            →  🎨 Random card by artist  
/f                   →  🎲 Random card from collection

/fv CARDNAME         →  🔍 AI visual analysis (OCR + memes)
/ft + [image]        →  🎯 Score your art's Fake appeal

/fl TOPIC            →  📚 Get lore from community history
/fl                  →  📖 Random lore story

"remember this..."   →  💾 Save a fact to memory

/fm CARDNAME         →  📈 Market stats snapshot
/xcp ASSET           →  🔗 Counterparty asset info
/fc d|m              →  💰 Cost tracking (admin only)

/start               →  👋 Welcome message
/help                →  ℹ️  Show commands
```

---

## 🔄 Quick Flow Diagrams

### Card Viewing (`/f`)
```
User → /f CARDNAME
  ↓
  ├─ Exact match? → Show card ✅
  ├─ Artist match? → Random by artist 🎨
  ├─ Typo? (≥75%) → Auto-correct & show ✨
  ├─ Close? (55-74%) → Suggest 3 options 💡
  └─ Not found → Error + tips ❌

Speed: <200ms | Free
```

### Visual Analysis (`/fv`)
```
User → /fv CARDNAME
  ↓
  Find card → Load image
  ↓
  GPT-4o Vision
  ↓
  📝 Text (OCR)
  🎨 Visual breakdown
  🧬 Memetic DNA
  🎯 Vibe check

Cost: ~$0.005 | Time: 1-3s
```

### Fake Appeal Test (`/ft`)
```
User → /ft + [image]
  ↓
  Check duplicate
  ├─ Exact (≥95%) → "HA! NICE TRY!" 🚨
  ├─ High (≥85%) → "SNEAKY!" ⚠️
  └─ Low/None → Full analysis
      ↓
      Score based on:
      ⭐ PEPE culture (highest weight)
      ⭐ Memetic text (high weight)
      ⚡ Green palette (medium)
      ⚡ Pepe name (medium)
      ↓
      🎯 FAKE APPEAL: X/10

Cost: ~$0.007 | Time: 2-4s
```

### Lore Retrieval (`/fl`)
```
User → /fl TOPIC
  ↓
  Hybrid search (exact card match + vector search)
  ↓
  Rank by source priority (LORE mode):
  ⭐⭐⭐ Memories (4.0x boost)
  ⭐⭐ Wiki (2.6x boost)
  ⭐ Telegram (2.2x boost)
  ⚡ Card-fact (1.2x boost)
  ↓
  Source diversity + MMR selection:
  - Ensures representation from all source types
  - Applies MMR for text diversity
  - Prevents card-facts from dominating
  ↓
  Card memory detected?
            ├─ YES → Dedicated cluster (raw text)
            │         + other clusters (summarized)
            │         ↓
            │         Artist's exact words preserved
            │
            └─ NO → Normal clustering
                    ↓
                    "I remember when..."
  ↓
  Knowledge response sent with citations (always LORE-style storytelling)

Cost: ~$0.01 | Time: 1-3s
```

### Memory Capture
```
User → /fr CARDNAME <lore>
  OR /fr <general lore>
  OR "FREEDOMKEK remember this: it was..."
  OR [Reply to bot] "remember this"
  ↓
  Extract content
  ↓
  Validate (not empty, not too long)
  ↓
  Store in Knowledge DB (global)
  ↓
  "💾 Memory stored! Access it anytime with /fl"
  ↓
  Now searchable via /fl! ✅

Priority: HIGHEST in lore searches
```

---

## 🎯 Feature Matrix

| Command | Purpose | AI Model | Cost | Speed |
|---------|---------|----------|------|-------|
| `/f` | View cards | None (index lookup) | Free | <200ms |
| `/fv` | Analyze card visuals | GPT-4o Vision | $0.005 | 1-3s |
| `/ft` | Score image appeal | GPT-4o + CLIP | $0.007 | 2-4s |
| `/fl` | Get lore/history | GPT-5/GPT-4o + embeddings | $0.01 | 1-3s |
| Memory | Save facts | None (DB write) | Free | <500ms |
| Chat | Conversation | Knowledge Orchestrator → GPT-4o persona fallback | $0.01 | 1-2s |

---

## 💡 Pro Tips

### Card Viewing
- **Typo-friendly:** "FREEDOMK" → auto-corrects to FREEDOMKEK
- **Artist search:** `/f Rare Scrilla` → random card by artist
- **Case-insensitive:** `/f freedomkek` works too
- **890+ cards** in the index (auto-updates hourly)

### Visual Analysis
- **Reads ALL text** on the card (OCR)
- **Identifies memes** and crypto culture references
- **Works with GIFs/MP4s** (uses static frame)
- **Cost:** Only ~$0.005 per analysis

### Fake Appeal Test
- **Upload any image** - not just Fake Rares
- **Duplicate detection** prevents re-submissions
- **Strict scoring** based on real Fake Rares ethos:
  - ⭐ PEPE culture (Fake Rares, Rare Pepe, danks)
  - ⭐ Memetic text (pepe-related)
  - ⚡ Green palette
  - ⚡ Pepe name/references
- **Blocks animations** - clip a frame first

### Lore Retrieval
- **3 source types:**
  - 💬 Telegram chat archives
  - 📖 pepe.wtf wiki pages
  - 💾 User-contributed memories (highest priority!)
- **Smart routing:**
  - "submission rules" → FACTS mode (bullet lists)
  - "tell me about" → LORE mode (storytelling)
- **Never repeats** recently shown content (LRU cache)
- **Global search** across all chats

### Memory Capture
- **Two ways to trigger:**
  1. Slash command: `/fr CARDNAME <lore>` or `/fr <general lore>`
  2. Natural language: `FREEDOMKEK remember this: fact here`
  3. Reply to bot + say "remember this"
- **Requirements:**
  - Must have CAPITALIZED word OR reply to bot OR mention bot
  - Plus "remember this" in text
- **Stored globally** - available to everyone via `/fl`
- **Highest priority** in lore searches (4x boost)

---

## 📊 Data Sources

### Card Database (890+ cards)
- **Source:** `fake-rares-data.json`
- **Updates:** Auto-refresh from GitHub every hour
- **Scraped from:** pepe.wtf + fakeraredirectory.com
- **Zero downtime** when new cards added

### Knowledge Base (for `/fl`)
- **Telegram Archives:** Historical community chats
- **pepe.wtf Wiki:** Official lore and documentation
- **User Memories:** Community-contributed facts (via "remember this")

---

## ⚡ Performance

| Metric | Value |
|--------|-------|
| Card lookup (known) | <200ms |
| Card lookup (unknown) | 2-10s (first time) |
| Visual analysis | 1-3s |
| Lore retrieval | 1-3s |
| Memory storage | <500ms |
| Conversation response | 1-2s |

---

## 💰 Monthly Costs (100 msgs/day)

| Feature | Usage | Cost |
|---------|-------|------|
| Card display | 40/day | Free |
| Visual analysis | 20/day | $3/mo |
| Fake test | 10/day | $2/mo |
| Lore retrieval | 30/day | $4/mo |
| Conversations | 50/day | $2/mo |
| **TOTAL** | | **~$11/mo** |

*Optimize by using gpt-4o-mini: ~$3/mo total*

---

## 🎨 Examples

### Card Viewing
```
/f FREEDOMKEK        →  Shows genesis card
/f PEEP              →  Auto-corrects to PEPE
/f FREEDOM           →  Suggests: FREEDOMKEK, FREEDOMWAR
/f Rare Scrilla      →  Random card by artist
/f                   →  Random from all 890+ cards
```

### Visual Analysis
```
/fv FREEDOMKEK       →  Memetic breakdown with OCR
/fv WAGMIWORLD       →  Visual + crypto culture analysis
/fv PEPONACID        →  Artistic style + vibe check
```

### Lore Retrieval
```
/fl purple subasset era     →  Stories about that time
/fl Rare Scrilla            →  Founder's history
/fl FREEDOMKEK              →  Genesis card lore
/fl submission rules        →  Factual rules list
/fl                         →  Random community story
```

### Memory Capture
```
FREEDOMKEK remember this: it was inspired by Free Kekistan
  →  Stores fact, searchable via /fl

[Reply to bot message]
"remember this"
  →  Stores bot's message + your comment
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | ElizaOS v1.6.2 |
| **Runtime** | Bun v1.0+ |
| **Platform** | Telegram (Telegraf) |
| **AI** | OpenAI GPT-4o, GPT-5 |
| **Vision** | GPT-4o Vision API |
| **Embeddings** | text-embedding-3-small, CLIP |
| **Vector DB** | PGlite (embedded PostgreSQL) |
| **Language** | TypeScript (strict mode) |

---

## 🚀 Getting Help

- **In bot:** `/help` - Show commands
- **In bot:** `/start` - Welcome + quick guide
- **Documentation:** See `README.md` for full setup
- **Flow diagrams:** See `FLOW_DIAGRAMS.md` for detailed flows
- **Issues:** GitHub Issues for bug reports

---

## 📋 Command Priority Order

When PEPEDAWN receives a message, it checks in this order:

1. **Memory capture** - "remember this" detection
2. **Command execution** - `/f`, `/fv`, `/ft`, `/fl`, `/fc`, `/fm`, `/xcp`, etc.
3. **Safety filters** - FAKEASF burn blocker & off-topic suppression
4. **Engagement gate** - Suppress low-signal chatter (unless card intent)
5. **Auto-routing** - FACTS/LORE questions → Knowledge Orchestrator
   - ✅ Questions: "What are the submission rules?"
   - ❌ Statements: "Three grails for sale..."
   - ❌ User-to-user replies: User A → User B conversation
   - ✅ Replies to bot: User → Bot question
6. **Context provider** - Inject card hints when capitals match
7. **Bootstrap persona** - Handles UNCERTAIN chat or knowledge fallbacks

---

## 🎓 Onboarding Checklist

For new users, try these in order:

- [ ] `/start` - Get welcome message
- [ ] `/f FREEDOMKEK` - View your first card
- [ ] `/f` - View a random card
- [ ] `/fv FREEDOMKEK` - See AI visual analysis
- [ ] `/fl Rare Scrilla` - Get some lore
- [ ] `/fr FREEDOMKEK it's the genesis card` - Save a memory
- [ ] `FREEDOMKEK remember this: it's the genesis card` - Save a memory (alt method)
- [ ] `/fl FREEDOMKEK` - See your memory appear in lore!
- [ ] Ask a question naturally - Try conversation mode

---

**gm anon! ☀️ WAGMI 🐸✨**

---

**Last Updated:** November 11, 2025  
**Version:** 2.3.0

