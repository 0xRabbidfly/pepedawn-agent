# Tasks — LLM-LORE

## Phase 1 — Setup

- [X] T001 Confirm precomputed embeddings tables exist in pglite (EMBEDDING_TABLES) in specs/001-llm-lore/spec.md
- [X] T002 Add/verify env vars: TEXT_MODEL, VECTOR_DB_DSN, RETRIEVAL_LIMIT, MIN_HITS, STORY_LENGTH_WORDS in pepe-tg/.env.example
- [X] T003 Update README quickstart reference to new env keys in README.md

## Phase 2 — Foundational

- [X] T004 Wire knowledge plugin provider access to pglite DSN in pepe-tg/src/providers (ensure provider config reads VECTOR_DB_DSN)
- [X] T005 [P] Add retrieval utility for vector search + MMR in pepe-tg/src/utils/loreRetrieval.ts
- [X] T006 Add summarization helper with token budgeting in pepe-tg/src/utils/loreSummarize.ts
- [X] T007 Define constants for retrieval limits and clustering in pepe-tg/src/utils/loreConfig.ts

## Phase 3 — US1: Ask for lore by natural phrase (P1)

Goal: As a user, I can ask "tell me about the purple subasset era" and get a grounded, fun story with sources.

- [X] T008 [US1] Detect lore intent and extract query in pepe-tg/src/actions/loreCommand.ts
- [X] T009 [US1] Call knowledge plugin to retrieve top-K passages (global scope) in pepe-tg/src/actions/loreCommand.ts
- [X] T010 [US1] Cluster and summarize with citations in pepe-tg/src/actions/loreCommand.ts
- [X] T011 [US1] Generate persona story (120–180 words) with sources line in pepe-tg/src/actions/loreCommand.ts
- [X] T012 [US1] Send Telegram message with truncation guard in pepe-tg/src/actions/loreCommand.ts
- [X] T013 [P] [US1] Add logging: query, hits_raw/used, clusters, latency_ms in pepe-tg/src/actions/loreCommand.ts

## Phase 4 — US2: Fallback expansion (P1)

Goal: If too few results, expand wiki → global chats automatically.

- [X] T014 [US2] Implement MIN_HITS check and staged expansion in pepe-tg/src/actions/loreCommand.ts
- [X] T015 [P] [US2] Add query expansion synonyms/aliases in pepe-tg/src/utils/loreRetrieval.ts

## Phase 5 — US3: Compact sources line (P2)

Goal: Show compact one-line sources.

- [X] T016 [US3] Format compact IDs (tg:ID, wiki:slug/anchor) in pepe-tg/src/utils/loreSummarize.ts
- [X] T017 [P] [US3] Include sources line in final message in pepe-tg/src/actions/loreCommand.ts

## Phase 6 — Polish & Ops

- [X] T018 Add feature flags for temperature/top_p, retrieval limits in pepe-tg/src/utils/loreConfig.ts
- [X] T019 Ensure no leakage of PII/secrets in logs in pepe-tg/src/actions/loreCommand.ts
- [X] T020 Update CHANGELOG with LLM-LORE feature in CHANGELOG.md

## Dependencies

US1 → US2 → US3

## Parallel Opportunities

- T005, T006, T007 can run in parallel
- T013, T015, T017 can run in parallel after US1 core tasks

## MVP Scope

- Complete US1 tasks (T008–T013)
