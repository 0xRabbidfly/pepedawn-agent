# Quickstart Guide: Hide Asset URLs in Card Display

**Feature**: 002-specify-scripts-bash  
**Date**: 2025-10-20  
**Purpose**: Manual verification guide for URL hiding feature

---

## Overview

This guide provides step-by-step instructions for manually verifying that the `/f` command displays card previews without showing asset URLs.

---

## Prerequisites

1. **Running bot**: Telegram bot must be running with latest code
2. **Test account**: Access to Telegram account for testing
3. **Test cards**: Knowledge of card names for different asset types

---

## Verification Steps

### Test Case 1: Image Card (Standard Case)

**Objective**: Verify image preview displays without URL

**Steps**:
1. Open Telegram chat with the bot
2. Send command: `/f FAKEMONA`
3. Observe the response

**Expected Results**:
- ✅ Image preview displays inline
- ✅ Message shows: Card name, series, card number, artist, supply, issuance
- ✅ Artist button (if available) appears as inline keyboard
- ❌ NO URL visible anywhere in the message
- ❌ NO `https://` or `http://` text present

**Pass Criteria**:
- Image preview renders correctly
- All metadata visible
- Zero URLs in message text
- Message is clean and professional

---

### Test Case 2: Video Card (MP4 Asset)

**Objective**: Verify video preview displays without URL

**Steps**:
1. Open Telegram chat with the bot
2. Send command: `/f <VIDEO_CARD_NAME>` (replace with actual video card name)
3. Observe the response

**Expected Results**:
- ✅ Video preview displays with play button
- ✅ Message shows: Card name, series, card number, artist, supply
- ✅ Artist button (if available) appears
- ❌ NO URL visible anywhere in the message

**Pass Criteria**:
- Video preview renders and plays correctly
- All metadata visible
- Zero URLs in message text

---

### Test Case 3: GIF/Animated Card

**Objective**: Verify animated preview displays without URL

**Steps**:
1. Send command: `/f <GIF_CARD_NAME>`
2. Observe the response

**Expected Results**:
- ✅ Animated GIF plays inline
- ✅ Message shows card metadata
- ❌ NO URL visible

---

### Test Case 4: Random Card

**Objective**: Verify random card selection still works

**Steps**:
1. Send command: `/f` (no card name)
2. Observe the response

**Expected Results**:
- ✅ Random card selected and displayed
- ✅ "🎲" random indicator present
- ✅ Preview displays
- ❌ NO URL visible

---

### Test Case 5: Typo Correction (Fuzzy Match)

**Objective**: Verify fuzzy matching still works

**Steps**:
1. Send command: `/f FAKEMNA` (intentional typo - missing O)
2. Observe the response

**Expected Results**:
- ✅ Bot corrects to "FAKEMONA"
- ✅ Typo correction message: "😅 Ha, spelling not your thing? No worries - got you fam."
- ✅ Preview displays
- ❌ NO URL visible

---

### Test Case 6: Fallback (Preview Failure)

**Objective**: Verify graceful fallback when preview cannot be generated

**Setup**: This requires a card with broken/invalid URL (may need to temporarily break a URL for testing)

**Steps**:
1. Identify or create a card with invalid asset URL
2. Send command: `/f <CARD_WITH_BROKEN_URL>`
3. Observe the response

**Expected Results**:
- ✅ Message displays card metadata (name, series, artist, supply, issuance)
- ✅ No media preview shown
- ❌ NO URL visible (especially no broken URL)
- ❌ NO error message exposing technical details

**Alternative**: If unable to test broken URL scenario, verify code logic ensures `includeMediaUrl: false` path works correctly.

---

## Regression Testing

### Verify NO Breaking Changes

1. **Command syntax**: `/f CARDNAME` still works
2. **Artist buttons**: Inline keyboard with artist links still appears
3. **Metadata**: All card information (series, artist, supply, issuance) still displays
4. **Random cards**: `/f` with no argument still returns random card
5. **Fuzzy matching**: Typos still corrected automatically
6. **Error messages**: Card not found messages still work

---

## Success Checklist

Before marking feature complete, verify ALL of these:

- [ ] Tested at least 3 different image cards - NO URLs visible
- [ ] Tested at least 1 video card - NO URLs visible
- [ ] Tested random card selection - NO URLs visible
- [ ] Tested typo correction - NO URLs visible
- [ ] Verified all card metadata still displays correctly
- [ ] Verified artist buttons still appear
- [ ] Verified media previews still render
- [ ] Verified message formatting is clean (no artifacts where URL was)
- [ ] Verified fallback text-only response works (or code review confirms)
- [ ] Verified no regression in card lookup or fuzzy matching

---

## Rollback Procedure

If issues are discovered:

1. **Quick rollback**: Revert commit that removed URL from `buildCardDisplayMessage()`
2. **Verify**: Test that URLs appear again
3. **Debug**: Check Telegram logs for preview generation issues
4. **Fix forward**: Address root cause and redeploy

---

## Environment Setup

**No new environment variables required.**

Existing `.env` configuration is sufficient:
- `TELEGRAM_BOT_TOKEN` - Bot authentication
- `OPENAI_API_KEY` - For AI features (unchanged)

---

## Notes

- **Zero Configuration**: This feature requires no setup beyond existing bot configuration
- **Backward Compatible**: Existing users see improved UX with no action required
- **Low Risk**: Single function modification, easily reversible
- **High Value**: Cleaner, more professional card displays

