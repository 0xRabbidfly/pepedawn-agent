# Bootstrap & Knowledge Plugin Integration - Findings

**Date:** October 26, 2025  
**Investigation:** How `@elizaos/plugin-knowledge` integrates with `@elizaos/plugin-bootstrap`

---

## Summary

**Conclusion:** Bootstrap's automatic knowledge integration is **unreliable and not recommended** for production use. Use explicit commands (like `/fl`) for knowledge-backed responses.

---

## What We Discovered

### 1. Bootstrap DOES Use Knowledge - But Unpredictably

When you include `@elizaos/plugin-knowledge` in your character's plugins, it provides a `KNOWLEDGE` provider that Bootstrap **can** use, but:

- ❌ The LLM decides whether to use it (non-deterministic)
- ❌ Decision varies based on conversation context
- ❌ Even explicit phrases like "search your knowledge" don't guarantee it
- ❌ When it does use knowledge, it may generate responses BEFORE knowledge arrives (hallucinations)

### 2. The Knowledge Plugin Has Two Mechanisms

**Mechanism A: KNOWLEDGE Provider** (for Bootstrap)
- Adds context to LLM prompts
- Supposed to be automatic
- Actually: LLM decides when to use it
- Result: Unpredictable

**Mechanism B: SEARCH_KNOWLEDGE Action**
- Triggers on phrases like "search your knowledge"
- Explicitly searches and returns raw results
- Result: Dumps raw JSON/passages to user (not useful)

### 3. Bootstrap Has Architectural Limitations

Bootstrap appears to run in "simple mode" where:
1. LLM decides which providers to use
2. LLM generates response text
3. **Then** providers are fetched
4. Response already sent (too late!)

The knowledge arrives but isn't used properly - leading to hallucinations alongside knowledge dumps.

---

## Test Results

### Test 1: "what is the book of kek?"
- Bootstrap triggered (reply=true)
- **No knowledge search**
- LLM responded from training data

### Test 2: "look deep into your knowledge and tell me about pepenardo"
- Bootstrap triggered (reply=true)
- **6 knowledge searches** (found 15 results each)
- Still unpredictable if it would work again

### Test 3: "did Scrilla start Fake Rares due to disagreements?"
- Bootstrap triggered (@mention)
- **Knowledge search executed**
- ❌ Bot hallucinated first response
- Then sent second response with raw knowledge dump
- User got TWO responses (one fake, one raw data)

---

## What Works Reliably

### ✅ Custom `/fl` Command
- **Always** searches knowledge database
- **Always** returns grounded responses
- Consistent, predictable behavior
- Beautiful lore storytelling with citations
- Users know it's a "deep dive" command

**Example:**
```
User: /fl Rare Scrilla
Bot: [Searches 20 passages, clusters into 6 themes, generates historian-style story]
     "Rare Scrilla founded Fake Rares in September 2021..."
     Sources: wiki:d9b486 || tg:89d896 2022-05-15 || ...
```

### ❌ Bootstrap + Knowledge Plugin
- **Sometimes** searches knowledge
- **Sometimes** hallucinates
- **Sometimes** dumps raw data
- Unpredictable, unreliable
- Users can't trust responses

---

## Why Bootstrap Knowledge Integration Fails

### 1. **LLM-Based Decision Making**
The decision to use KNOWLEDGE is made by the LLM's neural network, not code:

```
Location: GPT-4o-mini's weights (not in code)
Based on: Provider description + message content + conversation context + randomness
Result: Non-deterministic, context-dependent
```

### 2. **Timing Issue**
Bootstrap generates responses before providers return:
```
Step 1: LLM decides "I'll use KNOWLEDGE" + generates text
Step 2: Knowledge provider fetches data
Step 3: Response already sent (text from Step 1)
Result: Hallucinated response sent, knowledge ignored
```

### 3. **SEARCH_KNOWLEDGE Action Interference**
When users say "search your knowledge":
- Bootstrap's KNOWLEDGE provider might activate
- SEARCH_KNOWLEDGE action ALSO activates
- Result: Hallucinated response + raw data dump (two messages)

---

## Recommended Architecture

### ✅ **For Knowledge-Backed Responses:**
Use **explicit commands** that guarantee knowledge database usage:

```
/fl <topic>   - Detailed lore stories with citations
/f <card>     - Card display (uses card database, not knowledge)
/fv <card>    - Visual analysis (uses vision model)
```

### ✅ **For Casual Chat:**
Use **Bootstrap** with the understanding that:
- It's for general conversation
- Hallucinations on minor details are acceptable
- Users can use `/fl` if they need accurate lore

### ✅ **For Triggers:**
- `@mentions` → Bootstrap (casual chat, may hallucinate)
- `Replies` → Bootstrap (casual chat, may hallucinate)
- `CAPS words` → Bootstrap (casual chat, may hallucinate)
- Everything else → Suppressed (quiet bot)

---

## What We Tried (And Why It Didn't Work)

### Attempt 1: Custom messageHandlerTemplate
**Goal:** Force LLM to always use KNOWLEDGE provider for Fake Rares questions

**Result:** 
- ✅ LLM did select KNOWLEDGE provider more often
- ❌ But still generated hallucinated text before knowledge arrived
- ❌ Not a reliable solution

### Attempt 2: Custom Knowledge Conversation Action
**Goal:** Route @mentions through `/fl`-like flow with conversational output

**Result:**
- ✅ Knowledge searches worked
- ❌ Recent message context was broken (only saw bot's own responses)
- ❌ Database/memory retrieval issues
- ❌ More complex than the problem warranted

---

## Final Recommendation

**Keep it simple:**

1. **Remove custom template** - Not needed, adds complexity
2. **Use `/fl` for lore** - Works perfectly, reliable, predictable
3. **Accept Bootstrap limitations** - Good for casual chat, not factual accuracy
4. **Promote `/fl` to users** - "For accurate lore, use /fl <topic>"

**This is the pragmatic solution that actually works.**

---

## Key Learnings

1. **Plugin documentation can be misleading** - "@elizaos/plugin-knowledge" claims automatic retrieval, but it's unreliable in practice

2. **LLM decision-making is non-deterministic** - You cannot force the LLM to use providers through prompt engineering alone

3. **Explicit is better than automatic** - Custom commands (`/fl`) are more reliable than hoping Bootstrap makes the right decision

4. **Bootstrap is for chat, not facts** - Use Bootstrap for casual conversation where hallucinations don't matter; use custom actions for accuracy

5. **RAG requires control** - If you want reliable retrieval-augmented generation, you need explicit control over when and how knowledge is retrieved (like `/fl` does)

---

## Moving Forward

**What to tell users:**

> "For accurate, knowledge-backed lore responses, use `/fl <topic>`. 
> For casual chat, just @mention me or reply, but keep in mind I might 
> get some details wrong - always use /fl for the real history!"

This sets proper expectations and guides users to the reliable tools.

