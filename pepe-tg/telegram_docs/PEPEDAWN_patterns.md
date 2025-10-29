### PEPEDAWN patterns vs ElizaOS guidance

- **References**: [ElizaOS Plugin Patterns](https://docs.elizaos.ai/plugins/patterns) • [ElizaOS Plugin Schemas](https://docs.elizaos.ai/plugins/schemas)

---

## Overall compliance score

- **Score**: **7/10**
- **Why**: Strong adherence to Action and Provider patterns, clear Plugin initialization, solid API-integration actions, and clean separation into utils. Deviations: evaluator not wired, limited provider strategy, direct SDK calls bypassing `runtime.useModel`, knowledge orchestration not formalized as a `Service`, minimal action chaining/working-memory usage.

---

## Patterns we use effectively

- **Basic Plugin Structure Pattern** [patterns]
  - Evidence: `src/plugins/fakeRaresPlugin.ts` registers `actions`, `providers`, and `init`.
  - Notes: Clear domain plugin with initialization that starts card index auto-refresh.

- **Action Implementation Pattern** [patterns]
  - Evidence: `src/actions/*.ts` follow `validate` + `handler` + `ActionResult` + optional `callback`.
  - Examples: `basicCommands.ts`, `fakeRaresCard.ts`, `fakeVisualCommand.ts`, `fakeTestCommand.ts`, `loreCommand.ts`, `costCommand.ts`.

- **Handler Callbacks** [patterns]
  - Evidence: Many actions use `callback` to stream immediate feedback (e.g., `fakeVisualCommand.ts`, `fakeTestCommand.ts`).

- **Multi‑Step/API Integration Actions** [patterns]
  - Evidence: `fakeTestCommand.ts` has explicit steps and early exits; `oddsCommand.ts` (viem), `visionAnalyzer.ts` (OpenAI Vision), `visualEmbeddings.ts` (Replicate).

- **Provider Implementation Pattern** [patterns]
  - Evidence: `providers/fakeRaresContext.ts` returns `text`, `values`, `data` aligned with provider expectations.

- **Plugin Initialization Pattern** [patterns]
  - Evidence: `fakeRaresPlugin.init` starts GitHub card index refresh (`utils/cardIndexRefresher.ts`).

---

## Patterns partially used or misapplied

- **Service Plugin Pattern (missing formal services)** [patterns]
  - Observation: `services/knowledgeService.ts` is a functional module, not a `Service` class registered in `plugin.services`.
  - Impact: Harder discovery/lifecycle management; harder to compose with other services.

- **Action Chaining and Working Memory** [patterns]
  - Observation: Minimal use of action chaining (`options.context.previousResults`) and working-memory patterns. Most flows are single-action.
  - Impact: Missed opportunities for orchestration and stateful multi-action workflows.

- **Evaluator usage (unwired)** [patterns]
  - Observation: `evaluators/loreDetector.ts` exists but `fakeRaresPlugin.evaluators` is empty.
  - Impact: Automated post-message lore capture isn’t active.

- **Provider Patterns (conditional/aggregating)** [patterns]
  - Observation: Single context provider; no conditional/aggregating providers.
  - Impact: Less adaptive context composition; missed resilience via aggregation.

- **Model management deviations** [schemas]
  - Observation: `storyComposer.ts` and `visionAnalyzer.ts` call OpenAI SDK directly, bypassing `runtime.useModel`.
  - Impact: Splits telemetry and model governance; requires custom logging and hands-on tuning.

- **Runtime monkey‑patch for token logging** [patterns/schemas]
  - Observation: `tokenLogger.patchRuntimeForTracking` overrides `runtime.useModel`.
  - Impact: Pragmatic, but off the standard service/gateway approach.

---

## Schemas alignment snapshot

- **Plugin schema** [schemas]
  - Used: `name`, `description`, `actions`, `providers`, `init` (in `fakeRaresPlugin.ts`).
  - Not leveraged: `services` (none registered for knowledge), `evaluators` (empty), `events` (not used), `models/routes/tests/dependencies` (not used in this plugin; present only in starter example).

- **ActionResult** [patterns/schemas]
  - Used consistently with `success`, `text`, plus `data/values/metrics` when relevant.

- **Providers** [patterns/schemas]
  - Correct `get(runtime, message, state)` returning `text/values/data`.

- **Services** [schemas]
  - No formal `Service` subclass for knowledge orchestration.

- **Model Management** [schemas]
  - Mixed: both `runtime.useModel` (summaries) and direct SDK usage (stories/vision).

---

## Refactor opportunities (with priority and risk)

| Area/Pattern | Opportunity | Priority | Risk | Suggested change |
| --- | --- | --- | --- | --- |
| Evaluators | Wire `loreDetectorEvaluator` in `fakeRaresPlugin.evaluators` | P1 | Low | Enable post-conversation lore capture and curation |
| Actions (wiring) | Add `educateNewcomerAction` and `oddsCommand` to `plugin.actions` | P1 | Low | Immediate feature activation; small regression risk if env missing |
| Knowledge as Service | Wrap `retrieveKnowledge` in a formal `Service` (e.g., `KnowledgeOrchestratorService`) | P0 | Medium | Requires light DI changes; improves lifecycle/discoverability |
| Model gateway | Introduce a `ModelGatewayService` that centralizes calls; route `storyComposer`/`visionAnalyzer` through it | P0 | Medium | Replace direct SDK calls; preserves premium model selection via config; unify telemetry |
| Token logging | Replace `patchRuntimeForTracking` with gateway/service instrumentation | P1 | Low‑Medium | Simpler surface; avoids monkey‑patching; verify parity of logs |
| Action chaining | Use `options.context.previousResults` for composed workflows (e.g., provider → decision → card/lore) | P2 | Low | Incremental adoption; better reuse and planning |
| Working memory | Persist recent action results and reuse across steps | P2 | Low | Leverages built-in patterns for state accumulation |
| Providers | Add conditional/aggregating providers (e.g., `cardContextProvider`, `userRoleProvider`) | P2 | Low | Better context assembly; small complexity |
| Examples | Add minimal `examples` to large actions (e.g., `fakeRaresCardAction`) | P2 | Very Low | Documentation and tests benefit |
| Events | Consider `events` for telemetry hooks or routing bridges | P3 | Low | Optional; can aid observability |

Legend: P0 = highest priority, P3 = nice-to-have.

---

## Concrete next steps

1. Wire missing components: add `loreDetectorEvaluator`, `educateNewcomerAction`, `oddsCommand` to `fakeRaresPlugin`.
2. Create `KnowledgeOrchestratorService` to host `retrieveKnowledge` orchestration and register it in `plugin.services`.
3. Add `ModelGatewayService` to standardize model calls, route `storyComposer` and `visionAnalyzer` through it, and move token logging into the gateway.
4. Introduce one conditional provider (e.g., card context when a card regex is detected) and one aggregating provider for richer state.
5. Where useful, chain actions using `options.context.previousResults` and save results into working memory for subsequent steps.

---

## Notes and citations

- Patterns and examples referenced from: `ElizaOS Plugin Patterns` ([docs](https://docs.elizaos.ai/plugins/patterns)).
- Schema expectations and component fields referenced from: `ElizaOS Plugin Schemas` ([docs](https://docs.elizaos.ai/plugins/schemas)).
