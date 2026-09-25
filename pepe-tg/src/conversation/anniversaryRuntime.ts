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
  LORE_SHORTLIST,
  loreContestPhase,
  loreStandings,
  loreTopNames,
  noteMention,
  scoreLore,
  parseTriviaCallback,
  planDay,
  recordTap,
  scrillaRate,
  standings,
  validateSchedule,
  zonedToUtc,
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

/**
 * One instance per process, not one per copy of this module.
 *
 * The Telegram plugin loads this file as its own copy through a dynamic
 * import (see packages/plugin-telegram-fakerares/src/messageManager.ts), so a
 * module-scope `let` here hands the app and the plugin one each and they
 * drift. Trivia taps landed in the plugin's copy, the engine saved the app's,
 * and the taps were gone: a full day of "Locked in ✅" once ended in "Nobody
 * played". The store carried a merge-on-every-write to survive that.
 *
 * globalThis is the one thing the two copies genuinely share. `Symbol.for` is
 * load-bearing — a plain `Symbol()` would be duplicated along with the module
 * and defeat the whole point.
 */
function sharedSlot<T>(name: string): { value: T | null } {
  const key = Symbol.for(`pepedawn.anniversary.${name}`);
  const host = globalThis as unknown as Record<symbol, { value: T | null } | undefined>;
  return (host[key] ??= { value: null });
}

type ScheduleCache = { path: string; mtimeMs: number; schedule: Schedule | null };

/** The schedule, or null when the file is missing or invalid (logged once per change). */
export function loadSchedule(path = schedulePath()): Schedule | null {
  const cache = sharedSlot<ScheduleCache>('schedule');
  let mtimeMs = 0;
  try {
    if (existsSync(path)) mtimeMs = statSync(path).mtimeMs;
  } catch {
    // Racing a rewrite; the next call reads it.
  }
  if (cache.value && cache.value.path === path && cache.value.mtimeMs === mtimeMs) return cache.value.schedule;

  let schedule: Schedule | null = null;
  if (mtimeMs) {
    try {
      schedule = validateSchedule(JSON.parse(readFileSync(path, 'utf8')));
    } catch (error) {
      logger.error({ error, path }, '[Anniversary] schedule unreadable; nothing will be posted until it is fixed');
    }
  }
  cache.value = { path, mtimeMs, schedule };
  return schedule;
}

/**
 * The state file. Read once, write whole.
 *
 * It used to re-read and merge on every write, because the engine and the
 * Telegram plugin each held their own copy of this module and so their own
 * state. `anniversaryStore()` now hands both the same instance, so there is
 * one writer again and the merge has gone with it.
 *
 * The consequence worth knowing: a hand-edit of the state file mid-run is no
 * longer picked up, because nothing re-reads it. During an incident, edit it
 * and restart.
 */
export class FileAnniversaryStore implements AnniversaryStore {
  private cache: AnniversaryStateData | null = null;

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

  data(): AnniversaryStateData {
    if (!this.cache) this.cache = this.readDisk() ?? emptyState();
    return this.cache;
  }

  save(): void {
    if (!this.cache) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.cache, null, 1), 'utf8');
      renameSync(tmp, this.path);
    } catch (error) {
      logger.warn({ error, path: this.path }, '[Anniversary] could not persist state');
    }
  }
}

export function anniversaryStore(): FileAnniversaryStore {
  const path = statePath();
  const slot = sharedSlot<FileAnniversaryStore>('store');
  if (!slot.value || slot.value.path !== path) slot.value = new FileAnniversaryStore(path);
  return slot.value;
}

/**
 * Who may not enter the lore contest: the people who made the prize.
 *
 * Numeric Telegram ids, from the environment on the droplet plus any in the
 * schedule. The environment is preferred, because this repository is public
 * and the schedule is committed.
 */
export function excludedIds(schedule: Schedule): string[] {
  const fromEnv = (process.env.ANNIVERSARY_EXCLUDED_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const fromFile = (schedule.lore_contest?.excluded_ids ?? []).map(String);
  return [...new Set([...fromEnv, ...fromFile])];
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
    }, excludedIds(schedule));
    if (outcome.entered) s.save();
    return outcome;
  } catch (error) {
    logger.warn({ error }, '[Anniversary] lore entry failed');
    return { entered: false, reason: 'no_contest' };
  }
}

/**
 * Where a /fr in this chat stands with the contest right now: 'none' on any
 * other day or in any other chat, otherwise the contest phase. On the day,
 * nothing goes to vouching — before open it is asked to wait, after close it
 * is told so.
 */
export function loreContestStanding(chatId: string | undefined, now = Date.now()): 'none' | 'before' | 'open' | 'closed' {
  try {
    if (!anniversaryEnabled() || !chatId) return 'none';
    const schedule = loadSchedule();
    if (!schedule?.lore_contest || !eventChatIds(schedule).includes(chatId)) return 'none';
    if (!isEventDay(schedule, now)) return 'none';
    const phase = loreContestPhase(schedule, now);
    return phase === 'none' ? 'none' : phase;
  } catch {
    return 'none';
  }
}

/** The contest's opening time, for the "wait until" reply. */
export function loreContestOpensAt(): string | undefined {
  return loadSchedule()?.lore_contest?.opens;
}

/** Keep PEPEDAWN's quiet score for an entry. */
export function recordLoreScore(entryId: string, score: number, reason: string): boolean {
  try {
    const s = anniversaryStore();
    if (!scoreLore(s.data(), entryId, score, reason)) return false;
    s.save();
    return true;
  } catch (error) {
    logger.warn({ error }, '[Anniversary] could not record a lore score');
    return false;
  }
}

/** Top names so far, best first. Names only: never the lore, never the score. */
export function loreTopNamesNow(): { names: string[]; entries: number } {
  const data = anniversaryStore().data();
  return { names: loreTopNames(data.lore?.entries ?? []), entries: data.lore?.entries.length ?? 0 };
}

/** Is this entry one of the top-five people's best right now? For the good news, straight away. */
export function loreEntryInTop(entryId: string): boolean {
  try {
    const entries = anniversaryStore().data().lore?.entries ?? [];
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || entry.score === undefined) return false;
    const top = new Set<string>();
    for (const e of loreStandings(entries)) {
      top.add(e.submitterId);
      if (top.size >= LORE_SHORTLIST) break;
    }
    if (!top.has(entry.submitterId)) return false;
    // Their best entry is the one that put them there; only that one gets the news.
    const best = loreStandings(entries.filter((e) => e.submitterId === entry.submitterId))[0];
    return best?.id === entryId;
  } catch {
    return false;
  }
}

/**
 * A time from the schedule, spelled out so no model has to convert it.
 *
 * "closes 21:30" alone invited every reply to pick a timezone and a format of
 * its own, and they did. This gives Pacific, Eastern and UTC together, and the
 * prompt tells the bot to say it exactly this way.
 */
const ZONE_LABELS: Record<string, string> = {
  'America/Los_Angeles': 'Pacific',
  'America/Denver': 'Mountain',
  'America/Chicago': 'Central',
  'America/New_York': 'Eastern',
  'Europe/London': 'London',
  'Europe/Lisbon': 'Lisbon',
  UTC: 'UTC',
};

export function spelledTime(schedule: Schedule, hhmm: string): string {
  const eventZone = schedule.event.timezone;
  const instant = zonedToUtc(schedule.event.date, hhmm, eventZone);
  const fmt = (timeZone: string, style: 'h12' | 'h23') =>
    new Date(instant).toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hourCycle: style });
  const also: string[] = [];
  if (eventZone !== 'America/New_York') also.push(`${fmt('America/New_York', 'h12')} Eastern`);
  also.push(`${fmt('UTC', 'h23')} UTC`);
  return `${fmt(eventZone, 'h12')} ${ZONE_LABELS[eventZone] ?? eventZone} (${also.join(', ')})`;
}

const ASKS_WHEN = /\b(when|what time|clos(e|es|ing)|end(s|ing)?|deadline|until|how long|cut[- ]?off|last call)\b/i;
const ASKS_COUNT = /\b(count(er)?|tally|score|number|how many times)\b/i;
const ASKS_BOARD = /\b(leaderboard|leader board|trivia|scoreboard|winning|who'?s (ahead|winning|leading))\b/i;
const ASKS_LORE = /\b(lore|contest|entries|entry|top (5|five)|shortlist|finalists?)\b/i;

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
    const asksWhen = !!schedule.lore_contest && ASKS_LORE.test(text) && ASKS_WHEN.test(text);
    const asksLore = !!schedule.lore_contest && ASKS_LORE.test(text) && (ASKS_BOARD.test(text) || /\b(who|how many|top|best|standing|leading|winning|so far)\b/i.test(text));
    const asksBoard = ASKS_BOARD.test(text) && !asksLore;
    if (!asksScrilla && !asksBoard && !asksLore && !asksWhen) return null;

    const data = anniversaryStore().data();
    const { start } = eventDay(schedule);
    const parts: string[] = [];
    if (asksWhen) {
      const lc = schedule.lore_contest!;
      parts.push(
        `The lore contest closes at exactly ${spelledTime(schedule, lc.closes)} and the winner is announced at ` +
        `${spelledTime(schedule, lc.announce)}. State these times exactly as written; never convert, round or estimate them.`
      );
    }
    if (asksLore) {
      const lc = schedule.lore_contest!;
      const { names, entries } = loreTopNamesNow();
      parts.push(
        entries === 0
          ? `The birthday lore contest has no entries yet; it closes ${lc.closes} and the winner is chosen at ${lc.announce}.`
          : `The birthday lore contest has ${entries} entries so far. Top five right now, names only, best first: ${names.join(', ')}. ` +
            `That is all that may be revealed: never the scores, never whose lore is which. The winner is chosen at ${lc.announce}.`
      );
    }
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
      ? ` There is also a lore contest: /fr CARD <story> enters, ${lc.max_per_person} entries each, as many people as like. ` +
        `Entries close at exactly ${spelledTime(schedule, lc.closes)}; you score every entry quietly and announce the winner at ` +
        `${spelledTime(schedule, lc.announce)}; the prize is ${lc.prize}; ${data.lore?.entries.length ?? 0} entries so far. ` +
        `Whenever you mention the closing or announcement time, say it exactly as written here - never convert, round or ` +
        `estimate it. If asked how it stands you may give the top five names only, never scores and never who wrote which lore.`
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
  sharedSlot<ScheduleCache>('schedule').value = null;
  sharedSlot<FileAnniversaryStore>('store').value = null;
}
