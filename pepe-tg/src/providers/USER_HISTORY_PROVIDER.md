# User History Provider

## Overview

Injects smart, concise user context into conversations to enable natural continuity and familiarity.

## Features

✅ **Size-constrained** - Never exceeds tweet length (280 chars)  
✅ **Adaptive** - Matches user's current message length  
✅ **Smart summarization** - Topics, not raw messages  
✅ **Graceful degradation** - Skips context for new users (<3 messages)  
✅ **Card-aware** - Tracks card mentions and frequency  

## How It Works

### Input: User's Message
```
"gm" (2 characters)
```

### Provider Analyzes:
- User has 47 messages in this room
- Mentioned PEPEDAWN 5x, Rare Scrilla 2x
- Active member

### Output (Matches User's Length):
```
[User context: rabbidfly.xcp: active | likes: PEPEDAWN (5x), Rare Scrilla (2x)]
```
**Size:** ~70 characters (matches "gm" being short, under 280 cap)

---

### Input: User's Message
```
"What do you think about the Fake Rares movement and how it's evolved?" (75 characters)
```

### Output (Matches Longer Message):
```
[User context: rabbidfly.xcp: regular | likes: PEPEDAWN (5x), Rare Scrilla (2x), FREEDOMKEK]
```
**Size:** ~90 characters (matches longer query, still under 280 cap)

---

## Size Logic

```typescript
const userMessageLength = (message.content.text || '').length;
const maxContextLength = Math.min(
  280,                            // Hard cap: tweet length
  Math.max(50, userMessageLength) // Soft cap: match user's length (min 50)
);
```

**Examples:**
- User says "gm" (2 chars) → Context max: 50 chars (minimum)
- User says "Tell me..." (100 chars) → Context max: 100 chars
- User says long paragraph (500 chars) → Context max: 280 chars (hard cap)

## Format

```
[User context: {username}: {familiarity} | {interests}]
```

**Familiarity levels:**
- `regular` - 50+ messages
- `active` - 10-49 messages  
- (omitted) - 3-9 messages

**Interests:**
- Top 3 mentioned cards with frequency
- Example: `PEPEDAWN (5x), Rare Scrilla (2x), FREEDOMKEK`

## Character Integration

Character is instructed to:
- Use context ONLY if relevant
- Keep responses brief when user is brief
- Reference naturally, never force
- For "gm" → Just acknowledge familiarity ("gm fam, good to see you back")
- For questions → Personalize based on interests

## When Context Is Skipped

Provider returns empty string (`''`) when:
- User has < 3 messages (new user)
- Message is from the bot itself
- Error occurs (fail gracefully)

## Performance

- **Query:** Single `getMemories()` call (max 100 messages)
- **Processing:** In-memory filtering + card extraction
- **Latency:** < 50ms typically
- **Token impact:** 30-280 chars added to prompt (minimal)

## Testing

To test, chat with the bot:

1. **New user** → No context injected
2. **After 3+ messages** → Start getting concise context
3. **Say "gm"** → Short context, bot acknowledges familiarity
4. **Ask question** → Longer context with interests, bot personalizes

Check logs for:
```
[UserHistoryProvider] Context injected: [User context: rabbidfly.xcp: active | likes: PEPEDAWN]
```

## Example Conversation Flow

```
User (first time): "gm"
→ No context (< 3 messages)
→ Bot: "gm ser ☀️"

User (after 10 messages over days): "gm"  
→ Context: [User context: rabbidfly.xcp: active | likes: PEPEDAWN]
→ Bot: "gm fam, good to see you back 🐸"

User: "What do you think about the collection?"
→ Context: [User context: rabbidfly.xcp: active | likes: PEPEDAWN (5x), Rare Scrilla (2x)]
→ Bot: "You were vibing on PEPEDAWN last week - still hits different, right? The whole collection carries that energy 🔥"
```

## Code Location

- **Provider:** `src/providers/userHistoryProvider.ts`
- **Registered:** `src/plugins/fakeRaresPlugin.ts` (providers array)
- **Character:** `src/pepedawn.ts` (system prompt updated)

## Maintenance

- Monitor token usage (context adds 30-280 chars per message)
- Adjust MIN_MESSAGES_FOR_CONTEXT if needed (default: 3)
- Tune TWEET_LENGTH if prompts get too long (default: 280)

