# Telegram Bot Setup Guide

## BotFather Configuration

### Step 1: Set Commands

1. Open Telegram and message **@BotFather**
2. Send: `/setcommands`
3. Select your bot
4. Paste these commands:

```
f - View a Fake Rares card (usage: /f CARDNAME)
start - Start the bot and see welcome message
help - Show how to use PEPEDAWN
```

5. Done! ✅

---

## How Commands Work

### BotFather Commands (UI Only)
- Show in Telegram's autocomplete menu
- Help users discover features
- Purely cosmetic/UX enhancement
- Don't affect bot logic

### ElizaOS Actions (Actual Logic)
- Process the actual commands
- Execute the bot's functionality
- Handle validation and responses
- Already implemented in your code

**They work together perfectly!**

---

## Command Mapping

| BotFather Command | ElizaOS Action | What It Does |
|-------------------|----------------|--------------|
| `/f` | `fakeRaresCardAction` | Display card with image and lore |
| `/start` | `startCommand` | Welcome message for new users |
| `/help` | `helpCommand` | Show bot usage guide |
| *(natural language)* | `shareLoreAction` | Auto-shares lore when relevant |
| *(natural language)* | `educateNewcomerAction` | Auto-onboards newcomers |
| *(background)* | `loreDetectorEvaluator` | Saves community knowledge |

---

## User Experience

### Slash Commands (via UI)

**User types:** `/`

**Telegram shows:**
```
/f - View a Fake Rares card (usage: /f CARDNAME)
/start - Start the bot and see welcome message
/help - Show how to use PEPEDAWN
```

**User selects** `/f` → types `FREEDOMKEK` → bot shows card

---

### Natural Language (No Commands Needed)

```
User: "Tell me about FREEDOMKEK"
→ Bot automatically shares lore

User: "I'm new, what are Fake Rares?"
→ Newcomer education triggers

User: "WAGMIWORLD had 770 players!"
→ Lore detector saves this fact
```

---

## Complete Command Reference

### `/f CARDNAME`
**Purpose:** View any Fake Rares card

**Examples:**
- `/f FREEDOMKEK` - Genesis card
- `/f WAGMIWORLD` - Game card
- `/f PEPONACID` - Psychedelic card

**What happens:**
1. Shows progress: 🔍 Searching...
2. Fetches lore: 📚 Fetching lore...
3. Loads image: 🎨 Loading card...
4. Displays card with lore and image

---

### `/start`
**Purpose:** Welcome message for new users

**Response:**
```
gm anon! 🐸✨

I'm PEPEDAWN, your AI companion for all things Fake Rares.

Quick Start:
• Use /f CARDNAME to view any card
• Ask me anything about cards, artists, or lore
• Share facts and I'll remember them

Try /f FREEDOMKEK to see the genesis card!
```

---

### `/help`
**Purpose:** Show usage guide

**Response:**
- How to use `/f` command
- How to ask questions
- How to contribute knowledge
- Pro tips and resources

---

## No Conflicts!

### Your Smart Features Work WITHOUT Commands:

✅ **Proactive Lore Sharing**
- Triggers when cards are mentioned
- No command needed
- Uses AI to decide when to share

✅ **Newcomer Education**
- Detects beginner questions
- No command needed
- Auto-tailors response to knowledge level

✅ **Context Detection**
- Runs on every message
- No command needed
- Understands conversation topics

✅ **Lore Curation**
- Saves community facts automatically
- No command needed
- Builds growing knowledge base

---

## Optional: Additional Commands

If you want to add more BotFather commands later:

```
f - View a Fake Rares card (usage: /f CARDNAME)
start - Start the bot and see welcome message
help - Show how to use PEPEDAWN
about - Learn about PEPEDAWN and Fake Rares
```

Then create an `aboutCommand` action in your code.

**But keep it simple!** Natural language is more powerful than lots of commands.

---

## Testing Your Setup

### Test Each Command:

1. **`/start`** → Should show welcome
2. **`/help`** → Should show guide
3. **`/f FREEDOMKEK`** → Should show card with progress
4. **"What are Fake Rares?"** → Newcomer education
5. **"Tell me about WAGMIWORLD"** → Proactive lore
6. **"WAGMIWORLD had 770 players!"** → Lore saved (check console logs)

---

## Summary

✅ **BotFather commands set** - `/f`, `/start`, `/help`  
✅ **ElizaOS actions implemented** - All commands work  
✅ **No conflicts** - Slash commands + natural language = perfect harmony  
✅ **Smart features** - Work automatically without commands  

Your bot is ready! 🐸✨

