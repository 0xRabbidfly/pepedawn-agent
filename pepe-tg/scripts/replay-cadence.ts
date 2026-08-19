#!/usr/bin/env bun
/**
 * Replay the cadence governor against real production traffic.
 *
 * Answers the only question that matters about the v5 restraint work: would it
 * actually have stopped PEPEDAWN from dominating the room? The design is
 * falsifiable — if the governor still permits January 2026's 67-reply burst,
 * it is wrong.
 *
 * Inputs (produced by TelemetryService, pulled from prod):
 *   smart-router-logs.jsonl  - user messages that reached the router
 *   conversation-logs.jsonl  - bot replies actually sent
 *
 * Usage:
 *   bun scripts/replay-cadence.ts <dir-with-jsonl-files>
 *
 * Known limitations, stated rather than hidden:
 *   - Neither log records roomId, so the whole stream is replayed as one room.
 *     If the bot serves several groups this overstates density. Adding roomId
 *     to telemetry is tracked as part of step 1.
 *   - Slash commands short-circuit before the router, so user volume is
 *     undercounted, which biases share of voice high (i.e. conservative).
 *   - "Addressed" is inferred from the text mentioning pepedawn, since mention
 *     metadata was never logged.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateCadence, DEFAULT_CADENCE_CONFIG } from '../src/conversation/cadenceGovernor';
import type { ConversationTurn } from '../src/conversation/types';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: bun scripts/replay-cadence.ts <dir-with-jsonl-files>');
  process.exit(1);
}

const readJsonl = (name: string): any[] =>
  readFileSync(join(dir, name), 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

const routerLogs = readJsonl('smart-router-logs.jsonl');
const convLogs = readJsonl('conversation-logs.jsonl');

const ADDRESSED = /pepedawn/i;
/** Matches RoomHistory's retention so the replay sees what production would. */
const HISTORY_LIMIT = 120;

type Event = ConversationTurn & { kind: 'user' | 'bot' };

const events: Event[] = [
  ...routerLogs
    .filter((r) => r.timestamp)
    .map((r) => ({
      kind: 'user' as const,
      role: 'user' as const,
      text: String(r.userText ?? ''),
      author: 'user',
      at: Date.parse(r.timestamp),
      addressedBot: ADDRESSED.test(String(r.userText ?? '')),
    })),
  ...convLogs
    .filter((c) => c.timestamp)
    .map((c) => ({
      kind: 'bot' as const,
      role: 'bot' as const,
      text: '',
      at: Date.parse(c.timestamp),
    })),
]
  .filter((e) => !Number.isNaN(e.at))
  .sort((a, b) => a.at - b.at);

console.log(`replaying ${events.length} events ` + `(${routerLogs.length} user, ${convLogs.length} bot)`);

/** Max events in any rolling window. */
function maxBurst(times: number[], windowMs: number): number {
  let max = 0;
  let j = 0;
  for (let i = 0; i < times.length; i++) {
    while (times[i] - times[j] > windowMs) j++;
    max = Math.max(max, i - j + 1);
  }
  return max;
}

function summarise(label: string, botTimes: number[], totalUser: number) {
  const gaps: number[] = [];
  for (let i = 1; i < botTimes.length; i++) gaps.push(botTimes[i] - botTimes[i - 1]);
  const under = (ms: number) => gaps.filter((g) => g < ms).length;
  const share = totalUser + botTimes.length > 0 ? botTimes.length / (totalUser + botTimes.length) : 0;
  console.log(`\n### ${label}`);
  console.log(`  bot replies          ${botTimes.length}`);
  console.log(`  share of all traffic ${(100 * share).toFixed(1)}%`);
  console.log(`  worst 10-min burst   ${maxBurst(botTimes, 600_000)}`);
  console.log(`  worst 60-min burst   ${maxBurst(botTimes, 3_600_000)}`);
  if (gaps.length) {
    console.log(
      `  replies <60s apart   ${under(60_000)} (${((100 * under(60_000)) / gaps.length).toFixed(1)}%)`
    );
    console.log(
      `  replies <30s apart   ${under(30_000)} (${((100 * under(30_000)) / gaps.length).toFixed(1)}%)`
    );
  }
}

// --- Baseline: what actually happened -------------------------------------
const actualBot = events.filter((e) => e.kind === 'bot').map((e) => e.at);
const userCount = events.filter((e) => e.kind === 'user').length;
summarise('ACTUAL (production)', actualBot, userCount);

// --- Replay: same traffic, governor applied -------------------------------
// The bot "wants" to reply exactly when it actually did; the governor decides
// whether it may. History is rebuilt from replies the governor allowed, so
// suppression compounds the way it would in production.
const history: ConversationTurn[] = [];
const allowed: number[] = [];
const suppressedBy: Record<string, number> = {};

for (const event of events) {
  if (event.kind === 'user') {
    history.push({
      role: 'user',
      text: event.text,
      author: event.author,
      at: event.at,
      addressedBot: event.addressedBot,
    });
    if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
    continue;
  }

  // A bot reply was attempted here. Was the triggering message addressed?
  let addressed = false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') {
      addressed = !!history[i].addressedBot;
      break;
    }
  }

  const verdict = evaluateCadence(history, event.at, { addressed }, DEFAULT_CADENCE_CONFIG);
  if (verdict.cap === 'SILENT') {
    suppressedBy[verdict.reason] = (suppressedBy[verdict.reason] ?? 0) + 1;
    continue;
  }
  allowed.push(event.at);
  history.push({ role: 'bot', text: '', at: event.at });
}

summarise('WITH CADENCE GOVERNOR', allowed, userCount);

console.log('\n### suppression reasons');
const totalSuppressed = Object.values(suppressedBy).reduce((a, b) => a + b, 0);
for (const [reason, n] of Object.entries(suppressedBy).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason.padEnd(24)} ${String(n).padStart(6)}`);
}
console.log(
  `  ${'TOTAL'.padEnd(24)} ${String(totalSuppressed).padStart(6)}` +
    ` (${((100 * totalSuppressed) / actualBot.length).toFixed(1)}% of actual replies)`
);

// --- Per-month worst burst -------------------------------------------------
console.log('\n### worst 10-minute burst by month');
const byMonth = new Map<string, { actual: number[]; governed: number[] }>();
for (const t of actualBot) {
  const m = new Date(t).toISOString().slice(0, 7);
  if (!byMonth.has(m)) byMonth.set(m, { actual: [], governed: [] });
  byMonth.get(m)!.actual.push(t);
}
for (const t of allowed) {
  const m = new Date(t).toISOString().slice(0, 7);
  byMonth.get(m)?.governed.push(t);
}
console.log('month     actual  governed   reduction');
for (const m of [...byMonth.keys()].sort()) {
  const { actual, governed } = byMonth.get(m)!;
  const a = maxBurst(actual, 600_000);
  const g = maxBurst(governed, 600_000);
  const pct = a > 0 ? `${(100 * (1 - g / a)).toFixed(0)}%` : '-';
  console.log(m.padEnd(9) + String(a).padStart(7) + String(g).padStart(10) + pct.padStart(12));
}
