# Regression Test Plan: Named Card Query Fixes

## Changes Made
When a card is explicitly mentioned in a query (e.g., "what is pepedawn's poem?"), the system now:
- Skips card discovery/recommendation flows
- Skips fast path card detection
- Uses normal FACTS retrieval to fetch information about the mentioned card from memories/wiki

## Test Scenarios

### ✅ Should Still Work (No Regression)

#### 1. Card Discovery Queries (No Card Mentioned)
**Test Cases:**
- "what is the sexiest card?"
- "show me the coldest pepe"
- "which card has the best vibes?"
- "find me a card about art"

**Expected:** Should trigger card recommendation/discovery flow
**Why:** `mentionedCard` is null, so card discovery paths are not skipped

---

#### 2. Fast Path Card Detection (Discovery Queries)
**Test Cases:**
- "what card is green?" (when retrieval surfaces a single clear winner)
- "show me a card with pepe" (when one card dominates)

**Expected:** Should trigger fast path card display
**Why:** `mentionedCard` is null, so fast path check runs normally

---

#### 3. Force Card Facts from Plugin (Discovery Intent)
**Test Cases:**
- "show me a card about pepe art" (hasCardDiscoveryIntent = true)
- "what is the best fake rare?" (hasCardDiscoveryIntent = true)

**Expected:** Plugin calls `planRouting` with `forceCardFacts: true`, should trigger card recommendation
**Why:** `mentionedCard` is null, so `forceCardFacts` path is not skipped

---

#### 4. Names Top Card (Retrieval-Based, Not Explicitly Mentioned)
**Test Cases:**
- "what is the poem?" (when retrieval surfaces PEPEDAWN as top result and query implicitly names it)
- "tell me about the green one" (when retrieval finds a specific card)

**Expected:** Should use `forceCardFacts` based on `namesTopCard` flag
**Why:** `mentionedCard` is null (not explicitly detected), but `namesTopCard` is true from retrieval

---

#### 5. PEPEDAWN Bot Chat (Not Card Intent)
**Test Cases:**
- "hey pepedawn, what's your opinion on bitcoin?"
- "pepedawn will be more chatty now"
- "pepedawn, what do you think?"

**Expected:** Should go to CHAT flow, not FACTS
**Why:** PEPEDAWN disambiguation returns `BOT_CHAT`, so `mentionedCard` is nullified

---

#### 6. Normal FACTS Queries (No Card Mentioned)
**Test Cases:**
- "what are the submission rules?"
- "how do I submit a card?"
- "what is fake rares?"

**Expected:** Should use normal FACTS retrieval
**Why:** No card mentioned, normal flow

---

### ⚠️ Potential Edge Cases (Need Manual Testing)

#### 7. Query Mentions Card BUT Also Has Discovery Intent
**Test Cases:**
- "what is the sexiest card like PEPEDAWN?"
- "show me cards similar to PEPEDAWN"
- "which card is better than PEPEDAWN?"

**Expected Behavior:** 
- Should fetch facts about PEPEDAWN (not discover other cards)
- **OR** Should discover similar cards (if that's the intent)

**Current Behavior:** Will skip card discovery because PEPEDAWN is mentioned
**Risk:** Might miss discovery intent when a card is mentioned for comparison

**Manual Test Required:** ✅

---

#### 8. Query Names Card Implicitly (Not Detected by detectMentionedCard)
**Test Cases:**
- "what is the poem?" (when user means PEPEDAWN's poem, but PEPEDAWN not detected)
- "tell me about the green one" (referring to a specific card by attribute)

**Expected:** Should use `namesTopCard` logic to trigger card facts
**Why:** `mentionedCard` is null, so `namesTopCard` from retrieval should work

**Manual Test Required:** ✅

---

#### 9. Multiple Cards Mentioned
**Test Cases:**
- "compare PEPEDAWN and BLOBPEPE"
- "what's the difference between PEPEDAWN and another card?"

**Expected:** Should fetch facts about both cards
**Current Behavior:** `detectMentionedCard` only returns first match, so only first card is treated as mentioned
**Risk:** Might skip discovery for second card

**Manual Test Required:** ✅

---

#### 10. Card Mentioned But No Memory/Wiki Data
**Test Cases:**
- "what is PEPEDAWN's favorite food?" (no memory exists)
- "tell me about RANDOMCARD's history" (card exists but no lore)

**Expected:** Should return "No factual data available yet" or similar
**Risk:** Might fall back to card discovery if no facts found

**Manual Test Required:** ✅

---

#### 11. Force Card Facts Explicitly Passed with Card Mentioned
**Test Cases:**
- External code calls `planRouting("what is PEPEDAWN?", roomId, { forceCardFacts: true })`

**Expected:** Should ignore `forceCardFacts` and use normal retrieval
**Current Behavior:** Will skip `forceCardFacts` path because `mentionedCard` is set
**Risk:** Low (unlikely external code would do this)

**Manual Test Required:** ⚠️ (Low Priority)

---

### 🔴 Known Issues Fixed

#### 12. Named Card Attribute Queries (The Bug We Fixed)
**Test Cases:**
- "what is pepedawn's poem?"
- "what is pepedawn's main color?"
- "tell me about PEPEDAWN's supply"
- "what card is PEPEDAWN?"

**Expected:** Should fetch facts about PEPEDAWN from memories/wiki, NOT discover other cards
**Previous Bug:** Was triggering card discovery and returning wrong cards (e.g., BLOBPEPE instead of PEPEDAWN)

**Manual Test Required:** ✅ (Verify Fix)

---

## Test Execution Checklist

### High Priority (Core Functionality)
- [ ] Test 1: Card discovery queries still work
- [ ] Test 2: Fast path detection still works
- [ ] Test 3: Plugin forceCardFacts still works
- [ ] Test 12: Named card attribute queries now work correctly

### Medium Priority (Edge Cases)
- [ ] Test 7: Card mentioned with discovery intent
- [ ] Test 8: Implicitly named cards
- [ ] Test 10: Card mentioned but no data exists

### Low Priority (Rare Scenarios)
- [ ] Test 9: Multiple cards mentioned
- [ ] Test 11: External forceCardFacts override

---

## Key Logic Points to Verify

1. **`mentionedCard` detection**: Should correctly identify when a card is explicitly mentioned
2. **PEPEDAWN disambiguation**: Should correctly distinguish bot chat vs card intent
3. **Card discovery skip**: Should only skip when `mentionedCard` is not null
4. **Normal retrieval**: Should still work for named cards (fetch from memories/wiki)

---

## Monitoring Points

Watch logs for:
- `[SmartRouter] Suppressing named-card override for PEPEDAWN (bot conversation)` - Should appear for bot chat
- `[SmartRouter] Overriding intent to FACTS for named card` - Should appear for card queries
- Card discovery should NOT trigger when a card is mentioned
- Fast path should NOT trigger when a card is mentioned

