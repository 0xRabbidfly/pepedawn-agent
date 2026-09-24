/**
 * The card index, as committed, is fit to serve.
 *
 * This is the gate the daily update workflow runs before it merges its own
 * pull request: the run rewrites src/data/fake-rares-data.json from
 * pepe.wtf and fakeraredirectory.com without a person looking, and
 * production downloads whatever master holds. The sync already refuses a
 * short directory response and a retirement wave; this checks the file it
 * wrote, whichever step wrote it.
 */
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CardInfo } from '../../data/fullCardIndex';
import { determineCardUrl, isOldSiteUrl } from '../../utils/cardUrlUtils';

const cards = JSON.parse(readFileSync(join(import.meta.dir, '../../data/fake-rares-data.json'), 'utf8')) as CardInfo[];
const live = cards.filter((c) => !c.retired);
const KNOWN_EXT = ['jpg', 'jpeg', 'gif', 'GIF', 'png', 'mp4', 'webp'];

describe('fake-rares-data.json', () => {
  it('is a whole index, not a partial write', () => {
    expect(cards.length).toBeGreaterThanOrEqual(900);
    expect(cards.length).toBeLessThan(1500);
    // A few retirements are canon corrections; many means a source went wrong.
    expect(cards.length - live.length).toBeLessThan(cards.length * 0.05);
  });

  it('every card has an asset, a slot and a media extension', () => {
    const broken = cards.filter(
      (c) =>
        typeof c.asset !== 'string' || !c.asset.trim() ||
        !Number.isInteger(c.series) || c.series < 0 ||
        !Number.isInteger(c.card) || c.card < 1 ||
        !KNOWN_EXT.includes(c.ext as string),
    );
    expect(broken.map((c) => c.asset)).toEqual([]);
  });

  it('no asset is listed twice and no live slot is shared', () => {
    const seen = new Set<string>();
    const dupAssets = cards.map((c) => c.asset).filter((a) => seen.size === seen.add(a).size);
    expect(dupAssets).toEqual([]);
    const slots = new Set<string>();
    const dupSlots = live.map((c) => `${c.series}/${c.card}`).filter((s) => slots.size === slots.add(s).size);
    expect(dupSlots).toEqual([]);
  });

  it('every live card resolves to an https URL that is not the dead old site', () => {
    const bad = live
      .map((c) => ({ asset: c.asset, url: determineCardUrl(c, c.asset).url }))
      .filter(({ url }) => !/^https:\/\//.test(url) || isOldSiteUrl(url));
    expect(bad).toEqual([]);
  });
});
