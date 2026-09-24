/**
 * Card replies link to the directory: the card's page always, the artist's
 * page only when the directory has that artist - guessing a slug sends a
 * quarter of credits to a 404, so an unknown artist keeps pepe.wtf.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import type { CardInfo } from '../../data/fullCardIndex';
import { buildCardButtons, directoryArtistSlug, directoryArtistUrl, directoryCardUrl, type DirectoryArtist } from '../../utils/directoryLinks';

const list: DirectoryArtist[] = [
  { name: 'Rare Scrilla', slug: 'rare-scrilla', aliases: [] },
  { name: 'ACK', slug: 'ack', aliases: ['Alpha Centauri Kid'] },
];
const card = (over: Partial<CardInfo>): CardInfo =>
  ({ asset: 'PEPEDAWN', series: 18, card: 22, ext: 'gif', artist: 'rabbidfly', artistSlug: 'rabbidfly', supply: 133, ...over }) as CardInfo;

const flag = process.env.FAKE_RARES_ARTIST_BUTTONS;
afterEach(() => {
  if (flag === undefined) delete process.env.FAKE_RARES_ARTIST_BUTTONS;
  else process.env.FAKE_RARES_ARTIST_BUTTONS = flag;
});

describe('directory links', () => {
  it('a card page is /series/S/N; no slot, no link', () => {
    expect(directoryCardUrl(card({}))).toBe('https://fakeraredirectory.com/series/18/22');
    expect(directoryCardUrl({ series: 18, card: undefined as any })).toBeNull();
    expect(directoryCardUrl(null)).toBeNull();
  });

  it('an artist resolves by name or alias, case-insensitively, to the directory slug', () => {
    expect(directoryArtistSlug('rare scrilla', list)).toBe('rare-scrilla');
    expect(directoryArtistSlug('Alpha Centauri Kid', list)).toBe('ack');
    expect(directoryArtistSlug('Indelible Trade x Cam', list)).toBeNull();
    expect(directoryArtistUrl('ACK', list)).toBe('https://fakeraredirectory.com/artists/ack');
  });

  it('the committed list knows the artists the room asks about', () => {
    expect(directoryArtistSlug('Rare Scrilla')).toBe('rare-scrilla');
    expect(directoryArtistSlug('rabbidfly')).toBe('rabbidfly');
  });

  it('buttons: directory page always, artist on the directory when known, else pepe.wtf, gated', () => {
    process.env.FAKE_RARES_ARTIST_BUTTONS = 'true';
    expect(buildCardButtons(card({ artist: 'Rare Scrilla', artistSlug: 'rare-scrilla' }), list)).toEqual([
      { text: '🗂 Directory', url: 'https://fakeraredirectory.com/series/18/22' },
      { text: '👨‍🎨 Rare Scrilla', url: 'https://fakeraredirectory.com/artists/rare-scrilla' },
    ]);
    expect(buildCardButtons(card({ artist: 'Nay x Ry', artistSlug: 'nay-x-ry' }), list)[1]).toEqual({ text: '👨‍🎨 Nay x Ry', url: 'https://pepe.wtf/artists/nay-x-ry' });
    expect(buildCardButtons(card({ artist: 'Nay x Ry', artistSlug: undefined as any }), list)).toHaveLength(1);

    process.env.FAKE_RARES_ARTIST_BUTTONS = 'false';
    expect(buildCardButtons(card({}), list)).toEqual([{ text: '🗂 Directory', url: 'https://fakeraredirectory.com/series/18/22' }]);
    expect(buildCardButtons(card({ retired: true } as any), list)).toEqual([]);
    expect(buildCardButtons(null)).toEqual([]);
  });
});
