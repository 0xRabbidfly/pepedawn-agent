/**
 * Scheduled broadcasts: a reminder posted once a day for as long as it runs.
 *
 * The first one is the artist claim window on the new directory - every
 * artist has a card waiting if they fill in their page before 22 October
 * 2026. Reminders live in src/data/reminders.json, committed, so adding one
 * is a data change; what has been posted lives in a state file, so the
 * nightly restart does not repeat the day's post. All dates are UTC days.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import remindersJson from '../data/reminders.json';

export interface Reminder {
  id: string;
  /** First and last UTC day it posts, inclusive, YYYY-MM-DD. */
  from: string;
  until: string;
  /** Posts at the first check at or after this UTC hour. */
  hourUtc: number;
  /** Plain text. `{daysLeft}` becomes "N days" / "1 day" / "last day". */
  text: string;
  button?: { text: string; url: string };
}

export interface ReminderState {
  /** Reminder id → the UTC day it was last posted. */
  lastPosted: Record<string, string>;
}

export const REMINDERS: Reminder[] = (remindersJson as { reminders: Reminder[] }).reminders;

export function reminderStatePath(): string {
  return process.env.REMINDER_STATE_PATH || join(process.cwd(), 'src', 'data', 'reminder-state.json');
}

export function readReminderState(path = reminderStatePath()): ReminderState {
  try {
    if (!existsSync(path)) return { lastPosted: {} };
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as ReminderState;
    return { lastPosted: parsed.lastPosted ?? {} };
  } catch {
    return { lastPosted: {} };
  }
}

export function writeReminderState(state: ReminderState, path = reminderStatePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 1), 'utf8');
  renameSync(tmp, path);
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Whole UTC days from `now`'s day to `until`, 0 on the day itself. */
export function daysLeft(reminder: Pick<Reminder, 'until'>, now: Date): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = Date.parse(`${reminder.until}T00:00:00Z`);
  return Math.round((end - today) / 86_400_000);
}

export function renderReminder(reminder: Reminder, now: Date): string {
  const n = daysLeft(reminder, now);
  const phrase = n <= 0 ? 'last day' : n === 1 ? '1 day' : `${n} days`;
  return reminder.text.replace(/\{daysLeft\}/g, phrase);
}

/** Reminders that should post now: in their window, past their hour, not yet posted today. */
export function dueReminders(reminders: Reminder[], state: ReminderState, now: Date): Reminder[] {
  const today = utcDay(now);
  return reminders.filter(
    (r) => r.from <= today && today <= r.until && now.getUTCHours() >= r.hourUtc && state.lastPosted[r.id] !== today,
  );
}
