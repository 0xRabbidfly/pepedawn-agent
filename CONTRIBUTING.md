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

### 4. Run Tests

```bash
# Run all tests
bun test

# Run specific test
bun test src/__tests__/actions.test.ts

# Watch mode
bun test --watch
```

### 5. Start Development

```bash
# Development mode (hot-reload)
bun run dev

# Test in Telegram
# Message your test bot: /f FREEDOMKEK
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
- **Active actions:** startCommand, helpCommand, fakeRaresCardAction, loreCommand, costCommand

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

**Utilities** (`src/utils/`) - Shared functionality
- Card lookups, fuzzy matching, cost tracking, lore retrieval, etc.
- Reusable functions imported by actions/providers

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
   // src/__tests__/stats.test.ts
   import { describe, it, expect } from 'bun:test';
   import { statsCommand } from '../actions/statsCommand';
   
   describe('Stats Command', () => {
     it('should validate /stats command', async () => {
       const message = { content: { text: '/stats' } };
       const result = await statsCommand.validate(null as any, message as any);
       expect(result).toBe(true);
     });
   });
   ```

5. **Update BotFather commands:**
   ```
   stats - View collection statistics
   ```

6. **Update documentation:**
   - Add to README.md features section
   - Document in relevant markdown files

---

## 🧪 Testing

### Test Types

**Unit Tests** - Test individual functions
```typescript
// src/__tests__/utils.test.ts
import { describe, it, expect } from 'bun:test';
import { calculateSimilarity } from '../utils/fuzzyMatch';

describe('Fuzzy Matching', () => {
  it('should calculate similarity correctly', () => {
    expect(calculateSimilarity('PEPE', 'PEEP')).toBeGreaterThan(0.75);
  });
});
```

**Integration Tests** - Test component interactions
```typescript
// src/__tests__/integration.test.ts
import { describe, it, expect } from 'bun:test';

describe('Card Lookup Integration', () => {
  it('should find card and display with metadata', async () => {
    // Test complete card lookup flow
  });
});
```

**E2E Tests** - Test full user scenarios
```typescript
// src/__tests__/e2e/bot.e2e.ts
export class BotTestSuite implements TestSuite {
  name = 'bot_e2e';
  tests = [
    {
      name: 'card_display',
      fn: async (runtime) => {
        // Test complete /f command flow
      },
    },
  ];
}
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

