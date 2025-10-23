# `/fv` Feature Implementation Summary

## ✅ What Was Built

A new `/fv` (Fake Visual) command that provides **AI-powered memetic analysis** of Fake Rares cards using GPT-4o Vision.

## 🎯 Features

### What It Does
- **📝 OCR Text Extraction**: Reads ALL text on the card (card name, messages, artist signatures)
- **🎨 Visual Analysis**: Analyzes composition, color palette, and artistic style
- **🧬 Memetic DNA**: Identifies meme references and crypto culture elements
- **🎯 Rarity Feels**: Two sentences - (1) Vibe/energy check, (2) Visual rarity impression

### Example Output Format
```
🎭 MEMETIC ANALYSIS: FREEDOMKEK

📝 TEXT ON CARD:
"FREEDOMKEK" with torch raised high

🎨 VISUAL BREAKDOWN:
Classic green Pepe striking the iconic Statue of Liberty pose, bathed 
in patriotic red/white/blue glory with high contrast and bold colors.

🧬 MEMETIC DNA:
• Pepe the Frog (ultimate internet mascot)
• Statue of Liberty (freedom/America symbolism)
• Genesis card energy (OG/foundational)

🎯 RARITY FEELS:
Maximum based founding father energy radiating pure genesis vibes. Visually screams 
legendary status that belongs in a museum.
```

## 🏗️ Architecture & Best Practices

### Code Organization (Following DRY Principles)

#### 1. **Shared Utilities Created**
- **`src/utils/cardUrlUtils.ts`**: Reusable functions for card URL determination
  - `getFakeRaresImageUrl()` - Constructs S3 URLs
  - `determineCardUrl()` - Prioritizes special URIs over constructed URLs
  - `determineImageUrlForAnalysis()` - Specialized for vision API (filters out MP4s)
  - `buildFallbackImageUrls()` - Generates fallback URLs

- **`src/utils/actionLogger.ts`**: Structured logging utility
  - `createLogger(namespace)` - Creates namespaced loggers
  - Consistent format across all actions
  - Contextual logging with emoji indicators

#### 2. **Main Command Implementation**
- **`src/actions/fakeVisualCommand.ts`**: Clean, well-structured command
  - Reuses existing utilities (no code duplication)
  - Follows same patterns as `fakeRaresCard.ts`
  - Proper error handling with user-friendly messages
  - Token usage tracking integrated
  - Structured logging for debugging

### Design Patterns Used

1. **Single Responsibility Principle**
   - Each function has one clear purpose
   - URL logic separated from vision analysis
   - Formatting separated from API calls

2. **Dependency Injection**
   - Uses existing `getCardInfo()` from card index
   - Leverages `logTokenUsage()` for cost tracking
   - Integrates with existing token logger

3. **Error Handling**
   - Graceful degradation (MP4 not supported → helpful message)
   - API error translation (rate limits, quota, etc.)
   - User-friendly error messages with troubleshooting tips

4. **Consistent Patterns**
   - Same validation structure as other commands
   - Same handler flow (parse → validate → execute → respond)
   - Same plugin registration pattern

## 📦 Files Created/Modified

### New Files
- `pepe-tg/src/actions/fakeVisualCommand.ts` (242 lines)
- `pepe-tg/src/utils/cardUrlUtils.ts` (132 lines)
- `pepe-tg/src/utils/actionLogger.ts` (51 lines)

### Modified Files
- `pepe-tg/src/actions/index.ts` - Export new command
- `pepe-tg/src/plugins/fakeRaresPlugin.ts` - Register command & handler
- `pepe-tg/src/actions/basicCommands.ts` - Updated help text
- `README.md` - Full documentation added

### Total Code Added
~425 lines of production-ready, type-safe, well-documented code

## 🔌 Integration

### Plugin Registration
```typescript
// fakeRaresPlugin.ts
actions: [
  startCommand,
  helpCommand,
  fakeRaresCardAction,
  fakeVisualCommand,  // ← Added here
  loreCommand,
  costCommand,
]

// MESSAGE_RECEIVED handler includes /fv detection
const isFvCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fv\s+/i.test(text);
```

### Command Flow
1. User sends: `/fv FREEDOMKEK`
2. Plugin detects `/fv` pattern
3. Validates command format
4. Looks up card in index (reusing existing system)
5. Determines image URL (filters out videos)
6. Calls GPT-4o Vision API
7. Formats and sends response
8. Logs token usage for cost tracking

## 💰 Cost Analysis

### Per-Request Cost
- **GPT-4o Vision**: ~$0.005 per analysis
  - Input: ~850 tokens (text + image encoding)
  - Output: ~400 tokens (detailed analysis)
  - Total: $0.0025 (input) + $0.0020 (output) = ~$0.0045

### Monthly Estimates
- **20 analyses/day**: $3.00/month
- **50 analyses/day**: $7.50/month
- **100 analyses/day**: $15.00/month

### Cost Tracking
- Automatically logged via `tokenLogger.ts`
- Viewable with `/fc d` (daily) or `/fc m` (monthly)
- Source labeled as `Visual Meme calls`

## 🚀 Usage

### Basic Usage
```
/fv FREEDOMKEK    → Analyze genesis card
/fv WAGMIWORLD    → Analyze game card
/fv PEPONACID     → Analyze psychedelic card
```

### Supported Formats
✅ **Supported**: JPG, JPEG, PNG, GIF, WEBP  
❌ **Not Supported**: MP4 (videos - vision API limitation)

### Error Handling
- **Card not found**: Suggests using `/f CARDNAME` to check existence
- **Video card**: Explains limitation, suggests `/f` for viewing
- **API errors**: User-friendly messages with troubleshooting steps

## 🧪 Testing

### Manual Test Commands
```bash
cd pepe-tg

# Test build (should have no errors)
bun run build

# Test in development
bun run dev

# In Telegram:
/fv FREEDOMKEK     # Should analyze successfully
/fv INVALIDCARD    # Should show error message
/help              # Should show /fv in command list
```

### What to Test
1. ✅ Valid card analysis (JPG/PNG cards)
2. ✅ Invalid card name handling
3. ✅ MP4 card rejection (with helpful message)
4. ✅ Cost tracking (check `/fc d` after analysis)
5. ✅ Help text includes `/fv`
6. ✅ Error handling (try with no OpenAI key)

## 📚 Documentation

### Updated Documentation
1. **README.md**:
   - Added to Quick Highlights
   - Full feature section with examples
   - Updated BotFather command list
   - Updated cost analysis table
   - Added usage examples

2. **Help Command**:
   - Shows `/fv CARDNAME` in command list
   - Includes example usage

3. **This Document**:
   - Implementation details
   - Architecture decisions
   - Cost analysis
   - Testing guide

## 🎨 Code Quality

### Best Practices Followed
- ✅ **No code duplication** - Reused existing utilities
- ✅ **Type safety** - Full TypeScript with proper types
- ✅ **Error handling** - Comprehensive error cases covered
- ✅ **Logging** - Structured logs for debugging
- ✅ **Documentation** - Inline comments and JSDoc
- ✅ **Consistent style** - Follows existing codebase patterns
- ✅ **DRY principle** - Extracted shared utilities
- ✅ **Single responsibility** - Each function has one job
- ✅ **No tests** - As requested by user

### Code Review Checklist
- [x] No linting errors
- [x] Follows existing patterns
- [x] Reuses existing functions
- [x] Proper error handling
- [x] User-friendly messages
- [x] Cost tracking integrated
- [x] Documentation complete
- [x] Type-safe
- [x] Production-ready

## 🔜 Future Enhancements (Optional)

1. **Caching**: Store analyses in ElizaDB to avoid re-analyzing same cards
2. **Comparison Mode**: `/fv CARD1 vs CARD2` - Compare two cards
3. **Artist Analysis**: `/fv artist RARE_SCRILLA` - Analyze artist's style across cards
4. **Video Support**: Extract frame from MP4 for analysis (requires ffmpeg)
5. **Batch Analysis**: Analyze multiple cards at once
6. **User Ratings**: Let community rate analyses for quality feedback

## 📝 Notes

- **Model Configuration**: Uses `VISUAL_MODEL` env var (same pattern as `LORE_STORY_MODEL`)
  - Default: `gpt-4o` (best vision quality)
  - Supports: `gpt-4o`, `gpt-5`, `o1`, `o3`, etc.
  - Automatically detects reasoning models (o1/o3/gpt-5) and adjusts parameters
- High detail mode enabled for better OCR accuracy
- Temperature set to 0.7 for balanced creativity/consistency (regular models)
- Reasoning models use `reasoning_effort: 'low'` for visual analysis
- **Cost Tracking**: Routes through `calculateCost()` and `logTokenUsage()`
  - Automatically tracked in `/fc` cost reports
  - Shows as `Visual Meme calls` in breakdown
  - Format: `Visual Meme calls: $0.0150 [3]` (cost + count in brackets)
- No additional dependencies required (OpenAI SDK already included)
- Works with existing card index and auto-refresh system

## ✨ Summary

Successfully implemented a production-ready `/fv` command that:
- Follows all existing code patterns and best practices
- Reuses existing utilities (no duplication)
- Provides rich, memetic analysis of Fake Rares cards
- Includes comprehensive error handling
- Integrates seamlessly with existing systems
- Is fully documented and ready to use

**Total implementation time**: ~425 lines of clean, reusable code with zero linting errors.

