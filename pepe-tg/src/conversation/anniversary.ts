/**
 * The Fake Rares 5th birthday: a day of scheduled posts, driven by a JSON
 * timeline, run by the same shape of machinery as the recap and the release
 * note — a tick, a persisted record of what has been sent, and nothing held in
 * memory that a restart would lose. PM2 restarts the bot at 02:00, which is
 * inside the event day, so that last part is not optional.
 *
 * Everything in this file is pure: no clock, no files, no Telegram. The clock
 * and the sends are injected, which is what lets --dry-run and --fast-forward
 * run the real code path in a script rather than a parallel one.
 *
 * Native polls are not part of it. The bot is a plain member of the group and
 * the group's member permissions forbid polls, so every quiz is inline-keyboard
 * trivia instead — which also gives per-person scoring that a poll cannot.
 */

import type { CardInfo } from '../data/fullCardIndex';

export interface TimedText {
  time: string;
  text: string;
}

export interface TriviaQuestion {
  time: string;
  question: string;
  options: string[];
  /** Index into options. */
  answer: number;
  explanation: string;
  reveal_after_min?: number;
}

export interface LoreContest {
  /** When entries open, close, and the winner is announced. HH:MM local. */
  opens: string;
  closes: string;
  announce: string;
  /** One nudge before close (older form). */
  reminder?: string;
  /** Posted at `reminder`; {ENTRIES} {CLOSES}. */
  reminder_text?: string;
  /** The countdown: each posted at its time; {ENTRIES} {CLOSES}. */
  reminders?: TimedText[];
  max_per_person: number;
  /** Telegram ids that may not enter (the prize's makers). ANNIVERSARY_EXCLUDED_IDS adds to this. */
  excluded_ids?: string[];
  /** Posted at open; {PRIZE} {MAX} {CLOSES}. */
  open_text: string;
  /** Posted at announce; {WINNER} {HANDLE} {CARD} {LORE} {REASON} {ENTRIES} {PRIZE}. */
  winner_text: string;
  /** Posted at announce when nobody entered. */
  no_entries_text: string;
  /** Posted at announce when the judge could not decide; {ENTRIES}. */
  judge_failed_text: string;
  prize: string;
}

export interface Schedule {
  lore_contest?: LoreContest;
  event: {
    date: string;
    timezone: string;
    chat_ids?: string[];
    scrilla_handle: string;
    /** A post this late is skipped rather than sent, so a long outage does not replay the morning. */
    stale_after_min?: number;
  };
  history_drops: Array<TimedText & { card?: string }>;
  card_of_the_hour: { times: string[]; template: string; series_weight?: Record<string, number> };
  scrilla_counter: { start: TimedText; updates: TimedText[]; final: TimedText };
  trivia: TriviaQuestion[];
  closers: TimedText[];
  templates: {
    trivia: string;
    reveal: string;
    reveal_after_min?: number;
    leaderboard_empty: string;
  };
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Throws on anything the engine could not run. Read once, at load. */
export function validateSchedule(raw: any): Schedule {
  const fail = (why: string) => { throw new Error(`fakerares5 schedule: ${why}`); };
  if (!raw || typeof raw !== 'object') fail('not an object');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.event?.date ?? '')) fail('event.date must be YYYY-MM-DD');
  if (typeof raw.event?.timezone !== 'string') fail('event.timezone missing');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw.event.timezone });
  } catch {
    fail(`unknown timezone ${raw.event.timezone}`);
  }
  const time = (t: unknown, where: string) => {
    if (typeof t !== 'string' || !/^\d{2}:\d{2}$/.test(t)) fail(`${where}: time must be HH:MM`);
  };
  for (const [i, d] of (raw.history_drops ?? []).entries()) time(d.time, `history_drops[${i}]`);
  for (const [i, t] of (raw.card_of_the_hour?.times ?? []).entries()) time(t, `card_of_the_hour.times[${i}]`);
  time(raw.scrilla_counter?.start?.time, 'scrilla_counter.start');
  for (const [i, u] of (raw.scrilla_counter?.updates ?? []).entries()) time(u.time, `scrilla_counter.updates[${i}]`);
  time(raw.scrilla_counter?.final?.time, 'scrilla_counter.final');
  for (const [i, q] of (raw.trivia ?? []).entries()) {
    time(q.time, `trivia[${i}]`);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) fail(`trivia[${i}]: 2-4 options`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) fail(`trivia[${i}]: answer out of range`);
  }
  for (const [i, c] of (raw.closers ?? []).entries()) time(c.time, `closers[${i}]`);
  if (!raw.templates?.trivia || !raw.templates?.reveal) fail('templates.trivia and templates.reveal required');
  if (raw.lore_contest) {
    const lc = raw.lore_contest;
    for (const k of ['opens', 'closes', 'announce']) time(lc[k], `lore_contest.${k}`);
    if (lc.reminder !== undefined) time(lc.reminder, 'lore_contest.reminder');
    for (const [i, r] of (lc.reminders ?? []).entries()) {
      time(r?.time, `lore_contest.reminders[${i}]`);
      if (typeof r?.text !== 'string' || !r.text.trim()) fail(`lore_contest.reminders[${i}].text`);
    }
    if (!Number.isInteger(lc.max_per_person) || lc.max_per_person < 1) fail('lore_contest.max_per_person');
    for (const k of ['open_text', 'winner_text', 'no_entries_text', 'judge_failed_text', 'prize']) {
      if (typeof lc[k] !== 'string' || !lc[k].trim()) fail(`lore_contest.${k} required`);
    }
  }
  return raw as Schedule;
}

/** Offset of `timeZone` from UTC at `instant`, in ms. */
function tzOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wall - Math.floor(instant / 1000) * 1000;
}

/** The instant at which `date` `time` happens on the wall clock of `timeZone`. */
export function zonedToUtc(date: string, time: string, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - tzOffsetMs(guess, timeZone);
  // The offset at the corrected instant can differ across a DST edge.
  const again = guess - tzOffsetMs(utc, timeZone);
  if (again !== utc) utc = again;
  return utc;
}

function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export interface DayBounds {
  start: number;
  end: number;
}

export function eventDay(schedule: Schedule): DayBounds {
  return {
    start: zonedToUtc(schedule.event.date, '00:00', schedule.event.timezone),
    end: zonedToUtc(nextDate(schedule.event.date), '00:00', schedule.event.timezone),
  };
}

export function isEventDay(schedule: Schedule, now: number): boolean {
  const { start, end } = eventDay(schedule);
  return now >= start && now < end;
}

export type PlannedItem =
  | { id: string; at: number; kind: 'history'; text: string; card?: string }
  | { id: string; at: number; kind: 'card' }
  | { id: string; at: number; kind: 'counter'; text: string }
  | { id: string; at: number; kind: 'trivia'; index: number; question: TriviaQuestion }
  | { id: string; at: number; kind: 'closer'; text: string }
  | { id: string; at: number; kind: 'lore-open' }
  | { id: string; at: number; kind: 'lore-reminder'; text: string }
  | { id: string; at: number; kind: 'lore-winner' };

/** The whole day as timed items, oldest first. Ids are stable across restarts. */
export function planDay(schedule: Schedule): PlannedItem[] {
  const { date, timezone } = schedule.event;
  const at = (time: string) => zonedToUtc(date, time, timezone);
  const items: PlannedItem[] = [];

  schedule.history_drops.forEach((d, i) =>
    items.push({ id: `history-${i}`, at: at(d.time), kind: 'history', text: d.text, card: d.card })
  );
  schedule.card_of_the_hour.times.forEach((t) =>
    items.push({ id: `card-${t}`, at: at(t), kind: 'card' })
  );
  const c = schedule.scrilla_counter;
  items.push({ id: 'counter-start', at: at(c.start.time), kind: 'counter', text: c.start.text });
  c.updates.forEach((u, i) =>
    items.push({ id: `counter-update-${i}`, at: at(u.time), kind: 'counter', text: u.text })
  );
  items.push({ id: 'counter-final', at: at(c.final.time), kind: 'counter', text: c.final.text });
  schedule.trivia.forEach((q, i) =>
    items.push({ id: `trivia-${i}`, at: at(q.time), kind: 'trivia', index: i, question: q })
  );
  schedule.closers.forEach((cl, i) =>
    items.push({ id: `closer-${i}`, at: at(cl.time), kind: 'closer', text: cl.text })
  );
  const lc = schedule.lore_contest;
  if (lc) {
    items.push({ id: 'lore-open', at: at(lc.opens), kind: 'lore-open' });
    if (lc.reminder && lc.reminder_text) {
      items.push({ id: 'lore-reminder', at: at(lc.reminder), kind: 'lore-reminder', text: lc.reminder_text });
    }
    (lc.reminders ?? []).forEach((r, i) =>
      items.push({ id: `lore-reminder-${i}`, at: at(r.time), kind: 'lore-reminder', text: r.text })
    );
    items.push({ id: 'lore-winner', at: at(lc.announce), kind: 'lore-winner' });
  }

  return items.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/* ------------------------------------------------------------ lore contest */

export interface LoreEntry {
  /** chat, time and person: the same line twice is one entry. */
  id: string;
  /** 1-based, in order of arrival. What the room sees. */
  number: number;
  card: string;
  lore: string;
  submitterId: string;
  name: string;
  username?: string;
  chatId: string;
  at: number;
  /** The credited artist's own lore; it went into the corpus on arrival. */
  fromArtist: boolean;
  /** PEPEDAWN's quiet score on arrival, 1–10. Never shown; only names are revealed. */
  score?: number;
  scoreReason?: string;
}

/** How many names the room may see, and how many the final judge chooses between. */
export const LORE_SHORTLIST = 5;

/** Prompt to score one entry as it arrives. Same criteria as the final judge, one entry at a time. */
export function buildScorePrompt(entry: LoreEntry, card: CardInfo | undefined): string {
  const known = card
    ? `Series ${card.series} #${card.card}, by ${card.artist ?? 'unknown'}, supply ${card.supply ?? '?'}, ${card.issuance ?? 'date unknown'}`
    : 'not in the index';
  return [
    'It is the Fake Rares 5th birthday and members are submitting lore for their favourite cards.',
    `Score this entry from 1 to 10 on how well it honours the fakes.`,
    '',
    `Card: ${entry.card} (${known})`,
    `Entrant: ${entry.name}${entry.fromArtist ? " (the card's artist)" : ''}`,
    `Entry: "${entry.lore.replace(/\s+/g, ' ')}"`,
    '',
    'Weigh, in order: true to the card and its artist (nothing invented, nothing contradicting the facts',
    'above); captures what Fake Rares are - the art, the humour, the history, the people; worth',
    'retelling in five years; wit and warmth, never at anyone\'s expense. Insults, authorship claims',
    'and anything false score 1. Length and polish do not matter.',
    '',
    'Return STRICT JSON only: {"score": <1-10>, "reason": "<one short sentence>"}',
  ].join('\n');
}

export function parseScoreResponse(raw: string): { score: number; reason: string } | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const score = Math.round(Number(parsed?.score));
    if (!Number.isFinite(score) || score < 1 || score > 10) return null;
    const reason = typeof parsed?.reason === 'string' ? parsed.reason.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    return { score, reason };
  } catch {
    return null;
  }
}

/** Entries best first: score, then arrival. Unscored entries sort last, by arrival. */
export function loreStandings(entries: LoreEntry[]): LoreEntry[] {
  return [...entries].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.at - b.at);
}

/** One line per person, best first, no duplicates: a person appears once, for their best entry. */
export function loreTopNames(entries: LoreEntry[], limit = LORE_SHORTLIST): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const e of loreStandings(entries)) {
    if (seen.has(e.submitterId)) continue;
    seen.add(e.submitterId);
    names.push(e.name);
    if (names.length >= limit) break;
  }
  return names;
}

export interface LoreWinner {
  entryId: string;
  reason: string;
  decidedAt: number;
  stored?: boolean;
}

export interface LoreContestState {
  entries: LoreEntry[];
  winner?: LoreWinner;
  /** Set when the judge was asked and gave nothing usable. */
  judgeFailed?: boolean;
}

export type EnterOutcome =
  | { entered: true; entry: LoreEntry; remaining: number }
  | { entered: false; reason: 'no_contest' | 'not_open' | 'closed' | 'wrong_chat' | 'cap' | 'duplicate' | 'excluded' };

/** Contest window for `now`: before, open, or closed. */
export function loreContestPhase(schedule: Schedule, now: number): 'none' | 'before' | 'open' | 'closed' {
  const lc = schedule.lore_contest;
  if (!lc) return 'none';
  const { date, timezone } = schedule.event;
  if (now < zonedToUtc(date, lc.opens, timezone)) return 'before';
  if (now >= zonedToUtc(date, lc.closes, timezone)) return 'closed';
  return 'open';
}

/** Try to enter. Pure over the state; mutates it only when the entry is taken. */
export function enterLore(
  state: AnniversaryStateData,
  schedule: Schedule,
  chatIds: string[],
  input: { card: string; lore: string; submitterId: string; name: string; username?: string; chatId: string; at: number; fromArtist: boolean },
  /** People who made the prize. Telegram ids, never names. */
  excludedIds: string[] = []
): EnterOutcome {
  const lc = schedule.lore_contest;
  if (!lc) return { entered: false, reason: 'no_contest' };
  const phase = loreContestPhase(schedule, input.at);
  if (phase === 'before') return { entered: false, reason: 'not_open' };
  if (phase === 'closed') return { entered: false, reason: 'closed' };
  if (!chatIds.includes(input.chatId)) return { entered: false, reason: 'wrong_chat' };
  if (excludedIds.includes(input.submitterId)) return { entered: false, reason: 'excluded' };

  const mine = state.lore.entries.filter((e) => e.submitterId === input.submitterId);
  if (mine.length >= lc.max_per_person) return { entered: false, reason: 'cap' };
  const same = (a: string, b: string) => a.replace(/\W+/g, ' ').trim().toLowerCase() === b.replace(/\W+/g, ' ').trim().toLowerCase();
  if (state.lore.entries.some((e) => e.card === input.card && same(e.lore, input.lore))) return { entered: false, reason: 'duplicate' };

  const entry: LoreEntry = {
    id: `${input.chatId}:${input.at}:${input.submitterId}`,
    number: state.lore.entries.length + 1,
    card: input.card.toUpperCase(),
    lore: input.lore.trim(),
    submitterId: input.submitterId,
    name: input.name,
    username: input.username,
    chatId: input.chatId,
    at: input.at,
    fromArtist: input.fromArtist,
  };
  state.lore.entries.push(entry);
  return { entered: true, entry, remaining: lc.max_per_person - mine.length - 1 };
}

/** Record a score. Only the first score for an entry counts. */
export function scoreLore(state: AnniversaryStateData, entryId: string, score: number, reason: string): boolean {
  const entry = state.lore.entries.find((e) => e.id === entryId);
  if (!entry || entry.score !== undefined) return false;
  entry.score = score;
  entry.scoreReason = reason;
  return true;
}

/**
 * The judging prompt.
 *
 * The model picks a number and writes one sentence for the room. It never
 * rewrites an entry, and the sentence is about what the entry did right. Each
 * entry is shown with the card's real facts, so "true to the card" can be
 * checked against something rather than vibes.
 */
export function buildJudgePrompt(entries: LoreEntry[], facts: (asset: string) => CardInfo | undefined): string {
  const lines = entries.map((e) => {
    const c = facts(e.card);
    const known = c
      ? `${e.card} — Series ${c.series} #${c.card}, by ${c.artist ?? 'unknown'}, supply ${c.supply ?? '?'}, ${c.issuance ?? 'date unknown'}`
      : e.card;
    return `${e.number}. [${e.name}${e.fromArtist ? ', the card\'s artist' : ''}] on ${known}\n   "${e.lore.replace(/\s+/g, ' ')}"`;
  });
  return [
    'It is the Fake Rares 5th birthday. Members of the community submitted lore for their favourite',
    'cards today, and one of them wins a card. Choose the ONE entry that best honours the fakes.',
    '',
    'What honours the fakes, in order of weight:',
    '1. True to the card and its artist. Nothing invented, nothing that contradicts the facts given',
    '   for that card. A story the artist would recognise.',
    '2. Captures what Fake Rares are: the art, the humour, the history, the people who made it.',
    '3. Worth retelling in another five years.',
    '4. Wit and warmth. Never at anyone\'s expense.',
    '',
    'Disqualified outright: insults, claims about who made a card, anything false, anything that is',
    'not really about the card. Length and polish do not matter; a rough true story beats a slick',
    'empty one. An artist writing about their own card is welcome and not favoured for it.',
    '',
    'Return STRICT JSON only:',
    '{"winner": <entry number>, "reason": "<one sentence, spoken aloud to the room, naming what it did right>"}',
    '',
    'Entries:',
    ...lines,
  ].join('\n');
}

/** The model's choice, or null when it gave nothing that points at a real entry. */
export function parseJudgeResponse(raw: string, entries: LoreEntry[]): { entry: LoreEntry; reason: string } | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const entry = entries.find((e) => e.number === parsed?.winner);
    if (!entry) return null;
    const reason = typeof parsed?.reason === 'string' ? parsed.reason.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
    return { entry, reason: reason || 'It honours the fakes.' };
  } catch {
    return null;
  }
}

export function handleFor(e: { name: string; username?: string }): string {
  return e.username ? `@${e.username.replace(/^@/, '')}` : e.name;
}

export function fill(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{([A-Z_]+)\}/g, (whole, key) => {
    const v = vars[key];
    return v === undefined || v === null ? whole : String(v);
  });
}

/** Mentions per hour since the day began, never dividing by less than an hour. */
export function scrillaRate(count: number, dayStart: number, now: number): string {
  const hours = Math.max(1, (now - dayStart) / HOUR);
  return (count / hours).toFixed(1);
}

export interface Answer {
  opt: number;
  correct: boolean;
  name: string;
  at: number;
}

export interface Standing {
  userId: string;
  name: string;
  score: number;
  /** When they last got one right; ties go to whoever got there first. */
  lastCorrectAt: number;
}

export function standings(perQuestion: Record<string, Record<string, Answer>>): Standing[] {
  const by = new Map<string, Standing>();
  for (const answers of Object.values(perQuestion)) {
    for (const [userId, a] of Object.entries(answers)) {
      const s = by.get(userId) ?? { userId, name: a.name, score: 0, lastCorrectAt: 0 };
      s.name = a.name || s.name;
      if (a.correct) {
        s.score += 1;
        s.lastCorrectAt = Math.max(s.lastCorrectAt, a.at);
      }
      by.set(userId, s);
    }
  }
  return [...by.values()]
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.lastCorrectAt - b.lastCorrectAt || a.name.localeCompare(b.name));
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function formatLeaderboard(list: Standing[], limit: number, empty: string): string {
  if (list.length === 0) return empty;
  return list
    .slice(0, limit)
    .map((s, i) => `${MEDALS[i] ?? `${i + 1}.`} ${s.name} — ${s.score}`)
    .join('\n');
}

/** Cards the bot can actually send. Documents are refused by the channel; those are handled at send time. */
export function sendableCards(cards: CardInfo[]): CardInfo[] {
  return cards.filter((c) => c.series >= 0 && ['jpeg', 'jpg', 'png', 'gif', 'mp4'].includes(c.ext));
}

/**
 * A random card not yet used today, weighted by series.
 *
 * `random` is injected so the choice is reproducible in tests.
 */
export function pickCard(
  cards: CardInfo[],
  used: Set<string>,
  weights: Record<string, number> = {},
  random: () => number = Math.random
): CardInfo | null {
  const pool = cards.filter((c) => !used.has(c.asset));
  if (pool.length === 0) return null;
  const weight = (c: CardInfo) => Math.max(0, weights[String(c.series)] ?? 1);
  const total = pool.reduce((sum, c) => sum + weight(c), 0);
  if (total <= 0) return pool[Math.floor(random() * pool.length)];
  let r = random() * total;
  for (const c of pool) {
    r -= weight(c);
    if (r < 0) return c;
  }
  return pool[pool.length - 1];
}

export function cardCaption(template: string, card: CardInfo): string {
  return fill(template, {
    ASSET: card.asset,
    SERIES: card.series,
    CARD: card.card,
    ARTIST: card.artist ?? 'unknown artist',
    SUPPLY: card.supply === null || card.supply === undefined ? '?' : card.supply.toLocaleString('en-US'),
    ISSUANCE: card.issuance ?? 'date unknown',
  });
}

export const TRIVIA_CALLBACK_PREFIX = 'fr5:t:';

export function triviaCallback(qid: string, option: number): string {
  return `${TRIVIA_CALLBACK_PREFIX}${qid}:${option}`;
}

export function parseTriviaCallback(data: string): { qid: string; option: number } | null {
  if (!data.startsWith(TRIVIA_CALLBACK_PREFIX)) return null;
  const [qid, opt] = data.slice(TRIVIA_CALLBACK_PREFIX.length).split(':');
  const option = parseInt(opt, 10);
  if (!qid || !Number.isInteger(option) || option < 0) return null;
  return { qid, option };
}

export interface TriviaRecord {
  messageId: number;
  chatId: string;
  sentAt: number;
  revealAt: number;
  revealed?: boolean;
  answers: Record<string, Answer>;
}

/** What the engine persists. Kept as plain data so a file store is trivial. */
export interface AnniversaryStateData {
  date?: string;
  sent: Record<string, { at: number; messageId?: number; skipped?: boolean }>;
  cardsUsed: string[];
  scrilla: { date: string; count: number };
  trivia: Record<string, TriviaRecord>;
  lore: LoreContestState;
}

export function emptyState(): AnniversaryStateData {
  return { sent: {}, cardsUsed: [], scrilla: { date: '', count: 0 }, trivia: {}, lore: { entries: [] } };
}

/** Persistence contract. A file today; deliberately small. */
export interface AnniversaryStore {
  data(): AnniversaryStateData;
  save(): void;
}

/** What the engine can do to the world. The service speaks Telegram; the preview speaks console. */
export interface Effects {
  sendText(chatId: string, text: string): Promise<number | null>;
  /** True when the card went out. A card that cannot be sent is skipped, never retried. */
  sendCard(chatId: string, card: CardInfo, caption: string): Promise<boolean>;
  sendQuestion(chatId: string, text: string, buttons: Array<{ label: string; data: string }>): Promise<number | null>;
  editMessage(chatId: string, messageId: number, text: string): Promise<boolean>;
  /** Ask the judge. Returns the raw model reply; parsing and validation happen here. */
  judgeLore?(prompt: string): Promise<string>;
  /** Put the winning lore into the corpus. True when it landed. */
  storeLore?(entry: LoreEntry): Promise<boolean>;
  log(line: string): void;
}

export interface EngineOptions {
  schedule: Schedule;
  store: AnniversaryStore;
  cards: CardInfo[];
  effects: Effects;
  chatIds: string[];
  random?: () => number;
}

/** How many cards to try before giving up on one card-of-the-hour slot. */
const CARD_ATTEMPTS = 5;

export class AnniversaryEngine {
  readonly plan: PlannedItem[];
  readonly day: DayBounds;
  private readonly staleMs: number;
  private cards: CardInfo[];

  constructor(private readonly opts: EngineOptions) {
    this.plan = planDay(opts.schedule);
    this.day = eventDay(opts.schedule);
    this.staleMs = (opts.schedule.event.stale_after_min ?? 45) * MIN;
    this.cards = sendableCards(opts.cards);
  }

  private get state(): AnniversaryStateData {
    const data = this.opts.store.data();
    // The counter belongs to one day. Anything from another date starts at zero.
    if (data.scrilla.date !== this.opts.schedule.event.date) {
      data.scrilla = { date: this.opts.schedule.event.date, count: 0 };
    }
    return data;
  }

  /** Fire everything due and not yet sent, then any trivia reveal that is due. */
  async tick(now: number): Promise<void> {
    if (now < this.day.start || now >= this.day.end + this.staleMs) return;
    const state = this.state;

    for (const item of this.plan) {
      if (item.at > now || state.sent[item.id]) continue;

      // Stamped before the send, so a crash mid-send costs one post rather
      // than one per boot. The recap learned this the expensive way.
      if (now - item.at > this.staleMs) {
        state.sent[item.id] = { at: now, skipped: true };
        this.opts.store.save();
        this.opts.effects.log(`skipped ${item.id}: ${Math.round((now - item.at) / MIN)} min late`);
        continue;
      }
      state.sent[item.id] = { at: now };
      this.opts.store.save();

      try {
        await this.fire(item, now);
      } catch (error) {
        this.opts.effects.log(`failed ${item.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.revealDue(now);
  }

  private vars(now: number): Record<string, string | number> {
    const s = this.state;
    return {
      SCRILLA: this.opts.schedule.event.scrilla_handle,
      N: s.scrilla.count,
      RATE: scrillaRate(s.scrilla.count, this.day.start, now),
    };
  }

  private async fire(item: PlannedItem, now: number): Promise<void> {
    const { effects, schedule } = this.opts;
    for (const chatId of this.opts.chatIds) {
      switch (item.kind) {
        case 'history': {
          const text = fill(item.text, this.vars(now));
          const card = item.card ? this.cards.find((c) => c.asset === item.card!.toUpperCase()) : undefined;
          const sent = card ? await effects.sendCard(chatId, card, text) : false;
          if (!sent) await effects.sendText(chatId, text);
          break;
        }
        case 'card': {
          const state = this.state;
          const used = new Set(state.cardsUsed);
          for (let attempt = 0; attempt < CARD_ATTEMPTS; attempt++) {
            const card = pickCard(this.cards, used, schedule.card_of_the_hour.series_weight, this.opts.random);
            if (!card) break;
            // Used whether or not it went out: a card that fails once is not tried again today.
            used.add(card.asset);
            state.cardsUsed.push(card.asset);
            this.opts.store.save();
            if (await effects.sendCard(chatId, card, cardCaption(schedule.card_of_the_hour.template, card))) break;
            effects.log(`card ${card.asset} could not be sent; trying another`);
          }
          break;
        }
        case 'counter': {
          await effects.sendText(chatId, fill(item.text, this.vars(now)));
          break;
        }
        case 'trivia': {
          const q = item.question;
          const text = fill(schedule.templates.trivia, {
            K: item.index + 1,
            TOTAL: schedule.trivia.length,
            QUESTION: q.question,
          });
          const buttons = q.options.map((label, i) => ({ label, data: triviaCallback(item.id, i) }));
          const messageId = await effects.sendQuestion(chatId, text, buttons);
          if (messageId === null) break;
          const revealAfter = (q.reveal_after_min ?? schedule.templates.reveal_after_min ?? 15) * MIN;
          this.state.trivia[item.id] = { messageId, chatId, sentAt: now, revealAt: now + revealAfter, answers: {} };
          this.opts.store.save();
          break;
        }
        case 'closer': {
          const board = formatLeaderboard(standings(this.answers()), 10, schedule.templates.leaderboard_empty);
          await effects.sendText(chatId, fill(item.text, { ...this.vars(now), LEADERBOARD: board }));
          break;
        }
        case 'lore-open': {
          const lc = schedule.lore_contest!;
          await effects.sendText(chatId, fill(lc.open_text, { ...this.vars(now), PRIZE: lc.prize, MAX: lc.max_per_person, CLOSES: lc.closes }));
          break;
        }
        case 'lore-reminder': {
          const lc = schedule.lore_contest!;
          await effects.sendText(chatId, fill(item.text, { ...this.vars(now), ENTRIES: this.state.lore.entries.length, CLOSES: lc.closes }));
          break;
        }
        case 'lore-winner': {
          await effects.sendText(chatId, await this.decideLore(now));
          break;
        }
      }
    }
  }

  /**
   * Judge once, remember the verdict, store the winner. Idempotent: a second
   * call (the restart case, or a second chat) reuses the recorded decision.
   */
  private async decideLore(now: number): Promise<string> {
    const lc = this.opts.schedule.lore_contest!;
    const state = this.state;
    const entries = state.lore.entries;
    const vars = { ...this.vars(now), ENTRIES: entries.length, PRIZE: lc.prize };
    if (entries.length === 0) return fill(lc.no_entries_text, vars);

    let winner = state.lore.winner ? entries.find((e) => e.id === state.lore.winner!.entryId) : undefined;
    let reason = state.lore.winner?.reason ?? '';

    if (!winner && !state.lore.judgeFailed) {
      const judge = this.opts.effects.judgeLore;
      let verdict: { entry: LoreEntry; reason: string } | null = null;
      if (judge) {
        // The final pick is made between the quietly scored top entries — the
        // same names the room could ask for during the day — so the result is
        // never a surprise from outside the shortlist.
        const shortlist = entries.some((e) => e.score !== undefined)
          ? loreStandings(entries).slice(0, LORE_SHORTLIST)
          : entries;
        const prompt = buildJudgePrompt(shortlist, (asset) => this.opts.cards.find((c) => c.asset === asset));
        for (let attempt = 0; attempt < 2 && !verdict; attempt++) {
          try {
            verdict = parseJudgeResponse(await judge(prompt), shortlist);
          } catch (error) {
            this.opts.effects.log(`judge failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      if (!verdict) {
        state.lore.judgeFailed = true;
        this.opts.store.save();
        return fill(lc.judge_failed_text, vars);
      }
      winner = verdict.entry;
      reason = verdict.reason;
      state.lore.winner = { entryId: winner.id, reason, decidedAt: now };
      this.opts.store.save();
    }
    if (!winner) return fill(lc.judge_failed_text, vars);

    // Into the corpus, once. The artist's own lore is already there.
    if (!state.lore.winner!.stored && !winner.fromArtist && this.opts.effects.storeLore) {
      try {
        if (await this.opts.effects.storeLore(winner)) {
          state.lore.winner!.stored = true;
          this.opts.store.save();
        }
      } catch (error) {
        this.opts.effects.log(`could not store the winning lore: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return fill(lc.winner_text, {
      ...vars,
      WINNER: winner.name,
      HANDLE: handleFor(winner),
      CARD: winner.card,
      LORE: winner.lore,
      REASON: reason,
    });
  }

  private answers(): Record<string, Record<string, Answer>> {
    const out: Record<string, Record<string, Answer>> = {};
    for (const [qid, rec] of Object.entries(this.state.trivia)) out[qid] = rec.answers;
    return out;
  }

  private async revealDue(now: number): Promise<void> {
    const state = this.state;
    for (const [qid, rec] of Object.entries(state.trivia)) {
      if (rec.revealed || now < rec.revealAt) continue;
      const item = this.plan.find((p): p is Extract<PlannedItem, { kind: 'trivia' }> => p.id === qid && p.kind === 'trivia');
      if (!item) continue;
      rec.revealed = true;
      this.opts.store.save();
      const q = item.question;
      const text = fill(this.opts.schedule.templates.reveal, {
        QUESTION: q.question,
        ANSWER: q.options[q.answer],
        EXPLANATION: q.explanation,
        TOP: formatLeaderboard(standings(this.answers()), 5, this.opts.schedule.templates.leaderboard_empty),
      });
      await this.opts.effects.editMessage(rec.chatId, rec.messageId, text);
    }
  }

  /** Everything the day will do, for --dry-run output and for eyeballing the timeline. */
  describe(): string[] {
    return this.plan.map((p) => {
      const when = new Date(p.at).toLocaleTimeString('en-GB', {
        timeZone: this.opts.schedule.event.timezone, hour: '2-digit', minute: '2-digit',
      });
      const what =
        p.kind === 'history' ? `history${p.card ? ` (${p.card})` : ''}: ${p.text.slice(0, 60)}…`
        : p.kind === 'card' ? 'card of the hour'
        : p.kind === 'counter' ? `counter: ${p.text.slice(0, 60)}…`
        : p.kind === 'trivia' ? `trivia ${p.index + 1}: ${p.question.question}`
        : p.kind === 'closer' ? `closer: ${p.text.slice(0, 60)}…`
        : p.kind === 'lore-open' ? 'lore contest opens'
        : p.kind === 'lore-reminder' ? `lore contest countdown: ${p.text.slice(0, 40)}…`
        : 'lore contest: judge and announce';
      return `${when} ${p.id.padEnd(18)} ${what}`;
    });
  }
}

export type TapOutcome = 'locked' | 'already' | 'closed' | 'unknown';

/**
 * Record one tap. First tap per person is final.
 *
 * Pure over the state; the runtime wraps it with persistence and the reply
 * text shown in the little toast Telegram pops for a callback.
 */
export function recordTap(
  state: AnniversaryStateData,
  schedule: Schedule,
  plan: PlannedItem[],
  tap: { qid: string; option: number; userId: string; name: string; at: number }
): TapOutcome {
  const rec = state.trivia[tap.qid];
  const item = plan.find((p): p is Extract<PlannedItem, { kind: 'trivia' }> => p.id === tap.qid && p.kind === 'trivia');
  if (!rec || !item) return 'unknown';
  if (rec.revealed || tap.at >= rec.revealAt) return 'closed';
  if (rec.answers[tap.userId]) return 'already';
  if (tap.option >= item.question.options.length) return 'unknown';
  rec.answers[tap.userId] = {
    opt: tap.option,
    correct: tap.option === item.question.answer,
    name: tap.name,
    at: tap.at,
  };
  void schedule;
  return 'locked';
}

export const SCRILLA = /scrilla/i;

/** Count one message toward the day's tally, if it counts. Returns the new total, or null. */
export function noteMention(state: AnniversaryStateData, date: string, text: string): number | null {
  if (!SCRILLA.test(text || '')) return null;
  if (state.scrilla.date !== date) state.scrilla = { date, count: 0 };
  state.scrilla.count += 1;
  return state.scrilla.count;
}
