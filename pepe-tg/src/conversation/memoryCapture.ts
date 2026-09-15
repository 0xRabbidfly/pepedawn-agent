/**
 * Choosing what to remember from a conversation.
 *
 * Capture reads the day log rather than watching live traffic. The day log is
 * already on disk and already read by the recap, so nothing is held in memory
 * across PM2's nightly restart — the thing that quietly lost every session the
 * first version of this ever buffered.
 *
 * The model's only job is to pick lines and write a one-line summary. It never
 * writes what anyone said: the words and the person are both taken from the
 * numbered line it chose, the same rule the recap strip uses. A memory that
 * puts invented words in a named person's mouth is worse than no memory.
 *
 * Attribution is by construction for the same reason. The model sees display
 * names so it can read the conversation, but a memory always belongs to the
 * Telegram id on the line it points at — never to a name it wrote down.
 */

import type { DayTurn } from './dayLog';
import { isBait } from '../utils/addressing';
import { clampSalience, orderForListing, type MemoryKind, type MemoryRecord, type PersonMemory } from './socialMemory';

export const CAPTURE_SYSTEM_PROMPT =
  'You choose what is worth remembering about people in a group chat. ' +
  'You never write or reword what anyone said. You return JSON only.';

/** A conversation ends after this much silence. Matches scripts/tg-build-sessions.ts. */
export const SESSION_GAP_MS = 20 * 60 * 1000;

/** Longest transcript sent in one call. A longer session is read in pieces. */
export const MAX_LINES = 80;

/** Fewer people-turns than this is not a conversation worth a model call. */
export const MIN_USER_TURNS = 4;

/** Most new memories one person can take from one conversation. */
export const MAX_PER_PERSON_PER_SESSION = 2;

export const MAX_QUOTE_CHARS = 200;
export const MAX_SUMMARY_CHARS = 140;

/** Split turns into conversations on a gap of silence. Turns must be sorted. */
export function splitSessions(turns: DayTurn[], gapMs = SESSION_GAP_MS): DayTurn[][] {
  const sessions: DayTurn[][] = [];
  let current: DayTurn[] = [];
  for (const turn of turns) {
    const previous = current[current.length - 1];
    if (previous && turn.at - previous.at >= gapMs) {
      sessions.push(current);
      current = [];
    }
    current.push(turn);
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}

/** Conversations that are over. One still going is left for the next run. */
export function closedSessions(turns: DayTurn[], now: number, gapMs = SESSION_GAP_MS): DayTurn[][] {
  const sessions = splitSessions(turns, gapMs);
  const last = sessions[sessions.length - 1];
  if (last && now - last[last.length - 1].at < gapMs) sessions.pop();
  return sessions;
}

export function chunkSession(session: DayTurn[], maxLines = MAX_LINES): DayTurn[][] {
  const chunks: DayTurn[][] = [];
  for (let i = 0; i < session.length; i += maxLines) chunks.push(session.slice(i, i + maxLines));
  return chunks;
}

/**
 * A line a memory may be anchored to.
 *
 * Bait is filtered in code as well as in the prompt: a jailbreak or an attempt
 * to dig into someone must not become "a funny thing they said".
 */
export function isCandidateTurn(turn: DayTurn): boolean {
  if (turn.role !== 'user' || !turn.authorId || turn.kind === 'broadcast') return false;
  const text = (turn.text || '').trim();
  if (text.length < 12 || text.startsWith('/')) return false;
  return !isBait(text);
}

export function worthCapturing(session: DayTurn[]): boolean {
  const users = session.filter((t) => t.role === 'user');
  if (users.length < MIN_USER_TURNS) return false;
  if (!session.some(isCandidateTurn)) return false;
  const speakers = new Set(users.map((t) => t.authorId ?? t.author).filter(Boolean));
  return speakers.size >= 2 || users.length >= MIN_USER_TURNS * 2;
}

export interface KnownMemory {
  /** Short handle the model can refer back to, e.g. "m3". */
  key: string;
  personId: string;
  name: string;
  record: MemoryRecord;
}

/** What is already remembered about the people in this conversation. */
export function knownMemoriesFor(
  session: DayTurn[],
  person: (id: string) => PersonMemory | undefined,
  now: number,
  perPerson = 8
): KnownMemory[] {
  const known: KnownMemory[] = [];
  const ids = new Set(session.filter(isCandidateTurn).map((t) => t.authorId!));
  for (const id of ids) {
    const p = person(id);
    if (!p) continue;
    for (const record of orderForListing(p, now).slice(0, perPerson)) {
      known.push({ key: `m${known.length + 1}`, personId: id, name: p.name, record });
    }
  }
  return known;
}

function oneLine(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

export function truncateQuote(text: string): string {
  const clean = oneLine(text);
  if (clean.length <= MAX_QUOTE_CHARS) return clean;
  const cut = clean.slice(0, MAX_QUOTE_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > MAX_QUOTE_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

export function buildCapturePrompt(session: DayTurn[], known: KnownMemory[]): string {
  const lines = session.map(
    (t, i) => `${i}: [${t.role === 'bot' ? 'PEPEDAWN' : t.author || 'someone'}] ${oneLine(t.text).slice(0, 300)}`
  );
  const knownLines = known.map((k) =>
    k.record.kind === 'quote'
      ? `${k.key} [${k.name}] quote: "${k.record.text}"`
      : `${k.key} [${k.name}] trait: ${k.record.summary}`
  );

  return [
    'Below is a conversation from a Fake Rares Telegram group, one numbered line per message.',
    '',
    'Notice what is worth remembering about the PEOPLE in it, so that weeks from now PEPEDAWN can talk to',
    'them like a regular who has been listening. You are choosing lines, not writing them.',
    '',
    'Worth remembering:',
    '* a line that is funny, sharp or unmistakably them - kind "quote". Someone who knows them should',
    '  recognise it as theirs. Generic praise or reactions ("this is great", "lfg", "love it") are not quotes.',
    '* something about THEM - a card or artist they love or hate, what they collect or are hunting,',
    '  a position they keep taking, something they are making - kind "trait". A question they ask the bot',
    '  is not a memory in itself, but what it shows they care about can be.',
    '',
    'Never remember, whoever says it:',
    '* anything about someone other than the speaker - a person they mention, link to or describe is not',
    '  them, and what they say about that person is not a trait of theirs',
    '* greetings, thanks, one-word replies, price checks, logistics',
    '* violence, self-harm, threats or death, even as a joke, and anything said just to provoke',
    '* insults, anything mean or embarrassing, anything you would not bring up warmly weeks later',
    '* money lost, debts, health, family, relationships, where someone lives or works',
    '* anyone testing, baiting or arguing with the bot',
    '* anything PEPEDAWN said',
    '',
    ...(known.length
      ? [
          'Already remembered about these people:',
          ...knownLines,
          'When a line shows one of those again, return it with "same_as" set to that key instead of a new memory.',
          '',
        ]
      : []),
    'Return ONLY JSON:',
    '{"memories":[{"line": <line number>, "kind": "quote" | "trait", "summary": "<one short line about',
    'that person, under 20 words, e.g. still hunting a FREEDOMKEK>", "salience": 1 | 2 | 3,',
    '"same_as": "<key, only when it repeats something already remembered>"}]}',
    '',
    'salience: 1 worth keeping, 2 characteristic of them, 3 what the room would remember them for. Most are 1.',
    'The line must be said by the person the memory is about. Never write or reword what anyone said;',
    `the words are taken from the line itself. At most ${MAX_PER_PERSON_PER_SESSION} memories per person.`,
    'Most conversations contain nothing worth remembering, and {"memories":[]} is the correct and common answer.',
    '',
    ...lines,
  ].join('\n');
}

export type CaptureDecision =
  | { type: 'new'; personId: string; name: string; record: MemoryRecord }
  | { type: 'reinforce'; personId: string; name: string; recordId: string; at: number; salience: number };

export function memoryId(chatId: string, turn: DayTurn, kind: MemoryKind): string {
  return `${chatId}:${turn.at}:${turn.authorId}:${kind}`;
}

function cleanSummary(value: unknown): string {
  if (typeof value !== 'string') return '';
  const clean = oneLine(value).replace(/^["']|["']$/g, '');
  return clean.length > MAX_SUMMARY_CHARS ? `${clean.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…` : clean;
}

/**
 * Turn the model's reply into decisions.
 *
 * Anything that does not resolve to a real line said by a real, identified
 * person is dropped rather than repaired: a hallucinated line number is a
 * hallucinated memory. Malformed output yields nothing, never a guess.
 */
export function parseCaptureResponse(
  raw: string,
  session: DayTurn[],
  known: KnownMemory[],
  chatId: string
): CaptureDecision[] {
  let parsed: any;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const list: any[] = Array.isArray(parsed?.memories) ? parsed.memories : [];
  const byKey = new Map(known.map((k) => [k.key, k]));
  const perPerson = new Map<string, number>();
  const taken = new Set<string>();
  const decisions: CaptureDecision[] = [];

  for (const item of list) {
    if (!Number.isInteger(item?.line)) continue;
    const turn = session[item.line];
    if (!turn || !isCandidateTurn(turn)) continue;
    const personId = turn.authorId!;
    const name = turn.author || personId;
    const salience = clampSalience(item?.salience);

    const sameAs = typeof item?.same_as === 'string' ? byKey.get(item.same_as.trim()) : undefined;
    if (sameAs) {
      // One person's line never strengthens what is remembered about another.
      if (sameAs.personId !== personId) continue;
      decisions.push({ type: 'reinforce', personId, name, recordId: sameAs.record.id, at: turn.at, salience });
      continue;
    }

    const kind: MemoryKind | null = item?.kind === 'quote' || item?.kind === 'trait' ? item.kind : null;
    const summary = cleanSummary(item?.summary);
    if (!kind || !summary) continue;

    const id = memoryId(chatId, turn, kind);
    if (taken.has(id)) continue;
    const count = perPerson.get(personId) ?? 0;
    if (count >= MAX_PER_PERSON_PER_SESSION) continue;
    taken.add(id);
    perPerson.set(personId, count + 1);

    decisions.push({
      type: 'new',
      personId,
      name,
      record: {
        id,
        kind,
        summary,
        text: truncateQuote(turn.text),
        chatId,
        at: turn.at,
        lastSeenAt: turn.at,
        seen: 1,
        salience,
      },
    });
  }

  return decisions;
}
