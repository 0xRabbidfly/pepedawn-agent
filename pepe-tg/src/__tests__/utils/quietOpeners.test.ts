import { describe, it, expect } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ANGLES, SHAPES, buildJudgePrompt, buildOpenerPrompt, cleanArtist, cleanOpener, composeQuietOpener, drawAngle,
  drawShape, openerDue, openerGapMs, openerHooks, openerProblem, openersBetween, parseJudge, pickHook, quietOpenersOn,
  readOpeners, recordOpener, type OpenerHook, type OpenerRecord,
} from '../../utils/quietOpeners';
import { lastVolunteeredAt, quietSlotOpen } from '../../utils/xHarvest';
import type { CardInfo } from '../../data/fullCardIndex';

/** A repeatable stand-in for Math.random. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const H = 3600_000;
const DAY = 24 * H;
const NOW = Date.parse('2026-10-27T15:00:00Z');

function card(asset: string, series: number, n: number, date: string, extra: Partial<CardInfo> = {}): CardInfo {
  return { asset, series, card: n, ext: 'png', artist: 'Some Artist', artistSlug: null, supply: 100, release: { date, block: null, txHash: null, issuer: null }, ...extra };
}

// A small world: series 18 still coming out, a card from 2021 whose birthday is today.
const INDEX: CardInfo[] = [
  card('OLDBIRTHDAY', 2, 36, '2021-10-27', { artist: 'Mr. Enrique Fajaque', issuanceCount: 777 }),
  card('OTHERDAY', 3, 1, '2021-11-02'),
  card('THISYEAR', 18, 1, '2026-02-01'),
  card('JUSTOUT', 18, 2, '2026-10-20', { artist: 'Aquatic <p class="wp-block-p' }),
  card('RETIREDNEW', 18, 3, '2026-10-21', { retired: true }),
  card('COMMONNEW', 18, 4, '2026-10-22', { collection: 'fake-commons' }),
];

const hooksNow = (extra: Partial<Parameters<typeof openerHooks>[0]> = {}) =>
  openerHooks({ index: INDEX, now: NOW, look: () => null, ...extra });

const rec = (text: string, extra: Partial<OpenerRecord> = {}): OpenerRecord => ({ at: NOW - DAY, text, ...extra });

const hook = (extra: Partial<OpenerHook> = {}): OpenerHook => ({
  key: 'birthday:OLDBIRTHDAY:2026',
  kind: 'birthday',
  why: 'it turns 5 today',
  facts: ['Issued on this day 5 years ago.', 'OLDBIRTHDAY: Fake Rares series 2, card 36, by Mr. Enrique Fajaque.'],
  cards: ['OLDBIRTHDAY'],
  artists: ['Mr. Enrique Fajaque'],
  ...extra,
});

// 27 October, the owner: "the telegram jokes are annoying - replace it with
// casual conversation openers for the community", then "it has to be
// topical, fake rare related and something a member would ask honestly".

describe('when an opener goes out', () => {
  it('is on by default, and off when asked', () => {
    expect(quietOpenersOn({})).toBe(true);
    expect(quietOpenersOn({ QUIET_OPENERS: 'off' })).toBe(false);
    expect(quietOpenersOn({ QUIET_OPENERS: 'OFF' })).toBe(false);
  });

  it('at most once a day per room, unless told otherwise', () => {
    expect(openerGapMs({})).toBe(DAY);
    expect(openerGapMs({ QUIET_OPENER_GAP_HOURS: '48' })).toBe(2 * DAY);
    expect(openerGapMs({ QUIET_OPENER_GAP_HOURS: 'nonsense' })).toBe(DAY);
  });

  it('only once somebody has spoken since the bot last volunteered anything', () => {
    const now = NOW;
    expect(openerDue({ lastUserAt: now - 2 * H, now })).toBe(true);
    expect(openerDue({ lastUserAt: undefined, now })).toBe(false);
    // An unanswered question - or X post - is not followed by another.
    expect(openerDue({ lastUserAt: now - 30 * H, lastVolunteerAt: now - 20 * H, now })).toBe(false);
    expect(openerDue({ lastUserAt: now - 10 * H, lastVolunteerAt: now - 20 * H, now })).toBe(true);
  });

  it('never twice in a gap, and an hour after a failure', () => {
    const now = NOW;
    expect(openerDue({ lastUserAt: now - 2 * H, lastOpenerAt: now - 10 * H, now, gapMs: DAY })).toBe(false);
    expect(openerDue({ lastUserAt: now - 2 * H, lastOpenerAt: now - 25 * H, now, gapMs: DAY })).toBe(true);
    expect(openerDue({ lastUserAt: now - 2 * H, failedAt: now - 30 * 60_000, now })).toBe(false);
    expect(openerDue({ lastUserAt: now - 2 * H, failedAt: now - 2 * H, now })).toBe(true);
  });

  it('shares one slot with the X post, and a restart does not reopen it', () => {
    const now = 10 * H;
    expect(quietSlotOpen({ lastUserAt: undefined, now })).toBe(false);
    expect(quietSlotOpen({ lastUserAt: now - 30 * 60_000, now })).toBe(false);
    expect(quietSlotOpen({ lastUserAt: now - 2 * H, now })).toBe(true);
    expect(quietSlotOpen({ lastUserAt: now - 2 * H, lastVolunteerAt: now - H, now })).toBe(false);
    expect(lastVolunteeredAt([{ volunteeredAt: 5 } as any, {} as any, { volunteeredAt: 9 } as any])).toBe(9);
    expect(lastVolunteeredAt([])).toBeUndefined();
  });
});

describe('topical: every opener starts from something real', () => {
  it('a card that just came out, the newest flagged as such', () => {
    const fresh = hooksNow().filter((h) => h.kind === 'new-card');
    expect(fresh.map((h) => h.key)).toEqual(['new:JUSTOUT']);
    expect(fresh[0].why).toBe('it is the newest fake rare');
    expect(fresh[0].facts.join('\n')).toContain('JUSTOUT: Fake Rares series 18, card 2, by Aquatic.');
    // Scraped HTML never reaches the model.
    expect(fresh[0].artists).toEqual(['Aquatic']);
  });

  it('never a retired card or a fake common', () => {
    const keys = hooksNow().map((h) => h.key).join(' ');
    expect(keys).not.toContain('RETIREDNEW');
    expect(keys).not.toContain('COMMONNEW');
  });

  it('a card that sold in the last few days - never its price, never who bought it', () => {
    const sales = [
      { asset: 'THISYEAR', at: NOW - 20 * H, type: 'DIS_SALE' as const },
      { asset: 'THISYEAR', at: NOW - 40 * H, type: 'DEX_SALE' as const },
      { asset: 'OTHERDAY', at: NOW - 5 * DAY, type: 'DIS_SALE' as const },
      { asset: 'NOTAFAKERARE', at: NOW - H, type: 'DIS_SALE' as const },
    ];
    const sold = hooksNow({ sales }).filter((h) => h.kind === 'sale');
    expect(sold.map((h) => h.key)).toEqual(['sale:THISYEAR:2026-10-26']);
    expect(sold[0].why).toBe('2 of them sold in the last few days');
    expect(sold[0].facts.join('\n')).not.toMatch(/xcp|btc|sats|price/i);

    const one = hooksNow({ sales: [sales[0]] }).find((h) => h.kind === 'sale')!;
    expect(one.why).toBe('one went from a dispenser yesterday');
  });

  it('the series still coming out, and none once it is done', () => {
    const series = hooksNow().find((h) => h.kind === 'series')!;
    expect(series.key).toBe('series:18:2');
    expect(series.why).toBe('series 18 is still coming out, 2 cards so far');
    expect(series.cards).toEqual(['JUSTOUT', 'THISYEAR']);

    const full = Array.from({ length: 50 }, (_, i) => card(`DONE${i}`, 19, i + 1, '2026-01-01'));
    expect(openerHooks({ index: full, now: NOW, look: () => null }).some((h) => h.kind === 'series')).toBe(false);
  });

  it("a card's birthday, only on the day and only for earlier years", () => {
    const born = hooksNow().filter((h) => h.kind === 'birthday');
    expect(born.map((h) => h.key)).toEqual(['birthday:OLDBIRTHDAY:2026']);
    expect(born[0].why).toBe('it turns 5 today');
    expect(born[0].facts.join('\n')).toContain('777 issued.');
    const thisYear = openerHooks({ index: [card('TODAY', 18, 9, '2026-10-27')], now: NOW, look: () => null });
    expect(thisYear.some((h) => h.kind === 'birthday')).toBe(false);
  });

  it('what is on the card comes from its notes, when there are any', () => {
    const h = hooksNow({ look: (a) => (a === 'JUSTOUT' ? { visualSummary: 'A frog in a cake.' } : null) }).find((x) => x.key === 'new:JUSTOUT')!;
    expect(h.facts).toContain('What is on it: A frog in a cake.');
  });

  it('cleans artists the index scraped badly', () => {
    expect(cleanArtist('Shawn Leary <p class="wp-block-p')).toBe('Shawn Leary');
    expect(cleanArtist('unknown')).toBeNull();
    expect(cleanArtist(null)).toBeNull();
  });
});

describe('choosing what to ask about', () => {
  const hooks = hooksNow({ sales: [{ asset: 'THISYEAR', at: NOW - 20 * H, type: 'DIS_SALE' }] });

  it('a new card first, then a sale, then the series or a birthday', () => {
    expect(pickHook(hooks, [], seeded(), NOW)!.kind).toBe('new-card');
    const afterNew = [rec('x', { hook: 'new:JUSTOUT', cards: ['JUSTOUT'] })];
    expect(pickHook(hooks, afterNew, seeded(), NOW)!.kind).toBe('sale');
    const afterSale = [...afterNew, rec('y', { hook: 'sale:THISYEAR:2026-10-26', cards: ['THISYEAR'] })];
    expect(['series', 'birthday']).toContain(pickHook(hooks, afterSale, seeded(), NOW)!.kind);
  });

  it('each hook once, and a card asked about is left alone for a month', () => {
    const used = hooks.map((h) => rec('x', { hook: h.key, cards: h.cards }));
    expect(pickHook(hooks, used, seeded(), NOW)).toBeNull();
    // Asked about THISYEAR a week ago, through another hook: its sale waits.
    const resting = [rec('x', { at: NOW - 7 * DAY, hook: 'birthday:THISYEAR:2025', cards: ['THISYEAR'] }), rec('y', { hook: 'new:JUSTOUT', cards: ['JUSTOUT'] })];
    expect(pickHook(hooks, resting, seeded(), NOW)!.kind).not.toBe('sale');
    const rested = [rec('x', { at: NOW - 40 * DAY, hook: 'birthday:THISYEAR:2025', cards: ['THISYEAR'] }), rec('y', { hook: 'new:JUSTOUT', cards: ['JUSTOUT'] })];
    expect(pickHook(hooks, rested, seeded(), NOW)!.kind).toBe('sale');
  });

  it('draws the angle and the shape, never the ones just used', () => {
    const rng = seeded(3);
    const history: OpenerRecord[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = drawAngle('birthday', history, rng);
      const shape = drawShape(history, rng);
      expect(history.filter((r) => r.kind === 'birthday').slice(-(ANGLES.birthday.length - 1)).map((r) => r.angle)).not.toContain(angle);
      expect(history.slice(-2).map((r) => r.shape)).not.toContain(shape);
      history.push(rec('x', { kind: 'birthday', angle, shape }));
    }
    expect(SHAPES.length).toBeGreaterThanOrEqual(4);
  });

  it('the prompt carries the facts, why now, the angle, the shape and what was asked before', () => {
    const p = buildOpenerPrompt(hook(), 'does it still hold up', SHAPES[0], [rec('anyone get a JUSTOUT?')]);
    expect(p).toContain('OLDBIRTHDAY: Fake Rares series 2, card 36');
    expect(p).toContain('it turns 5 today');
    expect(p).toContain('does it still hold up');
    expect(p).toContain(SHAPES[0]);
    expect(p).toContain('- anyone get a JUSTOUT?');
    expect(p).toContain('written as OLDBIRTHDAY');
    expect(buildJudgePrompt('x?', hook())).toContain('Issued on this day 5 years ago.');
  });
});

describe('honest: what never goes out', () => {
  const ok = 'OLDBIRTHDAY turns 5 today - who here has held one since it came out?';

  it('a plain question about the hook passes', () => {
    expect(openerProblem(ok, hook(), [])).toBeNull();
    expect(openerProblem('does anyone know the story behind OLDBIRTHDAY by Mr. Enrique Fajaque? five years today', hook(), [])).toBeNull();
  });

  it('it must be a question, about the card it was given', () => {
    expect(openerProblem('OLDBIRTHDAY turns 5 today, happy birthday to it.', hook(), [])).toBe('not a question');
    expect(openerProblem('who here has held one since it came out?', hook(), [])).toBe('does not name OLDBIRTHDAY');
  });

  it('nothing about price or value', () => {
    expect(openerProblem('OLDBIRTHDAY turns 5 - what is the floor on it now?', hook(), [])).toBe('about price');
    expect(openerProblem('OLDBIRTHDAY turns 5 - would anyone pay 100 XCP for one?', hook(), [])).toBe('about price');
    expect(openerProblem('is OLDBIRTHDAY undervalued at five years old?', hook(), [])).toBe('about price');
  });

  it('the bot claims nothing it did not do', () => {
    expect(openerProblem('i just grabbed an OLDBIRTHDAY - anyone else holding?', hook(), [])).toContain('claims');
    expect(openerProblem('OLDBIRTHDAY is the best card in my collection, who agrees?', hook(), [])).toContain('claims');
    expect(openerProblem('i wonder who grabbed the first OLDBIRTHDAY?', hook(), [])).toBeNull();
  });

  it('a member, not a host', () => {
    expect(openerProblem('hey everyone, OLDBIRTHDAY turns 5! who has one?', hook(), [])).toBe('sounds like a host');
    expect(openerProblem('OLDBIRTHDAY turns 5 - drop your favourite card from series 2 below?', hook(), [])).toBe('sounds like a host');
    expect(openerProblem('OLDBIRTHDAY turns 5 🎂🎉 who has one?', hook(), [])).toBe('too many emoji');
  });

  it('no card and no artist it was not given', () => {
    expect(openerProblem('OLDBIRTHDAY turns 5 - better than FAKEASF?', hook(), [])).toBe('names another card, FAKEASF');
    expect(openerProblem('OLDBIRTHDAY turns 5 - anyone like it more than the Rare Scrilla ones?', hook(), [])).toBe('names another artist, rare scrilla');
  });

  it('the usual: mentions, scam bait, the quiet', () => {
    expect(openerProblem('@someone does OLDBIRTHDAY still hold up?', hook(), [])).toBe('mentions someone');
    expect(openerProblem('OLDBIRTHDAY turns 5 - dm me if you have one?', hook(), [])).toBe('scam bait');
    expect(openerProblem('chat is quiet - anyone still holding OLDBIRTHDAY?', hook(), [])).toBe('about the quiet');
  });

  it('never the same question twice', () => {
    const history = [rec('who here has held OLDBIRTHDAY since it came out, five years ago today?')];
    expect(openerProblem(ok, hook(), history)).toContain('too close');
    expect(openerProblem('who here has held OLDBIRTHDAY the longest, at five years old today?', hook(), [rec('who here has held JUSTOUT since day one?')])).toBe('same opening as a recent opener');
  });

  it('cleans what the model wrote', () => {
    expect(cleanOpener('"Question: does OLDBIRTHDAY still hold up? 🐸🔥 kek"')).toBe('does OLDBIRTHDAY still hold up? 🐸');
    expect(cleanOpener('a\nb\nc')).toBe('a\nb');
  });
});

describe('composing one', () => {
  const judgeOk = async () => '{"ok": true, "why": "fine"}';

  it('asks from another angle when one is thrown out', async () => {
    const prompts: string[] = [];
    const replies = ['what is the floor on OLDBIRTHDAY?', 'OLDBIRTHDAY turns 5 today - does it still hold up?'];
    const out = await composeQuietOpener({
      hooks: [hook()], history: [], now: NOW, rng: seeded(5), judge: judgeOk,
      generate: async (p) => { prompts.push(p); return replies.shift()!; },
    });
    expect(out!.text).toBe('OLDBIRTHDAY turns 5 today - does it still hold up?');
    const asked = prompts.map((p) => p.split('\n').find((l) => l.startsWith('What to ask')));
    expect(new Set(asked).size).toBe(2);
  });

  it('two tries per hook, then the next one; null when all fail', async () => {
    const seen: string[] = [];
    const other = hook({ key: 'birthday:OTHER:2026', cards: ['OTHER'], facts: ['OTHER: series 3.'] });
    const out = await composeQuietOpener({
      hooks: [hook(), other], history: [], now: NOW, rng: seeded(), judge: judgeOk, attempts: 4,
      generate: async (p) => { seen.push(p.includes('OTHER:') ? 'OTHER' : 'OLD'); return 'not a question'; },
    });
    expect(out).toBeNull();
    expect(seen.filter((s) => s === 'OLD').length).toBe(2);
    expect(seen.filter((s) => s === 'OTHER').length).toBe(2);
  });

  it('the judge has the last word, read strictly', async () => {
    const out = await composeQuietOpener({
      hooks: [hook()], history: [], now: NOW, attempts: 2, judge: async () => '{"ok": false, "why": "invents a story"}',
      generate: async () => 'OLDBIRTHDAY turns 5 today - who here has held one since?',
    });
    expect(out).toBeNull();
    expect(parseJudge('{"ok": true}').ok).toBe(true);
    expect(parseJudge('ok').ok).toBe(false);
    expect(parseJudge('{"ok": "yes"}').ok).toBe(false);
  });

  it('nothing fresh to ask about is nothing at all', async () => {
    let called = false;
    const out = await composeQuietOpener({
      hooks: [hook()], history: [rec('x', { hook: hook().key })], now: NOW, judge: judgeOk,
      generate: async () => { called = true; return ''; },
    });
    expect(out).toBeNull();
    expect(called).toBe(false);
  });
});

describe('the opener log', () => {
  it('keeps every opener, in order, and finds a window of them', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'openers-')), 'quiet-openers.jsonl');
    expect(readOpeners(path)).toEqual([]);
    recordOpener({ at: 100, text: 'one?', hook: 'a' }, path);
    recordOpener({ at: 200, text: 'two?', hook: 'b' }, path);
    expect(readOpeners(path).map((r) => r.text)).toEqual(['one?', 'two?']);
    expect(openersBetween(150, 300, path).map((r) => r.hook)).toEqual(['b']);
  });
});
