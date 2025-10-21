# Telegram File ID Cache Design

**Goal:** Eliminate redundant S3 streaming by caching Telegram's `file_id` for each card asset.

**Impact:** 
- 90%+ bandwidth reduction for popular cards
- Sub-second response times (vs 2-10 seconds for S3 streaming)
- Lower AWS data transfer costs

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         /f CARDNAME Request                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Check File ID Cache  │
              └───────────┬───────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
         CACHE HIT                  CACHE MISS
            │                           │
            ▼                           ▼
    ┌───────────────┐         ┌─────────────────┐
    │ Use file_id   │         │ Stream from S3   │
    │ (instant)     │         │ (2-10 seconds)   │
    └───────┬───────┘         └────────┬─────────┘
            │                          │
            │                          ▼
            │                 ┌─────────────────┐
            │                 │ Extract file_id │
            │                 │ from response   │
            │                 └────────┬─────────┘
            │                          │
            │                          ▼
            │                 ┌─────────────────┐
            │                 │ Save to cache   │
            │                 └────────┬─────────┘
            │                          │
            └──────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Send to Telegram    │
              └───────────────────────┘
```

---

## Data Model

### Cache Entry Structure

```typescript
interface FileIdCacheEntry {
  // Card identifier (uppercase, e.g., "PEPEBASQUIAT")
  cardName: string;
  
  // Telegram file_id (reusable forever)
  fileId: string;
  
  // Media type for correct Telegram API method
  mediaType: 'photo' | 'video' | 'animation' | 'document';
  
  // File extension (for fallback URL construction)
  extension: 'jpg' | 'jpeg' | 'gif' | 'png' | 'mp4' | 'webp';
  
  // Series number (for URL reconstruction if needed)
  series: number;
  
  // Metadata
  cachedAt: string;      // ISO timestamp
  lastUsedAt: string;    // ISO timestamp (for cache warmth tracking)
  useCount: number;      // Popularity metric
  fileSize?: number;     // Optional: bytes
}
```

### Example Cache Entries

```json
{
  "PEPEBASQUIAT": {
    "cardName": "PEPEBASQUIAT",
    "fileId": "AgACAgIAAxkBAAIBY2Z1234567890abcdefghijklmnopqr",
    "mediaType": "animation",
    "extension": "gif",
    "series": 0,
    "cachedAt": "2025-10-21T10:30:00Z",
    "lastUsedAt": "2025-10-21T15:45:23Z",
    "useCount": 47,
    "fileSize": 8421532
  },
  "PEPEDAWN": {
    "cardName": "PEPEDAWN",
    "fileId": "AgACAgIAAxkBAAIBY2Z9876543210zyxwvutsrqponmlkji",
    "mediaType": "photo",
    "extension": "jpg",
    "series": 1,
    "cachedAt": "2025-10-20T08:15:00Z",
    "lastUsedAt": "2025-10-21T16:20:10Z",
    "useCount": 152,
    "fileSize": 245678
  }
}
```

---

## Storage Options

### Option 1: PGlite Database Table (Recommended)
**Pros:**
- Consistent with existing architecture
- Atomic operations (thread-safe)
- Query capabilities (analytics, cache warmth)
- Automatic persistence

**Cons:**
- Requires migration script
- Slightly slower than in-memory (still <1ms)

**Schema:**
```sql
CREATE TABLE file_id_cache (
  card_name TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  series INTEGER NOT NULL,
  cached_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP NOT NULL,
  use_count INTEGER DEFAULT 1,
  file_size INTEGER
);

CREATE INDEX idx_last_used ON file_id_cache(last_used_at);
CREATE INDEX idx_use_count ON file_id_cache(use_count);
```

### Option 2: JSON File Cache
**Pros:**
- Simple implementation
- Easy debugging (human-readable)
- No database migration

**Cons:**
- Race conditions (concurrent writes)
- No query capabilities
- Manual file I/O

**File:** `src/data/fileIdCache.json`

### Option 3: In-Memory with Disk Backup
**Pros:**
- Fastest reads (<0.1ms)
- Simple API

**Cons:**
- Lost on restart (requires reload)
- Memory overhead (~100KB for 950 cards)

---

## Implementation Components

### 1. Cache Manager (`src/utils/fileIdCache.ts`)

```typescript
import { type IAgentRuntime } from '@elizaos/core';

export interface FileIdCacheEntry {
  cardName: string;
  fileId: string;
  mediaType: 'photo' | 'video' | 'animation' | 'document';
  extension: string;
  series: number;
  cachedAt: string;
  lastUsedAt: string;
  useCount: number;
  fileSize?: number;
}

export class FileIdCache {
  private runtime: IAgentRuntime;
  
  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }
  
  /**
   * Retrieve cached file_id for a card
   * Returns null if not cached
   */
  async get(cardName: string): Promise<FileIdCacheEntry | null> {
    const upperName = cardName.toUpperCase();
    
    const result = await this.runtime.databaseAdapter.query(
      `SELECT * FROM file_id_cache WHERE card_name = $1`,
      [upperName]
    );
    
    if (result.length === 0) {
      return null;
    }
    
    // Update last_used_at and increment use_count
    await this.runtime.databaseAdapter.query(
      `UPDATE file_id_cache 
       SET last_used_at = CURRENT_TIMESTAMP, 
           use_count = use_count + 1 
       WHERE card_name = $1`,
      [upperName]
    );
    
    return result[0] as FileIdCacheEntry;
  }
  
  /**
   * Cache a new file_id for a card
   */
  async set(entry: Omit<FileIdCacheEntry, 'cachedAt' | 'lastUsedAt' | 'useCount'>): Promise<void> {
    const upperName = entry.cardName.toUpperCase();
    
    await this.runtime.databaseAdapter.query(
      `INSERT INTO file_id_cache 
       (card_name, file_id, media_type, extension, series, cached_at, last_used_at, use_count, file_size)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, $6)
       ON CONFLICT (card_name) 
       DO UPDATE SET 
         file_id = EXCLUDED.file_id,
         media_type = EXCLUDED.media_type,
         extension = EXCLUDED.extension,
         series = EXCLUDED.series,
         last_used_at = CURRENT_TIMESTAMP,
         file_size = EXCLUDED.file_size`,
      [upperName, entry.fileId, entry.mediaType, entry.extension, entry.series, entry.fileSize]
    );
  }
  
  /**
   * Check if card is cached
   */
  async has(cardName: string): Promise<boolean> {
    const result = await this.get(cardName);
    return result !== null;
  }
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalCards: number;
    totalUses: number;
    mostPopular: Array<{ cardName: string; useCount: number }>;
  }> {
    const stats = await this.runtime.databaseAdapter.query(`
      SELECT 
        COUNT(*) as total_cards,
        SUM(use_count) as total_uses
      FROM file_id_cache
    `);
    
    const popular = await this.runtime.databaseAdapter.query(`
      SELECT card_name, use_count 
      FROM file_id_cache 
      ORDER BY use_count DESC 
      LIMIT 10
    `);
    
    return {
      totalCards: stats[0].total_cards,
      totalUses: stats[0].total_uses,
      mostPopular: popular,
    };
  }
  
  /**
   * Clear cache (useful for testing or invalidation)
   */
  async clear(): Promise<void> {
    await this.runtime.databaseAdapter.query(`DELETE FROM file_id_cache`);
  }
}
```

---

### 2. Modified Telegram Client (`patches/@elizaos+plugin-telegram+1.0.10.patch`)

**Changes Required:**
- Accept `file_id` OR `url` in attachments
- Route to appropriate `ctx.replyWith*()` method based on media type
- Capture `file_id` from sent message response

```typescript
// NEW: Support file_id in attachments
interface TelegramAttachment {
  url?: string;           // Existing: URL to stream
  file_id?: string;       // NEW: Cached Telegram file_id
  contentType: string;
  title?: string;
  // ... other fields
}

// In sendMessageInChunks():
for (const attachment of content.attachments) {
  // NEW: Check for file_id first (cache hit)
  if (attachment.file_id) {
    const mediaType = determineMediaType(attachment.contentType);
    
    switch (mediaType) {
      case 'photo':
        sentMessage = await ctx.replyWithPhoto(attachment.file_id, {
          caption: content.text || undefined,
          ...Markup.inlineKeyboard(telegramButtons)
        });
        break;
        
      case 'animation':
        sentMessage = await ctx.replyWithAnimation(attachment.file_id, {
          caption: content.text || undefined,
          ...Markup.inlineKeyboard(telegramButtons)
        });
        break;
        
      case 'video':
        sentMessage = await ctx.replyWithVideo(attachment.file_id, {
          caption: content.text || undefined,
          ...Markup.inlineKeyboard(telegramButtons)
        });
        break;
        
      case 'document':
        sentMessage = await ctx.replyWithDocument(attachment.file_id, {
          caption: content.text || undefined,
          ...Markup.inlineKeyboard(telegramButtons)
        });
        break;
    }
    
    sentPrimaryMedia = true;
    break;
  }
  
  // EXISTING: URL streaming path (cache miss)
  if (attachment.url) {
    // ... existing streaming logic ...
    
    // NEW: After successful send, extract file_id and pass back to action
    if (sentMessage) {
      const fileId = extractFileId(sentMessage, mediaType);
      // Store in message metadata for action to cache
      (sentMessage as any)._fileIdForCache = fileId;
    }
  }
}
```

---

### 3. Updated Action Handler (`src/actions/fakeRaresCard.ts`)

```typescript
// NEW: Import cache manager
import { FileIdCache } from '../utils/fileIdCache';

// Initialize cache in action
const fileIdCache = new FileIdCache(runtime);

// MODIFIED: sendCardWithMedia function
async function sendCardWithMedia(params: {
  runtime: IAgentRuntime;
  callback: ((response: any) => Promise<any>) | null;
  cardMessage: string;
  assetName: string;
  cardInfo: CardInfo;  // NEW: Need series and extension
  buttons?: Array<{ text: string; url: string }>;
}): Promise<void> {
  
  const cache = new FileIdCache(params.runtime);
  const upperAsset = params.assetName.toUpperCase();
  
  // STEP 1: Check cache first
  const cached = await cache.get(upperAsset);
  
  if (cached) {
    console.log(`⚡ CACHE HIT: ${upperAsset} (file_id=${cached.fileId})`);
    
    // Use cached file_id (no streaming!)
    const response = await params.callback({
      text: params.cardMessage,
      attachments: [{
        file_id: cached.fileId,  // NEW: Pass file_id instead of URL
        contentType: getContentType(cached.mediaType),
        title: params.assetName,
        source: 'fake-rares-cached',
      }],
      buttons: params.buttons,
      __fromAction: 'fakeRaresCard',
      suppressBootstrap: true,
    });
    
    console.log(`✅ Sent ${upperAsset} via cache (${cached.useCount} total uses)`);
    return;
  }
  
  // STEP 2: Cache miss - stream from S3
  console.log(`❌ CACHE MISS: ${upperAsset} - streaming from S3...`);
  
  const mediaUrl = getFakeRaresImageUrl(
    upperAsset, 
    params.cardInfo.series, 
    params.cardInfo.ext as MediaExtension
  );
  
  const mediaType = determineMediaType(params.cardInfo.ext);
  
  // Send with URL (existing streaming path)
  const response = await params.callback({
    text: params.cardMessage,
    attachments: [{
      url: mediaUrl,
      contentType: getContentType(mediaType),
      title: params.assetName,
      source: 'fake-rares',
    }],
    buttons: params.buttons,
    __fromAction: 'fakeRaresCard',
    suppressBootstrap: true,
  });
  
  // STEP 3: Extract file_id from response and cache it
  const fileId = extractFileIdFromResponse(response, mediaType);
  
  if (fileId) {
    await cache.set({
      cardName: upperAsset,
      fileId: fileId,
      mediaType: mediaType,
      extension: params.cardInfo.ext,
      series: params.cardInfo.series,
    });
    
    console.log(`💾 CACHED: ${upperAsset} → file_id=${fileId}`);
  } else {
    console.warn(`⚠️  Could not extract file_id for ${upperAsset}`);
  }
}

// Helper to determine media type from extension
function determineMediaType(ext: string): 'photo' | 'video' | 'animation' | 'document' {
  switch (ext.toLowerCase()) {
    case 'gif':
      return 'animation';
    case 'mp4':
      return 'video';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp':
      return 'photo';
    default:
      return 'document';
  }
}

// Helper to get content type from media type
function getContentType(mediaType: string): string {
  switch (mediaType) {
    case 'animation':
      return 'image/gif';
    case 'video':
      return 'video/mp4';
    case 'photo':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

// Extract file_id from Telegram response
function extractFileIdFromResponse(response: any, mediaType: string): string | null {
  // Check if response has the cached file_id from Telegram client
  if (response?._fileIdForCache) {
    return response._fileIdForCache;
  }
  
  // Fallback: try to extract from message object
  try {
    const msg = response?.result || response;
    
    switch (mediaType) {
      case 'photo':
        return msg?.photo?.[0]?.file_id || null;
      case 'animation':
        return msg?.animation?.file_id || null;
      case 'video':
        return msg?.video?.file_id || null;
      case 'document':
        return msg?.document?.file_id || null;
    }
  } catch {
    return null;
  }
  
  return null;
}
```

---

## Migration Strategy

### Phase 1: Setup (Day 1)
1. Create database migration script
2. Add `FileIdCache` utility class
3. Add environment flag: `ENABLE_FILE_ID_CACHE=true`

### Phase 2: Gradual Rollout (Day 2-7)
1. Deploy with cache enabled
2. Monitor cache hit rates
3. Warm cache for top 50 popular cards manually
4. Track bandwidth savings

### Phase 3: Full Production (Week 2+)
1. Remove fallback code
2. Add cache statistics to `/admin` command
3. Implement cache prewarming script

---

## Edge Cases & Solutions

### 1. File ID Expiration
**Problem:** Telegram may delete old file_ids (rare, but possible)

**Solution:**
```typescript
// If file_id fails, fall back to URL and recache
try {
  await ctx.replyWithPhoto(cached.fileId);
} catch (error) {
  if (error.message.includes('file_id')) {
    console.warn(`File ID expired for ${cardName}, recaching...`);
    await cache.delete(cardName);
    // Fall back to URL streaming
    return sendWithUrl(cardName);
  }
}
```

### 2. Multiple File Formats
**Problem:** Card might exist in multiple formats (jpg + gif)

**Solution:**
- Cache separately: `PEPEBASQUIAT.gif` and `PEPEBASQUIAT.jpg`
- Default to primary format from card index

### 3. Cache Poisoning
**Problem:** Wrong file_id cached for a card

**Solution:**
```bash
# Admin command to invalidate cache
/cache clear CARDNAME
```

### 4. Cold Start
**Problem:** Empty cache after restart or new cards

**Solution:**
- Prewarming script: Fetch top 100 cards on startup
- Gradual warming: Cache fills naturally over first day

---

## Performance Metrics

### Before (No Cache)
- **Average /f response time:** 2-10 seconds (S3 streaming)
- **Bandwidth per request:** 5-40MB
- **Cost per 1000 requests:** ~$0.50 (AWS data transfer)

### After (With Cache)
- **Cache hit response time:** 0.5-1 second (instant Telegram API)
- **Cache miss response time:** 2-10 seconds (same as before, but only first time)
- **Bandwidth per cached request:** ~5KB (API overhead only)
- **Expected cache hit rate:** 80-95% (popular cards)
- **Cost per 1000 requests:** ~$0.10 (20% cost reduction)

### Projected Savings (1000 daily requests, 90% hit rate)
- **Bandwidth saved:** ~25GB/month
- **AWS cost saved:** ~$2.50/month per 1000 daily requests
- **Response time improvement:** 5-8x faster for cached cards

---

## Monitoring & Analytics

### Key Metrics to Track
```typescript
interface CacheMetrics {
  hitRate: number;           // % of requests served from cache
  missRate: number;          // % requiring S3 streaming
  avgHitResponseTime: number; // ms
  avgMissResponseTime: number; // ms
  totalBandwidthSaved: number; // bytes
  topCards: Array<{cardName: string; hits: number}>;
}
```

### Logging Strategy
```typescript
// Log every cache operation
console.log(`[FileIdCache] HIT ${cardName} (${cached.useCount} uses)`);
console.log(`[FileIdCache] MISS ${cardName} - streaming from S3`);
console.log(`[FileIdCache] CACHED ${cardName} → ${fileId}`);

// Periodic stats (every 1000 requests)
console.log(`[FileIdCache] Stats: ${hitRate}% hit rate, ${totalCached} cards cached`);
```

---

## Testing Plan

### Unit Tests
```typescript
describe('FileIdCache', () => {
  it('should return null for uncached card', async () => {
    const cache = new FileIdCache(mockRuntime);
    const result = await cache.get('UNKNOWNCARD');
    expect(result).toBeNull();
  });
  
  it('should cache and retrieve file_id', async () => {
    const cache = new FileIdCache(mockRuntime);
    await cache.set({
      cardName: 'TESTCARD',
      fileId: 'test-file-id-123',
      mediaType: 'photo',
      extension: 'jpg',
      series: 0,
    });
    
    const result = await cache.get('TESTCARD');
    expect(result?.fileId).toBe('test-file-id-123');
  });
  
  it('should increment use count on cache hit', async () => {
    const cache = new FileIdCache(mockRuntime);
    await cache.set({...});
    
    await cache.get('TESTCARD');
    await cache.get('TESTCARD');
    
    const result = await cache.get('TESTCARD');
    expect(result?.useCount).toBe(3);
  });
});
```

### Integration Tests
1. Send `/f PEPEBASQUIAT` (cache miss → stream from S3 → cache file_id)
2. Send `/f PEPEBASQUIAT` again (cache hit → instant response)
3. Verify response time < 1 second for cache hit
4. Verify bandwidth reduced by 90%+

---

## Rollback Plan

If issues arise:
1. Set `ENABLE_FILE_ID_CACHE=false` in `.env`
2. Code falls back to URL streaming (existing behavior)
3. No data loss (cache is additive, not destructive)
4. Can re-enable after fixing issues

---

## Future Enhancements

### 1. Cache Prewarming
```typescript
// Warm cache for top N popular cards on startup
async function warmCache(topN: number = 100) {
  const popularCards = getTopCards(topN);
  for (const card of popularCards) {
    await sendCardToSelf(card); // Bot sends to itself to cache file_id
  }
}
```

### 2. Cross-Bot Cache Sharing
- Export cache as JSON
- Import into other bots in the same community
- Instant cache population for new bot instances

### 3. Cache Expiry Policy
```sql
-- Delete cache entries not used in 90 days
DELETE FROM file_id_cache 
WHERE last_used_at < NOW() - INTERVAL '90 days';
```

### 4. Multi-Format Support
```typescript
// Cache both GIF and JPG versions
cache.set('PEPEBASQUIAT.gif', fileIdGif);
cache.set('PEPEBASQUIAT.jpg', fileIdJpg);

// User preference: prefer GIF if available
```

---

## Implementation Checklist

- [ ] Create database migration script
- [ ] Implement `FileIdCache` class
- [ ] Add `file_id` support to Telegram client patch
- [ ] Modify `fakeRaresCard.ts` to use cache
- [ ] Add environment flag `ENABLE_FILE_ID_CACHE`
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Deploy to production with flag off
- [ ] Enable flag and monitor
- [ ] Add cache statistics command
- [ ] Document cache behavior in TECHNICAL_HANDOVER.md

---

## Questions for Review

1. **Storage:** PGlite table vs JSON file vs in-memory?
2. **Prewarming:** Warm top 50 cards on startup?
3. **Expiry:** Should we expire old cache entries?
4. **Admin commands:** Add `/cache stats` and `/cache clear CARDNAME`?
5. **Migration:** Deploy as opt-in first or force-enable?

