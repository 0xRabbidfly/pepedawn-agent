# Transaction Monitoring Architecture

## Overview

The transaction monitoring feature tracks Fake Rare market activity on the Counterparty blockchain and posts notifications to Telegram. This document justifies the architectural decisions made.

---

## Architecture Decisions

### 1. Separate Plugin: `marketTransactionReporterPlugin`

**Decision**: Keep as separate plugin from `fakeRaresPlugin`

**Justification**:
- **Independent Lifecycle**: Transaction monitoring can be enabled/disabled without affecting card display features
- **Different Concerns**: Card querying vs market monitoring are distinct features
- **Optional Feature**: Some deployments may only want card display, not market monitoring
- **Easier Testing**: Can test market monitoring in isolation
- **Clear Boundaries**: Services, actions, and types are logically grouped

**Trade-off**: Slight overhead of separate plugin registration vs better modularity

---

### 2. Separate Database: `TransactionHistory` Service

**Decision**: Use dedicated PGLite database (`data/transactions/`) instead of `runtime.databaseAdapter`

**Justification**:

#### **Separation of Concerns**
- **Agent Memories ≠ Business Data**: ElizaOS database stores conversation history, facts, and relationships. Transaction data is application-specific business logic.
- **Different Lifecycles**: 
  - Agent memories persist indefinitely
  - Transactions purge after 30 days (via auto-purge)
- **Schema Independence**: Custom transaction schema with domain-specific constraints (CHECK clauses, specialized indexes)

#### **Risk Mitigation**
- **Framework Isolation**: ElizaOS upgrades won't affect transaction data
- **Migration Safety**: Database migrations for transactions don't risk corrupting agent memories
- **Rollback Safety**: Can reset transaction database without losing agent state

#### **Performance**
- **Query Optimization**: Indexes optimized for transaction queries (timestamp DESC, type+timestamp)
- **No Lock Contention**: Transaction writes don't compete with memory searches
- **Dedicated Connection**: Separate connection pool for transaction operations

#### **Operational Benefits**
- **Independent Backups**: Can backup/restore transaction database separately
- **Selective Purging**: 30-day auto-purge without touching agent memories
- **Clear Data Ownership**: `data/transactions/` clearly separates application data from framework data

**Trade-off**: Additional database file vs cleaner separation and reduced risk

**Alternative Considered**: Using `runtime.databaseAdapter` with custom tables
- **Rejected Because**: 
  - Mixing concerns (agent state + business data)
  - Risk of schema conflicts with ElizaOS
  - Harder to reason about data lifecycle
  - Purge logic would need to be extremely careful not to touch framework tables

---

### 3. Type Organization: `types/` Instead of `models/` and `events/`

**Decision**: Consolidate into `types/` directory matching ElizaOS conventions

**Before** (Inconsistent):
```
src/
  models/
    transaction.ts
    fakeRareAsset.ts
  events/
    transactionEvents.ts
  types/
    memory.ts
    ...
```

**After** (Consistent):
```
src/
  types/
    transaction.ts
    transactionEvents.ts
    fakeRareAsset.ts
    memory.ts
    ...
```

**Justification**:
- **Framework Alignment**: ElizaOS uses `types/` for all TypeScript interfaces
- **Single Source**: One place to look for all type definitions
- **Reduced Confusion**: No ambiguity between "models" and "types"
- **Matches Core**: Aligns with ElizaOS core's organization pattern

---

### 4. Custom Events: `FakeRareTransactionEvent`

**Decision**: Use `runtime.emit()` / `runtime.on()` for inter-service communication

**Justification**:
- **Decoupling**: TransactionMonitor doesn't need to know about TelegramNotification
- **Extensibility**: Easy to add new listeners (e.g., analytics, Discord notifications)
- **Type Safety**: `FakeRareTransactionEvent` interface ensures consistent payloads
- **Framework Support**: [ElizaOS officially supports custom events](https://docs.elizaos.ai/runtime/events)

**Alternative Considered**: Direct service calls
- **Rejected Because**: Tight coupling, harder to extend, violates single responsibility

---

## Component Breakdown

### Services (4)

| Service | Responsibility | Why Separate |
|---------|---------------|--------------|
| `TransactionHistory` | Database CRUD | Encapsulates all database logic |
| `TokenScanClient` | HTTP API wrapper | Reusable, handles retries/rate-limiting |
| `TransactionMonitor` | Polling scheduler | Orchestrates polling + filtering |
| `TelegramNotificationService` | Event handler | Formats and sends notifications |

**Design Pattern**: Each service has single responsibility, can be tested independently

### Actions (1)

| Action | Purpose |
|--------|---------|
| `fakeMarketAction` | `/fm` command handler for querying transaction history |

**Design Pattern**: Thin action layer delegates to `TransactionHistory` service

### Types (3)

| Type File | Contents |
|-----------|----------|
| `transaction.ts` | Core transaction data structures |
| `transactionEvents.ts` | Event payload interfaces |
| `fakeRareAsset.ts` | Asset configuration types |

**Design Pattern**: Domain-driven type organization

---

## Data Flow

```
1. TransactionMonitor (every 3 min)
   ↓ polls
2. TokenScanClient → TokenScan API
   ↓ returns raw data
3. TransactionMonitor → filters for Fake Rares
   ↓ stores
4. TransactionHistory (PGLite DB)
   ↓ emits event
5. runtime.emit('fakeRareTransaction')
   ↓ handled by
6. TelegramNotificationService
   ↓ formats & sends
7. Telegram Channel
```

---

## ElizaOS Compliance

All components follow [ElizaOS Plugin Component patterns](https://docs.elizaos.ai/plugins/components):

- ✅ **Plugin**: Registers services, actions, providers, evaluators
- ✅ **Services**: Extend `Service`, implement `start()` / `stop()` lifecycle
- ✅ **Actions**: Implement `Action` interface, return `ActionResult` with `success`
- ✅ **Events**: Use `runtime.emit()` / `runtime.on()` for custom events
- ✅ **Types**: All in `types/` directory matching framework convention

---

## Future Enhancements

### Without Architecture Changes:
- Add Discord notification listener (just add new service)
- Add analytics service (just listen to transaction events)
- Add transaction export (query via TransactionHistory)

### Would Require Changes:
- Multi-chain support (need to abstract blockchain client)
- Real-time WebSocket (replace polling with push)
- Historical backfill (need cursor management)

---

## Summary

This architecture prioritizes:
1. **Separation of Concerns**: Framework data ≠ business data
2. **Modularity**: Each service has clear responsibility
3. **Extensibility**: Easy to add new features via events
4. **Risk Mitigation**: Changes can't corrupt agent memories
5. **Framework Alignment**: Follows ElizaOS patterns where applicable

The slight overhead of separate database and plugin is justified by improved maintainability, reduced risk, and clearer boundaries.

