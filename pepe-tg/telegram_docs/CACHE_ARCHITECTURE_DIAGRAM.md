# File ID Cache Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TELEGRAM USER                                   │
│                          "Hey bot, show /f PEPEBASQUIAT"                    │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TELEGRAM CLIENT                                      │
│                    (Receives message from user)                             │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FAKE RARES PLUGIN                                      │
│                    (Routes /f to fakeRaresCardAction)                       │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FAKE RARES CARD ACTION                                    │
│                      (fakeRaresCard.ts)                                      │
│                                                                              │
│  1. Parse command: "PEPEBASQUIAT"                                           │
│  2. Lookup card in Full Card Index                                          │
│     └─ Result: series=0, ext=gif                                            │
│                                                                              │
│  3. Initialize FileIdCache                                                  │
│     └─ const cache = new FileIdCache(runtime)                               │
│                                                                              │
│  4. Check cache for "PEPEBASQUIAT"                  ┌──────────────────┐   │
│     └─ await cache.get("PEPEBASQUIAT") ────────────►│  FILE ID CACHE   │   │
│                                                      │   (PGlite DB)    │   │
│        ┌─ CACHE HIT? ◄───────────────────────────── │                  │   │
│        │                                             │  Table:          │   │
│        ├─ YES ► Use file_id (instant)               │  file_id_cache   │   │
│        │                                             │                  │   │
│        └─ NO ► Continue to streaming                │  Columns:        │   │
│                                                      │  - card_name     │   │
│                                                      │  - file_id       │   │
│                                                      │  - media_type    │   │
│                                                      │  - series        │   │
│                                                      │  - cached_at     │   │
│                                                      │  - use_count     │   │
│                                                      └──────────────────┘   │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
         CACHE HIT                             CACHE MISS
              │                                     │
              ▼                                     ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────┐
│     INSTANT PATH (Cached)    │    │     STREAMING PATH (First Time)      │
│                              │    │                                      │
│  Send to Telegram Client:    │    │  1. Construct S3 URL:               │
│                              │    │     https://pepewtf.s3...            │
│  {                           │    │                                      │
│    attachments: [{           │    │  2. Send URL to Telegram Client     │
│      file_id: "AgACAgI...",  │    │                                      │
│      contentType: "image/gif"│    │  3. Client streams from S3          │
│    }]                        │    │     └─ Download 15MB GIF             │
│  }                           │    │                                      │
│                              │    │  4. Client uploads to Telegram      │
│  ⏱️  Response time: 0.5-1s   │    │     └─ Upload 15MB GIF               │
│  📊 Bandwidth: ~5KB          │    │                                      │
│  💰 Cost: negligible         │    │  5. Telegram returns file_id in     │
│                              │    │     message response                 │
│                              │    │                                      │
│                              │    │  6. Extract file_id from response   │
│                              │    │     └─ "AgACAgIAAxkB..."            │
│                              │    │                                      │
│                              │    │  7. Save to cache                   │
│                              │    │     await cache.set({               │
│                              │    │       cardName: "PEPEBASQUIAT",     │
│                              │    │       fileId: "AgACAgI...",         │
│                              │    │       mediaType: "animation",       │
│                              │    │       series: 0                     │
│                              │    │     })                              │
│                              │    │                                      │
│                              │    │  ⏱️  Response time: 4-12s            │
│                              │    │  📊 Bandwidth: ~15MB                 │
│                              │    │  💰 Cost: ~$0.002                    │
└──────────────┬───────────────┘    └──────────────┬───────────────────────┘
               │                                    │
               └────────────────┬───────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TELEGRAM CLIENT                                      │
│                  (Sends message with media to user)                         │
│                                                                              │
│  - If file_id: ctx.replyWithAnimation(file_id, {...})                       │
│  - If URL: ctx.replyWithAnimation(url, {...})                               │
│                                                                              │
│  Telegram API handles:                                                      │
│  - Serving media from their CDN                                             │
│  - Compression and optimization                                             │
│  - Delivery to user's device                                                │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TELEGRAM USER                                   │
│                       Sees card image/animation                             │
│                                                                              │
│                    [PEPEBASQUIAT animation displays]                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: First Request (Cache Miss)

```
┌────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User     │────►│    Eliza     │────►│  File ID     │────►│    S3        │
│            │     │   Runtime    │     │   Cache      │     │  Storage     │
│  "/f CARD" │     │              │     │              │     │              │
└────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                           │                    │                     │
                           │   1. Get cache?    │                     │
                           │───────────────────►│                     │
                           │                    │                     │
                           │   2. NULL (miss)   │                     │
                           │◄───────────────────│                     │
                           │                    │                     │
                           │   3. Stream from S3                      │
                           │─────────────────────────────────────────►│
                           │                    │                     │
                           │   4. 15MB GIF      │                     │
                           │◄─────────────────────────────────────────│
                           │                    │                     │
                           │   5. Upload to Telegram                  │
                           │──────────────────────────►               │
                           │                    │                     │
                           │   6. Get file_id   │                     │
                           │◄──────────────────────────               │
                           │                    │                     │
                           │   7. Save to cache │                     │
                           │───────────────────►│                     │
                           │                    │                     │
                           │   8. Display to user                     │
                           │──────────────────────────►               │
                                                │                     │
                                    ┌───────────┴───────────┐         │
                                    │  Cache now contains:  │         │
                                    │  CARD → file_id       │         │
                                    └───────────────────────┘         │

Total time: 4-12 seconds
Bandwidth: 15MB (S3 download) + 15MB (TG upload) = 30MB
```

---

## Data Flow: Subsequent Requests (Cache Hit)

```
┌────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User     │────►│    Eliza     │────►│  File ID     │     │  Telegram    │
│            │     │   Runtime    │     │   Cache      │     │     CDN      │
│  "/f CARD" │     │              │     │              │     │              │
└────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                           │                    │                     │
                           │   1. Get cache?    │                     │
                           │───────────────────►│                     │
                           │                    │                     │
                           │   2. file_id! ✅   │                     │
                           │◄───────────────────│                     │
                           │                    │                     │
                           │   3. Send file_id to Telegram API        │
                           │─────────────────────────────────────────►│
                           │                    │                     │
                           │   4. Telegram serves from their CDN      │
                           │◄─────────────────────────────────────────│
                           │                    │                     │
                           │   5. Display to user (instant!)          │
                           │──────────────────────────►               │
                                                │                     │
                                    ┌───────────┴───────────┐         │
                                    │  Cache stats updated: │         │
                                    │  use_count++          │         │
                                    │  last_used_at = NOW() │         │
                                    └───────────────────────┘         │

Total time: 0.5-1 second
Bandwidth: ~5KB (API overhead only)
                             
NO S3 ACCESS NEEDED! 🎉
```

---

## Cache State Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│                        CACHE LIFECYCLE                           │
└─────────────────────────────────────────────────────────────────┘

State 1: Empty Cache (Cold Start)
┌──────────────────────────┐
│  file_id_cache (empty)   │
│  ┌──────────────────────┐│
│  │   (no entries)       ││
│  └──────────────────────┘│
└──────────────────────────┘

                │
                │ User requests /f PEPEBASQUIAT
                │ (cache miss → stream from S3 → save file_id)
                ▼

State 2: Warming Up (First Day)
┌──────────────────────────────────────────────────────┐
│  file_id_cache                                        │
│  ┌──────────────────────────────────────────────────┐│
│  │ PEPEBASQUIAT → AgACAgI...  [uses: 5]            ││
│  │ PEPEDAWN → AgACAgI...      [uses: 12]           ││
│  │ NAKAMOTO → AgACAgI...      [uses: 2]            ││
│  │ ... (47 more cards)                             ││
│  └──────────────────────────────────────────────────┘│
│  Total: 50 cards cached                              │
│  Hit rate: ~60%                                      │
└──────────────────────────────────────────────────────┘

                │
                │ Week passes, more cards requested
                ▼

State 3: Warmed Up (After 1 Week)
┌──────────────────────────────────────────────────────┐
│  file_id_cache                                        │
│  ┌──────────────────────────────────────────────────┐│
│  │ PEPEBASQUIAT → AgACAgI...  [uses: 147]          ││
│  │ PEPEDAWN → AgACAgI...      [uses: 342]          ││
│  │ NAKAMOTO → AgACAgI...      [uses: 89]           ││
│  │ ... (197 more cards)                            ││
│  └──────────────────────────────────────────────────┘│
│  Total: 200 cards cached                             │
│  Hit rate: ~90%                                      │
└──────────────────────────────────────────────────────┘

                │
                │ Month passes, full collection accessed
                ▼

State 4: Fully Warmed (Steady State)
┌──────────────────────────────────────────────────────┐
│  file_id_cache                                        │
│  ┌──────────────────────────────────────────────────┐│
│  │ Top 10: 1000-5000 uses each                     ││
│  │ Top 50: 100-1000 uses each                      ││
│  │ Top 200: 10-100 uses each                       ││
│  │ Long tail: 1-10 uses each                       ││
│  │ ... (all 950 cards eventually)                  ││
│  └──────────────────────────────────────────────────┘│
│  Total: 950 cards cached (full collection)           │
│  Hit rate: ~95%                                      │
└──────────────────────────────────────────────────────┘
```

---

## Component Interaction Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        ElizaOS Runtime                           │
│                                                                  │
│  ┌────────────────┐         ┌──────────────────┐               │
│  │  Message Queue │────────►│  Plugin Router   │               │
│  └────────────────┘         └────────┬─────────┘               │
│                                      │                           │
│                                      │ Routes /f commands        │
│                                      ▼                           │
│              ┌──────────────────────────────────────────┐       │
│              │     Fake Rares Plugin                     │       │
│              │                                           │       │
│              │  ┌─────────────────────────────────────┐ │       │
│              │  │  fakeRaresCardAction                │ │       │
│              │  │                                     │ │       │
│              │  │  1. Parse card name                │ │       │
│              │  │  2. Lookup in Full Card Index      │ │       │
│              │  │  3. Check FileIdCache ─────────────┼─┼───┐   │
│              │  │  4. Send via Telegram Client       │ │   │   │
│              │  └─────────────────────────────────────┘ │   │   │
│              └──────────────────────────────────────────┘   │   │
│                                                              │   │
└──────────────────────────────────────────────────────────────┼───┘
                                                               │
                    ┌──────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FileIdCache Utility                           │
│                  (src/utils/fileIdCache.ts)                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Public API:                                              │ │
│  │  - get(cardName): Promise<Entry | null>                  │ │
│  │  - set(entry): Promise<void>                             │ │
│  │  - has(cardName): Promise<boolean>                       │ │
│  │  - getStats(): Promise<Stats>                            │ │
│  │  - clear(): Promise<void>                                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            │                                     │
│                            │ SQL queries                         │
│                            ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Private Methods:                                          │ │
│  │  - query(): Execute SQL                                   │ │
│  │  - updateStats(): Increment use_count                     │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PGlite Database                             │
│                   (.eliza/.elizadb/)                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Table: file_id_cache                                      │ │
│  │  ┌────────────┬────────────┬─────────────┬───────────────┐│ │
│  │  │ card_name  │  file_id   │ media_type  │  series       ││ │
│  │  ├────────────┼────────────┼─────────────┼───────────────┤│ │
│  │  │PEPEBASQUI..│ AgACAgI... │ animation   │  0            ││ │
│  │  │PEPEDAWN    │ AgACAgI... │ photo       │  1            ││ │
│  │  │...         │ ...        │ ...         │  ...          ││ │
│  │  └────────────┴────────────┴─────────────┴───────────────┘│ │
│  │                                                            │ │
│  │  Indexes:                                                  │ │
│  │  - PRIMARY KEY (card_name)                                │ │
│  │  - idx_last_used (for analytics)                          │ │
│  │  - idx_use_count (for popularity tracking)               │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Error Handling Flow

```
User requests /f CARDNAME
         │
         ▼
┌──────────────────────┐
│  Check cache         │
└──────────┬───────────┘
           │
     ┌─────┴─────┐
     │           │
  SUCCESS      ERROR
     │           │
     │           ├─ Database connection lost
     │           ├─ Query timeout
     │           └─ Invalid card name
     │           
     │           └───► Fallback to URL streaming
     │                 (log error, continue)
     │
     ▼
┌─────────────────────┐
│  Send to Telegram   │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │           │
  SUCCESS      ERROR
     │           │
     │           ├─ file_id expired/invalid
     │           ├─ Network timeout
     │           └─ Rate limit
     │           
     │           └───► Delete from cache
     │                 Retry with URL streaming
     │                 Recache on success
     │
     ▼
┌─────────────────────┐
│  Display to user    │
└─────────────────────┘
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Development                               │
│                                                                  │
│  1. Create database migration                                   │
│     └─ SQL: CREATE TABLE file_id_cache...                       │
│                                                                  │
│  2. Implement FileIdCache class                                 │
│     └─ src/utils/fileIdCache.ts                                 │
│                                                                  │
│  3. Modify fakeRaresCard.ts                                     │
│     └─ Add cache.get() → cache.set() logic                      │
│                                                                  │
│  4. Update Telegram client patch                                │
│     └─ Support file_id in attachments                           │
│                                                                  │
│  5. Add environment flag                                        │
│     └─ ENABLE_FILE_ID_CACHE=true|false                          │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Testing                                │
│                                                                  │
│  1. Unit tests (FileIdCache methods)                            │
│  2. Integration tests (cache hit/miss flows)                    │
│  3. Manual testing (request 10 cards, verify caching)           │
│  4. Performance testing (measure response times)                │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Production Deployment                       │
│                                                                  │
│  Phase 1: Code deployed, cache DISABLED                         │
│  └─ ENABLE_FILE_ID_CACHE=false                                  │
│                                                                  │
│  Phase 2: Enable cache, monitor                                 │
│  └─ ENABLE_FILE_ID_CACHE=true                                   │
│  └─ Watch logs for cache hits/misses                            │
│  └─ Track response times                                        │
│                                                                  │
│  Phase 3: Optimize                                              │
│  └─ Prewarm top 50 cards                                        │
│  └─ Add analytics dashboard                                     │
│  └─ Fine-tune cache expiry (if needed)                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Monitoring Dashboard (Future)

```
╔═══════════════════════════════════════════════════════════════╗
║               FILE ID CACHE STATISTICS                         ║
╠═══════════════════════════════════════════════════════════════╣
║                                                                ║
║  Total Requests Today:        1,234                           ║
║  Cache Hits:                  1,112 (90.1%)  ✅               ║
║  Cache Misses:                  122 (9.9%)   ⚠️                ║
║                                                                ║
║  Avg Response Time (hits):     0.62s  🚀                      ║
║  Avg Response Time (misses):   5.34s  🐌                      ║
║                                                                ║
║  Bandwidth Saved Today:        18.2 GB  💰                    ║
║  Cost Saved Today:            $1.82     💰                    ║
║                                                                ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║
║                                                                ║
║  📊 Most Popular Cards Today:                                 ║
║                                                                ║
║  1. PEPEBASQUIAT        247 requests  ████████████  (20.0%)  ║
║  2. PEPEDAWN            156 requests  ████████      (12.6%)  ║
║  3. NAKAMOTO            134 requests  ███████       (10.9%)  ║
║  4. PEPENOUNS            98 requests  █████         ( 7.9%)  ║
║  5. PEPEPUNK             87 requests  ████          ( 7.0%)  ║
║                                                                ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║
║                                                                ║
║  📈 Cache Growth:                                             ║
║                                                                ║
║  Cards Cached:           247 / 950  (26.0%)                   ║
║  Average Use Count:      12.3                                 ║
║  Oldest Entry:           7 days ago                           ║
║                                                                ║
╚═══════════════════════════════════════════════════════════════╝
```

This architecture delivers **10-20x performance improvement** for popular cards while maintaining **backward compatibility** with zero-downtime deployment.

