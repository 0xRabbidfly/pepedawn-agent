/**
 * Per-user command rate limiting with an escalating silence ladder.
 *
 * Written after 2026-08-19, when someone pointed a bot at /fr and pushed 21
 * submissions through in 18 minutes - seven identical ones inside 11 seconds.
 * Content gating (utils/loreSubmission.ts) rejects what they wrote; this stops
 * the flood itself, which costs model calls and database writes whether or not
 * the content is ultimately accepted.
 *
 * Ladder: exceed the burst threshold and you are silenced 10 minutes, then an
 * hour, then a day, then a week for continued abuse. Escalation is the standard
 * shape for this - a fixed penalty is worth retrying, a growing one is not.
 *
 * Two properties that matter and are easy to get wrong:
 *
 *  - **It must persist.** Production restarts nightly at 02:00 and on every
 *    deploy. An in-memory limiter forgets a day-long silence within hours, so
 *    the ladder is written to disk.
 *  - **The ladder must decay.** Without it, one bad afternoon leaves a user at
 *    the top rung forever. A clean stretch resets them to the bottom.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export interface RateLimitConfig {
  /** Commands allowed inside the window before the ladder engages. */
  maxPerWindow: number;
  windowMs: number;
  /** Silence durations by offence number. The last entry repeats. */
  ladderMs: number[];
  /**
   * Clean time after a silence lifts before the offence level resets to zero.
   */
  decayMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxPerWindow: 5,
  windowMs: 60 * 1000,
  ladderMs: [
    10 * 60 * 1000,      // 10 minutes
    60 * 60 * 1000,      // 1 hour
    24 * 60 * 60 * 1000, // 1 day
    7 * 24 * 60 * 60 * 1000, // 1 week, and stays here
  ],
  decayMs: 7 * 24 * 60 * 60 * 1000,
};

export interface UserRecord {
  /** Recent command timestamps, trimmed to the window. */
  hits: number[];
  /** How many times this user has tripped the limit. */
  level: number;
  /** Silenced until this epoch ms. */
  silencedUntil?: number;
  /**
   * When the last silence ended. Ladder decay is measured from here, not from
   * the offence: otherwise serving a long ban decays the ladder by itself, and
   * a user who reoffends the moment a week-long silence lifts starts again at
   * ten minutes.
   */
  clearedAt?: number;
}

export interface RateVerdict {
  allowed: boolean;
  /** True only on the transition into silence, so we warn exactly once. */
  justSilenced: boolean;
  silencedUntil?: number;
  level: number;
  /** Human-readable penalty, e.g. "10 minutes". */
  penalty?: string;
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Record a command and decide whether it may proceed.
 *
 * Mutates `record` in place; the caller persists it.
 */
export function evaluateRate(
  record: UserRecord,
  now: number,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): RateVerdict {
  // Still serving a silence: stay quiet, and do not extend it just for trying.
  // Extending on every retry lets a bot in a tight loop push the ban to
  // infinity, which is indistinguishable from a permanent ban by accident.
  if (record.silencedUntil && now < record.silencedUntil) {
    return { allowed: false, justSilenced: false, silencedUntil: record.silencedUntil, level: record.level };
  }

  // Ladder decay: a clean stretch since the last silence lifted wipes the slate.
  if (record.clearedAt && now - record.clearedAt >= config.decayMs) {
    record.level = 0;
    record.clearedAt = undefined;
  }

  record.hits = record.hits.filter((t) => now - t < config.windowMs);
  record.hits.push(now);

  if (record.hits.length <= config.maxPerWindow) {
    return { allowed: true, justSilenced: false, level: record.level };
  }

  // Tripped. Escalate one rung, capped at the top of the ladder.
  const rung = Math.min(record.level, config.ladderMs.length - 1);
  const duration = config.ladderMs[rung];
  record.level = Math.min(record.level + 1, config.ladderMs.length);
  record.silencedUntil = now + duration;
  record.clearedAt = record.silencedUntil;
  // Clear the window so the silence, not the backlog, governs what happens next.
  record.hits = [];

  return {
    allowed: false,
    justSilenced: true,
    silencedUntil: record.silencedUntil,
    level: record.level,
    penalty: formatDuration(duration),
  };
}

/* ------------------------------------------------------------- persistence */

function storePath(): string {
  return process.env.RATE_LIMIT_PATH || join(process.cwd(), 'src', 'data', 'rate-limits.json');
}

let cache: Record<string, UserRecord> | null = null;

function read(): Record<string, UserRecord> {
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
}

/**
 * The call site: record one command from `userId` and say whether to serve it.
 *
 * Admins are never limited - a locked-out admin cannot lift anyone else's ban.
 */
export function checkRateLimit(
  userId: string,
  now: number = Date.now(),
  opts: { isAdmin?: boolean } = {},
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): RateVerdict {
  if (opts.isAdmin) return { allowed: true, justSilenced: false, level: 0 };

  const all = read();
  const record: UserRecord = all[userId] ?? { hits: [], level: 0 };
  const verdict = evaluateRate(record, now, config);
  all[userId] = record;

  // Only write when something durable changed. A silenced user hammering the
  // bot would otherwise cause a disk write per message - the DOS, relocated.
  if (verdict.justSilenced || verdict.allowed) persist();

  return verdict;
}

/** Lift a silence. For an admin unban. */
export function clearRateLimit(userId: string): boolean {
  const all = read();
  if (!all[userId]) return false;
  delete all[userId];
  persist();
  return true;
}

/** Currently silenced users, for admin review. */
export function silencedUsers(now: number = Date.now()): Array<{ userId: string } & UserRecord> {
  const all = read();
  return Object.entries(all)
    .filter(([, r]) => r.silencedUntil && r.silencedUntil > now)
    .map(([userId, r]) => ({ userId, ...r }));
}

/** Testing seam. */
export function _resetCache(): void {
  cache = null;
}
