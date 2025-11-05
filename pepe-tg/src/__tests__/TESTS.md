# Test Suite Overview

> Custom tests for PEPEDAWN bot (excluding ElizaOS framework boilerplate)

## 📊 Test Summary

**Total:** 15 custom test files (257+ tests)

### 1. Bootstrap Suppression Test ⚡

**File:** `src/__tests__/bootstrap-suppression.test.ts`

**Purpose:** Validates that ElizaOS Bootstrap's AI responses are properly suppressed for custom commands.

**Runs:** Automatically on every `git commit` (pre-commit hook)

**Why it matters:** Without this, the bot would send duplicate responses (your command + Bootstrap's generic AI response).

---

### 2-5. Visual Commands Tests 🔍

**Files:** 4 test files, 67+ tests covering `/fv` and `/ft` commands

| File | Tests | Purpose |
|------|-------|---------|
| `utils/visionAnalyzer.test.ts` | 18 | Shared OpenAI Vision API utility |
| `actions/fakeVisualCommand.test.ts` | 12 | `/fv CARDNAME` card analysis |
| `actions/fakeTestCommand.test.ts` | 17 | `/ft [image]` appeal scoring |
| `integration/visual-commands.test.ts` | 20+ | Plugin routing & conflicts |

**See:** `VISUAL_COMMANDS_TESTS.md` for detailed documentation.

---

### 6. Auto-Routing Tests 🔀

**File:** `auto-routing.test.ts` (20 tests)

**Purpose:** Validates MESSAGE_RECEIVED auto-routing logic - ensures FACTS questions are routed to knowledge retrieval while statements/opinions are properly suppressed.

---

### 7-9. Card Display Tests 🎴

**Files:** 3 test files, 57 tests covering `/f`, `/f c`, and `/c` commands

| File | Tests | Purpose |
|------|-------|---------|
| `actions/fakeRaresCard.test.ts` | 32 | `/f` command (random, exact, fuzzy, artist) |
| `actions/fakeRaresCarousel.test.ts` | 16 | `/f c` carousel (validation, buttons, navigation) |
| `actions/fakeCommonsCard.test.ts` | 9 | `/c` command (random, exact match only) |

**Covers:**
- Random card selection
- Exact card lookup (case-insensitive)
- Artist search with fuzzy matching
- Carousel validation and button generation
- Carousel navigation logic (prev/next/noop actions)
- Fuzzy matching and typo correction (Fake Rares only)
- Artist search (Fake Rares only)
- Edge cases: whitespace, special chars, long input, missing callback

**Note:** Carousel callback_query integration tested manually (requires live Telegram interaction)

---

### 9-13. Knowledge & Lore Tests 📚

**Files:** 5 test files, 110 tests covering `/fl`, `/fr` commands and knowledge retrieval

| File | Tests | Purpose |
|------|-------|---------|
| `utils/queryClassifier.test.ts` | 33 | FACTS/LORE/UNCERTAIN classification |
| `utils/loreRetrieval.test.ts` | 19 | Memory priority & source boost logic |
| `utils/memoryStorage.test.ts` | 24 | Card detection & memory boost logic |
| `actions/loreCommand.test.ts` | 15 | `/fl` command & FACTS mode filtering |
| `actions/fakeRememberCommand.test.ts` | 7 | `/fr` command memory capture |
| **Total** | **98** | **Complete lore & knowledge coverage** |

**Purpose:** Validates query classification, memory prioritization (4.0x boost), card memory detection, slash command memory capture, and hybrid search logic.

---

## 🧪 Running Tests

### All Custom Tests
```bash
cd pepe-tg
bun test
```

### Specific Test Suites
```bash
# Bootstrap suppression (pre-commit)
bun test src/__tests__/bootstrap-suppression.test.ts

# Visual commands (all 4 files)
bun test src/__tests__/actions/fakeVisualCommand.test.ts
bun test src/__tests__/actions/fakeTestCommand.test.ts
bun test src/__tests__/utils/visionAnalyzer.test.ts
bun test src/__tests__/integration/visual-commands.test.ts

# Auto-routing
bun test src/__tests__/auto-routing.test.ts

# Knowledge & lore (all 5 files)
bun test src/__tests__/utils/queryClassifier.test.ts
bun test src/__tests__/utils/loreRetrieval.test.ts
bun test src/__tests__/utils/memoryStorage.test.ts
bun test src/__tests__/actions/loreCommand.test.ts
bun test src/__tests__/actions/fakeRememberCommand.test.ts

# Watch mode
bun test --watch

# Coverage report
bun test --coverage
```

---

## 📁 Test Organization

```
pepe-tg/src/__tests__/
├── bootstrap-suppression.test.ts    # Bootstrap suppression logic (28 tests)
├── auto-routing.test.ts             # Auto-routing FACTS questions (20 tests)
├── actions/
│   ├── fakeVisualCommand.test.ts    # /fv command tests (14 tests)
│   ├── fakeTestCommand.test.ts      # /ft command tests (16 tests)
│   ├── loreCommand.test.ts          # /fl command tests (15 tests)
│   └── fakeRememberCommand.test.ts  # /fr command tests (7 tests)
├── utils/
│   ├── queryClassifier.test.ts      # FACTS/LORE classification (33 tests)
│   ├── visionAnalyzer.test.ts       # Vision API utility (1 test)
│   ├── loreRetrieval.test.ts        # Memory priority & hybrid search (19 tests)
│   └── memoryStorage.test.ts        # Memory utilities (24 tests)
└── integration/
    └── visual-commands.test.ts      # Plugin routing integration (26 tests)
```

**Note:** Additional test files exist from ElizaOS framework but are not actively maintained as part of this project.

---

## ✅ Test Checklist

Before deploying:

- [ ] All 11 custom tests pass (197+ tests)
- [ ] Pre-commit hook validates (all 11 tests)
- [ ] Manual testing completed (see manual test plan)
- [ ] No linting errors
- [ ] Cost tracking verified in logs

---

## 🔄 Pre-Commit Hook

**Location:** `.git/hooks/pre-commit`

**What it does:** Runs 14 custom test files before every commit (including new carousel & service tests)

**To bypass (not recommended):**
```bash
git commit --no-verify
```

---

## 📚 Documentation

- **This file** - Test suite overview
- **`VISUAL_COMMANDS_TESTS.md`** - Detailed visual commands test documentation
- **`CONTRIBUTING.md`** - How to add new tests
- **`README.md`** - Quick test commands reference

---

## 🎯 Adding New Tests

1. Create test file in appropriate directory:
   - `__tests__/actions/` for command tests
   - `__tests__/utils/` for utility tests
   - `__tests__/integration/` for integration tests

2. Follow naming convention: `featureName.test.ts`

3. Use Bun test framework:
   ```typescript
   import { describe, it, expect } from 'bun:test';
   ```

4. Run tests to verify:
   ```bash
   bun test src/__tests__/your-new-test.test.ts
   ```

5. Document in this file

---

### 17. Card Display Service Tests 🔧

**File:** `services/CardDisplayService.test.ts` (11 tests)

**Purpose:** Validates unified card display service used across `/f`, `/c`, `/p` commands

**Covers:**
- Size checking for images, videos, animations
- Result caching (5-minute TTL)
- Callback invocation with correct structure
- Fallback URL generation for all collections
- Service lifecycle (start/stop)
- Null callback handling

---

**Last Updated:** November 5, 2025  
**Test Framework:** Bun Test  
**Coverage:** 15 custom test files, 257+ tests

## 🚧 Known Test Gaps

- **Carousel Callback Integration** - Telegram `callback_query` events require live bot testing. Navigation logic covered by unit tests, but end-to-end button flow is manual-only.

