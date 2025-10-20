# Hotfix: Model API Correction

**Issue**: Runtime error `No handler found for delegate type: TEXT_MODEL`

**Root Cause**: Used incorrect API `runtime.useModel('TEXT_MODEL')` instead of `runtime.generateText()`

**Fix Applied**:

### loreSummarize.ts
```typescript
// BEFORE (incorrect)
const summary = await runtime.useModel('TEXT_MODEL' as any, {
  prompt: summaryPrompt,
  maxTokens: LORE_CONFIG.MAX_TOKENS_SUMMARY,
  temperature: 0.3,
});

// AFTER (correct)
const summary = await runtime.generateText({
  prompt: summaryPrompt,
  maxTokens: LORE_CONFIG.MAX_TOKENS_SUMMARY,
  temperature: 0.3,
});
```

### storyComposer.ts
```typescript
// BEFORE (incorrect)
const story = await runtime.useModel('TEXT_MODEL' as any, {
  prompt: storyPrompt,
  maxTokens: LORE_CONFIG.MAX_TOKENS_STORY,
  temperature: LORE_CONFIG.TEMPERATURE,
  topP: LORE_CONFIG.TOP_P,
});

// AFTER (correct)
const story = await runtime.generateText({
  prompt: storyPrompt,
  maxTokens: LORE_CONFIG.MAX_TOKENS_STORY,
  temperature: LORE_CONFIG.TEMPERATURE,
});
```

**Note**: ElizaOS uses `runtime.generateText()` for text generation, not `runtime.useModel()` with custom model types.

**Status**: ✅ Fixed, build passes, ready for testing

