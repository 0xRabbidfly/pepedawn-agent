#!/usr/bin/env bun
/**
 * Post one quiet-room opener now, made exactly as the bot makes them when a
 * room goes quiet (src/utils/quietOpeners.ts): a real hook, a drawn angle,
 * checked, judged, and logged so the hook is never used again.
 *
 *   bun scripts/quiet-opener-now.ts                   # to the first TELEGRAM_CHANNEL_ID
 *   bun scripts/quiet-opener-now.ts --chat <id>       # somewhere else
 *   bun scripts/quiet-opener-now.ts --dry-run         # compose and print, send nothing
 *   bun scripts/quiet-opener-now.ts --kind birthday   # only hooks of one kind
 *
 * Runs from pepe-tg, on the droplet for the real channel. It reads and appends
 * files and never opens PGlite, so the bot keeps running - which also means
 * recent sales are out of its reach: those hooks only come from the bot. The
 * opener log is the one the bot reads, so its next opener counts from this one.
 */

import { appendDayTurn } from '../src/conversation/dayLog';
import { roomsForChat } from '../src/conversation/roomMap';
import { callTextModel } from '../src/utils/modelGateway';
import { composeQuietOpener, openerHooks, readOpeners, recordOpener } from '../src/utils/quietOpeners';
import { sendTextMessage } from '../src/utils/telegramSend';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const arg = (name: string) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined);
const kind = arg('--kind');
const chatId = arg('--chat') ?? (process.env.TELEGRAM_CHANNEL_ID || '').split(',')[0].trim();
const token = process.env.TELEGRAM_BOT_TOKEN || '';
const model = process.env.CHAT_MODEL || process.env.OPENAI_LARGE_MODEL || 'gpt-4o';

if (!dryRun && (!chatId || !token)) {
  console.error('TELEGRAM_CHANNEL_ID (or --chat) and TELEGRAM_BOT_TOKEN are needed to send');
  process.exit(2);
}

// No runtime outside the bot: the model calls go untracked by telemetry, which is pennies.
const runtime: any = { getService: () => null };
const hooks = openerHooks({}).filter((h) => !kind || h.kind === kind);
const opener = await composeQuietOpener({
  hooks,
  history: readOpeners(),
  generate: async (prompt, systemPrompt) =>
    (await callTextModel(runtime, { model, prompt, systemPrompt, maxTokens: 120, source: 'Quiet opener calls' })).text,
  judge: async (prompt) => (await callTextModel(runtime, { model, prompt, maxTokens: 60, source: 'Quiet opener calls' })).text,
  log: (line) => console.log(`  ✗ ${line}`),
});

if (!opener) {
  console.error('nothing passed the checks, or nothing fresh to ask about; run it again');
  process.exit(1);
}
console.log(opener.text);
console.log(`  [${opener.hook.key} | ${opener.angle}]`);

if (dryRun) {
  console.log('(dry run: nothing sent, nothing logged)');
  process.exit(0);
}

const messageId = await sendTextMessage(token, chatId, opener.text);
if (messageId === null) {
  console.error(`send to ${chatId} failed; nothing logged`);
  process.exit(1);
}
const at = Date.now();
recordOpener({ at, text: opener.text, hook: opener.hook.key, kind: opener.hook.kind, angle: opener.angle, cards: opener.hook.cards, chatId });
for (const roomId of roomsForChat(chatId).slice(0, 1)) appendDayTurn({ roomId, role: 'bot', text: opener.text, at, kind: 'broadcast' });
console.log(`sent to ${chatId} (message ${messageId})`);
