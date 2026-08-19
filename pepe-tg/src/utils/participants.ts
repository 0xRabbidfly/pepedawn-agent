/**
 * Who is actually part of this community, and since when.
 *
 * Exists to make vouching meaningful. A vouch threshold with no notion of
 * standing is defeated by the cheapest possible attack: register N accounts,
 * have them vouch for each other. The 2026-08-19 abuse was already automated,
 * so assuming the attacker will not spin up accounts is not safe.
 *
 * The rule that does the work is not the message count, it is `firstSeenAt`
 * predating the proposal: an account created to rubber-stamp a specific
 * submission cannot have been talking before that submission existed.
 *
 * Keyed on the Telegram user id, the same identity /fr and the rate limiter
 * use, so standing, authorship and penalties all refer to one person.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export interface Participant {
  id: string;
  name?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  messages: number;
}

export interface StandingConfig {
  /** Messages on record before a person may vouch. */
  minMessages: number;
  /** How long they must have been around before they may vouch. */
  minAgeMs: number;
}

export const DEFAULT_STANDING: StandingConfig = {
  minMessages: 5,
  minAgeMs: 24 * 60 * 60 * 1000,
};

function storePath(): string {
  return process.env.PARTICIPANTS_PATH || join(process.cwd(), 'src', 'data', 'participants.json');
}

let cache: Record<string, Participant> | null = null;
let dirtySince = 0;

function read(): Record<string, Participant> {
  if (cache) return cache;
  const path = storePath();
  try {
    cache = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

function persist(): void {
  const path = storePath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache ?? {}), 'utf8');
  renameSync(tmp, path);
  dirtySince = 0;
}

/** Flush interval. Every message writing to disk would itself be a load problem. */
const FLUSH_MS = 30 * 1000;

/** Record that this person spoke. Called for every user message. */
export function noteParticipant(
  id: string | undefined,
  name: string | undefined,
  now: number = Date.now()
): void {
  if (!id) return;
  const all = read();
  const existing = all[id];
  if (existing) {
    existing.lastSeenAt = now;
    existing.messages += 1;
    if (name) existing.name = name;
  } else {
    all[id] = { id, name, firstSeenAt: now, lastSeenAt: now, messages: 1 };
    // A first sighting is the fact vouching depends on, so it is written
    // immediately rather than waiting for the flush window.
    persist();
    return;
  }
  if (!dirtySince) dirtySince = now;
  if (now - dirtySince >= FLUSH_MS) persist();
}

export function getParticipant(id: string): Participant | undefined {
  return read()[id];
}

/**
 * May this person vouch for something proposed at `proposedAt`?
 *
 * `proposedAt` is load-bearing: standing must predate the proposal, or an
 * account made in response to it would qualify by the time it voted.
 */
export function hasStanding(
  id: string,
  proposedAt: number,
  now: number = Date.now(),
  config: StandingConfig = DEFAULT_STANDING
): boolean {
  const p = read()[id];
  if (!p) return false;
  if (p.firstSeenAt >= proposedAt) return false;
  if (p.messages < config.minMessages) return false;
  return now - p.firstSeenAt >= config.minAgeMs;
}

/** Force a write. For shutdown paths and tests. */
export function flushParticipants(): void {
  if (cache) persist();
}

/** Testing seam. */
export function _resetCache(): void {
  cache = null;
  dirtySince = 0;
}
