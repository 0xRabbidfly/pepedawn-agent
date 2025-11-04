# Telegram Plugin Fork Migration

**Date:** November 3, 2025  
**Status:** ✅ Production Ready

## Overview

Migrated from `patch-package` approach to local fork strategy for `@elizaos/plugin-telegram` to resolve critical stability issues and enable ongoing customization.

## Why We Migrated

**Problems with patch-package:**
- Patches failed to apply when upstream version changed (1.0.10 → 1.6.2)
- Difficult to test and debug patch-only changes
- Version conflicts causing build failures
- Unable to incrementally test fixes

**Benefits of fork approach:**
- Full TypeScript compilation and type checking
- Easier testing and debugging
- No patch application failures
- Can customize freely without conflicts
- Better long-term maintainability

---

## Implementation

### Local Fork Structure

```
packages/
└── plugin-telegram-fakerares/
    ├── package.json          # @fakerares/plugin-telegram v1.0.10-fakerares.1
    ├── tsconfig.json
    ├── tsup.config.ts
    └── src/
        ├── index.ts          # Main exports
        ├── service.ts        # TelegramService (extended timeout)
        ├── messageManager.ts # Core fixes applied here
        ├── types.ts
        ├── utils.ts
        └── tests.ts
```

### package.json Configuration

```json
{
  "dependencies": {
    "@elizaos/plugin-telegram": "file:./packages/plugin-telegram-fakerares"
  }
}
```

**Installation:** `bun install` automatically symlinks the fork to `node_modules/@elizaos/plugin-telegram/`

---

## Applied Fixes

All fixes from production patch successfully migrated:

### ✅ FIX #1: Button Handling & Placement
- **File:** `src/utils.ts` - `convertToTelegramButtons()`
- **Changes:**
  - Handles nested button arrays (flattens automatically)
  - Supports multiple button types: `login`, `url`, `callback_data`
  - Direct url buttons (without `kind` property)
  - Null/undefined filtering
- **Impact:** Buttons now appear under media attachments correctly

### ✅ FIX #3: Native Telegram Media Methods
- **File:** `src/messageManager.ts` - `sendMessageInChunks()`
- **Changes:**
  - Replaced generic `sendMedia()` with native Telegram methods:
    - `ctx.replyWithPhoto()` for images
    - `ctx.replyWithAnimation()` for GIFs
    - `ctx.replyWithVideo()` for MP4s
    - `ctx.replyWithDocument()` for fallback
  - Sequential `for...of` loop instead of `map(async...)` prevents duplicates
  - `sentPrimaryMedia` flag stops after first successful send
- **Impact:** Media displays correctly with proper inline preview/player

### ✅ FIX #4: Bootstrap Suppression
- **File:** `src/messageManager.ts` - `handleMessage()`
- **Changes:**
  - Added `mentionContext` as 4th parameter to `messageService.handleMessage()`
  - Checks `memory.metadata.__handledByCustom` flag
  - Skips bootstrap if reply is to another user (not bot)
  - Prevents double-processing by custom plugins
- **Impact:** No duplicate responses, faster processing for direct engagement

### ✅ FIX #5: Arweave Streaming Download
- **File:** `src/messageManager.ts` - `sendMessageInChunks()`
- **Changes:**
  - Detects problematic hosts: `arweave.net`, `amazonaws.com`, `tokenscan.io`
  - HEAD request to check file size (< 49MB limit)
  - Downloads video to memory as ArrayBuffer
  - Uploads to Telegram as Buffer with filename
  - Falls back to direct URL if streaming fails
- **Impact:** Arweave videos work reliably (FAKEASF, FAKEAKIRA, etc.)

### ✅ FIX #7: Incoming Attachment Processing
- **File:** `src/messageManager.ts` - `processMessage()`
- **Changes:**
  - New method replaces simple `processImage()`
  - Extracts photos, videos, GIFs, documents from incoming messages
  - Gets Telegram file URLs via `bot.telegram.getFileLink()`
  - Populates `memory.content.attachments[]` array
- **Impact:** `/ft` command works (requires image attachments)

### ✅ FIX #8: Text Cleaning & Null Byte Handling
- **File:** `src/messageManager.ts` - `cleanText()` utility
- **Changes:**
  - Removes null bytes (`\0`) from all text content
  - Cleans attachment metadata (title, description, text)
  - Uses space fallback for empty content with attachments
- **Impact:** Prevents Telegram API errors from malformed strings

### ✅ FIX #9: Short LLM Response Support
- **File:** `src/messageManager.ts` - `handleMessage()`
- **Changes:**
  - Passes `mentionContext` to bootstrap as 4th parameter
  - Bootstrap skips evaluation for direct engagement (reply/mention)
  - Ensures 36-41 token responses send successfully
  - Combined with `text: fullText || ' '` fallback
- **Impact:** Short responses no longer filtered by bootstrap

### ✅ CRASH FIX: Extended Timeout & Error Handling
- **File:** `src/service.ts` - Telegraf options
- **Changes:**
  - Increased `handlerTimeout` from 90s → 300s (5 minutes)
  - Removed `throw error` from `handleMessage()` catch block
  - Bot logs errors but continues running
- **Impact:** Large video streaming doesn't crash bot

---

## Skipped Fixes (Not Needed)

### ⏭️ FIX #2: URL Utilities (underscore escaping, alternative URLs)
- **Reason:** Streaming download handles all problematic URLs
- **Tested:** FAKEAKIRA (URL-encoded space), FROGLIFE (underscores) work without this

### ⏭️ FIX #6: PDF/Document Processing
- **Reason:** No PDF upload functionality in codebase
- **Decision:** Can add later if needed

---

## Testing Results

**All media types working:**
- ✅ Static images (jpg/png/webp) - instant
- ✅ S3-hosted GIFs - instant with inline animation
- ✅ Arweave GIFs - instant with inline animation
- ✅ S3-hosted videos - streaming download works
- ✅ Arweave videos - streaming download works (60-90s)
- ✅ Buttons appear under all media types
- ✅ `/ft` command processes user-uploaded images

**Edge cases tested:**
- ✅ URL-encoded filenames (FAKEAKIRA - `Fake%20Akira.MP4`)
- ✅ Underscores in filenames (FROGLIFE - `800x1120_MP4_Pepepoker.mp4`)
- ✅ Underscores in transaction IDs (FROGWOMAN, THEPEPIANIST)
- ✅ Large videos with 60-90s download time
- ✅ Short LLM responses (36-41 tokens)
- ✅ Bootstrap suppression for custom commands

---

## Deployment Instructions

### For Production (First Time)

1. **Update package.json:**
   ```json
   "@elizaos/plugin-telegram": "file:./packages/plugin-telegram-fakerares"
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```
   This symlinks the fork to `node_modules/@elizaos/plugin-telegram/`

3. **Build and deploy:**
   ```bash
   bun run build
   bun run dist/index.js  # Or your deployment command
   ```

### For Development

**Make changes to fork:**
1. Edit files in `packages/plugin-telegram-fakerares/src/`
2. Build fork: `cd packages/plugin-telegram-fakerares && bun run build`
3. Reinstall: `cd ../.. && rm -rf node_modules/@elizaos/plugin-telegram && bun install`
4. Build main app: `bun run build`
5. Test: `elizaos start` or `bun run dist/index.js`

**Faster iteration:**
Just rebuild and the symlink stays valid:
```bash
cd packages/plugin-telegram-fakerares && bun run build
cd ../.. && bun run build
```

---

## Files Removed/Archived

**Removed from production:**
- ❌ `patches/@elizaos+plugin-telegram+1.0.10.patch` (archived as `.old-not-needed`)
- ✅ `patch-package` dependency remains (for potential future use)
- ✅ Simplified `postinstall` script (removed patch-package call)

**Historical documentation (kept for reference):**
- `PATCH_RECOVERY_SUMMARY.md` - Initial patch troubleshooting
- `MAINTENANCE_STRATEGY.md` - Fork vs patch analysis
- `TELEGRAM_PATCH_FIXES.md` - Original patch documentation

---

## Future Maintenance

### Updating the Fork

**When upstream releases new version:**
1. Evaluate if new version has needed fixes
2. If yes: Update fork to match (cherry-pick or rebase)
3. If no: Stay on current fork with our fixes

**Adding new fixes:**
1. Edit `packages/plugin-telegram-fakerares/src/` files
2. Rebuild fork and main app
3. Test thoroughly
4. Document changes in this file

### Upgrading ElizaOS

**Safe upgrade strategy:**
1. Test new ElizaOS version in separate branch
2. Verify fork still compiles against new `@elizaos/core` version
3. Test all media types and commands
4. Merge if stable

---

## Technical Details

**Fork metadata:**
- **Package:** `@fakerares/plugin-telegram`
- **Version:** `1.0.10-fakerares.1`
- **Based on:** `@elizaos/plugin-telegram@1.0.10`
- **Build:** tsup (ESM + DTS)
- **Size:** ~65KB (dist/index.js)

**Dependencies inherited from upstream:**
- `@elizaos/core: *`
- `telegraf: ^4.16.3`
- `@telegraf/types: ^7.1.0`

---

## Troubleshooting

**Fork not being used:**
```bash
# Check symlink
ls -la node_modules/@elizaos/plugin-telegram

# Should show symlink to packages/plugin-telegram-fakerares
# If not, reinstall:
rm -rf node_modules/@elizaos/plugin-telegram
bun install
```

**Changes not appearing:**
```bash
# Rebuild fork
cd packages/plugin-telegram-fakerares && bun run build

# Force reinstall
cd ../.. && rm -rf node_modules/@elizaos/plugin-telegram && bun install
```

**Build errors:**
```bash
# Check TypeScript errors in fork
cd packages/plugin-telegram-fakerares
bun run build

# Check main app
cd ../..
bun run build
```

---

## Contact & Support

For issues related to this fork:
- Check `TELEGRAM_PATCH_FIXES.md` for detailed fix documentation
- Review `MAINTENANCE_STRATEGY.md` for decision rationale
- See `PATCH_RECOVERY_SUMMARY.md` for migration history

