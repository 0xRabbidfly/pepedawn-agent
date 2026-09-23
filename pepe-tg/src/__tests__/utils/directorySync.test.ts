/**
 * Reconciling our index with the directory: theirs is canonical for artist,
 * release and existence; ours keeps current supply and media detail.
 */
import { describe, expect, it } from 'bun:test';
import type { CardInfo } from '../../data/fullCardIndex';
import { longDate, monthOf, reconcile, renderReport, type DirectoryCard } from '../../utils/directorySync';

const ours = (over: Partial<CardInfo>): CardInfo =>
  ({ asset: 'X', series: 1, card: 1, ext: 'jpeg', artist: 'A', artistSlug: 'a', supply: 100, issuance: 'September 2021', ...over }) as CardInfo;
const theirs = (over: Partial<DirectoryCard>): DirectoryCard => ({
  series: 1, cardNumber: 1, title: 'X', artist: 'A', issuance: '100',
  assets: { image: 'https://cdn/x.jpg', video: null, small: 'https://cdn/x.webp' },
  release: { date: '2021-09-23', block: 702_000, txHash: 'ab', issuer: '1abc' },
  ...over,
});

describe('dates', () => {
  it('turns a directory date into the month every renderer shows, and an exact day', () => {
    expect(monthOf('2017-10-08')).toBe('October 2017');
    expect(longDate('2017-10-08')).toBe('8 October 2017');
    expect(monthOf('Unknown')).toBeNull();
    expect(longDate(undefined)).toBeNull();
  });
});

describe('reconcile', () => {
  it('takes their artist when ours is missing, an address, or a different name — not for case alone', () => {
    const { cards, report } = reconcile(
      [
        ours({ asset: 'MEMECAPITAL', artist: '1JAuET9GKgAbCdEfGhIjKlMnOpQrStUvWx' }),
        ours({ asset: 'BADBURGERDAY', artist: 'Indelible' }),
        ours({ asset: 'FAKAMOTO', artist: 'Yotet' }),
        ours({ asset: 'NOART', artist: null }),
      ],
      [
        theirs({ title: 'MEMECAPITAL', artist: 'Meme Conscious' }),
        theirs({ title: 'BADBURGERDAY', artist: 'Indelible Trade' }),
        theirs({ title: 'FAKAMOTO', artist: 'YOTET' }),
        theirs({ title: 'NOART', artist: 'Someone' }),
      ]
    );
    const by = Object.fromEntries(cards.map((c) => [c.asset, c.artist]));
    expect(by).toEqual({ MEMECAPITAL: 'Meme Conscious', BADBURGERDAY: 'Indelible Trade', FAKAMOTO: 'Yotet', NOART: 'Someone' });
    expect(report.artistChanged.map((a) => a.asset)).toEqual(['MEMECAPITAL', 'BADBURGERDAY', 'NOART']);
  });

  it('keeps our current supply, adds their issuance, release and media, and derives the month', () => {
    const { cards } = reconcile([ours({ asset: 'FREEDOMKEK', supply: 298, issuance: 'Oct 2017' })], [
      theirs({ title: 'FREEDOMKEK', issuance: 'Unknown', release: { date: '2017-10-08', block: 488827, txHash: 'tx', issuer: '13re' } }),
    ]);
    const c = cards[0];
    expect(c.supply).toBe(298);
    expect(c.issuanceCount).toBeUndefined();
    expect(c.release).toEqual({ date: '2017-10-08', block: 488827, txHash: 'tx', issuer: '13re' });
    expect(c.issuance).toBe('October 2017');
    expect(c.directory?.small).toBe('https://cdn/x.webp');
    const { cards: two } = reconcile([ours({ asset: 'FAKEASF', supply: 1030 })], [theirs({ title: 'FAKEASF', issuance: '1,998' })]);
    expect(two[0].issuanceCount).toBe(1998);
    expect(two[0].supply).toBe(1030);
  });

  it('adds what we lack, retires what they dropped, and un-retires what comes back', () => {
    const first = reconcile(
      [ours({ asset: 'KEPT' }), ours({ asset: 'GONE' })],
      [theirs({ title: 'KEPT' }), theirs({ title: 'NEW', series: 0, cardNumber: 22, artist: 'Q', assets: { image: 'https://cdn/n.png', video: null, small: null } })]
    );
    expect(first.report.added).toEqual(['NEW']);
    expect(first.report.retired).toEqual(['GONE']);
    const added = first.cards.find((c) => c.asset === 'NEW')!;
    expect(added).toMatchObject({ series: 0, card: 22, ext: 'png', artist: 'Q', supply: null, issuance: 'September 2021', issues: ['from_directory'] });
    expect(first.cards.find((c) => c.asset === 'GONE')!.retired).toBe(true);

    const second = reconcile(first.cards, [theirs({ title: 'KEPT' }), theirs({ title: 'NEW', series: 0, cardNumber: 22 }), theirs({ title: 'GONE' })]);
    expect(second.report.unretired).toEqual(['GONE']);
    expect(second.cards.find((c) => c.asset === 'GONE')!.retired).toBeUndefined();
  });

  it('skips a blank title, fixes series and card, and sorts by series then card', () => {
    const { cards, report } = reconcile(
      [ours({ asset: 'B', series: 2, card: 5 }), ours({ asset: 'A', series: 1, card: 9 })],
      [theirs({ title: '   ' }), theirs({ title: 'B', series: 2, cardNumber: 4 }), theirs({ title: 'A', series: 1, cardNumber: 9 })]
    );
    expect(report.skippedBlank).toBe(1);
    expect(report.seriesFixed).toEqual(['B S2#5→S2#4']);
    expect(cards.map((c) => c.asset)).toEqual(['A', 'B']);
  });

  it('a video card gets ext mp4', () => {
    const { cards } = reconcile([], [theirs({ title: 'V', assets: { image: 'https://cdn/v.png', video: 'https://cdn/v.mp4', small: null } })]);
    expect(cards[0].ext).toBe('mp4');
    expect(cards[0].videoUri).toBe('https://cdn/v.mp4');
  });

  it('lets the chain settle a name that differs by a typo, and leaves it alone when nobody knows', () => {
    const mine = [
      ours({ asset: 'PEPEXTASIS', series: 12, card: 7 }),
      ours({ asset: 'MADAMEPEPE', series: 11, card: 4 }),
      ours({ asset: 'MYSTERY', series: 3, card: 3 }),
    ];
    const dir = [
      theirs({ title: 'PEPEXTASIZ', series: 12, cardNumber: 7, artist: 'Z' }),  // their typo: not on-chain
      theirs({ title: 'MADAMPEPE', series: 11, cardNumber: 4, artist: 'Snuxton Pack' }), // real: we had the typo
      theirs({ title: 'MISTERY', series: 3, cardNumber: 3 }),                 // nobody checked
    ];
    const chain: Record<string, boolean | undefined> = { PEPEXTASIZ: false, MADAMPEPE: true };
    const { cards, report } = reconcile(mine, dir, { existsOnChain: (a) => chain[a] });
    const names = cards.map((c) => c.asset).sort();
    expect(names).toEqual(['MADAMPEPE', 'MYSTERY', 'PEPEXTASIS']);
    expect(cards.find((c) => c.asset === 'PEPEXTASIS')!.artist).toBe('Z');
    expect(cards.find((c) => c.asset === 'MADAMPEPE')!.artist).toBe('Snuxton Pack');
    expect(report.renamed).toEqual([{ from: 'MADAMEPEPE', to: 'MADAMPEPE' }]);
    expect(report.keptOurName).toEqual([{ ours: 'PEPEXTASIS', theirs: 'PEPEXTASIZ' }]);
    expect(report.unresolvedPairs).toEqual([{ ours: 'MYSTERY', theirs: 'MISTERY' }]);
    expect(report.added).toEqual([]);
    expect(report.retired).toEqual([]);
    expect(cards.find((c) => c.asset === 'MYSTERY')!.retired).toBeUndefined();
  });

  it('takes nothing structural from a title the directory lists twice', () => {
    const { cards, report } = reconcile(
      [ours({ asset: 'PEPEBERNIE', series: 6, card: 21, artist: 'teymthebeast' })],
      [
        theirs({ title: 'PEPEBERNIE', series: 6, cardNumber: 3, artist: 'teymthebeast' }),
        theirs({ title: 'PEPEBERNIE', series: 6, cardNumber: 21, artist: 'mera.ki' }),
      ]
    );
    expect(report.duplicateTitles).toEqual(['PEPEBERNIE']);
    expect(report.seriesFixed).toEqual([]);
    expect(cards[0].card).toBe(21);
  });

  it('renders a report a human can read', () => {
    const { report } = reconcile([ours({ asset: 'GONE' })], [theirs({ title: 'NEW' })]);
    const text = renderReport(report);
    expect(text).toContain('added 1: NEW');
    expect(text).toContain('retired 1: GONE');
  });
});
