/**
 * KEK-001, the daily artist spotlight: who gets picked, which cards and
 * when, the haiku's shape, and a caption that tags only what it knows -
 * never a bare @ from X, which Telegram would hand to a stranger.
 */
import { describe, expect, it } from 'bun:test';
import type { CardInfo } from '../../data/fullCardIndex';
import {
  CLAIM_URL, buildHaikuPrompt, cardsForArtist, composeCaption, emptyState, nextDue, parseHaiku, pickArtist, planDay,
  spotlightButtons, spotlightConfig, telegramHandleFor, xHandleFor,
} from '../../utils/artistSpotlight';

const card = (asset: string, artist: string, over: Partial<CardInfo> = {}): CardInfo =>
  ({ asset, artist, series: 4, card: 16, ext: 'jpg', artistSlug: 'x', supply: 10, ...over }) as CardInfo;
const index = [
  card('PEPEEUPHORIA', 'Prateek Dhiman'), card('PEPONACID', 'Prateek Dhiman'),
  card('SOLO', 'One Card Wonder'),
  card('CLAIMED1', 'Has Profile'), card('CLAIMED2', 'Has Profile'),
  card('GONE', 'Retired Artist', { retired: true } as any),
];
const artists = [
  { name: 'Prateek Dhiman', slug: 'prateek-dhiman', aliases: [], hasProfile: false },
  { name: 'One Card Wonder', slug: 'one-card-wonder', aliases: ['OCW'], hasProfile: false },
  { name: 'Has Profile', slug: 'has-profile', aliases: [], hasProfile: true },
  { name: 'Retired Artist', slug: 'retired-artist', aliases: [], hasProfile: false },
];
const cfg = spotlightConfig({});
const at = (iso: string) => new Date(iso);

describe('config', () => {
  it('three posts at 15, 19 and 23 UTC, two hours apart at least, prodding until 22 October', () => {
    expect(cfg).toMatchObject({ enabled: true, hoursUtc: [15, 19, 23], minGapMs: 2 * 3_600_000, repeatDays: 60, prodUntil: '2026-10-22' });
    expect(spotlightConfig({ SPOTLIGHT_HOURS_UTC: '20, 9, nope, 30' }).hoursUtc).toEqual([9, 20]);
    expect(spotlightConfig({ SPOTLIGHT_ENABLED: 'false' }).enabled).toBe(false);
  });
});

describe('who and which', () => {
  it("an artist's cards are the live ones credited to their name or an alias", () => {
    expect(cardsForArtist(artists[0], index).map((c) => c.asset)).toEqual(['PEPEEUPHORIA', 'PEPONACID']);
    expect(cardsForArtist({ name: 'x', aliases: ['ocw'] }, [card('A', 'OCW')]).map((c) => c.asset)).toEqual(['A']);
    expect(cardsForArtist(artists[3], index)).toEqual([]);
  });

  it('prefers a bare page with several cards while the prod runs; after it, several cards; never someone with no live cards', () => {
    const during = at('2026-09-25T12:00:00Z');
    for (let i = 0; i < 20; i++) expect(pickArtist(artists, index, [], during, cfg, () => i / 20)!.artist.name).toBe('Prateek Dhiman');
    const after = at('2026-11-01T12:00:00Z');
    const names = new Set(Array.from({ length: 20 }, (_, i) => pickArtist(artists, index, [], after, cfg, () => i / 20)!.artist.name));
    expect(names).toEqual(new Set(['Prateek Dhiman', 'Has Profile']));
  });

  it('does not repeat an artist within repeatDays', () => {
    const history = [{ day: '2026-09-20', artist: 'Prateek Dhiman' }];
    expect(pickArtist(artists, index, history, at('2026-09-25T12:00:00Z'), cfg, () => 0)!.artist.name).toBe('One Card Wonder');
    expect(pickArtist(artists, index, history, at('2026-12-01T12:00:00Z'), cfg, () => 0)!.artist.name).toBe('Prateek Dhiman');
  });

  it('plans a day once: up to one card per slot, and remembers who was picked', () => {
    const now = at('2026-09-25T08:00:00Z');
    const s = planDay(emptyState(), artists, index, now, cfg, () => 0);
    expect(s).toMatchObject({ day: '2026-09-25', artist: 'Prateek Dhiman', hasProfile: false, posted: [] });
    expect(s.cards.sort()).toEqual(['PEPEEUPHORIA', 'PEPONACID']);
    expect(s.history).toEqual([{ day: '2026-09-25', artist: 'Prateek Dhiman' }]);
    expect(planDay(s, artists, index, at('2026-09-25T20:00:00Z'), cfg)).toBe(s);
  });
});

describe('when', () => {
  const s = { ...emptyState(), day: '2026-09-25', artist: 'Prateek Dhiman', cards: ['A', 'B'], posted: [] as string[] };
  it('each card at its hour, never two within the gap, nothing once the day is done', () => {
    expect(nextDue(s, cfg, at('2026-09-25T14:59:00Z'))).toBeNull();
    expect(nextDue(s, cfg, at('2026-09-25T15:00:00Z'))).toBe('A');
    const one = { ...s, posted: ['A'], lastPostAt: at('2026-09-25T15:00:00Z').getTime() };
    expect(nextDue(one, cfg, at('2026-09-25T18:59:00Z'))).toBeNull();
    expect(nextDue(one, cfg, at('2026-09-25T19:00:00Z'))).toBe('B');
    // Down through two slots: one post now, not a burst.
    const late = { ...s, lastPostAt: at('2026-09-25T20:30:00Z').getTime(), posted: ['A'] };
    expect(nextDue(late, cfg, at('2026-09-25T21:00:00Z'))).toBeNull();
    expect(nextDue({ ...s, posted: ['A', 'B'] }, cfg, at('2026-09-25T23:30:00Z'))).toBeNull();
    expect(nextDue(s, cfg, at('2026-09-26T15:00:00Z'))).toBeNull();
  });
});

describe('the haiku', () => {
  it('is asked for from what is on the card', () => {
    const p = buildHaikuPrompt(card('PEPONACID', 'Prateek Dhiman'), 'Prateek Dhiman', { visualSummary: 'a kaleidoscopic Pepe', textOnCard: ['PEPONACID'] });
    for (const bit of ['PEPONACID by Prateek Dhiman', 'five, seven and five', 'a kaleidoscopic Pepe', 'Text on the card: PEPONACID', 'three lines only']) expect(p).toContain(bit);
  });
  it('comes back as exactly three short lines, forgiving numbering and quotes', () => {
    expect(parseHaiku('1. "Pepe blooms in neon"\n2. Mirrored acid folds inward\n\n3. Counterparty hums')).toEqual(['Pepe blooms in neon', 'Mirrored acid folds inward', 'Counterparty hums']);
    expect(parseHaiku('one\ntwo')).toBeNull();
    expect(parseHaiku(`a\nb\n${'x'.repeat(80)}`)).toBeNull();
  });
});

describe('the caption', () => {
  const handles = [
    { artist: 'Prateek Dhiman', handle: 'prateek_d', source: 'pepe.wtf' },
    { artist: 'Guessed', handle: 'maybe_them', source: 'telegram-archive' },
  ];
  it('tags only what it knows: a mapped Telegram @, an X profile as a link, never a guessed handle', () => {
    expect(xHandleFor('prateek dhiman', handles)).toBe('prateek_d');
    expect(xHandleFor('Guessed', handles)).toBeNull();
    expect(telegramHandleFor('Prateek Dhiman', { '@prateekd': ['Prateek Dhiman'], '123456': ['Prateek Dhiman'], _comment: 'x' })).toBe('@prateekd');
    expect(telegramHandleFor('Prateek Dhiman', { '123456': ['Prateek Dhiman'] })).toBeNull();
  });

  it('first post introduces, later ones count; haiku, X link and the low-voltage prod in order', () => {
    const first = composeCaption({ artist: 'Prateek Dhiman', card: { asset: 'PEPEEUPHORIA', series: 4, card: 15 }, index: 0, total: 2, haiku: ['a', 'b', 'c'], telegramHandle: null, xHandle: 'prateek_d', prod: true, prodUntil: '2026-10-22' });
    expect(first).toBe("🔦 Today's artist spotlight: Prateek Dhiman\nPEPEEUPHORIA · Series 4, Card 15\n\na\nb\nc\n\n𝕏 x.com/prateek_d\n⚡ low voltage: Prateek Dhiman, your page on the directory is still bare. Bio, links, wallet - claim it by 22 October.");
    expect(first).not.toMatch(/(^|\s)@prateek_d/);
    const second = composeCaption({ artist: 'Prateek Dhiman', card: { asset: 'PEPONACID', series: 4, card: 16 }, index: 1, total: 2, haiku: null, telegramHandle: '@prateekd', xHandle: null, prod: false, prodUntil: '2026-10-22' });
    expect(second).toBe('🔦 Prateek Dhiman (@prateekd), 2 of 2\nPEPONACID · Series 4, Card 16');
  });

  it('buttons: the card page always; the claim form while prodding, the artist page after', () => {
    expect(spotlightButtons({ series: 4, card: 16 }, 'prateek-dhiman', true)).toEqual([
      { text: '🗂 Directory', url: 'https://fakeraredirectory.com/series/4/16' },
      { text: '⚡ Claim your page', url: CLAIM_URL },
    ]);
    expect(spotlightButtons({ series: 4, card: 16 }, 'prateek-dhiman', false)[1]).toEqual({ text: '👨‍🎨 Artist page', url: 'https://fakeraredirectory.com/artists/prateek-dhiman' });
  });
});
