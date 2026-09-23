/**
 * Reconciling our card index with fakeraredirectory.com, the canonical source.
 *
 * The index was scraped from pepe.wtf in October 2025 and topped up daily by
 * scraping the old directory's HTML. The new directory (September 2026) has a
 * JSON API, and a diff against it found: 161 artist credits that disagree
 * (one of ours is a Bitcoin address), 11 cards we lack, 7 we hold that the
 * canon has dropped, exact release dates and transactions for 904 cards
 * where we had a month, and original issuance where we had current supply.
 *
 * Pure: takes both lists, returns the merged list and a report. The script in
 * scripts/sync-directory.ts fetches and writes.
 *
 * Policy, because "take theirs" is not always right:
 *  - artist: theirs wins when ours is missing, looks like an address, or
 *    differs beyond case and punctuation. A difference of case only keeps
 *    ours (theirs has "YOTET" where ours has "Yotet").
 *  - supply stays ours (current, from pepe.wtf); their figure is kept as
 *    `issuanceCount` (original issuance). Both are real numbers about the card.
 *  - release date, block, tx and issuer come from them; `issuance` (the month
 *    string every renderer already shows) is derived from the date.
 *  - a card of ours the directory does not list is marked `retired`, not
 *    deleted: explicit lookups still work, random picks and stats skip it.
 *  - a card of theirs we lack is added, with what they give us.
 */

import type { CardInfo } from '../data/fullCardIndex';

export interface DirectoryCard {
  series: number;
  cardNumber: number;
  title: string;
  url?: string;
  issuance?: string | number | null;
  artist?: string | null;
  assets?: { image?: string | null; video?: string | null; small?: string | null };
  release?: { date?: string | null; block?: number | null; timestamp?: number | null; txHash?: string | null; issuer?: string | null } | null;
}

export interface SyncReport {
  theirs: number;
  ours: number;
  added: string[];
  retired: string[];
  unretired: string[];
  artistChanged: Array<{ asset: string; from: string | null; to: string }>;
  releaseAdded: number;
  seriesFixed: string[];
  skippedBlank: number;
  /** Titles the directory lists more than once. Nothing structural is taken from those. */
  duplicateTitles: string[];
  /** Same slot, near-identical name: one side has a typo. Resolved by the chain. */
  renamed: Array<{ from: string; to: string }>;
  keptOurName: Array<{ ours: string; theirs: string }>;
  /** Pairs that could not be resolved because no chain lookup was supplied. */
  unresolvedPairs: Array<{ ours: string; theirs: string }>;
}

/** Levenshtein distance, for "is this the same name with a typo". */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/**
 * Cards in the same series and slot whose names differ by a character or two.
 *
 * Found three in the first run: PEPEXTASIZ, MCAMATO and ORNGEFFAKEASF, none of
 * which exist on-chain — the directory's typos for assets we hold correctly —
 * and MADAMPEPE, which does exist and is the directory correcting us. The
 * names are on-chain facts, so the chain decides; the script asks it and
 * passes the answer in.
 */
export function titleMismatches(ours: CardInfo[], theirs: DirectoryCard[]): Array<{ ours: string; theirs: string; series: number; card: number }> {
  const theirTitles = new Set(theirs.map((t) => (t.title ?? '').trim().toUpperCase()).filter(Boolean));
  const ourTitles = new Set(ours.map((c) => c.asset.toUpperCase()));
  const bySlot = new Map(ours.filter((c) => !theirTitles.has(c.asset.toUpperCase())).map((c) => [`${c.series}/${c.card}`, c]));
  const out: Array<{ ours: string; theirs: string; series: number; card: number }> = [];
  for (const t of theirs) {
    const title = (t.title ?? '').trim().toUpperCase();
    if (!title || ourTitles.has(title)) continue;
    const mine = bySlot.get(`${t.series}/${t.cardNumber}`);
    if (mine && editDistance(mine.asset.toUpperCase(), title) <= 2) {
      out.push({ ours: mine.asset.toUpperCase(), theirs: title, series: t.series, card: t.cardNumber });
    }
  }
  return out;
}

export interface ReconcileOptions {
  /** Whether an asset name exists on-chain; undefined when unknown. Only asked for mismatched pairs. */
  existsOnChain?: (asset: string) => boolean | undefined;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2017-10-08" → "October 2017", the form every renderer already shows. */
export function monthOf(date: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date ?? '');
  if (!m) return null;
  const month = MONTHS[parseInt(m[2], 10) - 1];
  return month ? `${month} ${m[1]}` : null;
}

/** "8 October 2017", for an exact answer. */
export function longDate(date: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!m) return null;
  const month = MONTHS[parseInt(m[2], 10) - 1];
  return month ? `${parseInt(m[3], 10)} ${month} ${m[1]}` : null;
}

function looksLikeAddress(s: string | null | undefined): boolean {
  return !!s && /^(1|3|bc1)[A-Za-z0-9]{8,}$/.test(s.trim());
}

function fold(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extOf(assets: DirectoryCard['assets']): CardInfo['ext'] {
  if (assets?.video) return 'mp4';
  const ext = (assets?.image ?? '').split('?')[0].split('.').pop()?.toLowerCase();
  return (['jpeg', 'jpg', 'png', 'gif', 'webp'].includes(ext ?? '') ? ext : 'jpeg') as CardInfo['ext'];
}

function issuanceCount(v: DirectoryCard['issuance']): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function reconcile(ours: CardInfo[], theirs: DirectoryCard[], options: ReconcileOptions = {}): { cards: CardInfo[]; report: SyncReport } {
  const report: SyncReport = {
    theirs: theirs.length, ours: ours.length, added: [], retired: [], unretired: [], artistChanged: [], releaseAdded: 0, seriesFixed: [], skippedBlank: 0,
    duplicateTitles: [], renamed: [], keptOurName: [], unresolvedPairs: [],
  };
  const byAsset = new Map(ours.map((c) => [c.asset.toUpperCase(), { ...c }]));
  const seen = new Set<string>();

  // A title the directory lists twice is a data error there (asset names are
  // unique on-chain). Its metadata is still taken for the record we hold, but
  // never its series or card number, which would otherwise flip-flop.
  const titleCounts = new Map<string, number>();
  for (const t of theirs) {
    const title = (t.title ?? '').trim().toUpperCase();
    if (title) titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }
  report.duplicateTitles = [...titleCounts].filter(([, n]) => n > 1).map(([t]) => t);
  const duplicated = new Set(report.duplicateTitles);

  // Same slot, one-or-two-character difference: the chain says which name is
  // real. Theirs exists → rename ours to it. Theirs does not → keep ours and
  // treat their entry as ours under a typo. Unknown → leave both alone and say so.
  const renameTo = new Map<string, string>();   // our asset → their title
  const theirTypo = new Map<string, string>();  // their title → our asset
  for (const pair of titleMismatches(ours, theirs)) {
    const exists = options.existsOnChain?.(pair.theirs);
    if (exists === true) { renameTo.set(pair.ours, pair.theirs); report.renamed.push({ from: pair.ours, to: pair.theirs }); }
    else if (exists === false) { theirTypo.set(pair.theirs, pair.ours); report.keptOurName.push({ ours: pair.ours, theirs: pair.theirs }); }
    else report.unresolvedPairs.push({ ours: pair.ours, theirs: pair.theirs });
  }
  for (const [from, to] of renameTo) {
    const c = byAsset.get(from);
    if (!c) continue;
    byAsset.delete(from);
    byAsset.set(to, { ...c, asset: to });
  }

  for (const t of theirs) {
    let asset = (t.title ?? '').trim().toUpperCase();
    if (!asset) { report.skippedBlank++; continue; }
    if (theirTypo.has(asset)) asset = theirTypo.get(asset)!;
    if (report.unresolvedPairs.some((p) => p.theirs === asset)) continue;
    seen.add(asset);
    const theirArtist = (t.artist ?? '').trim() || null;
    const release = t.release?.date
      ? {
          date: t.release.date,
          block: t.release.block ?? null,
          txHash: t.release.txHash ?? null,
          issuer: t.release.issuer ?? null,
        }
      : undefined;
    const directory = {
      image: t.assets?.image ?? null,
      small: t.assets?.small ?? null,
      video: t.assets?.video ?? null,
      url: t.url ?? null,
    };

    const mine = byAsset.get(asset);
    if (!mine) {
      byAsset.set(asset, {
        asset,
        series: t.series,
        card: t.cardNumber,
        ext: extOf(t.assets),
        artist: theirArtist,
        artistSlug: null,
        supply: null,
        issuanceCount: issuanceCount(t.issuance),
        issuance: monthOf(t.release?.date),
        imageUri: t.assets?.image ?? null,
        videoUri: t.assets?.video ?? null,
        release,
        directory,
        issues: ['from_directory'],
      });
      report.added.push(asset);
      if (release) report.releaseAdded++;
      continue;
    }

    if (mine.retired) { delete mine.retired; report.unretired.push(asset); }
    if (!duplicated.has(asset) && (mine.series !== t.series || mine.card !== t.cardNumber)) {
      report.seriesFixed.push(`${asset} S${mine.series}#${mine.card}→S${t.series}#${t.cardNumber}`);
      mine.series = t.series;
      mine.card = t.cardNumber;
    }
    if (theirArtist) {
      const ourArtist = mine.artist?.trim() || null;
      const take = !ourArtist || looksLikeAddress(ourArtist) || fold(ourArtist) !== fold(theirArtist);
      if (take && ourArtist !== theirArtist) {
        report.artistChanged.push({ asset, from: ourArtist, to: theirArtist });
        mine.artist = theirArtist;
      }
    }
    const count = issuanceCount(t.issuance);
    if (count !== null) mine.issuanceCount = count;
    if (release) {
      if (!mine.release) report.releaseAdded++;
      mine.release = release;
      mine.issuance = monthOf(release.date) ?? mine.issuance ?? null;
    }
    mine.directory = directory;
  }

  const unresolvedOurs = new Set(report.unresolvedPairs.map((p) => p.ours));
  for (const [asset, c] of byAsset) {
    if (!seen.has(asset) && !c.retired && !unresolvedOurs.has(asset)) {
      c.retired = true;
      report.retired.push(asset);
    }
  }

  const cards = [...byAsset.values()].sort((a, b) => a.series - b.series || a.card - b.card || a.asset.localeCompare(b.asset));
  return { cards, report };
}

export function renderReport(r: SyncReport): string {
  const lines = [
    `directory ${r.theirs} cards (${r.skippedBlank} blank title skipped) · ours ${r.ours} → ${r.ours + r.added.length}`,
    `added ${r.added.length}: ${r.added.join(', ') || '—'}`,
    `retired ${r.retired.length}: ${r.retired.join(', ') || '—'}`,
    r.unretired.length ? `unretired ${r.unretired.length}: ${r.unretired.join(', ')}` : '',
    `artist changed ${r.artistChanged.length}` + (r.artistChanged.length ? `: ${r.artistChanged.slice(0, 8).map((a) => `${a.asset} "${a.from ?? ''}"→"${a.to}"`).join('; ')}${r.artistChanged.length > 8 ? ' …' : ''}` : ''),
    `release dates newly known ${r.releaseAdded}`,
    r.seriesFixed.length ? `series/card fixed: ${r.seriesFixed.join(', ')}` : '',
    r.renamed.length ? `renamed to the directory's spelling (exists on-chain): ${r.renamed.map((p) => `${p.from}→${p.to}`).join(', ')}` : '',
    r.keptOurName.length ? `kept our name (theirs not on-chain): ${r.keptOurName.map((p) => `${p.ours} (they say ${p.theirs})`).join(', ')}` : '',
    r.unresolvedPairs.length ? `UNRESOLVED name pairs, left alone: ${r.unresolvedPairs.map((p) => `${p.ours}/${p.theirs}`).join(', ')}` : '',
    r.duplicateTitles.length ? `directory lists twice (no series/card taken): ${r.duplicateTitles.join(', ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
