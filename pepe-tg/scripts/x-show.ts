#!/usr/bin/env bun
/**
 * Post harvested X posts to the channel by hand, with an optional line from
 * PEPEDAWN first.
 *
 * Written for 23 September: the harvest had volunteered a stranger's NFT take
 * into the room while Scrilla's own anniversary post sat in the store unshown,
 * and the apology needed to come with the posts that should have gone out.
 *
 *   bun scripts/x-show.ts --id <postId> [--id <postId>...] [--say "<text>"] [--lead "<text>"] --confirm
 *
 * Run from pepe-tg on the droplet, so .env supplies the token and channel. The
 * bot may keep running: this reads the harvest store, sends through the Bot
 * API, and marks the posts volunteered so the harvest does not repeat them.
 * Nothing is sent without --confirm.
 */

import { allPosts, formatForTelegram, markVolunteered } from '../src/utils/xHarvest';
import { appendDayTurn } from '../src/conversation/dayLog';
import { roomsForChat } from '../src/conversation/roomMap';
import { sendTextMessage } from '../src/utils/telegramSend';

const args = process.argv.slice(2);
const values = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const ids = values('--id');
const say = values('--say')[0];
const leads = values('--lead');
const confirm = args.includes('--confirm');

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = (process.env.X_SHOW_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID || '').split(',')[0].trim();
if (!token || !chatId) { console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are required (run from pepe-tg).'); process.exit(1); }
if (ids.length === 0) { console.error('Pass at least one --id <postId>.'); process.exit(1); }

const posts = allPosts();
const chosen = ids.map((id) => {
  const p = posts.find((x) => x.id === id);
  if (!p) { console.error(`No harvested post with id ${id}`); process.exit(1); }
  return p;
});

console.log(`Chat ${chatId}`);
if (say) console.log(`\nPEPEDAWN says:\n${say}\n`);
chosen.forEach((p, i) => console.log(`[${i + 1}] @${p.author} · ${new Date(p.postedAt).toISOString().slice(0, 10)}${leads[i] ? ` · lead: "${leads[i]}"` : ''}\n    ${p.text.replace(/\s+/g, ' ').slice(0, 160)}`));
if (!confirm) { console.log('\nDry run. Add --confirm to send.'); process.exit(0); }

async function sendHtml(text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) console.error(`send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.ok;
}

const roomId = roomsForChat(chatId)[0] ?? chatId;
const log = (text: string) => appendDayTurn({ roomId, role: 'bot', text, at: Date.now(), kind: 'broadcast' });

if (say) {
  const id = await sendTextMessage(token, chatId, say);
  console.log(id !== null ? 'said.' : 'could not send the line; stopping.');
  if (id === null) process.exit(1);
  log(say);
}
for (const [i, p] of chosen.entries()) {
  const card = formatForTelegram(p, leads[i]);
  if (await sendHtml(card.text)) {
    markVolunteered(p.id);
    log(card.text.replace(/<[^>]+>/g, ''));
    console.log(`sent @${p.author}.`);
  }
  await new Promise((r) => setTimeout(r, 1200));
}
