/**
 * Session-boundary memory capture.
 *
 * Runs once per conversation session rather than per message: a session closes
 * after a gap of silence, and one model pass asks "was anything here worth
 * remembering, and who was involved?". Most sessions produce nothing, which is
 * the intended outcome — a bot that finds every exchange memorable has no taste.
 *
 * The sessionization matches scripts/tg-build-sessions.ts (20-minute gap), so
 * live capture and the historical importer agree on what a session is.
 */

import type { ConversationTurn } from './types';
import type { MemoryKind, MemoryRecord, PersonRef } from './socialMemory';

/** A session closes after this much silence. Matches tg-build-sessions.ts. */
export const SESSION_GAP_MS = 20 * 60 * 1000;

export interface CaptureConfig {
  sessionGapMs: number;
  /** Sessions shorter than this are not worth a model call. */
  minTurns: number;
  /** Never ask the model to consider more than this many turns at once. */
  maxTurns: number;
}

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  sessionGapMs: SESSION_GAP_MS,
  minTurns: 4,
  maxTurns: 60,
};

/** True when `now` is far enough past the last turn to close the session. */
export function sessionClosed(
  turns: ConversationTurn[],
  now: number,
  config: CaptureConfig = DEFAULT_CAPTURE_CONFIG
): boolean {
  if (turns.length === 0) return false;
  const last = turns[turns.length - 1];
  return now - last.at >= config.sessionGapMs;
}

/** Split a turn list into sessions on the gap boundary. */
export function splitSessions(
  turns: ConversationTurn[],
  config: CaptureConfig = DEFAULT_CAPTURE_CONFIG
): ConversationTurn[][] {
  const sessions: ConversationTurn[][] = [];
  let current: ConversationTurn[] = [];
  for (const turn of turns) {
    const previous = current[current.length - 1];
    if (previous && turn.at - previous.at >= config.sessionGapMs) {
      sessions.push(current);
      current = [];
    }
    current.push(turn);
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}

/** Whether a session is even worth sending to the model. */
export function worthCapturing(
  turns: ConversationTurn[],
  config: CaptureConfig = DEFAULT_CAPTURE_CONFIG
): boolean {
  const userTurns = turns.filter((t) => t.role === 'user');
  if (userTurns.length < config.minTurns) return false;
  // A session where one person talked to themselves is rarely memorable.
  const speakers = new Set(userTurns.map((t) => t.author).filter(Boolean));
  return speakers.size >= 2 || userTurns.length >= config.minTurns * 2;
}

/** Transcript for the capture prompt, oldest first. */
export function formatSession(
  turns: ConversationTurn[],
  config: CaptureConfig = DEFAULT_CAPTURE_CONFIG
): string {
  return turns
    .slice(-config.maxTurns)
    .map((t) => {
      const who = t.role === 'bot' ? 'PEPEDAWN' : t.author || 'someone';
      return `${who}: ${t.text.replace(/\s+/g, ' ').trim()}`;
    })
    .join('\n');
}

/**
 * The capture prompt.
 *
 * Deliberately biased towards returning nothing. The failure mode we care about
 * is a memory full of unremarkable chatter, which then surfaces as unremarkable
 * callbacks.
 */
export function buildCapturePrompt(transcript: string): string {
  return [
    'Conversation from a Fake Rares Telegram group:',
    '',
    transcript,
    '',
    'Identify anything genuinely worth remembering about these PEOPLE — not',
    'about the cards, which are already documented elsewhere.',
    '',
    'Worth remembering:',
    '* A funny or characteristic remark someone made (quote it).',
    '* A position someone keeps taking, or a card they clearly love or hate.',
    '* A notable community event: a drop, an argument, a milestone, a joke that landed.',
    '',
    'NOT worth remembering:',
    '* Ordinary greetings, acknowledgements, price chatter, logistics.',
    '* Anything about card specifications.',
    '* Anything you would not bring up warmly weeks later.',
    '',
    'Return STRICT JSON, and prefer an empty list:',
    '{"records":[{"kind":"quote|reaction|episode|highlight",',
    '  "summary":"one line, phrased so it can be said aloud later",',
    '  "text":"verbatim quote if kind is quote, else omit",',
    '  "people":["display name", ...],',
    '  "cards":["ASSET", ...]}]}',
    '',
    'Most sessions contain nothing worth remembering. Returning {"records":[]}',
    'is the correct and common answer.',
  ].join('\n');
}

const VALID_KINDS: MemoryKind[] = ['episode', 'highlight', 'quote', 'reaction'];

/**
 * Parse a capture response into records.
 *
 * Tolerant of the model wrapping JSON in prose or fences; returns [] rather
 * than throwing, because a bad capture must never break a conversation.
 */
export function parseCaptureResponse(
  raw: string,
  context: { roomId: string; at: number; authorIds: Map<string, string> }
): MemoryRecord[] {
  let parsed: any;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed?.records) ? parsed.records : [];

  return list.flatMap((item: any, index: number): MemoryRecord[] => {
    const kind: MemoryKind = VALID_KINDS.includes(item?.kind) ? item.kind : 'highlight';
    const summary = typeof item?.summary === 'string' ? item.summary.trim() : '';
    if (!summary) return [];

    const names: string[] = Array.isArray(item?.people)
      ? item.people.filter((n: unknown): n is string => typeof n === 'string')
      : [];
    const participants: PersonRef[] = names.map((name) => ({
      // Fall back to the display name when the id is unknown, so a record is
      // never silently unattributed.
      id: context.authorIds.get(name) ?? `name:${name}`,
      name,
      role: kind === 'quote' ? 'author' : 'subject',
    }));

    const cards: string[] = Array.isArray(item?.cards)
      ? item.cards
          .filter((c: unknown): c is string => typeof c === 'string')
          .map((c: string) => c.toUpperCase())
      : [];

    return [
      {
        id: `${context.roomId}-${context.at}-${index}`,
        kind,
        summary,
        text: typeof item?.text === 'string' && item.text.trim() ? item.text.trim() : undefined,
        participants,
        roomId: context.roomId,
        at: context.at,
        // Episodes are the "this mattered" tier and do not fade.
        pinned: kind === 'episode',
        cards: cards.length ? cards : undefined,
      },
    ];
  });
}
