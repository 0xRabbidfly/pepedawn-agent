/**
 * A day's worth of room chatter, kept for the recap.
 *
 * `roomHistory` cannot be the source: it holds 120 turns over 7 days and
 * prunes, so a busy day in the official channel would be recapped from its
 * last two hours and nothing else. This is an append-only JSONL log with a
 * separate, longer horizon and no per-room cap.
 *
 * It is deliberately a flat file rather than a table in PGlite. The recap is
 * a read-only consumer that must never be able to disturb retrieval, and the
 * database is the thing that corrupts when the process is killed mid-write.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export interface DayTurn {
  roomId: string;
  role: 'user' | 'bot';
  /** Display name as the room sees it. Absent for the bot's own turns. */
  author?: string;
  text: string;
  /** Epoch ms. */
  at: number;
}

/** Turns older than this are dropped on the next prune. */
const KEEP_MS = 8 * 24 * 60 * 60 * 1000;

/** A prune walks the whole file, so it is not done on every append. */
const PRUNE_EVERY = 500;

let sinceLastPrune = 0;

export function dayLogPath(): string {
  return process.env.RECAP_DAYLOG_PATH || join(process.cwd(), 'src', 'data', 'day-log.jsonl');
}

export function appendDayTurn(turn: DayTurn): void {
  try {
    const path = dayLogPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(turn) + '\n', 'utf8');
    if (++sinceLastPrune >= PRUNE_EVERY) {
      sinceLastPrune = 0;
      pruneDayLog();
    }
  } catch {
    // The recap is a nicety. It must never be able to break the message path.
  }
}

export function readDayTurns(roomId: string, fromMs: number, toMs: number): DayTurn[] {
  const path = dayLogPath();
  if (!existsSync(path)) return [];
  const out: DayTurn[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const t = JSON.parse(line) as DayTurn;
      if (t.roomId !== roomId) continue;
      if (t.at < fromMs || t.at >= toMs) continue;
      out.push(t);
    } catch {
      // A truncated final line after an unclean shutdown is not worth dying for.
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export function pruneDayLog(now = Date.now()): number {
  const path = dayLogPath();
  if (!existsSync(path)) return 0;
  const kept: string[] = [];
  let dropped = 0;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const t = JSON.parse(line) as DayTurn;
      if (now - t.at <= KEEP_MS) kept.push(line);
      else dropped++;
    } catch {
      dropped++;
    }
  }
  const tmp = path + '.tmp';
  writeFileSync(tmp, kept.length ? kept.join('\n') + '\n' : '', 'utf8');
  renameSync(tmp, path);
  return dropped;
}

/** Midnight-to-midnight in the runtime's own timezone, `daysAgo` days back. */
export function dayBounds(daysAgo = 0, now = new Date()): { from: number; to: number; label: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 1);
  const label = start
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();
  return { from: start.getTime(), to: end.getTime(), label };
}

/** Exposed for tests. */
export function _resetPruneCounter(): void {
  sinceLastPrune = 0;
}
