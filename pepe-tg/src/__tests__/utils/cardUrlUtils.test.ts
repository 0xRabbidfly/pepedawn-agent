/**
 * Where a card's media is fetched from.
 *
 * The ten newest Series 18 cards had image overrides scraped from the old
 * directory's HTML; those URLs returned 403 the day the site was replaced,
 * and the carousel showed nothing past card 31. The directory's CDN has all
 * of them.
 */
import { describe, expect, it } from 'bun:test';
import type { CardInfo } from '../../data/fullCardIndex';
import { determineCardUrl, directoryMedia } from '../../utils/cardUrlUtils';

const card = (over: Partial<CardInfo>): CardInfo =>
  ({ asset: 'X', series: 18, card: 32, ext: 'gif', artist: 'A', artistSlug: 'a', supply: 1, ...over }) as CardInfo;

describe('determineCardUrl', () => {
  it('prefers the directory CDN when the card has it, reading the extension off the URL', () => {
    const c = card({
      imageUri: 'https://old-directory.example/dead.gif',
      directory: { image: 'https://raw.githubusercontent.com/fakerares/cdn/main/cards/18/32_X.gif', small: null, video: null, url: null },
    });
    expect(determineCardUrl(c, 'X')).toEqual({
      url: 'https://raw.githubusercontent.com/fakerares/cdn/main/cards/18/32_X.gif',
      extension: 'gif',
    });
  });

  it('takes the directory video over its image, as mp4', () => {
    const c = card({
      ext: 'mp4',
      directory: { image: 'https://cdn/x.png', small: null, video: 'https://cdn/x.mp4', url: null },
    });
    expect(determineCardUrl(c, 'X')).toEqual({ url: 'https://cdn/x.mp4', extension: 'mp4' });
  });

  it('falls back to the old overrides and then S3 when there is no directory media', () => {
    expect(determineCardUrl(card({ imageUri: 'https://cdn.old/x.gif' }), 'X')).toEqual({ url: 'https://cdn.old/x.gif', extension: 'gif' });
    expect(determineCardUrl(card({ ext: 'jpeg' }), 'X').url).toBe('https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/18/X.jpeg');
    expect(directoryMedia(card({ directory: { image: 'https://cdn/x.tiff', small: null, video: null, url: null } }))).toBeNull();
    expect(directoryMedia(card({}))).toBeNull();
  });
});
