# /odds Command Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Telegram User                          │
│                     types: /odds                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   PEPEDAWN Bot                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  oddsCommand.validate()                              │  │
│  │  ✓ Is text exactly "/odds"?                          │  │
│  └─────────────────────┬─────────────────────────────────┘  │
│                        │                                     │
│                        ▼                                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  oddsCommand.handler()                               │  │
│  │                                                       │  │
│  │  1. Check cooldown (Map<chatId, timestamp>)         │  │
│  │     ├─ On cooldown? → Reply "wait X minutes"        │  │
│  │     └─ Not on cooldown? → Continue                  │  │
│  │                                                       │  │
│  │  2. Check cache (cachedData + timestamp)            │  │
│  │     ├─ Age < 30s? → Use cached data                 │  │
│  │     └─ Age ≥ 30s? → Fetch from contract             │  │
│  │                                                       │  │
│  │  3. Fetch lottery data (if needed)                  │  │
│  │     │                                                 │  │
│  │     ▼                                                 │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │ fetchLotteryData()                           │   │  │
│  │  │                                              │   │  │
│  │  │  A. Get currentRoundId()        ───────────┐ │   │  │
│  │  │  B. Get getRound(roundId)       ───────────┤ │   │  │
│  │  │  C. Get getRoundParticipants()  ───────────┤ │   │  │
│  │  │  D. For each participant:       ───────────┤ │   │  │
│  │  │     - getUserStats(roundId, addr)          │ │   │  │
│  │  │  E. Sort by tickets, take top 3            │ │   │  │
│  │  │  F. Cache result (30s TTL)                 │ │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │  4. Format message                                   │  │
│  │     - Round, tickets, pool, time until draw          │  │
│  │     - Top 3 leaderboard with odds %                  │  │
│  │     - Inline button to lottery site                  │  │
│  │                                                       │  │
│  │  5. Update cooldown                                  │  │
│  │     - Set Map[chatId] = Date.now()                   │  │
│  │                                                       │  │
│  │  6. Send reply (silent)                              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               Ethereum Sepolia Testnet                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  PepedawnRaffle.sol                                  │  │
│  │  @ 0xfd4BE1898Ee3d529aE06741001D3211914C1B90A       │  │
│  │                                                       │  │
│  │  View Functions (read-only, no gas):                 │  │
│  │  • currentRoundId() → uint256                        │  │
│  │  • getRound(id) → Round struct                       │  │
│  │  • getRoundParticipants(id) → address[]              │  │
│  │  • getUserStats(id, addr) → (wagered, tickets, ...)  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
           RPC Provider (drpc.org)
```

---

## Data Flow Diagram

```
User → Bot → Cooldown Check → Cache Check → Contract Call → Format → Reply
         ↓                          ↓               ↓
      5 min map                  30s TTL      viem + RPC
```

---

## State Management

### Cooldowns (Per-Chat)
```typescript
Map<chatId, timestamp>
```
- **Scope:** In-memory (cleared on restart)
- **TTL:** 5 minutes
- **Purpose:** Prevent spam in each chat

### Cache (Global)
```typescript
{
  timestamp: number,
  roundId: bigint,
  totalTickets: bigint,
  totalWagered: bigint,
  endTime: bigint,
  participants: Address[],
  topParticipants: ParticipantStats[]
}
```
- **Scope:** In-memory (single instance)
- **TTL:** 30 seconds
- **Purpose:** Reduce RPC calls by 90%

---

## Contract Call Sequence

```
1. currentRoundId()
   └─→ uint256 (e.g., 7)

2. getRound(7)
   └─→ Round { totalTickets, totalWagered, endTime, ... }

3. getRoundParticipants(7)
   └─→ [0xaaa..., 0xbbb..., 0xccc...]

4. For each address:
   getUserStats(7, address)
   └─→ (wagered, tickets, weight, hasProof)

5. Sort participants by tickets DESC
   └─→ Top 3

6. Calculate odds %
   └─→ (userTickets / totalTickets) * 100
```

**Total RPC Calls:**
- Without cache: 3 + N (where N = participant count)
- With cache: 0 (cache hit)
- Average: ~0.3 calls per `/odds` request

---

## Message Assembly

```typescript
formatOddsMessage(data) {
  // Line 1: Core stats
  `🎟 Round ${roundId} • Tickets: ${total} • Pool: ${eth} ETH`
  
  // Line 2: Countdown
  `⏰ Next draw in ${timeUntil}`
  
  // Lines 3-6: Leaderboard
  `🏆 Top Participants:`
  `🥇 ${addr1} • ${tickets1} tickets (${odds1}%)`
  `🥈 ${addr2} • ${tickets2} tickets (${odds2}%)`
  `🥉 ${addr3} • ${tickets3} tickets (${odds3}%)`
  
  // Button
  [🌅 Enter the Dawn] → PEPEDAWN_SITE_URL
}
```

---

## Error Handling

```
Contract call fails
  ↓
Catch error
  ↓
Log to console
  ↓
Reply: "⏳ Unable to fetch lottery data right now"
  ↓
Return { success: false }
```

**No crashes, no exposed errors to users.**

---

## Performance Characteristics

### Latency
- **Cooldown check:** < 1ms (Map lookup)
- **Cache hit:** < 1ms (object access)
- **Cache miss:** 500-2000ms (RPC latency)
- **Total (cached):** ~50ms
- **Total (uncached):** ~1000ms

### Memory
- **Cooldown Map:** ~50 bytes/chat (grows linearly)
- **Cache:** ~2KB (fixed)
- **Leaderboard:** ~300 bytes (3 addresses + stats)
- **Total overhead:** < 10KB

### RPC Usage
- **Requests/minute (no cache):** 60 calls (if 1 req/sec)
- **Requests/minute (with cache):** 2 calls
- **Savings:** 97% reduction

---

## Security Model

### No Risk Surfaces
✅ Read-only operations  
✅ No private keys  
✅ No user funds  
✅ No state mutations  

### Potential Issues
⚠️ RPC downtime → Graceful error message  
⚠️ Malicious RPC → Could return fake data (use trusted provider)  
⚠️ Cache poisoning → Low risk (30s TTL, no persistence)  

---

## Integration Points

### Plugin Registration
```typescript
// pepe-tg/src/plugins/fakeRaresPlugin.ts
actions: [
  startCommand,
  helpCommand,
  fakeRaresCardAction,
  loreCommand,
  oddsCommand,  // ← Registered here
]
```

### Environment Config
```bash
SEPOLIA_RPC_URL=https://sepolia.drpc.org
CONTRACT_ADDRESS=0xfd4BE1898Ee3d529aE06741001D3211914C1B90A
PEPEDAWN_SITE_URL=https://pepedawn.xyz
```

### Dependencies
```json
"viem": "2.38.3"  // Ethereum client
```

---

## Scalability

### Current Limits
- **Cooldown:** 1 call per 5 min per chat
- **Cache:** Shared across all chats
- **RPC:** Depends on provider (usually 10-300 req/sec)

### Bottlenecks
1. **RPC rate limits** (mitigated by cache)
2. **Participant count** (more addresses = slower)
3. **Memory growth** (cooldown map grows with chat count)

### Solutions
- Use paid RPC for higher limits
- Implement LRU cache for cooldowns
- Add multicall to batch getUserStats()

---

## Monitoring

### Console Logs
```
[oddsCommand] Fetching lottery data...
[oddsCommand] Cache hit (age: 15s)
[oddsCommand] Top 3 participants: 0xaaa..., 0xbbb..., 0xccc...
[oddsCommand] Reply sent successfully
```

### Metrics to Track
- Cache hit rate (should be >80%)
- RPC call count (should be <1 per request)
- Error rate (should be <5%)
- Response time (should be <2s)

---

## Future Optimizations

1. **Multicall:** Batch getUserStats() into single RPC call
2. **Persistent cache:** Store in Redis for multi-instance deployments
3. **LRU cooldown:** Cap memory growth at N chats
4. **GraphQL:** Use The Graph for indexed data
5. **Webhooks:** Push updates when draw completes

---

**Last Updated:** October 21, 2025  
**Version:** 1.0.0  
**Status:** Production-ready

