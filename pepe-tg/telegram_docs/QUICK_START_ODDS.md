# Quick Start: `/odds` Command

## 🚀 5-Minute Setup

### 1. Add to `.env`
```bash
echo "SEPOLIA_RPC_URL=https://sepolia.drpc.org" >> pepe-tg/.env
echo "CONTRACT_ADDRESS=0xfd4BE1898Ee3d529aE06741001D3211914C1B90A" >> pepe-tg/.env
echo "PEPEDAWN_SITE_URL=https://pepedawn.xyz" >> pepe-tg/.env
```

### 2. Test Locally
```bash
cd pepe-tg
bun run dev
```

### 3. Try It
Open your bot in Telegram, type:
```
/odds
```

### 4. Update BotFather
Message [@BotFather](https://t.me/BotFather):
```
/setcommands
```
Paste:
```
f - View a Fake Rares card or random card
lore - Get AI-powered lore stories from community history
odds - Check PEPEDAWN lottery stats and leaderboard
start - Welcome message and quick guide
help - Show detailed instructions
```

### 5. Deploy
```bash
bun run build
bun run start
```

---

## 📋 What You Get

```
🎟 Round 7 • Tickets: 12,340 • Pool: 2.4 ETH
⏰ Next draw in 3h 42m

🏆 Top Participants:
🥇 0x1234...5678 • 150 tickets (1.22%)
🥈 0xabcd...ef90 • 120 tickets (0.97%)
🥉 0x9876...5432 • 100 tickets (0.81%)

[🌅 Enter the Dawn]
```

---

## ✅ Features

- ✅ Live on-chain data
- ✅ 5-min cooldown per chat
- ✅ 30-sec cache (reduces RPC by 90%)
- ✅ Silent replies
- ✅ No spam, no DMs
- ✅ Read-only (no gas fees)

---

## 🔧 Customization

### Change cooldown:
Edit `pepe-tg/src/actions/oddsCommand.ts` line 27:
```typescript
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
```

### Change message:
Edit `formatOddsMessage()` function in same file.

---

## 📚 Full Docs

- **Setup:** `pepe-tg/telegram_docs/PEPEDAWN_LOTTERY_SETUP.md`
- **Architecture:** `pepe-tg/telegram_docs/ODDS_ARCHITECTURE.md`
- **Summary:** `PEPEDAWN_ODDS_SUMMARY.md`

---

## 🆘 Troubleshooting

**"Contract address not set"**  
→ Add `CONTRACT_ADDRESS` to `.env`

**"Unable to fetch lottery data"**  
→ Check RPC URL and contract address

**Cooldown too strict**  
→ Edit `COOLDOWN_MS` (see above)

---

## 🎯 That's It!

You're done. Type `/odds` in your bot to see it in action.

**Total setup time:** 5 minutes  
**Code changes required:** 0 (just env vars)  
**Risk level:** Minimal (read-only)

---

🌅 **Enjoy your PEPEDAWN lottery integration!**

