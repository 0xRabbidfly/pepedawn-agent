/**
 * The Fake Rares 5th birthday timeline.
 *
 * The properties that matter: nothing is sent twice across a restart, the
 * 02:00 restart mid-day is harmless, every time in the file means what it says
 * in the event's timezone, first trivia tap is final, and the day's own posts
 * cannot inflate the Scrilla count.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  AnniversaryEngine,
  cardCaption,
  emptyState,
  eventDay,
  fill,
  formatLeaderboard,
  isEventDay,
  noteMention,
  parseTriviaCallback,
  pickCard,
  planDay,
  recordTap,
  scrillaRate,
  standings,
  triviaCallback,
  validateSchedule,
  zonedToUtc,
  type AnniversaryStateData,
  type Effects,
  type Schedule,
} from '../../conversation/anniversary';
import {
  FileAnniversaryStore,
  _resetAnniversary,
  anniversaryActive,
  handleTriviaTap,
  loadSchedule,
  noteScrillaMention,
} from '../../conversation/anniversaryRuntime';
import type { CardInfo } from '../../data/fullCardIndex';

const MIN = 60_000;
const NY = 'America/New_York';

const SCHEDULE: Schedule = {
  event: { date: '2026-09-22', timezone: NY, chat_ids: ['-100'], scrilla_handle: 'Rare Scrilla', stale_after_min: 45 },
  history_drops: [
    { time: '09:00', card: 'FAKEASF', text: 'five years ago' },
    { time: '18:30', text: 'by the numbers, courtesy of {SCRILLA}' },
  ],
  card_of_the_hour: { times: ['10:00', '12:00'], template: '{ASSET} S{SERIES} #{CARD} {ARTIST} {SUPPLY} {ISSUANCE}', series_weight: { '1': 2 } },
  scrilla_counter: {
    start: { time: '00:05', text: 'count {SCRILLA}' },
    updates: [{ time: '11:00', text: 'so far {N} at {RATE}/h' }],
    final: { time: '22:00', text: 'final {N}' },
  },
  trivia: [
    { time: '10:30', question: 'How many in S1?', options: ['25', '50', '100'], answer: 1, explanation: 'fifty' },
    { time: '13:30', question: 'S1 #1?', options: ['FAKETORCH', 'FAKEASF'], answer: 1, explanation: 'asf', reveal_after_min: 5 },
  ],
  closers: [{ time: '22:05', text: 'board:\n{LEADERBOARD}' }],
  templates: {
    trivia: 'Q{K}/{TOTAL}: {QUESTION}',
    reveal: '{QUESTION} = {ANSWER}. {EXPLANATION}\n{TOP}',
    reveal_after_min: 15,
    leaderboard_empty: 'nobody',
  },
};

const card = (asset: string, series: number, ext: CardInfo['ext'] = 'jpeg'): CardInfo =>
  ({ asset, series, card: 1, ext, artist: 'A', artistSlug: 'a', supply: 10, issuance: 'September 2021' }) as CardInfo;
const CARDS = [card('FAKEASF', 1, 'mp4'), card('ONE', 1), card('TWO', 2), card('THREE', 3), card('DOC', 4)];

class MemStore {
  d: AnniversaryStateData = emptyState();
  saves = 0;
  data() { return this.d; }
  save() { this.saves++; }
}

interface Sent { kind: string; text: string; chatId: string; messageId?: number }

function fakeEffects(opts: { failCards?: string[] } = {}) {
  const sent: Sent[] = [];
  const edits: Array<{ messageId: number; text: string }> = [];
  const logs: string[] = [];
  let id = 100;
  const effects: Effects = {
    sendText: async (chatId, text) => { sent.push({ kind: 'text', text, chatId, messageId: ++id }); return id; },
    sendCard: async (chatId, c, caption) => {
      if (opts.failCards?.includes(c.asset)) return false;
      sent.push({ kind: `card:${c.asset}`, text: caption, chatId }); return true;
    },
    sendQuestion: async (chatId, text) => { sent.push({ kind: 'question', text, chatId, messageId: ++id }); return id; },
    editMessage: async (_c, messageId, text) => { edits.push({ messageId, text }); return true; },
    log: (line) => logs.push(line),
  };
  return { effects, sent, edits, logs };
}

const at = (time: string) => zonedToUtc('2026-09-22', time, NY);

describe('times mean the event timezone', () => {
  it('converts New York wall clock to the right instant', () => {
    // 09:00 EDT on 22 September 2026 is 13:00 UTC.
    expect(new Date(zonedToUtc('2026-09-22', '09:00', NY)).toISOString()).toBe('2026-09-22T13:00:00.000Z');
    expect(new Date(zonedToUtc('2026-09-22', '00:00', 'UTC')).toISOString()).toBe('2026-09-22T00:00:00.000Z');
    expect(new Date(zonedToUtc('2026-09-22', '00:00', 'Europe/Lisbon')).toISOString()).toBe('2026-09-21T23:00:00.000Z');
  });

  it('bounds the day and knows when it is on', () => {
    const { start, end } = eventDay(SCHEDULE);
    expect(end - start).toBe(24 * 60 * MIN);
    expect(isEventDay(SCHEDULE, start)).toBe(true);
    expect(isEventDay(SCHEDULE, end - 1)).toBe(true);
    expect(isEventDay(SCHEDULE, end)).toBe(false);
    expect(isEventDay(SCHEDULE, start - 1)).toBe(false);
  });

  it('plans every item in order with stable ids', () => {
    const plan = planDay(SCHEDULE);
    expect(plan.map((p) => p.id)).toEqual([
      'counter-start', 'history-0', 'card-10:00', 'trivia-0', 'counter-update-0', 'card-12:00',
      'trivia-1', 'history-1', 'counter-final', 'closer-0',
    ]);
    expect(plan.every((p, i) => i === 0 || p.at >= plan[i - 1].at)).toBe(true);
  });

  it('refuses a schedule it could not run', () => {
    expect(() => validateSchedule({ ...SCHEDULE, event: { ...SCHEDULE.event, timezone: 'Mars/Olympus' } })).toThrow(/timezone/);
    expect(() => validateSchedule({ ...SCHEDULE, trivia: [{ ...SCHEDULE.trivia[0], answer: 9 }] })).toThrow(/answer/);
    expect(() => validateSchedule({ ...SCHEDULE, closers: [{ time: '9pm', text: 'x' }] })).toThrow(/HH:MM/);
    expect(validateSchedule(JSON.parse(JSON.stringify(SCHEDULE)))).toBeTruthy();
  });
});

describe('the engine over a day', () => {
  it('sends each item once, at or after its time, and never again', async () => {
    const store = new MemStore();
    const { effects, sent } = fakeEffects();
    const engine = new AnniversaryEngine({ schedule: SCHEDULE, store, cards: CARDS, effects, chatIds: ['-100'] });

    await engine.tick(at('00:04'));
    expect(sent).toHaveLength(0);
    await engine.tick(at('00:05'));
    expect(sent.map((s) => s.text)).toEqual(['count Rare Scrilla']);
    await engine.tick(at('00:05') + 20_000);
    await engine.tick(at('00:06'));
    expect(sent).toHaveLength(1);
  });

  it('survives a restart mid-day without re-sending', async () => {
    const store = new MemStore();
    const first = fakeEffects();
    const a = new AnniversaryEngine({ schedule: SCHEDULE, store, cards: CARDS, effects: first.effects, chatIds: ['-100'] });
    await a.tick(at('09:00'));
    // The 00:05 opener is nine hours stale by now and is skipped, not replayed.
    expect(first.sent.map((s) => s.kind)).toEqual(['card:FAKEASF']);
    expect(store.d.sent['counter-start'].skipped).toBe(true);

    // Same state, new process.
    const second = fakeEffects();
    const b = new AnniversaryEngine({ schedule: SCHEDULE, store, cards: CARDS, effects: second.effects, chatIds: ['-100'] });
    await b.tick(at('09:01'));
    expect(second.sent).toHaveLength(0);
    await b.tick(at('10:00'));
    expect(second.sent.map((s) => s.kind.split(':')[0])).toEqual(['card']);
  });

  it('skips, rather than replays, posts that are long past', async () => {
    const store = new MemStore();
    const { effects, sent, logs } = fakeEffects();
    const engine = new AnniversaryEngine({ schedule: SCHEDULE, store, cards: CARDS, effects, chatIds: ['-100'] });
    // Down all morning, back at 11:10: 00:05, 09:00 and 10:00 are past the
    // 45-minute stale window; the 10:30 trivia and 11:00 update are not.
    await engine.tick(at('11:10'));
    expect(sent.map((s) => s.kind)).toEqual(['question', 'text']);
    expect(store.d.sent['counter-start'].skipped).toBe(true);
    expect(store.d.sent['history-0'].skipped).toBe(true);
    expect(store.d.sent['card-10:00'].skipped).toBe(true);
    expect(store.d.sent['trivia-0'].skipped).toBeUndefined();
    expect(logs.some((l) => l.startsWith('skipped counter-start'))).toBe(true);
  }, 10_000);

  it('falls back to text when a history card cannot be sent', async () => {
    const store = new MemStore();
    const { effects, sent } = fakeEffects({ failCards: ['FAKEASF'] });
    const engine = new AnniversaryEngine({ schedule: SCHEDULE, store, cards: CARDS, effects, chatIds: ['-100'] });
    await engine.tick(at('09:00'));
    expect(sent.map((s) => s.kind)).toEqual(['text']);
    expect(sent[0].text).toBe('five years ago');
  });

  it('does nothing outside the day', async () => {
    const store = new MemStore();
    const { effects, sent } = fakeEffects();
    const engine = new AnniversaryEngine({ schedule: SCHEDULE, store, cards: CARDS, effects, chatIds: ['-100'] });
    await engine.tick(at('09:00') - 24 * 60 * MIN);
    await engine.tick(at('09:00') + 48 * 60 * MIN);
    expect(sent).toHaveLength(0);
  });
});

describe('card of the hour', () => {
  it('never repeats a card and weights series', () => {
    const used = new Set<string>();
    const picks: string[] = [];
    for (let i = 0; i < CARDS.length; i++) {
      const c = pickCard(CARDS, used, {}, () => 0.01)!;
      picks.push(c.asset);
      used.add(c.asset);
    }
    expect(new Set(picks).size).toBe(CARDS.length);
    expect(pickCard(CARDS, used)).toBeNull();

    // With series 1 weighted 100x, a mid-range draw lands on a series-1 card.
    const heavy = pickCard(CARDS, new Set(), { '1': 100 }, () => 0.5)!;
    expect(heavy.series).toBe(1);
  });

  it('tries another card when one cannot be sent, and burns the failed one', async () => {
    const store = new MemStore();
    const { effects, sent, logs } = fakeEffects({ failCards: ['ONE', 'FAKEASF'] });
    const engine = new AnniversaryEngine({ schedule: SCHEDULE, store, cards: CARDS, effects, chatIds: ['-100'], random: () => 0.01 });
    await engine.tick(at('10:00'));
    const cards = sent.filter((s) => s.kind.startsWith('card:'));
    expect(cards).toHaveLength(1);
    expect(['ONE', 'FAKEASF']).not.toContain(cards[0].kind.split(':')[1]);
    expect(store.d.cardsUsed).toContain('ONE');
    expect(logs.some((l) => l.includes('could not be sent'))).toBe(true);
  });

  it('captions from the index', () => {
    expect(cardCaption('{ASSET} S{SERIES} #{CARD} by {ARTIST}, {SUPPLY}, {ISSUANCE}', card('FAKEASF', 1))).toBe(
      'FAKEASF S1 #1 by A, 10, September 2021'
    );
    expect(cardCaption('{SUPPLY}', { ...card('X', 1), supply: 1030 })).toBe('1,030');
  });
});

describe('the Scrilla counter', () => {
  it('counts mentions, resets on a new date, and reports a rate', () => {
    const s = emptyState();
    expect(noteMention(s, '2026-09-22', 'gm everyone')).toBeNull();
    expect(noteMention(s, '2026-09-22', 'SCRILLA wen drop')).toBe(1);
    expect(noteMention(s, '2026-09-22', 'rarescrilla is a legend')).toBe(2);
    expect(noteMention(s, '2026-09-23', 'scrilla')).toBe(1);
    expect(scrillaRate(10, at('00:00'), at('00:30'))).toBe('10.0');
    expect(scrillaRate(10, at('00:00'), at('04:00'))).toBe('2.5');
  });

  it('fills the templates with the live count', async () => {
    const store = new MemStore();
    const { effects, sent } = fakeEffects();
    const engine = new AnniversaryEngine({ schedule: SCHEDULE, store, cards: CARDS, effects, chatIds: ['-100'] });
    await engine.tick(at('10:59'));
    for (let i = 0; i < 6; i++) noteMention(store.d, '2026-09-22', 'scrilla');
    await engine.tick(at('11:00'));
    expect(sent.at(-1)!.text).toBe('so far 6 at 0.5/h');
  });
});

describe('trivia', () => {
  it('first tap is final, scores the correct ones, and closes at reveal', async () => {
    const store = new MemStore();
    const { effects, sent, edits } = fakeEffects();
    const engine = new AnniversaryEngine({ schedule: SCHEDULE, store, cards: CARDS, effects, chatIds: ['-100'] });
    await engine.tick(at('10:30'));
    const q = sent.find((s) => s.kind === 'question')!;
    expect(q.text).toBe('Q1/2: How many in S1?');
    const plan = planDay(SCHEDULE);
    const t = at('10:31');

    expect(recordTap(store.d, SCHEDULE, plan, { qid: 'trivia-0', option: 1, userId: 'u1', name: 'Crypsi', at: t })).toBe('locked');
    expect(recordTap(store.d, SCHEDULE, plan, { qid: 'trivia-0', option: 0, userId: 'u1', name: 'Crypsi', at: t })).toBe('already');
    expect(recordTap(store.d, SCHEDULE, plan, { qid: 'trivia-0', option: 0, userId: 'u2', name: 'Coit', at: t + 1 })).toBe('locked');
    expect(recordTap(store.d, SCHEDULE, plan, { qid: 'trivia-0', option: 7, userId: 'u3', name: 'X', at: t })).toBe('unknown');
    expect(recordTap(store.d, SCHEDULE, plan, { qid: 'nope', option: 0, userId: 'u3', name: 'X', at: t })).toBe('unknown');

    await engine.tick(at('10:44'));
    expect(edits).toHaveLength(0);
    await engine.tick(at('10:45'));
    expect(edits).toHaveLength(1);
    expect(edits[0].messageId).toBe(q.messageId);
    expect(edits[0].text).toBe('How many in S1? = 50. fifty\n🥇 Crypsi — 1');
    expect(recordTap(store.d, SCHEDULE, plan, { qid: 'trivia-0', option: 1, userId: 'u9', name: 'Late', at: at('10:46') })).toBe('closed');
  });

  it('a per-question reveal time overrides the default', async () => {
    const store = new MemStore();
    const { effects, edits } = fakeEffects();
    const engine = new AnniversaryEngine({ schedule: SCHEDULE, store, cards: CARDS, effects, chatIds: ['-100'] });
    await engine.tick(at('13:30'));
    await engine.tick(at('13:35'));
    expect(edits).toHaveLength(1);
  });

  it('builds a leaderboard and fills the closer with it', async () => {
    const store = new MemStore();
    const { effects, sent } = fakeEffects();
    const engine = new AnniversaryEngine({ schedule: SCHEDULE, store, cards: CARDS, effects, chatIds: ['-100'] });
    const plan = planDay(SCHEDULE);
    await engine.tick(at('10:30'));
    recordTap(store.d, SCHEDULE, plan, { qid: 'trivia-0', option: 1, userId: 'u1', name: 'Crypsi', at: at('10:31') });
    recordTap(store.d, SCHEDULE, plan, { qid: 'trivia-0', option: 1, userId: 'u2', name: 'Coit', at: at('10:32') });
    await engine.tick(at('13:30'));
    recordTap(store.d, SCHEDULE, plan, { qid: 'trivia-1', option: 1, userId: 'u2', name: 'Coit', at: at('13:31') });
    await engine.tick(at('22:05'));
    expect(sent.at(-1)!.text).toBe('board:\n🥇 Coit — 2\n🥈 Crypsi — 1');
    expect(formatLeaderboard([], 5, 'nobody')).toBe('nobody');
    expect(standings({})).toEqual([]);
  });

  it('round-trips callback data', () => {
    expect(parseTriviaCallback(triviaCallback('trivia-3', 2))).toEqual({ qid: 'trivia-3', option: 2 });
    expect(parseTriviaCallback('fc:next:a:X:0:10')).toBeNull();
    expect(parseTriviaCallback('fr5:t:trivia-3:x')).toBeNull();
    expect(triviaCallback('trivia-3', 2).length).toBeLessThanOrEqual(64);
  });
});

describe('template filling', () => {
  it('replaces known keys and leaves unknown ones visible', () => {
    expect(fill('{N} by {SCRILLA} {NOPE}', { N: 3, SCRILLA: 'S' })).toBe('3 by S {NOPE}');
  });
});

describe('in the running bot', () => {
  let dir: string;
  const saved: Record<string, string | undefined> = {};
  const KEYS = ['ANNIVERSARY_ENABLED', 'ANNIVERSARY_SCHEDULE_PATH', 'ANNIVERSARY_STATE_PATH', 'TELEGRAM_CHANNEL_ID'];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fr5-'));
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.ANNIVERSARY_ENABLED = 'true';
    process.env.ANNIVERSARY_SCHEDULE_PATH = join(dir, 'schedule.json');
    process.env.ANNIVERSARY_STATE_PATH = join(dir, 'state.json');
    process.env.TELEGRAM_CHANNEL_ID = '-100';
    writeFileSync(process.env.ANNIVERSARY_SCHEDULE_PATH, JSON.stringify(SCHEDULE));
    _resetAnniversary();
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    _resetAnniversary();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is active only on the day, only when enabled', () => {
    expect(anniversaryActive(at('12:00'))).toBe(true);
    expect(anniversaryActive(at('12:00') - 24 * 60 * MIN)).toBe(false);
    process.env.ANNIVERSARY_ENABLED = 'false';
    expect(anniversaryActive(at('12:00'))).toBe(false);
  });

  it('counts Scrilla mentions only in the event chat, on the day, and persists them', () => {
    expect(noteScrillaMention('scrilla!', '-100', at('12:00'))).toBe(1);
    expect(noteScrillaMention('scrilla!', '-999', at('12:00'))).toBeNull();
    expect(noteScrillaMention('scrilla!', '-100', at('12:00') - 24 * 60 * MIN)).toBeNull();
    expect(noteScrillaMention('SCRILLA again', '-100', at('12:01'))).toBe(2);
    const onDisk = JSON.parse(readFileSync(process.env.ANNIVERSARY_STATE_PATH!, 'utf8'));
    expect(onDisk.scrilla).toEqual({ date: '2026-09-22', count: 2 });
  });

  it('takes taps from the callback path with a toast, and persists them', async () => {
    const store = new FileAnniversaryStore(process.env.ANNIVERSARY_STATE_PATH!);
    const { effects } = fakeEffects();
    const engine = new AnniversaryEngine({ schedule: loadSchedule()!, store, cards: CARDS, effects, chatIds: ['-100'] });
    await engine.tick(at('10:30'));
    _resetAnniversary();

    expect(handleTriviaTap('fr5:t:trivia-0:1', { id: 7, first_name: 'Crypsi' }, at('10:31'))).toBe('Locked in ✅ Answer in a few minutes.');
    expect(handleTriviaTap('fr5:t:trivia-0:0', { id: 7, first_name: 'Crypsi' }, at('10:31'))).toBe('Already answered — first tap is final.');
    expect(handleTriviaTap('fc:next:a:X:0:10', { id: 7 }, at('10:31'))).toBeNull();
    const onDisk = JSON.parse(readFileSync(process.env.ANNIVERSARY_STATE_PATH!, 'utf8'));
    expect(onDisk.trivia['trivia-0'].answers['7']).toMatchObject({ opt: 1, correct: true, name: 'Crypsi' });
  });

  it('keeps taps taken by a second copy of the state, and shows them in the reveal', async () => {
    // The engine (main process) and the tap handler (the Telegram plugin's own
    // module copy) each hold their own in-memory state over one file.
    const engineStore = new FileAnniversaryStore(process.env.ANNIVERSARY_STATE_PATH!);
    const { effects, edits, sent } = fakeEffects();
    const engine = new AnniversaryEngine({ schedule: loadSchedule()!, store: engineStore, cards: CARDS, effects, chatIds: ['-100'] });
    await engine.tick(at('10:30'));

    // Taps through the runtime's separate instance.
    expect(handleTriviaTap('fr5:t:trivia-0:1', { id: 7, first_name: 'Crypsi' }, at('10:31'))).toContain('Locked in');
    expect(handleTriviaTap('fr5:t:trivia-0:0', { id: 8, first_name: 'Coit' }, at('10:32'))).toContain('Locked in');

    // The engine saves for an unrelated reason: it must not clobber the taps.
    await engine.tick(at('10:34'));
    engineStore.save();
    const onDisk = JSON.parse(readFileSync(process.env.ANNIVERSARY_STATE_PATH!, 'utf8'));
    expect(Object.keys(onDisk.trivia['trivia-0'].answers).sort()).toEqual(['7', '8']);

    // And the reveal, from the engine's copy, knows who answered.
    await engine.tick(at('10:45'));
    expect(edits).toHaveLength(1);
    expect(edits[0].text).toContain('🥇 Crypsi — 1');

    // A late tap through the second copy sees the reveal the first copy made.
    expect(handleTriviaTap('fr5:t:trivia-0:1', { id: 9, first_name: 'Late' }, at('10:46'))).toBe("This one's closed.");
    void sent;
  });

  it('refuses to run over a state file it cannot read', () => {
    writeFileSync(process.env.ANNIVERSARY_STATE_PATH!, '{ broken');
    expect(() => new FileAnniversaryStore(process.env.ANNIVERSARY_STATE_PATH!).data()).toThrow(/unreadable/);
  });

  it('loads the real schedule and every fact in it is a real card', async () => {
    const real = loadSchedule(join(process.cwd(), 'src', 'data', 'fakerares5-schedule.json'))!;
    expect(real).toBeTruthy();
    const { FULL_CARD_INDEX } = await import('../../data/fullCardIndex');
    for (const drop of real.history_drops) {
      if (drop.card) expect(FULL_CARD_INDEX.some((c) => c.asset === drop.card)).toBe(true);
    }
    expect(planDay(real).length).toBeGreaterThan(10);
  });
});
