/**
 * Social memory — what PEPEDAWN remembers about each person in the room.
 *
 * The card corpus tells PEPEDAWN what the collection is. This tells it who the
 * community is, one person at a time, so that someone who talks to it over
 * weeks is answered by something that has been listening:
 *
 *   bob: anyone got a spare FREEDOMKEK
 *   PEPEDAWN: still on that kidney offer, bob?
 *
 * Every memory belongs to exactly one person, keyed by their numeric Telegram
 * id — the same rule as the character roster, for the same reason: display
 * names can be copied, and one of the room's regulars is literally called
 * "deleted account".
 *
 * Two kinds, both anchored to a line the person actually said:
 *
 *   quote  a line that is funny, sharp or unmistakably them. Verbatim.
 *   trait  something they care about or keep coming back to, with the line
 *          that showed it.
 *
 * The part that needed the most thought is the cap. Thirty slots alone does
 * not stop the most prolific poster in the room from filling them with noise:
 * it only means their thirty turn over every fortnight. So three rules work
 * together:
 *
 *   - at most `perDay` new memories per person per day
 *   - once full, a new memory must outscore their weakest one to get in, so
 *     quality only ratchets up
 *   - a roster entry can lower the cap or switch capture off for one person
 *
 * Everything here is pure: no file, no clock, no model.
 */

export type MemoryKind = 'quote' | 'trait';

export interface MemoryRecord {
  /** chat, turn time, author and kind — so capturing the same line twice is a no-op. */
  id: string;
  kind: MemoryKind;
  /** One line about them, written by the model, phrased to be said aloud later. */
  summary: string;
  /** What they actually said, copied from the turn. Never written by the model. */
  text: string;
  /** The Telegram chat it was said in. Recall never carries it into another group. */
  chatId: string;
  /** When they said it. Epoch ms. */
  at: number;
  /** When it last came up again. Decay runs from here. */
  lastSeenAt: number;
  /** 1, plus one for each later conversation that showed the same thing. */
  seen: number;
  /** 1 worth keeping, 2 characteristic, 3 what the room remembers them for. */
  salience: number;
  /** When PEPEDAWN last quoted it back. */
  lastUsedAt?: number;
}

export interface PersonMemory {
  /** Numeric Telegram user id, as a string. The only thing that identifies them. */
  id: string;
  /** Display name when last captured. For reading the file, never for lookup. */
  name: string;
  records: MemoryRecord[];
  /** Asked to be forgotten. Nothing new is captured until they say otherwise. */
  optedOut?: boolean;
}

export interface MemoryPolicy {
  /** Most memories one person can hold. */
  cap: number;
  /** Most new memories one person can gain from a single day. */
  perDay: number;
  /** A memory's weight halves over this many days since it last came up. */
  halfLifeDays: number;
  /** False switches capture off for this person entirely. */
  capture: boolean;
}

export const DEFAULT_POLICY: MemoryPolicy = {
  cap: 30,
  perDay: 2,
  halfLifeDays: 90,
  capture: true,
};

const DAY_MS = 86_400_000;

/** A quote is not offered again for this long after it was used. */
export const QUOTE_REUSE_MS = 30 * DAY_MS;

export function clampSalience(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(3, Math.max(1, n)) : 1;
}

/**
 * How much a memory deserves its slot.
 *
 * Salience, faded by time since it last came up, lifted a little each time a
 * later conversation showed the same thing. Reinforcement is capped so one
 * running joke cannot become untouchable.
 */
export function keepScore(
  record: MemoryRecord,
  now: number,
  halfLifeDays = DEFAULT_POLICY.halfLifeDays
): number {
  const ageDays = Math.max(0, (now - record.lastSeenAt) / DAY_MS);
  const decay = Math.pow(0.5, ageDays / halfLifeDays);
  const reinforcement = 1 + 0.25 * Math.min(Math.max(record.seen - 1, 0), 4);
  return clampSalience(record.salience) * decay * reinforcement;
}

function utcDay(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

function weakestIndex(records: MemoryRecord[], now: number, halfLifeDays: number): number {
  let index = 0;
  for (let i = 1; i < records.length; i++) {
    if (keepScore(records[i], now, halfLifeDays) < keepScore(records[index], now, halfLifeDays)) index = i;
  }
  return index;
}

export type RejectReason =
  | 'opted_out'
  | 'not_captured'
  | 'duplicate'
  | 'daily_limit'
  | 'below_weakest';

export type AdmitOutcome =
  | { status: 'admitted'; record: MemoryRecord }
  | { status: 'replaced'; record: MemoryRecord; evicted: MemoryRecord }
  | { status: 'rejected'; reason: RejectReason };

/**
 * Try to add a memory to a person. Mutates `person` only when it is let in.
 *
 * A cap lowered by the roster takes effect here, at the next admission: the
 * weakest memories are dropped until the person fits.
 */
export function admit(
  person: PersonMemory,
  candidate: MemoryRecord,
  policy: MemoryPolicy,
  now: number
): AdmitOutcome {
  if (person.optedOut) return { status: 'rejected', reason: 'opted_out' };
  if (!policy.capture || policy.cap <= 0) return { status: 'rejected', reason: 'not_captured' };
  if (person.records.some((r) => r.id === candidate.id)) return { status: 'rejected', reason: 'duplicate' };

  const day = utcDay(candidate.at);
  const sameDay = person.records.filter((r) => utcDay(r.at) === day).length;
  if (sameDay >= policy.perDay) return { status: 'rejected', reason: 'daily_limit' };

  while (person.records.length > policy.cap) {
    person.records.splice(weakestIndex(person.records, now, policy.halfLifeDays), 1);
  }

  if (person.records.length < policy.cap) {
    person.records.push(candidate);
    return { status: 'admitted', record: candidate };
  }

  const weakest = weakestIndex(person.records, now, policy.halfLifeDays);
  const evicted = person.records[weakest];
  if (keepScore(candidate, now, policy.halfLifeDays) <= keepScore(evicted, now, policy.halfLifeDays)) {
    return { status: 'rejected', reason: 'below_weakest' };
  }
  person.records[weakest] = candidate;
  return { status: 'replaced', record: candidate, evicted };
}

/**
 * A later conversation showed the same thing again.
 *
 * Only a line said after the memory last came up counts, which makes
 * re-running capture over the same conversation harmless.
 */
export function reinforce(
  person: PersonMemory,
  recordId: string,
  at: number,
  salience?: number
): MemoryRecord | undefined {
  const record = person.records.find((r) => r.id === recordId);
  if (!record || at <= record.lastSeenAt) return undefined;
  record.seen += 1;
  record.lastSeenAt = at;
  if (salience !== undefined) record.salience = Math.max(record.salience, clampSalience(salience));
  return record;
}

/** A person's memories, strongest first, optionally limited to one chat. */
export function orderForListing(
  person: PersonMemory,
  now: number,
  scopeChatId?: string,
  halfLifeDays = DEFAULT_POLICY.halfLifeDays
): MemoryRecord[] {
  return person.records
    .filter((r) => !scopeChatId || r.chatId === scopeChatId)
    .map((r) => ({ r, score: keepScore(r, now, halfLifeDays) }))
    .sort((a, b) => b.score - a.score || b.r.at - a.r.at)
    .map(({ r }) => r);
}

const STOPWORDS = new Set([
  'about', 'after', 'again', 'also', 'been', 'being', 'could', 'does', 'doing', 'dont', 'from',
  'going', 'have', 'here', 'into', 'just', 'know', 'like', 'make', 'more', 'much', 'only', 'over',
  'really', 'said', 'some', 'still', 'than', 'that', 'thats', 'their', 'them', 'then', 'there',
  'these', 'they', 'thing', 'think', 'this', 'what', 'when', 'where', 'which', 'with', 'would',
  'your', 'youre', 'pepedawn',
]);

function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []) {
    if (!STOPWORDS.has(word)) out.add(word);
  }
  return out;
}

/** 0..1 — how much a memory has to do with what was just said. */
export function relevance(record: MemoryRecord, userText: string): number {
  const asked = words(userText);
  if (asked.size === 0) return 0;
  const known = words(`${record.summary} ${record.text}`);
  let overlap = 0;
  for (const word of asked) if (known.has(word)) overlap++;
  return Math.min(1, overlap / Math.min(asked.size, 3));
}

export interface Recollection {
  records: MemoryRecord[];
  /** A quote that may be called back this time, if any. */
  quotable?: MemoryRecord;
}

/**
 * What to hold in mind while answering this person.
 *
 * Relevance lifts a memory but never gates it: the point is to know the
 * person, not only to match their words.
 */
export function recollect(
  person: PersonMemory,
  options: {
    userText: string;
    now: number;
    /** Only memories from this chat. Undefined means all of them (a DM). */
    scopeChatId?: string;
    allowQuote: boolean;
    limit?: number;
    halfLifeDays?: number;
  }
): Recollection | null {
  const halfLife = options.halfLifeDays ?? DEFAULT_POLICY.halfLifeDays;
  const scored = person.records
    .filter((r) => !options.scopeChatId || r.chatId === options.scopeChatId)
    .map((r) => ({ r, score: keepScore(r, options.now, halfLife) * (1 + relevance(r, options.userText)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 5);
  if (scored.length === 0) return null;

  const quotable = options.allowQuote
    ? scored.find(
        ({ r }) => r.kind === 'quote' && (!r.lastUsedAt || options.now - r.lastUsedAt >= QUOTE_REUSE_MS)
      )?.r
    : undefined;

  return { records: scored.map(({ r }) => r), quotable };
}

/** The reply-prompt section. */
export function formatRecollection(recollection: Recollection, name: string): string {
  const lines = recollection.records.map((r) => {
    const when = new Date(r.at).toISOString().slice(0, 10);
    return r.kind === 'quote' ? `- ${when}: they said "${r.text}" (${r.summary})` : `- ${when}: ${r.summary}`;
  });
  return [
    `What you remember about ${name}, who is talking to you now, from earlier conversations:`,
    ...lines,
    'This is so you know them the way a regular knows the other regulars. Let it shape how you talk to them. ' +
      'Do not recite it, list it or announce that you remember, and never use it to mock or embarrass them.',
    recollection.quotable
      ? `If it fits naturally you may call back to one thing they said, "${recollection.quotable.text}", in passing. Most replies should not.`
      : 'Do not quote any of it back this time.',
    '',
  ].join('\n');
}

function normalisedWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * Did the reply actually call the quote back?
 *
 * Three words in a row from the quote, or the whole of a shorter one. The
 * reuse clock only starts when it was used, not when it was offered: most
 * offers are rightly declined, and burning them would leave nothing to say.
 */
export function quoteWasUsed(reply: string, quote: string): boolean {
  const q = normalisedWords(quote);
  if (q.length === 0) return false;
  const r = ` ${normalisedWords(reply).join(' ')} `;
  if (q.length < 3) return r.includes(` ${q.join(' ')} `);
  for (let i = 0; i + 3 <= q.length; i++) {
    if (r.includes(` ${q.slice(i, i + 3).join(' ')} `)) return true;
  }
  return false;
}
