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
  enterLore,
  eventDay,
  fill,
  formatLeaderboard,
  handleFor,
  isEventDay,
  loreStandings,
  loreTopNames,
  noteMention,
  parseJudgeResponse,
  parseScoreResponse,
  scoreLore,
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
  anniversaryContext,
  anniversaryFact,
  handleTriviaTap,
  loadSchedule,
  mergeState,
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

describe('the lore contest', () => {
  const WITH_CONTEST: Schedule = {
    ...SCHEDULE,
    lore_contest: {
      opens: '08:00', closes: '21:30', reminder: '20:45', announce: '21:55', max_per_person: 3, prize: 'a PEPEDAWN card',
      open_text: 'open: {MAX} each, closes {CLOSES}, prize {PRIZE}',
      reminder_text: '{ENTRIES} in, closes {CLOSES}',
      winner_text: 'winner {WINNER} ({HANDLE}) on {CARD}: "{LORE}" — {REASON} [{ENTRIES}] {PRIZE}',
      no_entries_text: 'nobody entered',
      judge_failed_text: 'could not pick from {ENTRIES}',
    },
  };
  const entry = (n: number, over: Partial<Parameters<typeof enterLore>[3]> = {}) => ({
    card: 'FAKEASF', lore: `a story about the first mint number ${n}`, submitterId: 'u1', name: 'Crypsi', username: 'crypsi',
    chatId: '-100', at: at('09:00') + n * MIN, fromArtist: false, ...over,
  });

  it('takes entries only while open, only in the event chat, three each, no duplicates', () => {
    const s = emptyState();
    expect(enterLore(s, WITH_CONTEST, ['-100'], entry(1, { at: at('07:59') }))).toEqual({ entered: false, reason: 'not_open' });
    expect(enterLore(s, WITH_CONTEST, ['-100'], entry(1, { at: at('21:30') }))).toEqual({ entered: false, reason: 'closed' });
    expect(enterLore(s, WITH_CONTEST, ['-100'], entry(1, { chatId: '-999' }))).toEqual({ entered: false, reason: 'wrong_chat' });
    expect(enterLore(s, SCHEDULE, ['-100'], entry(1))).toEqual({ entered: false, reason: 'no_contest' });

    // The prize's makers sit it out, by id.
    expect(enterLore(s, WITH_CONTEST, ['-100'], entry(1, { submitterId: 'maker' }), ['maker'])).toEqual({ entered: false, reason: 'excluded' });

    const first = enterLore(s, WITH_CONTEST, ['-100'], entry(1));
    expect(first.entered && first.entry.number).toBe(1);
    expect(first.entered && first.remaining).toBe(2);
    expect(enterLore(s, WITH_CONTEST, ['-100'], entry(1, { lore: 'A story about the first mint number 1!' }))).toEqual({ entered: false, reason: 'duplicate' });
    enterLore(s, WITH_CONTEST, ['-100'], entry(2));
    const third = enterLore(s, WITH_CONTEST, ['-100'], entry(3));
    expect(third.entered && third.remaining).toBe(0);
    expect(enterLore(s, WITH_CONTEST, ['-100'], entry(4))).toEqual({ entered: false, reason: 'cap' });
    const other = enterLore(s, WITH_CONTEST, ['-100'], entry(5, { submitterId: 'u2', name: 'Coit', username: undefined }));
    expect(other.entered && other.entry.number).toBe(4);
  });

  it('posts open, reminder and the judged winner, stores the winner once, and survives a restart', async () => {
    const store = new MemStore();
    const judged: string[] = [];
    const stored: string[] = [];
    const { effects, sent } = fakeEffects();
    effects.judgeLore = async (prompt) => { judged.push(prompt); return 'Sure: {"winner": 2, "reason": "It is true, and it is theirs."}'; };
    effects.storeLore = async (e) => { stored.push(e.id); return true; };
    const engine = new AnniversaryEngine({ schedule: WITH_CONTEST, store, cards: CARDS, effects, chatIds: ['-100'] });

    await engine.tick(at('08:00'));
    expect(sent.at(-1)!.text).toBe('open: 3 each, closes 21:30, prize a PEPEDAWN card');
    enterLore(store.d, WITH_CONTEST, ['-100'], entry(1, { fromArtist: true }));
    enterLore(store.d, WITH_CONTEST, ['-100'], entry(2, { submitterId: 'u2', name: 'Coit', username: undefined, card: 'ONE' }));
    await engine.tick(at('20:45'));
    expect(sent.at(-1)!.text).toBe('2 in, closes 21:30');

    await engine.tick(at('21:55'));
    expect(judged).toHaveLength(1);
    expect(judged[0]).toContain('2. [Coit] on ONE — Series 1 #1, by A, supply 10, September 2021');
    expect(judged[0]).toContain("1. [Crypsi, the card's artist] on FAKEASF");
    expect(sent.at(-1)!.text).toBe('winner Coit (Coit) on ONE: "a story about the first mint number 2" — It is true, and it is theirs. [2] a PEPEDAWN card');
    expect(stored).toHaveLength(1);
    expect(store.d.lore.winner).toMatchObject({ reason: 'It is true, and it is theirs.', stored: true });

    // A restart does not re-judge, re-store or re-post.
    const again = fakeEffects();
    again.effects.judgeLore = async () => { throw new Error('should not be asked'); };
    again.effects.storeLore = async () => { throw new Error('should not store'); };
    const b = new AnniversaryEngine({ schedule: WITH_CONTEST, store, cards: CARDS, effects: again.effects, chatIds: ['-100'] });
    await b.tick(at('21:56'));
    expect(again.sent).toHaveLength(0);
  });

  it("does not store an artist's winning lore twice, and copes with no entries or a useless judge", async () => {
    const store = new MemStore();
    const stored: string[] = [];
    const { effects, sent } = fakeEffects();
    effects.storeLore = async (e) => { stored.push(e.id); return true; };
    effects.judgeLore = async () => '{"winner": 1, "reason": "theirs"}';
    const engine = new AnniversaryEngine({ schedule: WITH_CONTEST, store, cards: CARDS, effects, chatIds: ['-100'] });
    await engine.tick(at('08:00'));
    enterLore(store.d, WITH_CONTEST, ['-100'], entry(1, { fromArtist: true }));
    await engine.tick(at('21:55'));
    expect(sent.at(-1)!.text).toContain('winner Crypsi (@crypsi)');
    expect(stored).toHaveLength(0);

    const empty = new MemStore();
    const e2 = fakeEffects();
    const engine2 = new AnniversaryEngine({ schedule: WITH_CONTEST, store: empty, cards: CARDS, effects: e2.effects, chatIds: ['-100'] });
    await engine2.tick(at('21:55'));
    expect(e2.sent.at(-1)!.text).toBe('nobody entered');

    const bad = new MemStore();
    const e3 = fakeEffects();
    let asked = 0;
    e3.effects.judgeLore = async () => { asked++; return 'I cannot choose {"winner": 9}'; };
    const engine3 = new AnniversaryEngine({ schedule: WITH_CONTEST, store: bad, cards: CARDS, effects: e3.effects, chatIds: ['-100'] });
    await engine3.tick(at('08:00'));
    enterLore(bad.d, WITH_CONTEST, ['-100'], entry(1));
    await engine3.tick(at('21:55'));
    expect(asked).toBe(2);
    expect(e3.sent.at(-1)!.text).toBe('could not pick from 1');
    expect(bad.d.lore.judgeFailed).toBe(true);
  });

  it('scores entries quietly, ranks by score, and reveals names only', async () => {
    const s = emptyState();
    const people = ['Crypsi', 'Coit', 'FWD', 'Kane', 'm0nti', 'Shaban', 'Arwyn'];
    people.forEach((name, i) =>
      enterLore(s, WITH_CONTEST, ['-100'], entry(i + 1, { submitterId: `u${i}`, name, username: undefined, lore: `a different story number ${i} about the mint` }))
    );
    // Crypsi's second entry scores highest of all; a person is still listed once.
    enterLore(s, WITH_CONTEST, ['-100'], entry(20, { submitterId: 'u0', name: 'Crypsi', lore: 'another tale from the same person' }));
    const scores = [4, 9, 7, 8, 2, 6, 5, 10];
    s.lore.entries.forEach((e, i) => expect(scoreLore(s, e.id, scores[i], 'r')).toBe(true));
    expect(scoreLore(s, s.lore.entries[0].id, 1, 'again')).toBe(false);
    expect(s.lore.entries[0].score).toBe(4);

    expect(loreTopNames(s.lore.entries)).toEqual(['Crypsi', 'Coit', 'Kane', 'FWD', 'Shaban']);
    expect(loreStandings(s.lore.entries)[0].score).toBe(10);
    expect(parseScoreResponse('{"score": 7.4, "reason": "  true  "}')).toEqual({ score: 7, reason: 'true' });
    expect(parseScoreResponse('{"score": 11}')).toBeNull();
    expect(parseScoreResponse('no')).toBeNull();

    // The final judge chooses among the top five only, by their real numbers.
    const store = new MemStore();
    store.d = s;
    const judged: string[] = [];
    const { effects, sent } = fakeEffects();
    effects.judgeLore = async (p) => { judged.push(p); return '{"winner": 8, "reason": "the best of the five"}'; };
    effects.storeLore = async () => true;
    const engine = new AnniversaryEngine({ schedule: WITH_CONTEST, store, cards: CARDS, effects, chatIds: ['-100'] });
    await engine.tick(at('21:55'));
    expect(judged[0]).toContain('8. [Crypsi]');
    expect(judged[0]).toContain('2. [Coit]');
    expect(judged[0]).not.toContain('5. [m0nti]');
    expect(sent.at(-1)!.text).toContain('winner Crypsi');
  });

  it('reads the judge strictly', () => {
    const s = emptyState();
    enterLore(s, WITH_CONTEST, ['-100'], entry(1));
    const es = s.lore.entries;
    expect(parseJudgeResponse('{"winner": 1, "reason": "  true  and   kind "}', es)).toEqual({ entry: es[0], reason: 'true and kind' });
    expect(parseJudgeResponse('{"winner": "1"}', es)).toBeNull();
    expect(parseJudgeResponse('{"winner": 2}', es)).toBeNull();
    expect(parseJudgeResponse('nothing', es)).toBeNull();
    expect(parseJudgeResponse('{"winner": 1}', es)!.reason).toBe('It honours the fakes.');
    expect(handleFor({ name: 'Coit' })).toBe('Coit');
    expect(handleFor({ name: 'Coit', username: '@coitart' })).toBe('@coitart');
  });

  it('merges entries from two writers and renumbers them in arrival order', () => {
    const a = emptyState();
    const b = emptyState();
    enterLore(a, WITH_CONTEST, ['-100'], entry(2));
    enterLore(b, WITH_CONTEST, ['-100'], entry(1, { submitterId: 'u2', name: 'Coit' }));
    mergeState(a, b);
    expect(a.lore.entries.map((e) => [e.number, e.name])).toEqual([[1, 'Coit'], [2, 'Crypsi']]);
    mergeState(a, b);
    expect(a.lore.entries).toHaveLength(2);
  });

  it('the real schedule carries a contest that opens before it closes and announces after', () => {
    const real = loadSchedule(join(process.cwd(), 'src', 'data', 'fakerares5-schedule.json'))!;
    const lc = real.lore_contest!;
    expect(lc).toBeTruthy();
    expect(lc.max_per_person).toBe(5);
    const t = (h: string) => zonedToUtc(real.event.date, h, real.event.timezone);
    expect(t(lc.opens)).toBeLessThan(t(lc.closes));
    expect(t(lc.closes)).toBeLessThan(t(lc.announce));
    const ids = planDay(real).map((p) => p.id);
    expect(ids).toContain('lore-winner');
    // The countdown: 1 hour, 30 minutes, 5 minutes before close.
    expect(lc.reminders!.map((r) => r.time)).toEqual(['20:30', '21:00', '21:25']);
    expect(ids.filter((id) => id.startsWith('lore-reminder'))).toHaveLength(3);
    expect(lc.open_text).toContain('Pacific');
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

  it('answers "what is the counter at" with the real number, not an improvisation', async () => {
    noteScrillaMention('scrilla', '-100', at('06:00'));
    noteScrillaMention('SCRILLA again', '-100', at('06:10'));
    const fact = anniversaryFact("Pepedawn what's the Scrilla bday counter at?", at('06:32'))!;
    expect(fact).toContain('count for the birthday is 2 so far today');
    expect(fact).toContain('an hour');
    // The second time it was asked, Scrilla was not named.
    expect(anniversaryFact("What's counter at now you miscreant ? 😘", at('06:42'))).toContain('is 2 so far today');
    // Only on the day, and only for the question.
    expect(anniversaryFact("what's the Scrilla counter at?", at('06:32') - 24 * 60 * MIN)).toBeNull();
    expect(anniversaryFact('scrilla is a legend', at('06:32'))).toBeNull();
    expect(anniversaryFact('gm', at('06:32'))).toBeNull();

    // The leaderboard, once a question has been asked and answered.
    const { effects } = fakeEffects();
    const engine = new AnniversaryEngine({ schedule: loadSchedule()!, store: new FileAnniversaryStore(process.env.ANNIVERSARY_STATE_PATH!), cards: CARDS, effects, chatIds: ['-100'] });
    await engine.tick(at('10:30'));
    handleTriviaTap('fr5:t:trivia-0:1', { id: 7, first_name: 'Crypsi' }, at('10:31'));
    _resetAnniversary();
    expect(anniversaryFact("who's winning the trivia?", at('10:40'))).toContain('🥇 Crypsi — 1');

    // Asked about the lore contest it gives names only, never the lore or a score.
    const withContest = { ...loadSchedule()!, lore_contest: {
      opens: '08:00', closes: '21:30', announce: '21:55', max_per_person: 3, prize: 'a card',
      open_text: 'o', winner_text: 'w', no_entries_text: 'n', judge_failed_text: 'j',
    } };
    writeFileSync(process.env.ANNIVERSARY_SCHEDULE_PATH!, JSON.stringify(withContest));
    _resetAnniversary();
    expect(anniversaryFact("who's winning the lore contest?", at('10:40'))).toContain('no entries yet');
    const { enterLoreContest, recordLoreScore } = await import('../../conversation/anniversaryRuntime');
    const e1 = enterLoreContest({ card: 'FAKEASF', lore: 'a secret story about the mint', submitterId: '7', name: 'Crypsi', chatId: '-100', fromArtist: false, now: at('10:41') });
    const e2 = enterLoreContest({ card: 'ONE', lore: 'another secret story here', submitterId: '8', name: 'Coit', chatId: '-100', fromArtist: false, now: at('10:42') });
    recordLoreScore(e1.entered ? e1.entry.id : '', 3, 'meh');
    recordLoreScore(e2.entered ? e2.entry.id : '', 9, 'great');
    const { loreEntryInTop } = await import('../../conversation/anniversaryRuntime');
    expect(loreEntryInTop(e1.entered ? e1.entry.id : '')).toBe(true);
    expect(loreEntryInTop(e2.entered ? e2.entry.id : '')).toBe(true);
    // A weaker second entry from someone already in the top five is not news.
    const e3 = enterLoreContest({ card: 'TWO', lore: 'a third story, weaker than the first', submitterId: '8', name: 'Coit', chatId: '-100', fromArtist: false, now: at('10:44') });
    recordLoreScore(e3.entered ? e3.entry.id : '', 2, 'weak');
    expect(loreEntryInTop(e3.entered ? e3.entry.id : '')).toBe(false);
    const standing = anniversaryFact('how many entries in the lore contest so far?', at('10:43'))!;
    expect(standing).toContain('3 entries so far');
    expect(standing).toContain('Coit, Crypsi');
    expect(standing).not.toContain('secret story');
    // Scores were 3, 9 and 2; none may appear. "3 entries" is the count, not a score.
    expect(standing.replace(/\d+ entries/, '')).not.toMatch(/\b[392]\b/);
    expect(standing).not.toContain('great');

    // And every reply on the day is told what day it is.
    expect(anniversaryContext(at('10:40'))).toContain('5th birthday');
    expect(anniversaryContext(at('10:40'))).toContain('(currently 2)');
    expect(anniversaryContext(at('10:40') + 24 * 60 * MIN)).toBe('');
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
