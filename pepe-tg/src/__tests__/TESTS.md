# Test Suite Overview

> Custom tests for PEPEDAWN bot (excluding ElizaOS framework boilerplate)

## 📊 Test Summary

**Total:** 8 custom test files (100+ tests)

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

### 6-8. Knowledge & Auto-Routing Tests 📚

**Files:** 3 test files, 67 tests covering `/fl` command and auto-routing

| File | Tests | Purpose |
|------|-------|---------|
| `utils/queryClassifier.test.ts` | 33 | FACTS/LORE/UNCERTAIN classification |
| `utils/loreRetrieval.test.ts` | 19 | Memory priority & source boost logic |
| `actions/loreCommand.test.ts` | 15 | `/fl` command & FACTS mode filtering |

**Purpose:** Validates query classification, memory prioritization (4.0x boost), and auto-routing of fact questions to knowledge retrieval.

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

# Knowledge & auto-routing (all 3 files)
bun test src/__tests__/utils/queryClassifier.test.ts
bun test src/__tests__/utils/loreRetrieval.test.ts
bun test src/__tests__/actions/loreCommand.test.ts

# Watch mode
bun test --watch

# Coverage report
bun test --coverage
```

---

## 📁 Test Organization

```
pepe-tg/src/__tests__/
├── bootstrap-suppression.test.ts    # Pre-commit hook test
├── actions/
│   ├── fakeVisualCommand.test.ts    # /fv command tests
│   ├── fakeTestCommand.test.ts      # /ft command tests
│   └── loreCommand.test.ts          # /fl command tests
├── utils/
│   ├── visionAnalyzer.test.ts       # Shared vision utility tests
│   ├── queryClassifier.test.ts      # FACTS/LORE classification tests
│   └── loreRetrieval.test.ts        # Memory priority & source boost tests
└── integration/
    └── visual-commands.test.ts      # Plugin routing tests
```

**Note:** Additional test files exist from ElizaOS framework but are not actively maintained as part of this project.

---

## ✅ Test Checklist

Before deploying:

- [ ] All 8 custom tests pass (100+ tests)
- [ ] Pre-commit hook validates (bootstrap suppression)
- [ ] Manual testing completed (see manual test plan)
- [ ] No linting errors
- [ ] Cost tracking verified in logs

---

## 🔄 Pre-Commit Hook

**Location:** `.git/hooks/pre-commit`

**What it does:** Runs `bootstrap-suppression.test.ts` before every commit

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

**Last Updated:** October 28, 2025  
**Test Framework:** Bun Test  
**Coverage:** 8 custom test files, 100+ tests

