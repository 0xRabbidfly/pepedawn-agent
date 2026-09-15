#!/usr/bin/env bun
/**
 * Run social memory capture over a day log without the bot, and print what it
 * would remember about each person.
 *
 * For judging the capture prompt against real conversation before a change
 * reaches the room — above all, whether the most prolific poster ends up with
 * thirty good memories or thirty pieces of noise.
 *
 * Reads the day log, room map, participant registry and character roster from
 * the usual environment variables, and writes to SOCIAL_MEMORY_PATH, which
 * must be a scratch file: the live one belongs to the running bot.
 *
 * Usage (from pepe-tg/, with copies pulled from the droplet into $DIR):
 *   RECAP_DAYLOG_PATH=$DIR/day-log.jsonl ROOM_MAP_PATH=$DIR/room-map.json \
 *   PARTICIPANTS_PATH=$DIR/participants.json SOCIAL_MEMORY_PATH=$DIR/social-memory.json \
 *   bun scripts/social-memory-preview.ts [--max-sessions N]
 *
 * Re-running continues from the watermark in SOCIAL_MEMORY_PATH; delete that
 * file to start over. Costs one model call per conversation worth reading.
 */

import { resolve, join } from 'path';
import { runCapture } from '../src/conversation/socialMemoryRuntime';
import { socialMemoryPath, socialStore } from '../src/conversation/socialMemoryStore';
import { orderForListing } from '../src/conversation/socialMemory';
import { CAPTURE_SYSTEM_PROMPT } from '../src/conversation/memoryCapture';
import { callTextModel } from '../src/utils/modelGateway';

const live = resolve(join(process.cwd(), 'src', 'data', 'social-memory.json'));
if (!process.env.SOCIAL_MEMORY_PATH || resolve(socialMemoryPath()) === live) {
  console.error('Set SOCIAL_MEMORY_PATH to a scratch file. The live file belongs to the running bot.');
  process.exit(1);
}

const flag = process.argv.indexOf('--max-sessions');
const maxSessions = flag > 0 ? parseInt(process.argv[flag + 1], 10) : undefined;
const model = process.env.SOCIAL_MEMORY_MODEL || process.env.CHAT_MODEL || 'gpt-5.6-luna';
// callTextModel only asks the runtime for telemetry, which a script has none of.
const runtime = { getService: () => null } as any;

const report = await runCapture({
  maxSessions,
  model: async (prompt) =>
    (await callTextModel(runtime, {
      model,
      prompt,
      systemPrompt: CAPTURE_SYSTEM_PROMPT,
      maxTokens: 900,
      source: 'SocialMemory-preview',
    })).text,
});

console.log('\nReport:', report);

const now = Date.now();
const people = socialStore().people().sort((a, b) => b.records.length - a.records.length);
for (const person of people) {
  console.log(`\n${person.name} (${person.id}) — ${person.records.length}${person.optedOut ? ' [opted out]' : ''}`);
  for (const r of orderForListing(person, now)) {
    const words = r.kind === 'quote' ? ` — "${r.text}"` : ` — from "${r.text}"`;
    console.log(`  [${r.kind} s${r.salience} x${r.seen} ${new Date(r.at).toISOString().slice(0, 10)}] ${r.summary}${words}`);
  }
}
