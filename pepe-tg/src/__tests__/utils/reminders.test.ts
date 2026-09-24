/**
 * Daily reminders: in the window, after the hour, once per UTC day; the
 * days-left phrase counts down to "last day"; the committed artist claim
 * reminder is well-formed and points at the claim page.
 */
import { describe, expect, it } from 'bun:test';
import { REMINDERS, daysLeft, dueReminders, renderReminder, type Reminder } from '../../utils/reminders';

const r: Reminder = { id: 'x', from: '2026-09-24', until: '2026-10-22', hourUtc: 16, text: '{daysLeft} left' };
const at = (iso: string) => new Date(iso);

describe('reminders', () => {
  it('is due in its window, at or after its hour, once a day', () => {
    const none = { lastPosted: {} };
    expect(dueReminders([r], none, at('2026-09-23T18:00:00Z'))).toEqual([]); // before the window
    expect(dueReminders([r], none, at('2026-09-24T15:59:00Z'))).toEqual([]); // before the hour
    expect(dueReminders([r], none, at('2026-09-24T16:00:00Z'))).toEqual([r]);
    expect(dueReminders([r], { lastPosted: { x: '2026-09-24' } }, at('2026-09-24T23:00:00Z'))).toEqual([]); // already today
    expect(dueReminders([r], { lastPosted: { x: '2026-09-24' } }, at('2026-09-25T16:10:00Z'))).toEqual([r]);
    expect(dueReminders([r], none, at('2026-10-22T16:00:00Z'))).toEqual([r]); // last day posts
    expect(dueReminders([r], none, at('2026-10-23T16:00:00Z'))).toEqual([]); // after the window
  });

  it('counts the days down to the last day', () => {
    expect(daysLeft(r, at('2026-09-24T16:00:00Z'))).toBe(28);
    expect(renderReminder(r, at('2026-09-24T16:00:00Z'))).toBe('28 days left');
    expect(renderReminder(r, at('2026-10-21T16:00:00Z'))).toBe('1 day left');
    expect(renderReminder(r, at('2026-10-22T16:00:00Z'))).toBe('last day left');
  });

  it('the committed artist claim reminder runs to 22 October and links the claim page', () => {
    const claim = REMINDERS.find((x) => x.id === 'artist-claim-2026')!;
    expect(claim).toBeDefined();
    expect(claim.until).toBe('2026-10-22');
    expect(claim.button?.url).toBe('https://fakeraredirectory.com/artists/submit');
    expect(renderReminder(claim, at('2026-09-24T16:00:00Z'))).toContain('28 days left');
    expect(renderReminder(claim, at('2026-09-24T16:00:00Z'))).toContain('https://fakeraredirectory.com/artists/submit');
    for (const x of REMINDERS) {
      expect(x.from <= x.until).toBe(true);
      expect(x.hourUtc).toBeGreaterThanOrEqual(0);
      expect(x.hourUtc).toBeLessThan(24);
    }
  });
});
