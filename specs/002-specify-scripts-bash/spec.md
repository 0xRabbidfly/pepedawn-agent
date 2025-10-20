# Feature Specification: Hide Asset URLs in Card Display

**Feature ID**: 002-specify-scripts-bash  
**Status**: Draft  
**Created**: 2025-10-20  
**Last Updated**: 2025-10-20

---

## Overview

### Summary

When users request Fake Rare card information using the `/f` command, the bot currently displays both a preview of the asset (image or video) and the full URL to that asset. This feature will hide the URL while maintaining the visual preview, creating a cleaner, more professional presentation focused on the card artwork rather than technical details.

### Problem Statement

Currently, card display responses include the raw asset URL alongside the preview. This creates visual clutter and exposes technical implementation details (storage URLs, CDN paths) that provide no value to end users. Users only need to see the card artwork—they don't need or want to see the underlying URL infrastructure.

### Goals

- Provide clean, preview-only card displays without URL clutter
- Maintain all existing visual preview functionality
- Improve user experience by hiding technical implementation details
- Reduce message length in Telegram responses

### Non-Goals

- Changing how card data is fetched or stored
- Modifying the `/f` command syntax or behavior
- Adding new card display features beyond URL removal
- Implementing URL hiding for commands other than `/f`

---

## Clarifications

### Session 2025-10-20

- Q: Fallback Behavior for Preview Failures → A: Show card metadata (name, series, description) without any media

---

## User Scenarios & Testing

### Primary User Scenarios

#### Scenario 1: User requests a card with image asset
**Actor**: Telegram user  
**Precondition**: User is in a chat with the bot, card "FAKEMONA" has an image asset  
**Steps**:
1. User types `/f FAKEMONA`
2. Bot retrieves card data
3. Bot sends response with embedded image preview
4. User views the card

**Expected Outcome**:
- User sees the card image preview
- User does NOT see any URL in the message
- Message is concise and focused on card information

#### Scenario 2: User requests a card with video asset
**Actor**: Telegram user  
**Precondition**: User is in a chat with the bot, card "RAREANIM" has an MP4 video asset  
**Steps**:
1. User types `/f RAREANIM`
2. Bot retrieves card data
3. Bot sends response with embedded video preview
4. User views the card

**Expected Outcome**:
- User sees the video preview (can play inline)
- User does NOT see any URL in the message
- Video preview functionality remains unchanged

#### Scenario 3: Asset preview fails to load
**Actor**: Telegram user  
**Precondition**: Asset URL is valid but preview generation fails  
**Steps**:
1. User types `/f CARDNAME`
2. Bot attempts to send preview
3. Telegram cannot generate preview for some reason

**Expected Outcome**:
- User receives card metadata (name, series, description) as text
- No media preview shown
- No broken URL is shown
- User can still identify and learn about the card

---

## Functional Requirements

### Must Have

1. **URL Removal from Display**
   - Asset URLs must not appear in any `/f` command response text
   - Image previews must render without accompanying URL text
   - Video previews must render without accompanying URL text

2. **Preview Preservation**
   - All existing image preview functionality must remain functional
   - All existing video preview functionality must remain functional
   - Telegram's native media preview features must continue to work

3. **Backward Compatibility**
   - Existing `/f` command syntax must remain unchanged
   - Card lookup logic must remain unchanged
   - Response format (excluding URL) must remain consistent

### Should Have

1. **Clean Message Formatting**
   - Responses should be well-formatted without URL artifacts
   - No placeholder text where URLs were previously shown
   - Consistent spacing and layout

### Could Have

1. **Optional URL Access**
   - Future consideration: Allow power users to optionally view URLs via a separate command
   - Not required for this feature

### Won't Have

1. **URL removal from other commands** - Only `/f` command is in scope
2. **Asset URL obfuscation or encryption** - Simply hide, don't transform
3. **Different preview types** - Use existing Telegram preview mechanisms

---

## Success Criteria

1. **Visual Cleanliness**: 100% of `/f` command responses display card previews without showing any URL text
2. **Preview Functionality**: Card image and video previews render correctly in 100% of cases where they previously worked
3. **User Satisfaction**: Users see only card information and artwork, no technical implementation details
4. **Message Length Reduction**: Average message length for `/f` responses decreases by at least 20% (due to URL removal)
5. **No Broken Functionality**: Zero regressions in card lookup, data display, or preview generation

---

## Key Entities

### Card Asset
**Purpose**: Media file (image or video) associated with a Fake Rare card  
**Key Attributes**:
- Asset URL (internal, not displayed)
- Asset type (image/video)
- Preview capability (boolean)

### Bot Response
**Purpose**: Message sent by bot in response to `/f` command  
**Key Attributes**:
- Card information (text)
- Media preview (embedded image or video)
- URL visibility (hidden for this feature)

---

## Assumptions

1. Telegram supports embedded media previews without requiring visible URLs in message text
2. Current `/f` command implementation includes URL as part of the response text/caption
3. Asset URLs are publicly accessible for Telegram to generate previews
4. No security or access control implications from hiding URLs (users can still access via preview)
5. Message length limits in Telegram will not be exceeded even with previews

---

## Dependencies

- Telegram Bot API media sending capabilities
- Existing `/f` command implementation
- Card data structure with asset URLs

---

##Out of Scope

- Modifying card data storage
- Changing asset hosting or CDN configuration
- Implementing URL shortening or transformation
- Adding authentication/authorization for asset access
- Hiding URLs in commands other than `/f`
- Adding watermarks or other asset protections

---

## Risks & Mitigations

### Risk 1: Preview Generation Failure
**Probability**: Low  
**Impact**: Medium  
**Mitigation**: Implement graceful fallback that displays card metadata (name, series, description) as text when preview cannot be generated, ensuring users still receive valuable information without any broken URLs

### Risk 2: Telegram API Changes
**Probability**: Low  
**Impact**: Medium  
**Mitigation**: Monitor Telegram Bot API updates; design with flexibility for future changes

### Risk 3: User Confusion (No URL to Copy)
**Probability**: Low  
**Impact**: Low  
**Mitigation**: Users rarely need raw URLs; preview is sufficient. Can add opt-in URL command later if needed.

---

## Open Questions

None - feature is straightforward and well-defined.
