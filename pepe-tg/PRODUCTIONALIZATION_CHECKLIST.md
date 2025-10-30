# Productionalization Checklist

## ✅ Completed

### Duplicate/Backup Files
- [x] Removed `src/services/transactionMonitor_fixed.ts`
- [x] Removed `src/services/transactionMonitor.ts.corrupt`

---

## 📋 To Review

### Console.log Statements (20 files)
Many files use `console.log/debug/info` instead of `logger`:

**Core Logic:**
- `src/plugins/fakeRaresPlugin.ts` - Message routing logs
- `src/services/MemoryStorageService.ts` - Memory storage logs
- `src/services/KnowledgeOrchestratorService.ts` - Knowledge retrieval logs
- `src/services/TelemetryService.ts` - Cost tracking logs

**Utils:**
- `src/utils/loreRetrieval.ts`
- `src/utils/loreSummarize.ts`
- `src/utils/storyComposer.ts`
- `src/utils/modelGateway.ts`
- `src/utils/visualEmbeddings.ts`
- `src/utils/embeddingsDb.ts`
- `src/utils/cardCache.ts`
- `src/utils/actionLogger.ts`
- `src/utils/cardIndexRefresher.ts`

**Actions:**
- `src/actions/loreCommand.ts`
- `src/actions/fakeRaresCard.ts`
- `src/actions/educateNewcomer.ts`

**Data:**
- `src/data/fullCardIndex.ts`
- `src/data/cardSeriesMap.ts`

**Main:**
- `src/index.ts`

**Recommendation**: Replace `console.*` with `logger.*` for production-ready logging with levels.

---

### Untracked Files (Need to add to git)

**New Features:**
- `src/actions/fakeMarketAction.ts` - /fm command
- `src/services/transactionMonitor.ts` - Transaction monitoring
- `src/services/transactionHistory.ts` - Database service
- `src/services/tokenscanClient.ts` - API client
- `src/services/telegramNotification.ts` - Notifications
- `src/plugins/marketTransactionReporterPlugin.ts` - Plugin container
- `src/types/transaction.ts` - Type definitions
- `src/types/transactionEvents.ts` - Event types
- `src/types/fakeRareAsset.ts` - Asset types

**Data/Runtime:**
- `:memory:/` - Temporary directory (should be in .gitignore)
- `pepe-tg/data/` - Runtime data (should be in .gitignore) (except src/data - keep that as tracked)

**Scripts:**
- `scripts/copy-pglite.sh` - Production script

**Docs:**
- `telegram_docs/PEPEDAWN_Market_SVC.md` - Feature documentation


**Recommendation**: Add new feature files to git, update .gitignore for runtime directories.

---

### Debug Code Patterns to Consider

**TODO/FIXME Comments:**
```bash
grep -r "TODO\|FIXME" src/ --include="*.ts" | wc -l
# Run to see count
```

**Debug-only Code:**
```bash
grep -r "DEBUG:" src/ --include="*.ts"
# Any DEBUG: prefixed logs
```

**Commented Code:**
```bash
# Large blocks of commented-out code
```

---

## What NOT to Delete

- ✅ All test files (`src/__tests__/`)
- ✅ All scripts (`scripts/`)
- ✅ All configs (cypress, vite, tailwind)
- ✅ Documentation (`telegram_docs/`, `specs/`)
- ✅ Source code (`src/`)

**These are part of the project structure, not dev artifacts!**

