/**
 * Social memory in a running bot: when to capture, and what to recall.
 *
 * SOCIAL_MEMORY decides how much of it is live:
 *
 *   off     nothing (the default)
 *   record  capture only — memories accumulate and can be read on the server,
 *           but never reach a reply
 *   on      capture, and the speaker's memories inform replies to them
 *
 * The model is injected, so everything here runs in tests without one.
 */

import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '@elizaos/core';
import { characterFor } from './characters';
import { readDayTurns, type DayTurn } from './dayLog';
import { allChats, chatForRoom, roomsForChat } from './roomMap';
import { participantIdsNamed } from '../utils/participants';
import {
  DEFAULT_POLICY,
  formatRecollection,
  quoteWasUsed,
  recollect,
  type MemoryPolicy,
  type MemoryRecord,
} from './socialMemory';
import {
  buildCapturePrompt,
  chunkSession,
  closedSessions,
  knownMemoriesFor,
  parseCaptureResponse,
  worthCapturing,
  type CaptureDecision,
} from './memoryCapture';
import { socialStore, type SocialMemoryStore } from './socialMemoryStore';

export type SocialMemoryMode = 'off' | 'record' | 'on';

export function socialMemoryMode(): SocialMemoryMode {
  const value = (process.env.SOCIAL_MEMORY || '').trim().toLowerCase();
  return value === 'on' || value === 'record' ? value : 'off';
}

function envInt(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** The rules for one person: environment defaults, then their roster entry. */
export function policyFor(personId: string): MemoryPolicy {
  const base: MemoryPolicy = {
    ...DEFAULT_POLICY,
    cap: envInt('SOCIAL_MEMORY_CAP', DEFAULT_POLICY.cap),
    perDay: envInt('SOCIAL_MEMORY_PER_DAY', DEFAULT_POLICY.perDay),
  };
  const override = characterFor(personId)?.memory;
  if (!override) return base;
  return {
    ...base,
    cap: override.cap ?? base.cap,
    perDay: override.perDay ?? base.perDay,
    capture: override.capture ?? base.capture,
  };
}

/** Telegram group and supergroup ids are negative; a DM is the user's own, positive id. */
export function isGroupChat(chatId?: string): chatId is string {
  return !!chatId && chatId.startsWith('-');
}

/** Which chats capture reads. Groups only: nothing said in a DM is remembered. */
export function captureChats(): string[] {
  const configured = (process.env.SOCIAL_MEMORY_CHAT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return (configured.length ? configured : allChats()).filter(isGroupChat);
}

/** How far back the very first run reads. The day log itself keeps about a week. */
export const BACKFILL_MS = 30 * 24 * 60 * 60 * 1000;

/** Bounds what one run can spend. Whatever is left is picked up by the next. */
export const MAX_SESSIONS_PER_RUN = 80;

/**
 * Attribute a turn logged before turns carried the speaker's id.
 *
 * Only when exactly one known participant has that display name. Two people
 * sharing a name means the line belongs to nobody, which is the right answer
 * for a registry that must never put words in the wrong mouth.
 */
export function attributeLegacy(turn: DayTurn): DayTurn {
  if (turn.role !== 'user' || turn.authorId || !turn.author) return turn;
  const ids = participantIdsNamed(turn.author);
  return ids.length === 1 ? { ...turn, authorId: ids[0] } : turn;
}

export interface CaptureReport {
  chats: number;
  sessions: number;
  calls: number;
  admitted: number;
  replaced: number;
  reinforced: number;
  rejected: number;
  failed: number;
}

let running = false;

function captureLog(store: SocialMemoryStore, entry: Record<string, unknown>): void {
  try {
    const path = join(dirname(store.path), 'social-capture.jsonl');
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // The audit trail is best effort.
  }
}

/**
 * Read every finished conversation since the last run and remember what is
 * worth it.
 *
 * Idempotent by watermark, per chat: a conversation is read once, and the
 * watermark only moves past it once it has been read. A model failure leaves
 * the watermark where it is, so the conversation is retried next run rather
 * than silently skipped. That also defuses the trap XHarvestService fell into
 * (5.6.0), where every deploy bought another round: a run with nothing new to
 * read makes no model call at all.
 */
export async function runCapture(options: {
  model: (prompt: string) => Promise<string>;
  now?: number;
  store?: SocialMemoryStore;
  maxSessions?: number;
}): Promise<CaptureReport | null> {
  if (running) return null;
  running = true;
  try {
    const now = options.now ?? Date.now();
    const store = options.store ?? socialStore();
    let budget = options.maxSessions ?? MAX_SESSIONS_PER_RUN;
    const report: CaptureReport = {
      chats: 0, sessions: 0, calls: 0, admitted: 0, replaced: 0, reinforced: 0, rejected: 0, failed: 0,
    };

    const apply = (chatId: string, decision: CaptureDecision) => {
      const logged = { capturedAt: new Date(now).toISOString(), chatId, personId: decision.personId, name: decision.name };
      if (decision.type === 'reinforce') {
        if (store.reinforce(decision.personId, decision.recordId, decision.at, decision.salience)) {
          report.reinforced++;
          captureLog(store, { ...logged, outcome: 'reinforced', recordId: decision.recordId });
        }
        return;
      }
      const outcome = store.admit(decision.personId, decision.name, decision.record, policyFor(decision.personId), now);
      if (outcome.status === 'admitted') report.admitted++;
      else if (outcome.status === 'replaced') report.replaced++;
      else report.rejected++;
      captureLog(store, {
        ...logged,
        outcome: outcome.status,
        reason: outcome.status === 'rejected' ? outcome.reason : undefined,
        evicted: outcome.status === 'replaced' ? outcome.evicted.summary : undefined,
        kind: decision.record.kind,
        salience: decision.record.salience,
        summary: decision.record.summary,
        text: decision.record.text,
      });
    };

    for (const chatId of captureChats()) {
      const rooms = roomsForChat(chatId);
      if (rooms.length === 0) continue;
      report.chats++;

      const from = store.watermark(chatId) ?? now - BACKFILL_MS;
      const turns = rooms
        .flatMap((roomId) => readDayTurns(roomId, from, now))
        .sort((a, b) => a.at - b.at)
        .map(attributeLegacy);

      for (const session of closedSessions(turns, now)) {
        if (budget <= 0) break;
        if (worthCapturing(session)) {
          budget--;
          report.sessions++;
          let failed = false;
          for (const chunk of chunkSession(session)) {
            if (!worthCapturing(chunk)) continue;
            const known = knownMemoriesFor(chunk, (id) => store.person(id), now);
            let raw: string;
            try {
              report.calls++;
              raw = await options.model(buildCapturePrompt(chunk, known));
            } catch (error) {
              logger.warn({ error, chatId }, '[SocialMemory] capture call failed; will retry next run');
              report.failed++;
              failed = true;
              break;
            }
            for (const decision of parseCaptureResponse(raw, chunk, known, chatId)) apply(chatId, decision);
          }
          if (failed) break;
        }
        store.setWatermark(chatId, session[session.length - 1].at + 1);
      }
    }

    return report;
  } finally {
    running = false;
  }
}

/** A quote is offered to the same person at most this often. */
export const QUOTE_OFFER_GAP_MS = 2 * 60 * 60 * 1000;

const lastQuoteOffer = new Map<string, number>();

export interface SpeakerRecall {
  /** Prompt section, or '' when there is nothing to add. */
  block: string;
  personId?: string;
  quotable?: MemoryRecord;
}

const NOTHING: SpeakerRecall = { block: '' };

/**
 * What PEPEDAWN remembers about the person it is answering.
 *
 * Scoped to the chat the reply is going to, so a line from the private group
 * never surfaces in the official channel. In a DM the person hears only about
 * themselves, so everything is in scope. A room whose chat cannot be resolved
 * gets nothing rather than everything.
 */
export function recallForSpeaker(input: {
  speakerId?: string;
  roomId: string;
  userText: string;
  now?: number;
  store?: SocialMemoryStore;
}): SpeakerRecall {
  if (socialMemoryMode() !== 'on' || !input.speakerId) return NOTHING;
  try {
    const now = input.now ?? Date.now();
    const person = (input.store ?? socialStore()).person(input.speakerId);
    if (!person || person.optedOut || person.records.length === 0) return NOTHING;

    const chatId = chatForRoom(input.roomId);
    if (!chatId) return NOTHING;

    const last = lastQuoteOffer.get(person.id);
    const recollection = recollect(person, {
      userText: input.userText,
      now,
      scopeChatId: isGroupChat(chatId) ? chatId : undefined,
      allowQuote: last === undefined || now - last >= QUOTE_OFFER_GAP_MS,
    });
    if (!recollection) return NOTHING;
    if (recollection.quotable) lastQuoteOffer.set(person.id, now);

    const name = characterFor(person.id)?.name || person.name || 'them';
    return { block: formatRecollection(recollection, name), personId: person.id, quotable: recollection.quotable };
  } catch {
    // Remembering someone is a nicety. It must never cost them a reply.
    return NOTHING;
  }
}

/** Start the reuse clock on a quote, but only if the reply actually used it. */
export function settleRecall(recall: SpeakerRecall, reply: string, now = Date.now(), store?: SocialMemoryStore): boolean {
  if (!recall.quotable || !recall.personId) return false;
  if (!quoteWasUsed(reply, recall.quotable.text)) return false;
  try {
    (store ?? socialStore()).markUsed(recall.personId, recall.quotable.id, now);
  } catch {
    return false;
  }
  return true;
}

export function _resetRecallLimiter(): void {
  lastQuoteOffer.clear();
}
