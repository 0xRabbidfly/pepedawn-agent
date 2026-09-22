/**
 * The anniversary in a running bot: the schedule file, the state file, and
 * the two hooks the live message path calls into — counting mentions and
 * taking trivia taps.
 *
 * The schedule is re-read whenever the file changes, so a wording fix on the
 * droplet lands on the next tick with no restart. The state file is the record
 * of what has been sent, who answered what, and the day's count; it is what
 * makes the 02:00 restart harmless.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '@elizaos/core';
import {
  SCRILLA,
  emptyState,
  enterLore,
  eventDay,
  formatLeaderboard,
  isEventDay,
  loreContestPhase,
  noteMention,
  parseTriviaCallback,
  planDay,
  recordTap,
  scrillaRate,
  standings,
  validateSchedule,
  type Answer,
  type AnniversaryStateData,
  type AnniversaryStore,
  type EnterOutcome,
  type Schedule,
  type TapOutcome,
} from './anniversary';

export function anniversaryEnabled(): boolean {
  return process.env.ANNIVERSARY_ENABLED === 'true';
}

export function schedulePath(): string {
  return process.env.ANNIVERSARY_SCHEDULE_PATH || join(process.cwd(), 'src', 'data', 'fakerares5-schedule.json');
}

export function statePath(): string {
  return process.env.ANNIVERSARY_STATE_PATH || join(process.cwd(), 'src', 'data', 'anniversary-state.json');
}

let scheduleCache: { path: string; mtimeMs: number; schedule: Schedule | null } | null = null;

/** The schedule, or null when the file is missing or invalid (logged once per change). */
export function loadSchedule(path = schedulePath()): Schedule | null {
  let mtimeMs = 0;
  try {
    if (existsSync(path)) mtimeMs = statSync(path).mtimeMs;
  } catch {
    // Racing a rewrite; the next call reads it.
  }
  if (scheduleCache && scheduleCache.path === path && scheduleCache.mtimeMs === mtimeMs) return scheduleCache.schedule;

  let schedule: Schedule | null = null;
  if (mtimeMs) {
    try {
      schedule = validateSchedule(JSON.parse(readFileSync(path, 'utf8')));
    } catch (error) {
      logger.error({ error, path }, '[Anniversary] schedule unreadable; nothing will be posted until it is fixed');
    }
  }
  scheduleCache = { path, mtimeMs, schedule };
  return schedule;
}

/**
 * Fold what another writer put on disk into this state, in place.
 *
 * Everything here is append-mostly, so a union is the right merge: a post sent
 * by either side stays sent, an answer recorded by either side stays recorded
 * (first tap wins, so an existing answer is never replaced), a reveal by either
 * side sticks, and the count takes the larger figure. In place, because the
 * engine holds a reference across a tick and must not be handed a new object.
 */
export function mergeState(target: AnniversaryStateData, source: AnniversaryStateData): void {
  for (const [id, rec] of Object.entries(source.sent ?? {})) if (!target.sent[id]) target.sent[id] = rec;
  for (const asset of source.cardsUsed ?? []) if (!target.cardsUsed.includes(asset)) target.cardsUsed.push(asset);
  if (source.scrilla) {
    if (!target.scrilla.date) target.scrilla = { ...source.scrilla };
    else if (source.scrilla.date === target.scrilla.date) {
      target.scrilla.count = Math.max(target.scrilla.count, source.scrilla.count);
    }
  }
  for (const [qid, rec] of Object.entries(source.trivia ?? {})) {
    const mine = target.trivia[qid];
    if (!mine) {
      target.trivia[qid] = { ...rec, answers: { ...rec.answers } };
      continue;
    }
    for (const [userId, a] of Object.entries(rec.answers ?? {})) if (!mine.answers[userId]) mine.answers[userId] = a;
    if (rec.revealed) mine.revealed = true;
  }
  if (source.lore) {
    if (!target.lore) target.lore = { entries: [] };
    for (const e of source.lore.entries ?? []) {
      if (!target.lore.entries.some((m) => m.id === e.id)) target.lore.entries.push(e);
    }
    // Numbers are positions in arrival order; renumber after a union so two
    // writers cannot both have handed out "#4".
    target.lore.entries.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    target.lore.entries.forEach((e, i) => { e.number = i + 1; });
    if (!target.lore.winner && source.lore.winner) target.lore.winner = source.lore.winner;
    else if (target.lore.winner && source.lore.winner?.stored) target.lore.winner.stored = true;
    if (source.lore.judgeFailed) target.lore.judgeFailed = true;
  }
}

/**
 * The state file, safe for more than one writer.
 *
 * There are two. The engine runs in the main process; trivia taps arrive in
 * the Telegram plugin, which loads this module as its own copy through a
 * dynamic import and so has its own in-memory state. A plain read-once,
 * write-whole store loses every tap the moment the engine next saves — the
 * fast-forward preview showed a full day of "Locked in ✅" ending in "Nobody
 * played". So: re-read when the file has changed, and merge what is on disk
 * into memory before every write.
 */
export class FileAnniversaryStore implements AnniversaryStore {
  private cache: AnniversaryStateData | null = null;
  private mtimeMs = -1;

  constructor(readonly path: string) {}

  private readDisk(): AnniversaryStateData | null {
    if (!existsSync(this.path)) return null;
    try {
      return { ...emptyState(), ...(JSON.parse(readFileSync(this.path, 'utf8')) as AnniversaryStateData) };
    } catch (error) {
      // A state file that will not parse must not be silently replaced: that
      // would re-send the whole day. Refuse to run instead.
      throw new Error(`[Anniversary] state file unreadable at ${this.path}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private currentMtime(): number {
    try {
      return existsSync(this.path) ? statSync(this.path).mtimeMs : 0;
    } catch {
      return this.mtimeMs;
    }
  }

  data(): AnniversaryStateData {
    const mtime = this.currentMtime();
    if (!this.cache) {
      this.cache = this.readDisk() ?? emptyState();
      this.mtimeMs = mtime;
    } else if (mtime !== this.mtimeMs) {
      const disk = this.readDisk();
      if (disk) mergeState(this.cache, disk);
      this.mtimeMs = mtime;
    }
    return this.cache;
  }

  save(): void {
    if (!this.cache) return;
    try {
      const disk = this.readDisk();
      if (disk) mergeState(this.cache, disk);
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.cache, null, 1), 'utf8');
      renameSync(tmp, this.path);
      this.mtimeMs = this.currentMtime();
    } catch (error) {
      logger.warn({ error, path: this.path }, '[Anniversary] could not persist state');
    }
  }
}

let store: FileAnniversaryStore | null = null;

export function anniversaryStore(): FileAnniversaryStore {
  const path = statePath();
  if (!store || store.path !== path) store = new FileAnniversaryStore(path);
  return store;
}

/** Which chats the day runs in. */
export function eventChatIds(schedule: Schedule): string[] {
  const configured = (schedule.event.chat_ids ?? []).map(String).filter(Boolean);
  if (configured.length) return configured;
  return (process.env.TELEGRAM_CHANNEL_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** True while the event day is running: the periodic showcase stands down for it. */
export function anniversaryActive(now = Date.now()): boolean {
  if (!anniversaryEnabled()) return false;
  const schedule = loadSchedule();
  return !!schedule && isEventDay(schedule, now);
}

/**
 * Count a message toward the Scrilla tally. Called for every user message;
 * a no-op unless the day is on and the message is in an event chat. The bot's
 * own posts never arrive here — Telegram does not deliver a bot its own
 * messages — so the templates naming Scrilla cannot inflate the count.
 */
export function noteScrillaMention(text: string, chatId: string | undefined, now = Date.now()): number | null {
  try {
    if (!anniversaryEnabled() || !chatId) return null;
    const schedule = loadSchedule();
    if (!schedule || !isEventDay(schedule, now)) return null;
    if (!eventChatIds(schedule).includes(chatId)) return null;
    const s = anniversaryStore();
    const total = noteMention(s.data(), schedule.event.date, text);
    if (total !== null) s.save();
    return total;
  } catch {
    return null;
  }
}

const TOAST: Record<TapOutcome, string> = {
  locked: 'Locked in ✅ Answer in a few minutes.',
  already: 'Already answered — first tap is final.',
  closed: "This one's closed.",
  unknown: '',
};

/** Take a trivia tap. Returns the toast to show, or null when the data is not ours. */
export function handleTriviaTap(
  data: string,
  from: { id: string | number; first_name?: string; last_name?: string; username?: string },
  now = Date.now()
): string | null {
  const parsed = parseTriviaCallback(data || '');
  if (!parsed) return null;
  try {
    const schedule = loadSchedule();
    if (!schedule) return TOAST.closed;
    const s = anniversaryStore();
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id);
    const outcome = recordTap(s.data(), schedule, planDay(schedule), {
      qid: parsed.qid, option: parsed.option, userId: String(from.id), name, at: now,
    });
    if (outcome === 'locked') s.save();
    return TOAST[outcome];
  } catch (error) {
    logger.warn({ error }, '[Anniversary] tap failed');
    return TOAST.closed;
  }
}

/**
 * Enter a /fr submission in the birthday lore contest.
 *
 * Called by the /fr command after every gate except vouching has passed. On
 * the day, in the event chat, a non-artist's lore enters here instead of going
 * to the room for vouches — vouching allows one open proposal per person, which
 * would have ended most people's contest at their first entry. The winner is
 * stored at announcement; an artist's own lore was stored on arrival as always.
 */
export function enterLoreContest(input: {
  card: string;
  lore: string;
  submitterId?: string;
  name: string;
  username?: string;
  chatId?: string;
  fromArtist: boolean;
  now?: number;
}): EnterOutcome {
  try {
    if (!anniversaryEnabled() || !input.chatId || !input.submitterId) return { entered: false, reason: 'no_contest' };
    const schedule = loadSchedule();
    if (!schedule?.lore_contest) return { entered: false, reason: 'no_contest' };
    const s = anniversaryStore();
    const outcome = enterLore(s.data(), schedule, eventChatIds(schedule), {
      card: input.card,
      lore: input.lore,
      submitterId: input.submitterId,
      name: input.name,
      username: input.username,
      chatId: input.chatId,
      at: input.now ?? Date.now(),
      fromArtist: input.fromArtist,
    });
    if (outcome.entered) s.save();
    return outcome;
  } catch (error) {
    logger.warn({ error }, '[Anniversary] lore entry failed');
    return { entered: false, reason: 'no_contest' };
  }
}

/** Whether a non-artist /fr in this chat should go to the contest rather than to vouching, right now. */
export function loreContestOpen(chatId: string | undefined, now = Date.now()): boolean {
  try {
    if (!anniversaryEnabled() || !chatId) return false;
    const schedule = loadSchedule();
    if (!schedule?.lore_contest || !eventChatIds(schedule).includes(chatId)) return false;
    return loreContestPhase(schedule, now) === 'open';
  } catch {
    return false;
  }
}

const ASKS_COUNT = /\b(count(er)?|tally|score|number|how many times)\b/i;
const ASKS_BOARD = /\b(leaderboard|leader board|trivia|scoreboard|winning|who'?s (ahead|winning|leading))\b/i;

/**
 * An exact answer for a question about the birthday, or null.
 *
 * Asked "what's the Scrilla bday counter at?" on the morning of the event, the
 * bot answered "5 years, with the next anniversary on September 21, 2026" —
 * retrieval had nothing on the counter, so it improvised from the words. The
 * real number was one, in a file it never reads. This hands it the number.
 */
export function anniversaryFact(text: string, now = Date.now()): string | null {
  try {
    if (!anniversaryEnabled()) return null;
    const schedule = loadSchedule();
    if (!schedule || !isEventDay(schedule, now)) return null;
    // On the day there is exactly one counter, so "what's the counter at" is
    // about it whether or not Scrilla is named. The second time it was asked,
    // "What's counter at now you miscreant?", the name was not there and the
    // question went to retrieval, which improvised "5 years" for a second time.
    const asksScrilla = /\b(counter|tally)\b/i.test(text) || (SCRILLA.test(text) && ASKS_COUNT.test(text));
    const asksBoard = ASKS_BOARD.test(text);
    if (!asksScrilla && !asksBoard) return null;

    const data = anniversaryStore().data();
    const { start } = eventDay(schedule);
    const parts: string[] = [];
    if (asksScrilla) {
      const count = data.scrilla.date === schedule.event.date ? data.scrilla.count : 0;
      parts.push(
        `The ${schedule.event.scrilla_handle} count for the birthday is ${count} so far today, ` +
        `running at ${scrillaRate(count, start, now)} an hour.`
      );
    }
    if (asksBoard) {
      const perQuestion: Record<string, Record<string, Answer>> = {};
      for (const [qid, rec] of Object.entries(data.trivia)) perQuestion[qid] = rec.answers;
      const board = formatLeaderboard(standings(perQuestion), 5, 'nobody has scored yet');
      const asked = Object.keys(data.trivia).length;
      parts.push(`Birthday trivia so far (${asked} of ${schedule.trivia.length} questions asked): ${board.replace(/\n/g, '; ')}.`);
    }
    return parts.join(' ');
  } catch {
    return null;
  }
}

/** One line of context for every reply on the day, so the bot knows what day it is. */
export function anniversaryContext(now = Date.now()): string {
  try {
    if (!anniversaryEnabled()) return '';
    const schedule = loadSchedule();
    if (!schedule || !isEventDay(schedule, now)) return '';
    const data = anniversaryStore().data();
    const count = data.scrilla.date === schedule.event.date ? data.scrilla.count : 0;
    const lc = schedule.lore_contest;
    const contest = lc
      ? ` There is also a lore contest: /fr CARD <story> enters, ${lc.max_per_person} entries each, closes ${lc.closes}, ` +
        `you judge it and the prize is ${lc.prize}; ${data.lore?.entries.length ?? 0} entries so far.`
      : '';
    return (
      `Today is the Fake Rares 5th birthday and you are hosting: history drops, a card every couple of hours, ` +
      `trivia with a leaderboard, and a running count of how often ${schedule.event.scrilla_handle}'s name is said in this chat ` +
      `(currently ${count}).${contest} If anyone asks about the count, the trivia or the contest, use these numbers and never invent others.\n`
    );
  } catch {
    return '';
  }
}

export function _resetAnniversary(): void {
  scheduleCache = null;
  store = null;
}
