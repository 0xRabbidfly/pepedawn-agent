/**
 * Action Attribution Context
 *
 * `/fc` reports cost broken down **By Type** (the call site, e.g. "Lore calls")
 * and **By Action** (what the user actually asked for, e.g. `/f` or
 * `smart-router`). The two answer different questions: "Lore calls" cost the
 * same whether it came from a command or from auto-routing, and knowing which
 * is what makes the report actionable.
 *
 * Model calls happen several frames below the point where the action is known,
 * so the label rides along in an AsyncLocalStorage rather than being threaded
 * through every call signature. `TelemetryService.logModelUsage()` reads it as
 * the default for `actionName`.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const actionStore = new AsyncLocalStorage<string>();

/**
 * Run `fn` with every model call inside it attributed to `actionName`.
 * Nesting is allowed — the innermost label wins, so a command dispatched by the
 * smart router is attributed to the command rather than to the router.
 */
export function runWithAction<T>(actionName: string, fn: () => Promise<T>): Promise<T> {
  return actionStore.run(actionName, fn);
}

/** Label for the action currently executing, if any. */
export function getCurrentAction(): string | undefined {
  return actionStore.getStore();
}

/** Bucket for model calls made outside any labelled action. */
export const UNATTRIBUTED_ACTION = '(unattributed)';
