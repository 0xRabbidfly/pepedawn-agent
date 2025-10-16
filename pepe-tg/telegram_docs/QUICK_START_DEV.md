# Quick Start for Developers

**Get up to speed in 5 minutes**

---

## What Is This?

PEPEDAWN = AI Telegram bot for Fake Rares community
- Displays cards via `/f CARDNAME`
- Shares lore intelligently
- Educates newcomers automatically
- Learns from community

---

## Current State

**Status:** Embeddings in progress (~60% done)

**What's working:**
- ✅ Bot code complete
- ✅ Actions, providers, evaluators implemented
- ✅ Character personality defined
- 🔄 Embeddings loading (wait 2-3 hours)

**What's next:**
- Wait for embeddings to finish
- Test features
- Populate card series map
- Deploy

---

## Essential Commands

```bash
# Navigate to project
cd pepe-tg

# Start bot (after embeddings complete)
elizaos start

# Development mode (hot reload)
elizaos dev

# Build for production
bun run build

# Stop bot
Ctrl+C
```

---

## Test the Bot

Once embeddings complete:

```bash
# 1. Start bot
elizaos start

# 2. Open Telegram, test:
/start
/help
/f FREEDOMKEK
"What are Fake Rares?"
"Tell me about WAGMIWORLD"
```

---

## Key Files

| What | Where |
|------|-------|
| Main entry | `src/index.ts` |
| Character | `src/pepedawn.ts` |
| Custom plugin | `src/plugins/fakeRaresPlugin.ts` |
| /f command | `src/actions/fakeRaresCard.ts` |
| Config | `.env` |

---

## Common Tasks

### Add a new card to series map
Edit: `src/data/cardSeriesMap.ts`
```typescript
'NEWCARD': 5,  // Add to CARD_SERIES_MAP
```

### Change bot personality
Edit: `src/pepedawn.ts`
- Modify `system` prompt
- Update `bio` array
- Adjust `style` guide

### Add new action
1. Create: `src/actions/myAction.ts`
2. Export: `src/actions/index.ts`
3. Add to: `src/plugins/fakeRaresPlugin.ts`

### View logs
```bash
# Real-time logs
elizaos start

# Specific log level
LOG_LEVEL=debug elizaos start
```

---

## Architecture Quick Reference

```
Message → Provider → Actions → Evaluator

Provider:  Enriches state (before actions)
Actions:   Execute commands (main logic)
Evaluator: Process results (after actions)
```

**Example flow:**
```
"/f FREEDOMKEK"
  ↓
fakeRaresContext (provider)
  → Detects: FREEDOMKEK mentioned
  ↓
fakeRaresCardAction (action)
  → Validates: /f pattern matches
  → Handler: Fetches + displays card
  ↓
loreDetector (evaluator)
  → Checks if response contained new lore
```

---

## Debugging

### Bot not responding in Telegram
1. Check bot is running: console should show "AgentServer is listening on port 3000"
2. Verify token: `.env` has correct `TELEGRAM_BOT_TOKEN`
3. Check errors in console

### Action not triggering
1. Check `validate()` function - add console.log
2. Verify action is in `fakeRaresPlugin.actions`
3. Test validation regex/logic

### No lore in responses
1. Embeddings must be complete
2. Check `LOAD_DOCS_ON_STARTUP=true`
3. Verify files in `docs/chunks/`

---

## Performance Notes

- **Known cards:** Instant (~200ms)
- **Unknown cards:** Slow first time (~10s), then cached
- **Optimize:** Populate `CARD_SERIES_MAP` with all 950 cards

---

## Next Immediate Steps

1. **Wait for embeddings** (~2-3 hours)
2. **Test bot** in Telegram
3. **Scrape pepe.wtf:**
   ```bash
   python scripts/scrape_card_series.py
   ```
4. **Configure BotFather** (see TELEGRAM_SETUP.md)
5. **Share user guide** with community

---

## Help & Documentation

- **Full technical details:** `docs/TECHNICAL_HANDOVER.md`
- **User guide:** `telegram_docs/PEPEDAWN_USER_GUIDE.md`
- **Telegram setup:** `telegram_docs/TELEGRAM_SETUP.md`
- **ElizaOS docs:** https://docs.elizaos.ai

---

**Built with:** ElizaOS + OpenAI + Telegram + 264k embedded messages 🐸✨

