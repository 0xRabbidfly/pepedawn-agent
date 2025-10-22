# PEPEDAWN Lottery Integration Setup Guide

## Overview

The `/odds` command integrates the PEPEDAWN lottery smart contract with the Telegram bot, providing real-time statistics from the Ethereum blockchain.

**Features:**
- ✅ Read-only contract calls (no gas fees, no private keys)
- ✅ Live round data, ticket counts, and prize pool
- ✅ Top 3 participant leaderboard with odds
- ✅ Time until next draw
- ✅ 5-minute per-chat cooldown
- ✅ 30-second caching to reduce RPC load
- ✅ Silent, reply-only messages

---

## Architecture

### Tech Stack
- **Library:** `viem` (lightweight Ethereum client for Bun/Node)
- **Network:** Sepolia Testnet (easily switchable to mainnet)
- **Contract:** PepedawnRaffle.sol
- **RPC:** Any Ethereum RPC provider (drpc.org, Alchemy, Infura, etc.)

### Contract Functions Used
All functions are **read-only** (`view` functions):
- `currentRoundId()` - Get active round number
- `getRound(roundId)` - Fetch round details (tickets, pool, endTime)
- `getRoundParticipants(roundId)` - Get all participant addresses
- `getUserStats(roundId, address)` - Get per-user ticket counts

### Data Flow
```
User types /odds
  ↓
Check cooldown (5 min per chat)
  ↓
Check cache (30s TTL)
  ↓
Fetch from contract (if cache miss)
  ↓
Format message + leaderboard
  ↓
Reply with inline button
```

---

## Setup

### 1. Environment Variables

Add these to your `.env` file:

```bash
# REQUIRED for /odds command
SEPOLIA_RPC_URL=https://sepolia.drpc.org
CONTRACT_ADDRESS=0xfd4BE1898Ee3d529aE06741001D3211914C1B90A

# OPTIONAL: Custom lottery site URL
PEPEDAWN_SITE_URL=https://pepedawn.xyz
```

**Notes:**
- If `CONTRACT_ADDRESS` is not set, `/odds` will return an error message
- Default RPC is `https://sepolia.drpc.org` (works without API key)
- For production, use a dedicated RPC endpoint (Alchemy, Infura, etc.)

### 2. Dependencies

The `viem` library is already installed. If you need to reinstall:

```bash
cd pepe-tg
bun add viem
```

### 3. BotFather Commands

Update your bot's command list via [@BotFather](https://t.me/BotFather):

```
/setcommands
```

Then paste:
```
f - View a Fake Rares card or random card
lore - Get AI-powered lore stories from community history
odds - Check PEPEDAWN lottery stats and leaderboard
start - Welcome message and quick guide
help - Show detailed instructions
```

### 4. Test Locally

Start the bot in dev mode:

```bash
bun run dev
```

Open a private chat with your bot and type:
```
/odds
```

Expected response:
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

## Switching to Mainnet

When ready to deploy to Ethereum mainnet:

1. **Update `.env`:**
   ```bash
   # Replace Sepolia RPC with mainnet RPC
   MAINNET_RPC_URL=https://eth.llamarpc.com
   CONTRACT_ADDRESS=0x... # Your mainnet contract address
   ```

2. **Update `oddsCommand.ts`:**
   ```typescript
   // Line 29: Change import
   import { mainnet } from 'viem/chains';

   // Line 36: Update chain
   const publicClient = createPublicClient({
     chain: mainnet,
     transport: http(process.env.MAINNET_RPC_URL),
   });
   ```

3. **Redeploy:**
   ```bash
   bun run build
   bun run start
   ```

---

## Customization

### Change Cooldown Duration

Edit `pepe-tg/src/actions/oddsCommand.ts`:

```typescript
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
```

Change to:
```typescript
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
```

### Change Cache TTL

```typescript
const CACHE_TTL_MS = 30 * 1000; // 30 seconds
```

### Customize Message Format

Edit the `formatOddsMessage()` function in `oddsCommand.ts`:

```typescript
function formatOddsMessage(data: CachedOddsData): string {
  // Customize emojis, text, formatting here
  let message = `🎟 **Round ${data.roundId}**\n`;
  // ... rest of formatting
  return message;
}
```

### Change Button Text/URL

```typescript
buttons: [
  {
    text: '🌅 Enter the Dawn',  // Customize text
    url: PEPEDAWN_SITE_URL,      // Customize URL
  },
]
```

---

## Monitoring & Debugging

### Enable Debug Logs

Set in `.env`:
```bash
LOG_LEVEL=debug
```

The `/odds` command logs:
- RPC call timing
- Cache hits/misses
- Cooldown checks
- Contract read errors

### Check Console Output

When `/odds` is triggered, you'll see:
```
[oddsCommand] Fetching lottery data...
[oddsCommand] Cached data valid, using cache
[oddsCommand] Handler executed successfully
```

### Common Issues

**Error: "Contract address not set"**
- Add `CONTRACT_ADDRESS` to `.env`

**Error: "Unable to fetch lottery data"**
- Check RPC URL is correct and accessible
- Verify contract address is deployed on the network
- Check if contract has an active round

**Cooldown message appearing too often**
- This is expected! It prevents spam
- Adjust `COOLDOWN_MS` if needed

---

## Rate Limiting & Performance

### Built-in Protections

1. **Per-chat cooldown (5 min):** Prevents individual chats from spamming
2. **30-second cache:** Reduces RPC calls by ~90%
3. **Batch participant queries:** Minimizes on-chain reads

### Estimated RPC Usage

- **Without cache:** ~10-50 RPC calls per `/odds` (depending on participant count)
- **With cache:** ~0.33 RPC calls per `/odds` (30s cache = ~2 calls/min max)

### Free Tier Limits

Most public RPCs allow:
- **drpc.org:** 10 req/sec (no signup)
- **Alchemy:** 300M compute units/mo (free tier)
- **Infura:** 100k req/day (free tier)

With the cache, you can handle ~5,000 `/odds` requests/day on free tier.

---

## Advanced Configuration

### Custom ABI

If the contract ABI changes, update:
```
pepe-tg/src/contracts/PepedawnRaffle.abi.json
```

The file contains only the view functions needed for `/odds`.

### Multiple Contract Support

To support multiple lottery contracts:

1. Create separate command files (e.g., `oddsCommandV2.ts`)
2. Pass contract address as command parameter: `/odds <contract>`
3. Maintain separate caches per contract

---

## Security Notes

✅ **Safe practices:**
- Read-only contract calls
- No private keys stored
- No state-modifying transactions
- No user funds at risk

⚠️ **Considerations:**
- RPC URL leakage could enable rate-limit attacks (use env vars)
- Malicious RPC could return fake data (use trusted providers)
- Cache poisoning risk is low (30s TTL, no persistence)

---

## Support

For issues or questions:
1. Check console logs first
2. Verify `.env` configuration
3. Test contract functions manually using Etherscan
4. Review ElizaOS action handler documentation

**Contract Explorer:**
- Sepolia: `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`
- Mainnet: `https://etherscan.io/address/${CONTRACT_ADDRESS}`

---

## Future Enhancements

Potential additions (not yet implemented):

- [ ] `/odds <wallet>` - Check specific user's stats
- [ ] DM notifications for large draws
- [ ] Historical round data
- [ ] Multi-chain support (L2s)
- [ ] ENS name resolution for leaderboard

---

**Last Updated:** October 21, 2025  
**Contract:** PepedawnRaffle.sol  
**Network:** Sepolia Testnet (ready for mainnet)

