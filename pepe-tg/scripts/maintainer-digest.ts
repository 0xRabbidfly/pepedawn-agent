#!/usr/bin/env bun
/**
 * Stage 1 of the maintainer loop, the monitoring half: read what happened
 * since the last run, triage it by who said it, and send the owner a digest.
 *
 * Runs on the droplet, from pepe-tg, on a cron (see docs/MAINTAINER.md). It
 * reads files the bot writes and never touches PGlite, so the bot keeps
 * running. One model call classifies the messages aimed at the bot; everything
 * else is deterministic.
 *
 *   bun scripts/maintainer-digest.ts            # since the last run (first run: 24h), DM the owner
 *   bun scripts/maintainer-digest.ts --hours 6  # a fixed window
 *   bun scripts/maintainer-digest.ts --dry-run  # print, send nothing, move no watermark
 *
 * Output: src/data/maintainer/<timestamp>.md and .json (gitignored — they quote
 * real people), plus latest.json, which the proposer reads.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readDayTurns } from '../src/conversation/dayLog';
import { ticketsBetween } from '../src/utils/buildRequests';
import { allChats, roomsForChat } from '../src/conversation/roomMap';
import { getParticipant } from '../src/utils/participants';
import { callTextModel } from '../src/utils/modelGateway';
import { sendTextMessage } from '../src/utils/telegramSend';
import {
  anomalies, backupLine, buildClassifyPrompt, chunkForTelegram, countMatches, findCandidates, parseClassifyResponse,
  parseDecisions, renderDigest, stats, triage, type BackupStatus, type DigestParts,
} from '../src/utils/maintainerDigest';

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const value = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = flag('--dry-run');

const dir = process.env.MAINTAINER_DIR || join(process.cwd(), 'src', 'data', 'maintainer');
mkdirSync(dir, { recursive: true });
const statePath = join(dir, 'state.json');
const state: { lastRunAt?: number } = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};

const now = Date.now();
const hours = value('--hours') ? parseFloat(value('--hours')!) : undefined;
const from = hours ? now - hours * 3_600_000 : (state.lastRunAt ?? now - 24 * 3_600_000);
const to = now;

// Who can direct a change: admins, plus whoever MAINTAINER_DIRECTIVE_IDS names (the owner).
const directiveIds = [...new Set(
  `${process.env.TELEGRAM_ADMIN_IDS || ''},${process.env.MAINTAINER_DIRECTIVE_IDS || ''}`
    .split(',').map((s) => s.trim()).filter(Boolean)
)];
const ownerChat = process.env.MAINTAINER_OWNER_CHAT_ID || '';
const token = process.env.TELEGRAM_BOT_TOKEN || '';

// The chats being watched: the configured channel(s), or every group seen.
const chats = (process.env.MAINTAINER_CHAT_IDS || process.env.TELEGRAM_CHANNEL_ID || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const watched = chats.length ? chats : allChats().filter((c) => c.startsWith('-'));

const turns = watched
  .flatMap((chatId) => roomsForChat(chatId).flatMap((roomId) => readDayTurns(roomId, from, to)))
  .sort((a, b) => a.at - b.at);

// The router's own account of itself, from the current PM2 log(s).
const logsDir = join(process.cwd(), 'logs');
let logText = '';
try {
  const files = readdirSync(logsDir)
    .filter((f) => /^out-\d+\.log$/.test(f))
    .map((f) => ({ f, m: statSync(join(logsDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 3);
  logText = files.map(({ f }) => readFileSync(join(logsDir, f), 'utf8')).join('\n');
} catch {
  // No logs, no decisions: the digest still has the chat.
}
const decisions = parseDecisions(logText, from, to);
const extra = {
  repeatGuardHits: countMatches(logText, /\[RepeatGuard\]/, from, to),
  cardCooldownHits: countMatches(logText, /\[CardShow\]/, from, to),
  errors: countMatches(logText, /^\S+ \S+ \S+ +Error /, from, to),
};

const cands = findCandidates(turns, from, to).slice(0, 40);
let classified = [] as ReturnType<typeof parseClassifyResponse>;
if (cands.length && process.env.OPENAI_API_KEY) {
  try {
    const runtime = { getService: () => null } as any;
    const reply = await callTextModel(runtime, {
      model: process.env.MAINTAINER_MODEL || process.env.CHAT_MODEL || 'gpt-5.6-luna',
      prompt: buildClassifyPrompt(cands),
      systemPrompt: 'You label messages in a group chat. You return JSON only.',
      maxTokens: 60 * cands.length + 100,
      source: 'Maintainer-Digest',
    });
    classified = parseClassifyResponse(reply.text, cands.length);
  } catch (error) {
    console.error('classification failed; triaging by heuristics only', error);
  }
}
// With no classification, anything that names the bot from a director still surfaces.
if (classified.length === 0) {
  classified = cands.map((c, i) => ({ index: i, kind: c.because === 'named' ? ('request' as const) : ('other' as const), summary: '' }));
}

const nameOf = (id: string | undefined, fallback?: string) => (id && getParticipant(id)?.name) || fallback || id || 'someone';
const { directives, suggestions } = triage(cands, classified, directiveIds, nameOf);

const notes: string[] = [];
if (directiveIds.length === 0) notes.push('No directive ids configured (TELEGRAM_ADMIN_IDS / MAINTAINER_DIRECTIVE_IDS): nothing can be a directive.');
if (!process.env.OPENAI_API_KEY) notes.push('No OPENAI_API_KEY: messages were triaged by heuristics only.');

// The room's /fb tickets opened in the window, by name where the roster has one.
const buildRequests = ticketsBetween(from, to).map((r) => ({
  id: r.id, at: r.at, title: r.title, text: r.text, status: r.status,
  who: nameOf(r.sender.id, r.sender.name || r.sender.username),
}));

// Written by scripts/nightly-backup.sh; absent until its first run.
function readBackupStatus(): BackupStatus | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'backup-status.json'), 'utf8'));
  } catch {
    return null;
  }
}

const parts: DigestParts = {
  from, to,
  stats: stats(turns, decisions, extra),
  directives, suggestions,
  anomalies: anomalies(turns),
  notes,
  buildRequests,
  backup: backupLine(readBackupStatus(), to),
};
const markdown = renderDigest(parts);

const stamp = new Date(to).toISOString().replace(/[:.]/g, '-').slice(0, 16);
if (!dryRun) {
  writeFileSync(join(dir, `${stamp}.md`), markdown, 'utf8');
  const brief = { generatedAt: to, window: { from, to }, directiveIds, ...parts };
  writeFileSync(join(dir, `${stamp}.json`), JSON.stringify(brief, null, 1), 'utf8');
  writeFileSync(join(dir, 'latest.json'), JSON.stringify(brief, null, 1), 'utf8');
}

console.log(markdown);

if (dryRun) {
  console.log('\n(dry run: nothing sent, watermark unchanged)');
} else {
  if (token && ownerChat) {
    let sent = 0;
    for (const chunk of chunkForTelegram(markdown)) {
      if ((await sendTextMessage(token, ownerChat, chunk)) !== null) sent++;
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log(`\nsent ${sent} message(s) to ${ownerChat}`);
  } else {
    console.log('\nnot sent: MAINTAINER_OWNER_CHAT_ID or TELEGRAM_BOT_TOKEN missing');
  }
  writeFileSync(statePath, JSON.stringify({ lastRunAt: to }), 'utf8');
}
