#!/usr/bin/env bun
/**
 * Telegram History → Session Builder
 *
 * Reads the full Telegram export (`backups/TG-chat-history-cleaned.json`)
 * and produces compact "session" documents that can be imported into the
 * knowledge base as higher-quality telegram chunks.
 *
 * Output (default): `pepe-tg/tmp/telegram-sessions.jsonl`
 *
 * Each line is a JSON object:
 * {
 *   sessionId: string;
 *   startDate: string;
 *   endDate: string;
 *   startTimestamp: number;
 *   endTimestamp: number;
 *   participants: string[];
 *   cardMentions: string[];
 *   hasQuestion: boolean;
 *   hasCard: boolean;
 *   messageCount: number;
 *   signalMessageCount: number;
 *   chunks: string[];        // Pre-chunked text blocks (headers + key lines)
 * }
 *
 * Usage:
 *   bun run scripts/tg-build-sessions.ts
 *   bun run scripts/tg-build-sessions.ts --source ../../backups/TG-chat-history-cleaned.json --out ../tmp/custom-sessions.jsonl
 */

import fs from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Defaults relative to repo layout:
//   pepe-tg/scripts/tg-build-sessions.ts
//   ../../backups/TG-chat-history-cleaned.json
//   ../tmp/telegram-sessions.jsonl
const DEFAULT_SOURCE = path.resolve(__dirname, '../../backups/TG-chat-history-cleaned.json');
const DEFAULT_OUT = path.resolve(__dirname, '../tmp/telegram-sessions.jsonl');

// Session configuration
const SESSION_GAP_MS = 20 * 60 * 1000; // 20 minutes
const MIN_SIGNAL_MESSAGES_PER_SESSION = 3;
const MIN_TOTAL_MESSAGES_PER_SESSION = 5;
const MAX_CHARS_PER_CHUNK = 1800;

// Generic reactions (copied / adapted from parse-real-data.js)
const GENERIC_REACTIONS = new Set(
  [
    'gm', 'gn', 'hi', 'hello', 'hey', 'sup', 'yo', 'kek', 'lol', 'lmao', 'rofl',
    'based', 'ngmi', 'wagmi', 'ser', 'fren', 'wen', 'soon', 'lfg', 'nice', 'ok',
    'cool', 'thanks', 'ty', 'thx', 'yeah', 'yep', 'nope', 'nah', 'bruh', 'fr', 'frfr',
  ].map((s) => s.toLowerCase()),
);

const QUESTION_PATTERNS: RegExp[] = [
  /\?$/,
  /^(what|how|when|where|why|who|which|can|could|would|should|do|does|did|is|are|was|were)\b/i,
  /^(tell|show|explain|describe|list|give)\s+(me|us)\s+(about|the|how)/i,
  /\b(need to know|want to know|wondering|curious|help me|can you)\b/i,
];

interface CLIOptions {
  source: string;
  out: string;
}

interface RawMessage {
  id: number;
  type: 'message' | 'service' | string;
  date: string;
  date_unixtime?: string;
  from?: string | null;
  from_id?: string;
  reply_to_message_id?: number;
  text?: string | any[] | { text?: string };
}

interface EnrichedMessage {
  id: number;
  date: string;
  timestamp: number;
  from: string | null;
  fromId: string | null;
  replyTo?: number;
  text: string;
  wordCount: number;
  hasQuestion: boolean;
  isGeneric: boolean;
  emojiOnly: boolean;
}

interface SessionDoc {
  sessionId: string;
  startDate: string;
  endDate: string;
  startTimestamp: number;
  endTimestamp: number;
  participants: string[];
  cardMentions: string[]; // Placeholder for future card detection; currently empty
  hasQuestion: boolean;
  hasCard: boolean;
  messageCount: number;
  signalMessageCount: number;
  chunks: string[];
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  let source = DEFAULT_SOURCE;
  let out = DEFAULT_OUT;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === '--source' || arg === '--src') && args[i + 1]) {
      source = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--source=')) {
      source = path.resolve(process.cwd(), arg.split('=')[1]);
    } else if ((arg === '--out' || arg === '--output') && args[i + 1]) {
      out = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--out=')) {
      out = path.resolve(process.cwd(), arg.split('=')[1]);
    } else if (arg === '--help' || arg === '-h') {
      printHelpAndExit();
    } else {
      console.warn(`⚠️  Unrecognized argument: ${arg}`);
    }
  }

  return { source, out };
}

function printHelpAndExit(): never {
  console.log(`
Telegram Session Builder
========================

Usage:
  bun run scripts/tg-build-sessions.ts [--source <path>] [--out <path>]

Options:
  --source  Path to TG-chat-history-cleaned.json
           (default: ../../backups/TG-chat-history-cleaned.json)
  --out     Output JSONL file for sessions
           (default: ../tmp/telegram-sessions.jsonl)
`);
  process.exit(0);
}

function ensureOutDir(outPath: string): void {
  const dir = path.dirname(outPath);
  mkdirSync(dir, { recursive: true });
}

function flattenTextField(text: RawMessage['text']): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  if (Array.isArray(text)) {
    return text
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('');
  }
  if (typeof text === 'object' && typeof (text as any).text === 'string') {
    return (text as any).text;
  }
  return '';
}

function detectHasQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return QUESTION_PATTERNS.some((re) => re.test(trimmed));
}

function detectEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Basic emoji-only heuristic (same as parse-real-data.js)
  return /^[\p{Emoji}\s]+$/u.test(trimmed);
}

function detectGeneric(text: string, emojiOnly: boolean): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  return GENERIC_REACTIONS.has(trimmed) || emojiOnly;
}

function enrichMessages(rawMessages: RawMessage[]): EnrichedMessage[] {
  const enriched: EnrichedMessage[] = [];

  for (const msg of rawMessages) {
    if (msg.type !== 'message') continue;

    const text = flattenTextField(msg.text || '').trim();
    if (!text) continue;

    const timestamp =
      typeof msg.date_unixtime === 'string'
        ? Number(msg.date_unixtime) * 1000
        : Date.parse(msg.date);

    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const emojiOnly = detectEmojiOnly(text);
    const isGeneric = detectGeneric(text, emojiOnly);
    const hasQuestion = detectHasQuestion(text);
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    enriched.push({
      id: msg.id,
      date: msg.date,
      timestamp,
      from: msg.from ?? null,
      fromId: msg.from_id ?? null,
      replyTo: msg.reply_to_message_id,
      text,
      wordCount: words.length,
      hasQuestion,
      isGeneric,
      emojiOnly,
    });
  }

  enriched.sort((a, b) => a.timestamp - b.timestamp);
  return enriched;
}

function buildSessions(messages: EnrichedMessage[]): SessionDoc[] {
  const sessions: SessionDoc[] = [];

  if (messages.length === 0) {
    return sessions;
  }

  let currentMessages: EnrichedMessage[] = [];

  const flushSession = () => {
    if (currentMessages.length === 0) return;

    const messageCount = currentMessages.length;
    const signalMessages = currentMessages.filter((m) => {
      const longEnough = m.wordCount >= 8;
      const hasSignal = m.hasQuestion;
      // Treat short generic / emoji-only as noise unless they carry a question
      if (m.emojiOnly || m.isGeneric) {
        return hasSignal;
      }
      return longEnough || hasSignal;
    });

    const signalMessageCount = signalMessages.length;
    if (
      signalMessageCount < MIN_SIGNAL_MESSAGES_PER_SESSION &&
      messageCount < MIN_TOTAL_MESSAGES_PER_SESSION
    ) {
      // Skip tiny / low-signal sessions entirely
      currentMessages = [];
      return;
    }

    const first = currentMessages[0];
    const last = currentMessages[currentMessages.length - 1];
    const participantsSet = new Set<string>();

    for (const m of currentMessages) {
      if (m.from && m.from.trim().length > 0) {
        participantsSet.add(m.from);
      } else if (m.fromId) {
        participantsSet.add(m.fromId);
      }
    }

    const participants = Array.from(participantsSet).slice(0, 16);

    const sessionId = `tg-${first.id}-${last.id}-${first.date.substring(0, 10)}`;

    const hasQuestion = signalMessages.some((m) => m.hasQuestion);
    const hasCard = false; // Card detection can be layered in later if needed

    const chunks = buildSessionChunks(sessionId, participants, currentMessages, signalMessages);

    const doc: SessionDoc = {
      sessionId,
      startDate: first.date,
      endDate: last.date,
      startTimestamp: first.timestamp,
      endTimestamp: last.timestamp,
      participants,
      cardMentions: [],
      hasQuestion,
      hasCard,
      messageCount,
      signalMessageCount,
      chunks,
    };

    sessions.push(doc);
    currentMessages = [];
  };

  let prev: EnrichedMessage | null = null;
  for (const msg of messages) {
    if (
      prev &&
      msg.timestamp - prev.timestamp > SESSION_GAP_MS
    ) {
      flushSession();
    }
    currentMessages.push(msg);
    prev = msg;
  }

  flushSession();
  return sessions;
}

function buildSessionChunks(
  sessionId: string,
  participants: string[],
  allMessages: EnrichedMessage[],
  signalMessages: EnrichedMessage[],
): string[] {
  const chunks: string[] = [];

  if (signalMessages.length === 0) {
    return chunks;
  }

  const sessionStart = allMessages[0].date;
  const sessionEnd = allMessages[allMessages.length - 1].date;
  const participantsLine =
    participants.length > 0
      ? participants.join(', ')
      : 'Unknown';

  let chunkIndex = 1;
  let currentText = '';

  const makeHeader = (part?: number) => {
    const partSuffix = part && part > 1 ? ` (part ${part})` : '';
    return [
      `[Telegram session${partSuffix}: ${sessionStart} → ${sessionEnd}]`,
      `[Participants: ${participantsLine}]`,
      '',
      'Messages:',
    ].join('\n');
  };

  currentText = makeHeader();

  const appendLine = (line: string) => {
    const candidate = currentText.length === 0 ? line : `${currentText}\n${line}`;
    if (candidate.length > MAX_CHARS_PER_CHUNK && currentText.length > 0) {
      chunks.push(currentText);
      chunkIndex += 1;
      currentText = makeHeader(chunkIndex);
      currentText = `${currentText}\n${line}`;
    } else {
      currentText = candidate;
    }
  };

  for (const msg of signalMessages) {
    const author =
      msg.from && msg.from.trim().length > 0
        ? msg.from
        : msg.fromId || 'Unknown';
    const prefix = `${msg.id} | ${author}`;
    const line = `- ${prefix}: ${msg.text.replace(/\s+/g, ' ').trim()}`;
    appendLine(line);
  }

  if (currentText.length > 0) {
    chunks.push(currentText);
  }

  return chunks;
}

async function main() {
  const options = parseArgs();

  console.log('📦 Telegram Session Builder');
  console.log('===========================');
  console.log(`Source: ${options.source}`);
  console.log(`Output: ${options.out}`);
  console.log('');

  ensureOutDir(options.out);

  let raw: string;
  try {
    raw = await fs.readFile(options.source, 'utf-8');
  } catch (err) {
    console.error(`❌ Failed to read source file: ${options.source}`);
    console.error(err);
    process.exit(1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('❌ Failed to parse JSON from source file.');
    console.error(err);
    process.exit(1);
  }

  const messages: RawMessage[] = Array.isArray(parsed?.messages)
    ? parsed.messages
    : [];

  if (messages.length === 0) {
    console.warn('⚠️  No messages found in source file.');
    await fs.writeFile(options.out, '', 'utf-8');
    console.log('✅ Wrote empty sessions file.');
    return;
  }

  console.log(`   Loaded ${messages.length.toLocaleString()} raw messages`);

  const enriched = enrichMessages(messages);
  console.log(`   Retained ${enriched.length.toLocaleString()} text messages after filtering.`);

  const sessions = buildSessions(enriched);
  console.log(`   Built ${sessions.length.toLocaleString()} sessions`);

  const lines = sessions.map((s) => JSON.stringify(s));
  await fs.writeFile(options.out, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf-8');

  const maxEndTs = sessions.reduce(
    (acc, s) => (s.endTimestamp > acc ? s.endTimestamp : acc),
    0,
  );
  if (maxEndTs > 0) {
    console.log(
      `   History max session end date: ${new Date(maxEndTs).toISOString()}`,
    );
  }

  console.log('\n✅ Session file written.');
}

main().catch((err) => {
  console.error('❌ Unhandled error in tg-build-sessions.ts:', err);
  process.exit(1);
});


