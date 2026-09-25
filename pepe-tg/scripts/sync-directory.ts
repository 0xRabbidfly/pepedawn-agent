#!/usr/bin/env bun
/**
 * Bring the card index in line with fakeraredirectory.com, the canonical source.
 *
 *   bun scripts/sync-directory.ts            # fetch, reconcile, write, report
 *   bun scripts/sync-directory.ts --dry-run  # report only
 *
 * Reads /api/cards (one request), reconciles into src/data/fake-rares-data.json
 * by the policy in src/utils/directorySync.ts, and prints what changed. Runs
 * daily from the update-fake-rares workflow after the pepe.wtf pass, so the
 * directory has the last word on artist, release and which cards exist, and
 * pepe.wtf still supplies current supply, slugs and media details.
 *
 * Production picks the committed JSON up from GitHub within a day; no deploy.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { reconcile, renderReport, titleMismatches, type DirectoryCard } from '../src/utils/directorySync';
import type { CardInfo } from '../src/data/fullCardIndex';

/**
 * Does this asset exist on Counterparty? Asked only for the handful of names
 * where ours and the directory's differ by a typo; the chain is the authority
 * on names. Undefined when the lookup fails, which leaves the pair alone.
 */
async function existsOnChain(asset: string): Promise<boolean | undefined> {
  try {
    const res = await fetch(`https://xchain.io/api/asset/${encodeURIComponent(asset)}`, { headers: { 'User-Agent': 'pepedawn-agent sync' } });
    if (!res.ok) return undefined;
    const body: any = await res.json();
    if (body?.asset) return true;
    if (typeof body?.error === 'string' || body?.asset === undefined) return false;
    return undefined;
  } catch {
    return undefined;
  }
}

const API = process.env.DIRECTORY_API || 'https://fakeraredirectory.com/api/cards';
const dataPath = join(process.cwd(), 'src', 'data', 'fake-rares-data.json');
const dryRun = process.argv.includes('--dry-run');

const res = await fetch(API, { headers: { 'User-Agent': 'pepedawn-agent sync (one request a day)' } });
if (!res.ok) { console.error(`${API}: ${res.status}`); process.exit(1); }
const theirs = (await res.json()) as DirectoryCard[];
if (!Array.isArray(theirs) || theirs.length < 500) {
  console.error(`Refusing: the directory returned ${Array.isArray(theirs) ? theirs.length : 'no'} cards; expected hundreds.`);
  process.exit(1);
}

const ours = JSON.parse(readFileSync(dataPath, 'utf8')) as CardInfo[];

const known = new Map<string, boolean | undefined>();
for (const pair of titleMismatches(ours, theirs)) {
  known.set(pair.theirs, await existsOnChain(pair.theirs));
  await new Promise((r) => setTimeout(r, 300));
}
const { cards, report } = reconcile(ours, theirs, { existsOnChain: (a) => known.get(a) });
console.log(renderReport(report));

// A retirement wave is a sign something is wrong upstream, not a canon change.
if (report.retired.length > 20) {
  console.error(`Refusing to write: ${report.retired.length} cards would be retired at once.`);
  process.exit(1);
}
// The artist list too: card replies link an artist to the directory's page
// only when the directory has one, and its slugs are its own. Small file,
// one more request. A short or failed response leaves yesterday's list.
const ARTISTS_API = API.replace(/\/api\/cards$/, '/api/artists');
const artistsPath = join(process.cwd(), 'src', 'data', 'directory-artists.json');
let artists: Array<{ name: string; slug: string; aliases: string[]; hasProfile: boolean }> | null = null;
try {
  const ares = await fetch(ARTISTS_API, { headers: { 'User-Agent': 'pepedawn-agent sync (one request a day)' } });
  const body: any = ares.ok ? await ares.json() : null;
  const list: any[] = Array.isArray(body?.artists) ? body.artists : [];
  if (list.length >= 100) {
    artists = list
      .filter((a) => typeof a?.name === 'string' && typeof a?.slug === 'string')
      .map((a) => ({
        name: a.name,
        slug: a.slug,
        aliases: (a.aliases ?? []).filter((x: unknown) => typeof x === 'string'),
        // A bio or any link means the page has been filled in; the artist
        // spotlight prods only the bare ones while the claim window is open.
        hasProfile: !!(a.bio && String(a.bio).trim()) || Object.values(a.links ?? {}).some(Boolean),
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
  } else {
    console.warn(`artists: ${ARTISTS_API} returned ${list.length}; keeping the committed list`);
  }
} catch (error) {
  console.warn(`artists: ${error instanceof Error ? error.message : String(error)}; keeping the committed list`);
}
if (artists) console.log(`artists ${artists.length} (${artists.filter((a) => a.aliases.length).length} with aliases)`);

if (dryRun) { console.log('\n(dry run: not written)'); process.exit(0); }
writeFileSync(dataPath, JSON.stringify(cards, null, 2) + '\n', 'utf8');
console.log(`\nwrote ${cards.length} cards to ${dataPath}`);
if (artists) {
  writeFileSync(artistsPath, JSON.stringify({ fetchedAt: new Date().toISOString().slice(0, 10), artists }, null, 1) + '\n', 'utf8');
  console.log(`wrote ${artists.length} artists to ${artistsPath}`);
}
