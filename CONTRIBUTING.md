# Contributing to PEPEDAWN

Thank you for your interest in contributing to the Fake Rares Telegram Bot! 🐸✨

## 🚀 Quick Start for Contributors

### 1. Fork & Clone

```bash
# Fork the repository on GitHub, then clone your fork:
git clone https://github.com/YOUR_USERNAME/pepedawn-agent.git
cd pepedawn-agent/pepe-tg
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment

```bash
# Copy the template
cp .env.example .env

# Edit with your API keys
nano .env
```

**Required for testing:**
- `OPENAI_API_KEY` - Get from [platform.openai.com](https://platform.openai.com/api-keys)
- `TELEGRAM_BOT_TOKEN` - Create test bot via [@BotFather](https://t.me/BotFather)
- `REPLICATE_API_TOKEN` - Get from [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) (for `/ft` duplicate detection)

### 4. Run Tests

```bash
# Run all tests
bun test

# Run specific test
bun test src/__tests__/actions.test.ts

# Watch mode
bun test --watch
```

### 5. Generate Card Embeddings (One-Time Setup)

The `/ft` command requires CLIP embeddings for duplicate detection.

**Option 1: Use Existing Embeddings** (Recommended)
```bash
# If card-embeddings.json exists in the repo, you're done!
ls src/data/card-embeddings.json
```

**Option 2: Generate Embeddings** (If Missing)
```bash
# Add REPLICATE_API_TOKEN to .env
echo "REPLICATE_API_TOKEN=r8_your-token-here" >> .env

# Generate embeddings for all cards (~5-10 minutes)
bun run scripts/generate-card-embeddings.js

# This creates: src/data/card-embeddings.json (~680KB)
```

**What it does:**
- Generates 512-dimensional CLIP embeddings for all ~890 cards
- Enables duplicate detection when users upload images with `/ft`
- Uses Replicate API (`krthr/clip-embeddings` model)
- Cost: ~$0.0002 per image × 890 cards = ~$0.18 one-time

**Note:** Without embeddings, `/ft` will skip duplicate checking and go straight to LLM analysis.

### 6. Start Development

```bash
# Development mode (hot-reload)
bun run dev

# Test in Telegram
# Message your test bot: /f FREEDOMKEK
# Message your test bot: /ft [attach image]
```

---

## 📋 Development Guidelines

### Code Style

**We use:**
- **TypeScript** (strict mode)
- **Prettier** for formatting (auto-runs on save)
- **ESM modules** (not CommonJS)
- **Bun** as runtime and package manager

**Before committing:**
```bash
# Format code
bun run lint

# Type check
bun run type-check

# Run tests
bun test
```

### Commit Messages

Follow conventional commits:

```
feat: Add card comparison feature
fix: Correct fuzzy matching threshold
docs: Update README with new /compare command
chore: Update dependencies
refactor: Extract fuzzy logic to separate file
test: Add tests for cost command
```

### Pull Request Process

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Write code
   - Add tests
   - Update documentation

3. **Test thoroughly:**
   ```bash
   bun run check-all  # Runs type-check, format-check, and tests
   ```

4. **Commit and push:**
   ```bash
   git add .
   git commit -m "feat: Your feature description"
   git push origin feature/your-feature-name
   ```

5. **Create Pull Request:**
   - Go to GitHub
   - Click "New Pull Request"
   - Describe changes clearly
   - Link related issues

---

## 🏗️ Project Architecture

### ElizaOS Pattern Overview

PEPEDAWN follows ElizaOS architectural patterns:

**Actions** (`src/actions/`) - Bot commands and handlers
- Handle specific commands or behaviors (e.g., `/f`, `/fl`, `/fc`)
- **Must have:** `validate()` and `handler()` functions
- **Returns:** `ActionResult` with `success` boolean
- **Active actions:** startCommand, helpCommand, fakeRaresCardAction, fakeVisualCommand, fakeTestCommand, loreCommand, costCommand

**Providers** (`src/providers/`) - Context enrichment
- Run **BEFORE** actions to add contextual data to state
- Example: fakeRaresContextProvider detects card mentions
- **Returns:** `ProviderResult` with `{ text, data, values }`
- **Active providers:** fakeRaresContextProvider

**Evaluators** (`src/evaluators/`) - Post-processing
- Run **AFTER** conversations to extract insights
- Example: loreDetectorEvaluator (currently disabled)
- **Returns:** void (no return needed)
- **Active evaluators:** None currently

**Services** (`src/services/`) - Shared business logic
- **knowledgeService** - Shared knowledge retrieval for `/fl` and auto-routing

**Utilities** (`src/utils/`) - Shared functionality
- Card lookups, fuzzy matching, cost tracking, lore retrieval, etc.
- **visionAnalyzer** - Shared OpenAI Vision API integration
- **visualEmbeddings** - Replicate CLIP embeddings for duplicate detection
- **embeddingsDb** - JSON storage for card embeddings
- **queryClassifier** - FACTS/LORE/UNCERTAIN query classification
- Reusable functions imported by actions/providers/services

### Adding a New Feature

**Example: Adding a `/stats` command**

1. **Create action file:**
   ```typescript
   // src/actions/statsCommand.ts
   import { type Action, type HandlerCallback, type IAgentRuntime, type Memory } from '@elizaos/core';
   
   export const statsCommand: Action = {
     name: 'STATS_COMMAND',
     description: 'Show collection statistics',
     
     validate: async (runtime, message) => {
       const text = message.content.text?.toLowerCase().trim() || '';
       return text === '/stats';
     },
     
     handler: async (runtime, message, state, options, callback) => {
       // Your logic here
       const stats = `📊 Collection has 890 cards across 19 series`;
       
       if (callback) {
         await callback({ text: stats });
       }
       
       return { success: true, text: 'Sent stats' };
     },
   };
   ```

2. **Export from index:**
   ```typescript
   // src/actions/index.ts
   export { statsCommand } from './statsCommand';
   ```

3. **Register in plugin:**
   ```typescript
   // src/plugins/fakeRaresPlugin.ts
   import { statsCommand } from '../actions';
   
   export const fakeRaresPlugin: Plugin = {
     actions: [
       startCommand,
       helpCommand,
       fakeRaresCardAction,
       loreCommand,
       costCommand,
       statsCommand,  // Add here
     ],
     // ...
   };
   ```

4. **Add tests:**
   ```typescript
   // src/__tests__/actions/stats.test.ts
   import { describe, it, expect } from 'bun:test';
   import { statsCommand } from '../../actions/statsCommand';
   
   describe('Stats Command', () => {
     it('should validate /stats command', async () => {
       const message = { content: { text: '/stats' } };
       const result = await statsCommand.validate(null as any, message as any);
       expect(result).toBe(true);
     });
   });
   ```
   
   **Note:** Organize tests by type:
   - `__tests__/actions/` - Action command tests
   - `__tests__/utils/` - Utility function tests
   - `__tests__/integration/` - Integration tests

5. **Update BotFather commands:**
   ```
   stats - View collection statistics
   fv - Analyze card visuals and memes with AI vision
   ```

6. **Update documentation:**
   - Add to README.md features section
   - Document in relevant markdown files

---

## 🖼️ Visual Commands & Embeddings

### How `/ft` Duplicate Detection Works

When a user uploads an image with `/ft`:

1. **Generate CLIP embedding** for uploaded image (via Replicate API)
2. **Compare to all card embeddings** in `card-embeddings.json` using cosine similarity
3. **Classify similarity:**
   - ≥95% = Exact match (existing Fake Rare)
   - ≥85% = High similarity (modified card)
   - 30-84% = Low similarity (show closest match + full analysis)
   - <30% = No match (full analysis only)

### Setting Up Embeddings

**Required for `/ft` duplicate detection:**

1. **Add Replicate API token** to `.env`:
   ```bash
   REPLICATE_API_TOKEN=r8_your-token-here
   ```
   Get token: [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens)

2. **Generate embeddings** (one-time, ~5-10 minutes):
   ```bash
   bun run scripts/generate-card-embeddings.js
   ```

3. **Verify creation:**
   ```bash
   ls -lh src/data/card-embeddings.json
   # Should be ~680KB with 890 card embeddings
   ```

**When to regenerate:**
- ✅ When adding new cards
- ✅ When card images change
- ✅ When `card-embeddings.json` is missing

**Cost:** ~$0.0002 per image via Replicate (`krthr/clip-embeddings`)

### Adding New Cards with Embeddings

When you add new cards, regenerate embeddings:

```bash
# 1. Add new cards
node scripts/add-new-cards.js 19

# 2. Generate embeddings for new cards only
bun run scripts/generate-card-embeddings.js NEWCARD1 NEWCARD2 NEWCARD3

# 3. Or regenerate all (safe, updates only changed cards)
bun run scripts/generate-card-embeddings.js

# 4. Commit both files
git add src/data/fake-rares-data.json src/data/card-embeddings.json
git commit -m "feat: Add series 19 cards with embeddings"
```

**Note:** The `add-new-cards.js` script will remind you to run embedding generation at the end.

---

## 🎨 Adapting for Your Own Collection

Want to use this bot for a different NFT/trading card collection? Here's how:

### 1. Create Your Data File

Replace `src/data/fake-rares-data.json` with your collection data:

```json
[
  {
    "asset": "YOURCARD001",
    "series": 0,
    "card": 1,
    "ext": "png",
    "artist": "Artist Name",
    "artistSlug": "artist-name",
    "supply": 100,
    "issuance": "October 2024"
  }
]
```

**Required fields:**
- `asset` - Card/token name (UPPERCASE recommended)
- `series` - Series/collection number
- `card` - Card number within series
- `ext` - File extension (jpg, png, gif, mp4, webp)
- `artist` - Artist/creator name
- `supply` - Total supply/mintage

**Optional fields:**
- `artistSlug` - URL-safe artist name
- `issuance` - Release date/time
- `imageUri` - Override image URL
- `videoUri` - Direct video URL (for MP4s)
- `memeUri` - Static image URL (for animated cards)

### 2. Adapt the Scraper

**Option A: Manual data entry** (small collections)
```bash
# Just edit fake-rares-data.json directly
nano src/data/fake-rares-data.json
```

**Option B: Write custom scraper** (large collections)

Copy and modify `scripts/add-new-cards.js`:

```javascript
// scripts/scrape-your-collection.js
const BASE_URL = 'https://your-collection-site.com';

async function scrapeYourCollection(seriesNumber) {
  // Your scraping logic here
  // Target: Extract asset name, artist, supply, etc.
  
  return cards.map(card => ({
    asset: card.name.toUpperCase(),
    series: seriesNumber,
    card: card.number,
    ext: determineExtension(card.imageUrl),
    artist: card.creator,
    supply: card.totalSupply,
    issuance: card.releaseDate,
  }));
}
```

**Scraping tips:**
- Use Playwright for dynamic sites (included in dependencies)
- Respect rate limits (add delays between requests)
- Validate data completeness after scraping
- Handle missing fields gracefully

### 3. Update URLs and Branding

**Files to modify:**

1. **`src/pepedawn.ts`** - Character personality, collection knowledge
2. **`src/actions/basicCommands.ts`** - Help text, collection name references
3. **`src/utils/cardUrlUtils.ts`** - Image URL construction logic
4. **`README.md`** - All collection-specific references

**Search and replace:**
```bash
# Find all Fake Rares references
grep -r "Fake Rares" pepe-tg/src/

# Find all pepe.wtf references  
grep -r "pepe.wtf" pepe-tg/src/

# Find all S3 URL patterns
grep -r "pepewtf.s3.amazonaws.com" pepe-tg/src/
```

### 4. Generate Embeddings for Your Collection

```bash
# 1. Ensure REPLICATE_API_TOKEN in .env

# 2. Generate embeddings for all your cards
bun run scripts/generate-card-embeddings.js

# This creates: src/data/card-embeddings.json with your collection
```

### 5. Test Thoroughly

```bash
# Test card lookup
/f YOURCARD001

# Test visual analysis  
/fv YOURCARD001

# Test duplicate detection
/ft [upload image of YOURCARD001]
```

### Example: Adapting for "Cool Cats"

**Step 1: Data structure**
```json
[
  {
    "asset": "COOLCAT001",
    "series": 1,
    "card": 1,
    "ext": "png",
    "artist": "Clon",
    "supply": 9999,
    "issuance": "July 2021"
  }
]
```

**Step 2: Update character (`src/pepedawn.ts`)**
```typescript
bio: [
  "I'm the keeper of Cool Cats knowledge",
  "I know every Cool Cat ever created",
  // ... etc
]
```

**Step 3: Update help text**
```typescript
const helpMessage = `🐱 **Cool Cats Bot Commands**

\`/f CARDNAME\` - View any Cool Cat
\`/fv CARDNAME\` - Analyze Cool Cat visuals
\`/ft [attach image]\` - Test your cat for appeal
// ... etc
```

**Step 4: Update URLs**
```typescript
// In cardUrlUtils.ts
const BASE_URL = 'https://coolcats-cdn.com/images/';
```

### When to Fork vs. Contribute

**Fork this project if:**
- ✅ Building bot for a different collection
- ✅ Need different branding/personality  
- ✅ Different data structure/APIs

**Contribute to this project if:**
- ✅ Improving Fake Rares features
- ✅ Bug fixes or optimizations
- ✅ Better documentation
- ✅ General ElizaOS improvements that benefit everyone

---

## 🧪 Testing

### Test Types

The project has **9 custom test files** (120+ tests, excluding framework boilerplate):

**1. Bootstrap Suppression Test** (pre-commit hook)
```typescript
// src/__tests__/bootstrap-suppression.test.ts
// Validates that Bootstrap AI responses are properly suppressed
// Runs automatically on every commit
```

**2-5. Visual Commands Tests** (4 files, 67+ tests)
- `__tests__/utils/visionAnalyzer.test.ts` - Shared vision API utility
- `__tests__/actions/fakeVisualCommand.test.ts` - `/fv` card analysis
- `__tests__/actions/fakeTestCommand.test.ts` - `/ft` image appeal test
- `__tests__/integration/visual-commands.test.ts` - Plugin routing

**6-9. Knowledge & Auto-Routing Tests** (4 files, 91 tests)
- `__tests__/utils/queryClassifier.test.ts` - FACTS/LORE/UNCERTAIN classification
- `__tests__/utils/loreRetrieval.test.ts` - Memory priority & source boost logic
- `__tests__/utils/memoryStorage.test.ts` - Card detection & memory boost logic
- `__tests__/actions/loreCommand.test.ts` - `/fl` command & FACTS mode filtering

**Organize new tests by type:**

**Action Tests** - Test command handlers
```typescript
// src/__tests__/actions/yourCommand.test.ts
import { describe, it, expect } from 'bun:test';
import { yourCommand } from '../../actions/yourCommand';

describe('Your Command', () => {
  it('should validate command correctly', async () => {
    // Test validation logic
  });
});
```

**Utility Tests** - Test shared utilities
```typescript
// src/__tests__/utils/yourUtil.test.ts
import { describe, it, expect } from 'bun:test';
import { yourFunction } from '../../utils/yourUtil';

describe('Your Utility', () => {
  it('should process data correctly', () => {
    expect(yourFunction('input')).toBe('output');
  });
});
```

**Integration Tests** - Test component interactions
```typescript
// src/__tests__/integration/feature.test.ts
import { describe, it, expect } from 'bun:test';

describe('Feature Integration', () => {
  it('should work end-to-end', async () => {
    // Test complete flow
  });
});
```

### Running Tests

```bash
# All tests
bun test

# Watch mode
bun test --watch

# Coverage
bun test --coverage

# Specific file
bun test src/__tests__/actions.test.ts
```

---

## 🔍 Debugging

### Local Debugging

```bash
# Enable debug logs
LOG_LEVEL=debug bun run dev

# Check what's happening
tail -f logs/combined.log  # If logging to file
```

### Production Debugging

```bash
# SSH into server
ssh root@YOUR_SERVER_IP

# Check PM2 logs
pm2 logs pepe-tg --lines 100

# Check for errors only
pm2 logs pepe-tg --err

# Monitor in real-time
pm2 monit
```

### Common Issues

**TypeScript errors:**
```bash
# Clear build cache
rm -rf dist/ *.tsbuildinfo
bun run build
```

**Module not found:**
```bash
# Reinstall dependencies
rm -rf node_modules
bun install
```

**Bot not responding:**
1. Check `.env` file exists and has correct tokens
2. Check console for errors
3. Verify API keys are valid
4. Check rate limits on OpenAI dashboard

---

## 📚 Resources

### Documentation

- **README.md** - Complete setup guide
- **CONTRIBUTING.md** - This file - architecture & development patterns
- **telegram_docs/PEPEDAWN_cost_analysis.md** - Cost breakdown
- **telegram_docs/** - Feature-specific technical docs
- **src/assets/README.md** - Asset hosting guide

### ElizaOS Resources

- [ElizaOS Documentation](https://docs.elizaos.ai)
- [Plugin Development](https://docs.elizaos.ai/plugins)
- [Action Patterns](https://docs.elizaos.ai/plugins/patterns)

### Fake Rares Resources

- [pepe.wtf](https://pepe.wtf) - Card explorer
- [fakeraredirectory.com](https://fakeraredirectory.com) - Card directory
- [Telegram Community](https://t.me/fakerares)

---

## 🎯 Contribution Ideas

Not sure what to contribute? Here are some ideas:

**Easy:**
- Add more card metadata to `fake-rares-data.json`
- Fix typos in documentation
- Add more test coverage
- Improve error messages

**Medium:**
- Implement `/compare CARD1 CARD2` command
- Add artist spotlight feature
- Create gallery browsing by series
- Improve fuzzy matching algorithm

**Advanced:**
- GitHub Actions workflow for automated scraping
- Redis caching layer for card lookups
- Rarity stats and floor price integration
- Multi-language support

---

## 📞 Getting Help

1. **Check existing documentation** - README, CONTRIBUTING, telegram_docs/, etc.
2. **Search issues** - Someone might have had the same problem
3. **Ask in discussions** - GitHub Discussions for questions
4. **Open an issue** - For bugs or feature requests

---

## 🤝 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help newcomers learn
- Celebrate creativity over gatekeeping
- WAGMI energy always! 🐸

---

**Thank you for contributing to PEPEDAWN!** 🙏

*Let's keep the Fake Rares community thriving!* 🚀

