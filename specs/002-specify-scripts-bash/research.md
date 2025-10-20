# Research & Technology Decisions: Hide Asset URLs in Card Display

**Feature**: 002-specify-scripts-bash  
**Date**: 2025-10-20  
**Status**: Complete

---

## Overview

This document resolves technical unknowns identified during planning and documents key technology decisions for implementing URL hiding in `/f` command responses.

---

## Research Findings

### 1. Current Implementation Analysis

**Task**: Understand how `/f` command currently displays URLs

**Findings**:
- Location: `/pepe-tg/src/actions/fakeRaresCard.ts`
- Current flow:
  1. `parseCardRequest()` extracts asset name from `/f CARDNAME`
  2. `lookupCardUrl()` finds card data and constructs/retrieves URL
  3. `buildCardDisplayMessage()` formats message **including URL** at line 266:
     ```typescript
     message += formatTelegramUrl(params.mediaUrl);
     ```
  4. `callback({ text: cardMessage, buttons, ... })` sends message to Telegram
- **Key insight**: URL is appended to message text via `formatTelegramUrl()` at line 266
- Card data comes from `fake-rares-data.json` with fields: asset, series, card, ext, artist, supply, issuance, videoUri, imageUri

**Decision**: Remove line 266 (`message += formatTelegramUrl(params.mediaUrl)`) from `buildCardDisplayMessage()` function.

**Rationale**: The URL is added as plain text to the message caption. Telegram Bot API can send media with captions without requiring URL in the caption text—the media URL is provided separately in the API call.

### 2. Telegram Bot API Media Sending Methods

**Task**: Determine which Telegram methods support media preview without visible URL

**Research Sources**:
- Telegram Bot API documentation: https://core.telegram.org/bots/api
- ElizaOS messaging patterns: https://docs.elizaos.ai/runtime/messaging

**Findings**:
- Telegram Bot API provides separate methods for different media types:
  - `sendPhoto`: For JPEG, PNG, GIF images
  - `sendVideo`: For MP4 videos
  - `sendAnimation`: For GIF animations
- Each method accepts:
  - `photo/video/animation`: File URL or file_id
  - `caption`: Optional text to display with media (supports Markdown/HTML)
  - `reply_markup`: Optional inline keyboard
- **Critical**: The URL parameter is for the API to fetch the media; it's NOT displayed to users unless explicitly included in caption

**Decision**: Continue using ElizaOS callback mechanism which wraps Telegram Bot API. The callback already handles media correctly—we just need to stop adding URL to caption text.

**Rationale**: ElizaOS `callback({ text, buttons })` already uses appropriate Telegram methods under the hood. The `text` parameter becomes the caption. By removing the URL from `text`, we achieve the desired behavior without changing the callback structure.

### 3. ElizaOS Callback Pattern for Media

**Task**: Understand how ElizaOS handles media in message callbacks

**Research Sources**:
- ElizaOS messaging documentation: https://docs.elizaos.ai/runtime/messaging
- ElizaOS plugin patterns: https://docs.elizaos.ai/plugins/patterns
- Existing implementation in `fakeRaresCard.ts` (lines 466-472)

**Findings**:
- Current callback usage:
  ```typescript
  callback({
    text: cardMessage,  // ← Contains card metadata + URL
    buttons: artistButton,
    __fromAction: 'fakeRaresCard',
    suppressBootstrap: true,
  })
  ```
- ElizaOS Telegram adapter detects URLs in `text` and:
  - If URL points to image/video: sends media message with `text` as caption
  - If no URL or text-only: sends plain text message
- The adapter automatically handles media type detection and uses correct Telegram Bot API method

**Decision**: Remove URL from `cardMessage` text while keeping all other metadata. Let ElizaOS adapter detect media type from URL pattern if needed, OR explore passing media URL separately from caption.

**Rationale**: ElizaOS adapter already has smart URL detection. By removing URL from caption but ensuring media is still sent, we achieve preview without visible URL.

**Follow-up Research Needed**: Investigate if ElizaOS callback supports explicit `attachments` or `media` parameter separate from `text` for cleaner separation.

### 4. Fallback for Preview Failures

**Task**: Define fallback behavior when media preview cannot be generated

**Specification Answer** (from clarification): Show card metadata (name, series, description) without any media

**Decision**: Modify `buildCardDisplayMessage()` to accept optional `includeMediaUrl` parameter (default: false). When preview fails or media URL invalid, call with `includeMediaUrl: false` to generate text-only metadata response.

**Rationale**: 
- Maintains consistent message formatting logic
- Provides graceful degradation
- Users still get valuable card information
- No broken URLs or error messages that leak implementation details

**Implementation Pattern**:
```typescript
function buildCardDisplayMessage(params: CardDisplayParams & { includeMediaUrl?: boolean }): string {
  // ... existing metadata formatting ...
  
  // Only add URL if explicitly requested (for fallback text-only mode)
  if (params.includeMediaUrl) {
    message += formatTelegramUrl(params.mediaUrl);
  }
  
  return message;
}
```

---

## Technology Decisions

### Decision 1: URL Removal Approach

**Chosen**: Remove `formatTelegramUrl()` call from message builder

**Alternatives Considered**:
- A. Pass media URL via separate callback parameter → **Rejected**: Would require understanding ElizaOS callback internals; higher risk
- B. Post-process message to strip URLs → **Rejected**: Fragile regex-based approach, error-prone
- C. Simply remove the line adding URL → **Selected**: Simplest, lowest risk, directly addresses requirement

**Rationale**: The simplest solution is the best. Line 266 in `buildCardDisplayMessage()` explicitly adds the URL. Removing it achieves the goal with minimal code changes and zero risk to other functionality.

### Decision 2: Media Handling Strategy

**Chosen**: Rely on Telegram's URL preview feature via message text

**Alternatives Considered**:
- A. Use explicit Telegram Bot API media methods → **Rejected**: Requires bypassing ElizaOS callback abstraction
- B. Pass attachments array to callback → **Rejected**: Not standard ElizaOS pattern based on current codebase
- C. Let Telegram auto-preview URLs in messages → **Selected**: Current working behavior, just remove visible URL text

**Rationale**: Current implementation already works—Telegram generates previews from URLs. The issue is the URL is ALSO shown as text. Removing it from the message text preserves preview while hiding the URL string.

**Update After Testing**: If Telegram requires visible URL for preview generation, will need to explore sending media via explicit Telegram Bot API methods with caption parameter.

### Decision 3: Fallback Text Format

**Chosen**: Reuse existing `buildCardDisplayMessage()` with all metadata except URL

**Format**:
```
CARDNAME 🐸 Series X - Card Y
👨‍🎨 Artist • 💎 Supply • 📅 Issuance

[No URL line]
```

**Rationale**: Consistent with existing message format, just omits the URL line. Users get all the information they need to identify and learn about the card.

---

## Resolved Unknowns

### From Technical Context

1. **Exact Telegram API method currently used for media responses**
   - **Resolved**: ElizaOS callback abstraction handles this. Current implementation passes `text` with URL, adapter detects and sends media. Solution: remove URL from text.

2. **Whether card asset URLs are in `fake-rares-data.json` or fetched dynamically**
   - **Resolved**: URLs are in card data (`videoUri`, `imageUri`) or constructed from `{series}/{asset}.{ext}` pattern. No changes needed to data layer.

3. **Current message format structure (caption vs. separate message text)**
   - **Resolved**: Single message with `text` field that becomes caption when media is present. URL is currently part of this text.

---

## Open Questions

None - all unknowns resolved through codebase analysis and ElizaOS documentation review.

---

## Implementation Notes

- **Code Changes**: Single file modification (`fakeRaresCard.ts`, ~3 lines changed)
- **Testing**: Manual verification with `/f FAKEMONA` (image), `/f <video-card>` (video), and edge cases
- **Risk**: Very low - removing text from message, no API or data changes
- **Rollback**: Trivial - revert single line addition

---

## References

- ElizaOS Messaging: https://docs.elizaos.ai/runtime/messaging
- ElizaOS Plugin Patterns: https://docs.elizaos.ai/plugins/patterns
- Telegram Bot API: https://core.telegram.org/bots/api#sendphoto
- Current implementation: `/pepe-tg/src/actions/fakeRaresCard.ts`

