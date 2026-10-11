#!/usr/bin/env bun
/**
 * Post one quiet-room joke now, made exactly as the bot makes them when a
 * room goes quiet (src/utils/quietJokes.ts): drawn, checked, judged, logged
 * so it is never said again. 5.27.0 opened with one instead of a release
 * note, at the owner's call: "Don't announce this release - just start with
 * a joke".
 *
 *   bun scripts/quiet-joke-now.ts               # to the first TELEGRAM_CHANNEL_ID
 *   bun scripts/quiet-joke-now.ts --chat <id>   # somewhere else
 *   bun scripts/quiet-joke-now.ts --dry-run     # compose and print, send nothing
 *
 * Runs from pepe-tg, on the droplet for the real channel. It reads and appends
 * files and never opens PGlite, so the bot keeps running. The joke log is the
 * one the bot reads, so its next quiet-room slot counts from this joke.
 */

import { appendDayTurn } from '../src/conversation/dayLog';
import { roomsForChat } from '../src/conversation/roomMap';
import { callTextModel } from '../src/utils/modelGateway';
import { composeQuietJoke, jokeTemperature, readJokes, recordJoke } from '../src/utils/quietJokes';
import { sendTextMessage } from '../src/utils/telegramSend';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const chatArg = args.indexOf('--chat');
const chatId = chatArg >= 0 ? args[chatArg + 1] : (process.env.TELEGRAM_CHANNEL_ID || '').split(',')[0].trim();
const token = process.env.TELEGRAM_BOT_TOKEN || '';
const model = process.env.CHAT_MODEL || process.env.OPENAI_LARGE_MODEL || 'gpt-4o';

if (!dryRun && (!chatId || !token)) {
  console.error('TELEGRAM_CHANNEL_ID (or --chat) and TELEGRAM_BOT_TOKEN are needed to send');
  process.exit(2);
}

// No runtime outside the bot: the model calls go untracked by telemetry, which is pennies.
const runtime: any = { getService: () => null };
const joke = await composeQuietJoke({
  history: readJokes(),
  temperature: jokeTemperature(),
  generate: async (prompt, systemPrompt, temperature) =>
    (await callTextModel(runtime, { model, prompt, systemPrompt, temperature, temperatureOnReasoning: true, maxTokens: 120, source: 'Quiet joke calls' })).text,
  judge: async (prompt) => (await callTextModel(runtime, { model, prompt, maxTokens: 60, source: 'Quiet joke calls' })).text,
  log: (line) => console.log(`  ✗ ${line}`),
});

if (!joke) {
  console.error('nothing passed the checks; run it again');
  process.exit(1);
}
console.log(joke.text);
console.log(`  [${joke.draw.format} | ${joke.draw.topic}${joke.draw.wildcard ? ` | ${joke.draw.wildcard}` : ''}]`);

if (dryRun) {
  console.log('(dry run: nothing sent, nothing logged)');
  process.exit(0);
}

const messageId = await sendTextMessage(token, chatId, joke.text);
if (messageId === null) {
  console.error(`send to ${chatId} failed; nothing logged`);
  process.exit(1);
}
const at = Date.now();
recordJoke({ at, text: joke.text, ...joke.draw, chatId });
for (const roomId of roomsForChat(chatId).slice(0, 1)) appendDayTurn({ roomId, role: 'bot', text: joke.text, at, kind: 'broadcast' });
console.log(`sent to ${chatId} (message ${messageId})`);
