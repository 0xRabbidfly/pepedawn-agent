# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Node 23 + Bun, Python 3.11, etc., or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., ElizaOS, Telegram API SDK, etc., or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, SQLite, files or N/A]  
**Verification (optional)**: [e.g., manual chat flow checklist, scripts, or N/A]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [single/web/mobile - determines source structure]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

[Gates determined based on constitution file]

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

**Structure is already in place - do NOT modify

```
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

# [OPTIONAL] tests/ (include only if explicitly requested)
# ├── contract/
# ├── integration/
# └── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── [OPTIONAL] tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

### Implementation Plan: LLM-LORE

Branch: 001-llm-lore | Date: 2025-10-20 | Spec: /home/nuno/projects/Fake-Rare-TG-Agent/specs/001-llm-lore/spec.md
Input: Feature specification from `/specs/001-llm-lore/spec.md`

## Summary

Build LLM-LORE: a local RAG pipeline over Telegram history and pepe.wtf wiki (pglite). Retrieve diverse evidence via local vector DB, summarize clusters, then generate persona-aligned stories that vary slightly while remaining grounded. Clarified: global retrieval scope, compact source IDs, fallback expansion (wiki → global chats), 120–180 words. Embeddings are already precomputed in pglite and fetched by the knowledge plugin.

## Technical Context

Language/Version: Node.js 20+ with Bun 1.0+; TypeScript
Primary Dependencies: ElizaOS core and plugins (`@elizaos/plugin-bootstrap`, `@elizaos/plugin-openai`, `@elizaos/plugin-sql`, `@elizaos/plugin-knowledge`, `@elizaos/plugin-telegram`); Telegram Bot API
Storage: pglite for wiki; local vector DB with precomputed embeddings accessed via knowledge plugin (no embedding generation during runtime)
Verification: Manual Telegram chat flows; logs for hits/latency/tokens
Target Platform: Linux server and local dev (WSL2/Linux)
Project Type: Single repository, Telegram agent with plugins (`pepe-tg`)
Performance Goals: P95 ≤ 2.5s warmed; ≤ 5s cold
Constraints: Compact replies; privacy by design; compact sources line
Scale/Scope: Multi-chat org retrieval; retrieval cap 24; clusters 4–6

## Constitution Check

Single-Responsibility: Focused lore slice. PASS
Config & Secret Hygiene: env-based (`VECTOR_DB_DSN`, table names). PASS
Stable Chat Contracts: No breaking changes; `/f` intact. PASS
Observability & Resilience: Structured logs, safe fallbacks. PASS
Versioned Delivery: CHANGELOG + minor bump. PASS

Gate: PASS

## Project Structure

Documentation (this feature)
```
specs/001-llm-lore/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── openapi.yaml
```

Source Code (repository root)
```
pepe-tg/
└── src/
    ├── actions/
    │   ├── loreCommand.ts
    │   ├── shareLore.ts
    │   └── fakeRaresCard.ts
    ├── plugins/
    │   └── fakeRaresPlugin.ts
    ├── providers/
    ├── utils/
    │   └── cardIndexRefresher.ts
    └── pepedawn.ts
```

Structure Decision: Extend existing `pepe-tg` plugin/action structure. Wire lore retrieval via `fakeRaresPlugin.ts` (core routing), re-use `loreCommand.ts`/`shareLore.ts` for initiating RAG, persona in `pepedawn.ts`, knowledge via `@elizaos/plugin-knowledge` reading precomputed embeddings from pglite.

## Phase 0: Outline & Research

Unknowns resolved in `research.md`: retrieval diversification (MMR/cluster), summarization prompts, pglite schema shape, rate limiting, error states.

## Phase 1: Design & Contracts

Artifacts: `data-model.md` (entities/fields), `contracts/openapi.yaml` (internal lore endpoint), `quickstart.md` (env + run), agent context updated.


