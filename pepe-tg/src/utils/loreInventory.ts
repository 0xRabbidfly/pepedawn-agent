/**
 * Ledger of accepted /fr lore submissions.
 *
 * The knowledge base is the retrieval store; this file is the authority on
 * quota and provenance. They are separate on purpose:
 *
 *  - Counting via vector search cannot enforce a hard cap. Recall depends on a
 *    similarity threshold, so an entry that scores below it is invisible to the
 *    count and the third, fourth, fifth submission all sail through.
 *  - The 2026-08-19 abuse could not be attributed or reversed, because storage
 *    kept no record of who wrote what. Every accepted entry is logged here with
 *    its submitter, so a purge is a filter rather than an archaeology exercise.
 *
 * Small, append-mostly, and rewritten atomically - the same shape as
 * conversation/fileRoomHistoryStore.ts.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export interface LoreEntry {
  card: string;
  lore: string;
  submitterId?: string;
  submitterName?: string;
  at: number;
  /** Document id returned by the knowledge service, for later removal. */
  memoryId?: string;
}

/**
 * Resolved per call, not at import time. ESM hoists imports above any
 * assignment a test makes to process.env, so a module-level constant here
 * silently pointed the test suite at the real ledger.
 */
function ledgerPath(): string {
  return process.env.LORE_LEDGER_PATH || join(process.cwd(), 'src', 'data', 'lore-ledger.json');
}

let cache: LoreEntry[] | null = null;

function read(): LoreEntry[] {
  if (cache) return cache;
  const path = ledgerPath();
  try {
    cache = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
  } catch {
    // A corrupt ledger must not take the bot down, but it must not silently
    // reset the quota either - an empty read is logged by the caller.
    cache = [];
  }
  return cache!;
}

function write(entries: LoreEntry[]): void {
  cache = entries;
  const path = ledgerPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf8');
  renameSync(tmp, path);
}

/** How many lore entries this card already holds. */
export async function countLoreForCard(_runtime: unknown, card: string): Promise<number> {
  const upper = card.toUpperCase();
  return read().filter((e) => e.card === upper).length;
}

/** Existing lore text for this card, for duplicate rejection. */
export async function existingLoreTexts(_runtime: unknown, card: string): Promise<string[]> {
  const upper = card.toUpperCase();
  return read().filter((e) => e.card === upper).map((e) => e.lore);
}

/** Record an accepted submission. Called only after storage succeeds. */
export async function recordLore(entry: LoreEntry): Promise<void> {
  write([...read(), { ...entry, card: entry.card.toUpperCase() }]);
}

/** Everything on record, newest first. For admin review. */
export function allLore(): LoreEntry[] {
  return [...read()].sort((a, b) => b.at - a.at);
}

/** Drop entries matching a predicate. Returns what was removed. */
export function removeLore(match: (entry: LoreEntry) => boolean): LoreEntry[] {
  const entries = read();
  const removed = entries.filter(match);
  if (removed.length) write(entries.filter((e) => !match(e)));
  return removed;
}

/** Testing seam. */
export function _resetCache(): void {
  cache = null;
}
