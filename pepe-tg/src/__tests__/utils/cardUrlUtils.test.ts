/**
 * Where a card's media is fetched from.
 *
 * The ten newest Series 18 cards had image overrides scraped from the old
 * directory's HTML; those URLs returned 403 the day the site was replaced,
 * and the carousel showed nothing past card 31. The directory's CDN has all
 * of them - but "CDN first" was measured across all 918 cards and would have
 * sent 44 animated cards as stills. So the directory is the fallback, used
 * only where our own source is dead or missing.
 */
import { describe, expect, it } from 'bun:test';
import type { CardInfo } from '../../data/fullCardIndex';
import { determineCardUrl, directoryMedia, isOldSiteUrl, preferDirectoryMedia } from '../../utils/cardUrlUtils';

const CDN = 'https://raw.githubusercontent.com/fakerares/cdn/main/cards';
const card = (over: Partial<CardInfo>): CardInfo =>
  ({ asset: 'X', series: 18, card: 32, ext: 'gif', artist: 'A', artistSlug: 'a', supply: 1, ...over }) as CardInfo;
const dir = (image: string | null, video: string | null = null) => ({ image, small: null, video, url: null });

describe('determineCardUrl', () => {
  it('uses the directory CDN for a card whose override points at the dead old site', () => {
    const c = card({ imageUri: 'https://fakeraredirectory.com/wp-content/uploads/2025/09/PEPEFLOW.gif', directory: dir(`${CDN}/18/32_X.gif`) });
    expect(isOldSiteUrl(c.imageUri)).toBe(true);
    expect(preferDirectoryMedia(c)).toBe(true);
    expect(determineCardUrl(c, 'X')).toEqual({ url: `${CDN}/18/32_X.gif`, extension: 'gif' });
  });

  it('keeps a working override and S3 even when the directory has media - motion is never downgraded', () => {
    // PEPONACID: an MP4 for us, only a JPG at the directory.
    const mp4 = card({ asset: 'PEPONACID', series: 4, ext: 'mp4', videoUri: 'https://arweave.net/abc', directory: dir(`${CDN}/4/9_PEPONACID.jpg`) });
    expect(preferDirectoryMedia(mp4)).toBe(false);
    expect(determineCardUrl(mp4, 'PEPONACID')).toEqual({ url: 'https://arweave.net/abc', extension: 'mp4' });
    // A plain S3 card with a CDN twin stays on S3.
    const s3 = card({ asset: 'FREEDOMKEK', series: 0, ext: 'jpeg', directory: dir(`${CDN}/0/1_FREEDOMKEK.jpg`) });
    expect(determineCardUrl(s3, 'FREEDOMKEK').url).toBe('https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/0/FREEDOMKEK.jpeg');
  });

  it('uses the directory for a card only it knows about', () => {
    // The sync writes the directory image as the override too, so either path
    // lands on the CDN; the fallback rule matters when the override is absent.
    const added = card({ asset: 'CAKERARE', ext: 'webp', issues: ['from_directory'], imageUri: `${CDN}/18/42_CAKERARE.webp`, directory: dir(`${CDN}/18/42_CAKERARE.webp`) });
    expect(determineCardUrl(added, 'CAKERARE').url).toBe(`${CDN}/18/42_CAKERARE.webp`);
    const bare = card({ asset: 'NEWONE', ext: 'png', issues: ['from_directory'], directory: dir(`${CDN}/19/1_NEWONE.png`) });
    expect(preferDirectoryMedia(bare)).toBe(true);
    expect(determineCardUrl(bare, 'NEWONE').url).toBe(`${CDN}/19/1_NEWONE.png`);
  });

  it('reads the directory extension off the URL and prefers its video', () => {
    expect(directoryMedia(card({ directory: dir(`${CDN}/x.png`, `${CDN}/x.mp4`) }))).toEqual({ url: `${CDN}/x.mp4`, extension: 'mp4' });
    expect(directoryMedia(card({ directory: dir(`${CDN}/x.tiff`) }))).toBeNull();
    expect(directoryMedia(card({}))).toBeNull();
    expect(isOldSiteUrl(`${CDN}/x.gif`)).toBe(false);
    expect(isOldSiteUrl('https://fakeraredirectory.com/series/18/32')).toBe(false);
  });
});
