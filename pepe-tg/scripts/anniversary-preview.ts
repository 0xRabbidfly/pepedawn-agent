#!/usr/bin/env bun
/**
 * Run the anniversary timeline without Telegram.
 *
 *   bun scripts/anniversary-preview.ts --dry-run
 *       Prints the whole plan in event-local time, then ticks against the real
 *       clock, logging every send it would make. Ctrl-C to stop.
 *
 *   bun scripts/anniversary-preview.ts --fast-forward
 *       Runs the entire day in about two minutes on a fake clock, with three
 *       pretend players answering each trivia question, so the reveals and the
 *       final leaderboard render. This is the same engine and the same code
 *       path the bot runs; only the clock and the sends are swapped.
 *
 * State goes to a scratch file (ANNIVERSARY_STATE_PATH, default under the OS
 * temp dir), never the live one. The schedule is read from
 * ANNIVERSARY_SCHEDULE_PATH or src/data/fakerares5-schedule.json.
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';
import { AnniversaryEngine, planDay, type Effects } from '../src/conversation/anniversary';
import { FileAnniversaryStore, handleTriviaTap, loadSchedule, schedulePath, _resetAnniversary } from '../src/conversation/anniversaryRuntime';
import { FULL_CARD_INDEX } from '../src/data/fullCardIndex';

const args = process.argv.slice(2);
const fastForward = args.includes('--fast-forward');
const dryRun = args.includes('--dry-run') || fastForward;
if (!dryRun) {
  console.error('Pass --dry-run or --fast-forward. This script never sends to Telegram.');
  process.exit(1);
}

const statePath = process.env.ANNIVERSARY_STATE_PATH || join(tmpdir(), `fakerares5-preview-${process.pid}.json`);
process.env.ANNIVERSARY_STATE_PATH = statePath;
process.env.ANNIVERSARY_ENABLED = 'true';
_resetAnniversary();

const schedule = loadSchedule(schedulePath());
if (!schedule) process.exit(1);
const tz = schedule.event.timezone;
const stamp = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', { timeZone: tz, hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

let fakeNow = 0;
let messageIds = 1000;
const effects: Effects = {
  sendText: async (chatId, text) => { console.log(`\n[${stamp(fakeNow)}] → ${chatId} TEXT\n${indent(text)}`); return ++messageIds; },
  sendCard: async (chatId, card, caption) => { console.log(`\n[${stamp(fakeNow)}] → ${chatId} CARD ${card.asset} (S${card.series} ${card.ext})\n${indent(caption)}`); return true; },
  sendQuestion: async (chatId, text, buttons) => {
    console.log(`\n[${stamp(fakeNow)}] → ${chatId} QUESTION\n${indent(text)}\n${indent(buttons.map((b) => `[ ${b.label} ]`).join('  '))}`);
    return ++messageIds;
  },
  editMessage: async (chatId, messageId, text) => { console.log(`\n[${stamp(fakeNow)}] ✎ ${chatId} #${messageId} EDIT\n${indent(text)}`); return true; },
  log: (line) => console.log(`[${stamp(fakeNow)}] · ${line}`),
};
const chatIds = schedule.event.chat_ids?.length ? schedule.event.chat_ids : ['-100PREVIEW'];
// Deliberately NOT the runtime's shared store: in production the plugin that
// takes trivia taps holds its own copy of the state, so the preview's taps go
// through a second instance too. If the leaderboard renders, the merge works.
const engine = new AnniversaryEngine({ schedule, store: new FileAnniversaryStore(statePath), cards: FULL_CARD_INDEX, effects, chatIds });

console.log(`Fake Rares 5 — ${schedule.event.date} ${tz} — ${engine.plan.length} items\n`);
for (const line of engine.describe()) console.log('  ' + line);

if (!fastForward) {
  console.log('\nTicking against the real clock. Nothing is sent. Ctrl-C to stop.\n');
  const loop = async () => { fakeNow = Date.now(); await engine.tick(fakeNow); };
  await loop();
  setInterval(() => void loop(), 20_000);
} else {
  // 24 hours in ~1440 one-minute steps. A short pause per step keeps the output readable.
  const players = [
    { id: 1, first_name: 'Crypsi' }, { id: 2, first_name: 'Coit' }, { id: 3, first_name: 'FWD' },
  ];
  const plan = planDay(schedule);
  const answered = new Set<string>();
  fakeNow = engine.day.start - 60_000;
  const end = engine.day.end + 60_000;
  const t0 = Date.now();
  while (fakeNow < end) {
    await engine.tick(fakeNow);
    // Pretend players tap two minutes after each question goes out.
    for (const item of plan) {
      if (item.kind !== 'trivia' || answered.has(item.id) || fakeNow < item.at + 2 * 60_000) continue;
      answered.add(item.id);
      players.forEach((p, i) => {
        const option = i === 0 ? item.question.answer : (item.question.answer + i) % item.question.options.length;
        const toast = handleTriviaTap(`fr5:t:${item.id}:${option}`, p, fakeNow);
        console.log(`[${stamp(fakeNow)}] ${p.first_name} taps "${item.question.options[option]}" → ${toast}`);
      });
      const again = handleTriviaTap(`fr5:t:${item.id}:0`, players[1], fakeNow + 1000);
      console.log(`[${stamp(fakeNow)}] Coit taps again → ${again}`);
    }
    fakeNow += 60_000;
    await new Promise((r) => setTimeout(r, 70));
  }
  console.log(`\nDay done in ${((Date.now() - t0) / 1000).toFixed(0)}s of real time. State was at ${statePath}`);
  rmSync(statePath, { force: true });
}

function indent(text: string): string {
  return text.split('\n').map((l) => '    ' + l).join('\n');
}
