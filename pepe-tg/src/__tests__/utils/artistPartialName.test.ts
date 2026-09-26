/**
 * KEK-002, 26 September 2026: "/f c nardo" showed TWardo's cards. By edit
 * distance "nardo" is two letters from TWardo and four from Pepenardo, and
 * nothing credited a name for containing what was typed. These pin that part
 * of a name finds its artist, that collaborations do not make it ambiguous,
 * and that a genuinely ambiguous fragment is left to the old matcher.
 */
import { describe, expect, it } from 'bun:test';
import { findArtistByPartialName } from '../../utils/fuzzyMatch';
import { findCardsByArtistFuzzy } from '../../actions/fakeRaresCard';

describe('findArtistByPartialName', () => {
  const artists = [
    'Pepenardo',
    'Pepenardo Fakers, we ask you&#8230;',
    'TWardo',
    'Rare Scrilla',
    'AWRALPH x Rare Scrilla',
    'Rare Scrilla & Ghostface Killah',
    'Pepe Picasso',
    'Pepe Le Hues',
    'Mr Hansel',
    'Mr.Hansel & Ghostface Killah',
  ];

  it('finds the artist whose name holds what was typed', () => {
    expect(findArtistByPartialName('nardo', artists)).toBe('Pepenardo');
    expect(findArtistByPartialName('NARDO', artists)).toBe('Pepenardo');
  });

  it('is not thrown by collaborations crediting the same artist', () => {
    expect(findArtistByPartialName('scrilla', artists)).toBe('Rare Scrilla');
    expect(findArtistByPartialName('hansel', artists)).toBe('Mr Hansel');
  });

  it('declines when the fragment could be more than one artist', () => {
    expect(findArtistByPartialName('pepe', artists)).toBeNull();
  });

  it('declines fragments too short to mean anything', () => {
    expect(findArtistByPartialName('rdo', artists)).toBeNull();
    expect(findArtistByPartialName('', artists)).toBeNull();
  });

  it('declines when nothing holds the input', () => {
    expect(findArtistByPartialName('grillasca', artists)).toBeNull();
  });
});

describe('/f c and /f artist lookup against the card index', () => {
  it('"nardo" is Pepenardo, not TWardo, and is not called a typo', () => {
    const m = findCardsByArtistFuzzy('nardo');
    expect(m?.matchedArtist).toBe('Pepenardo');
    expect(m?.similarity).toBe(1);
    expect(m?.cards.length).toBeGreaterThan(0);
    expect(m?.cards.every((c) => c.artist === 'Pepenardo')).toBe(true);
  });

  it('TWardo is still found by his own name', () => {
    expect(findCardsByArtistFuzzy('wardo')?.matchedArtist).toBe('TWardo');
  });

  it('a name that used to land on the wrong artist now lands on the right one', () => {
    // Was Pepenardo: two edits beat a name that contains the input.
    expect(findCardsByArtistFuzzy('pepedward')?.matchedArtist).toBe('PepEdward Hopper');
    expect(findCardsByArtistFuzzy('scrilla')?.matchedArtist).toBe('Rare Scrilla');
  });
});
