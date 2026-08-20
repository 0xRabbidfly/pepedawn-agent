/**
 * x-probe.ts — read-only reconnaissance against the X/Twitter API v2.
 *
 * Answers one question: what would PEPEDAWN actually get out of X? It never
 * writes to the database, never posts, and never touches the lore corpus. It
 * prints what came back and what it cost.
 *
 * X moved to pay-per-use in 2026 (~$0.005 per post read), so reads cost real
 * money and the default mode spends nothing:
 *
 *   bun scripts/x-probe.ts                      # plan only: queries + projected cost
 *   bun scripts/x-probe.ts --verify             # resolve handles (user lookups)
 *   bun scripts/x-probe.ts --search --budget 200
 *   bun scripts/x-probe.ts --search --budget 200 --days 7 --out report.json
 *
 * Needs X_BEARER_TOKEN in pepe-tg/.env (OAuth2 app-only bearer).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.x.com/2';
const COST_PER_POST_READ = 0.005;   // USD, pay-per-use as of 2026-04
const MAX_QUERY_LEN = 512;          // conservative; Pro allows 1024

interface ArtistHandle {
  artist: string; handle: string;
  source: 'pepe.wtf' | 'telegram-archive';
  confidence: 'confirmed' | 'curated' | 'inferred';
  cards: number; archiveMentions: number;
}

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (f: string, d?: string) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const MODE_VERIFY = has('--verify');
const MODE_SEARCH = has('--search');
const BUDGET = parseInt(val('--budget', '0')!, 10);   // max posts to read
const DAYS = Math.min(parseInt(val('--days', '7')!, 10), 7);  // recent search is 7d
const OUT = val('--out');
const MIN_CONFIDENCE = val('--min-confidence', 'curated'); // confirmed|curated|inferred

// ---------------------------------------------------------------- creds

function bearer(): string {
  if (process.env.X_BEARER_TOKEN) return process.env.X_BEARER_TOKEN;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^\s*X_BEARER_TOKEN\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* no .env */ }
  return '';
}

// ---------------------------------------------------------------- roster

function loadArtists(): ArtistHandle[] {
  const p = join(process.cwd(), 'src', 'data', 'artist-handles.json');
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  const rank = { confirmed: 3, curated: 2, inferred: 1 } as const;
  const floor = rank[MIN_CONFIDENCE as keyof typeof rank] ?? 2;
  return (doc.artists as ArtistHandle[])
    .filter((a) => rank[a.confidence] >= floor)
    .sort((a, b) => b.cards - a.cards);
}

/**
 * Handles too generic to be the artist's real account. These arrive from a name
 * collision — pepe.wtf credits the collab "Luna x Al x Pepe" to @pepe — and a
 * `from:` on one would flood the budget with unrelated posts.
 */
const HANDLE_DENYLIST = new Set(['pepe', 'nft', 'art', 'rare', 'crypto', 'xcp', 'bitcoin', 'eth']);

const VALID_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/**
 * Collaboration cards credit the same handle under several artist names
 * ("Arwyn" and "El Cholo Pepe x Arwyn" are both @mrarwyn), so the roster
 * legitimately repeats a handle. Queries must not.
 */
function usableHandles(artists: ArtistHandle[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of artists) {
    const h = a.handle.toLowerCase();
    if (seen.has(h) || HANDLE_DENYLIST.has(h) || !VALID_HANDLE.test(a.handle)) continue;
    seen.add(h);
    out.push(a.handle);
  }
  return out;
}

/** Pack `from:` clauses into as few queries as the length limit allows. */
function batchFromQueries(handles: string[], suffix = ''): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  const len = (parts: string[]) =>
    parts.map((h) => `from:${h}`).join(' OR ').length + suffix.length + 8;
  for (const h of handles) {
    if (cur.length && len([...cur, h]) > MAX_QUERY_LEN) {
      out.push(`(${cur.map((x) => `from:${x}`).join(' OR ')})${suffix}`);
      cur = [];
    }
    cur.push(h);
  }
  if (cur.length) out.push(`(${cur.map((x) => `from:${x}`).join(' OR ')})${suffix}`);
  return out;
}

// Topic queries. Deliberately narrow: bare #pepe is memecoin spam, not lore.
const TOPIC_QUERIES = [
  '(#fakerares OR "fake rare" OR "fake rares") -is:retweet lang:en',
  '("rare pepe" OR #rarepepe) (counterparty OR XCP OR dispenser) -is:retweet lang:en',
  '(fakeraredirectory OR "fake rare directory" OR pepe.wtf) -is:retweet',
];

// ---------------------------------------------------------------- http

let postsRead = 0;
let requests = 0;

async function call(path: string, params: Record<string, string>, token: string) {
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  requests++;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    const reset = res.headers.get('x-rate-limit-reset');
    throw new Error(`rate limited (429)${reset ? `, resets at ${new Date(+reset * 1000).toISOString()}` : ''}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json() as Promise<any>;
}

// ---------------------------------------------------------------- modes

async function verify(artists: ArtistHandle[], token: string) {
  console.log(`\n=== VERIFY: resolving ${artists.length} handles against X ===`);
  const alive: any[] = [];
  const dead: ArtistHandle[] = [];
  for (let i = 0; i < artists.length; i += 100) {
    const chunk = artists.slice(i, i + 100);
    const data = await call('/users/by', {
      usernames: chunk.map((a) => a.handle).join(','),
      'user.fields': 'username,name,description,public_metrics,verified,created_at',
    }, token);
    const found = new Map<string, any>();
    for (const u of data.data ?? []) found.set(u.username.toLowerCase(), u);
    for (const a of chunk) {
      const u = found.get(a.handle.toLowerCase());
      if (u) alive.push({ ...a, x: u }); else dead.push(a);
    }
    process.stdout.write(`  resolved ${Math.min(i + 100, artists.length)}/${artists.length}\r`);
  }
  console.log(`\n  live:  ${alive.length}`);
  console.log(`  dead / renamed / suspended: ${dead.length}`);
  if (dead.length) {
    console.log('\n  unresolved (handle is stale — do NOT quote these, X recycles usernames):');
    for (const d of dead.slice(0, 25)) {
      console.log(`    @${d.handle.padEnd(20)} ${d.artist}  [${d.source}]`);
    }
    if (dead.length > 25) console.log(`    ... and ${dead.length - 25} more`);
  }
  const byFollowers = alive.sort((a, b) => (b.x.public_metrics?.followers_count ?? 0) - (a.x.public_metrics?.followers_count ?? 0));
  console.log('\n  most-followed live artists:');
  for (const a of byFollowers.slice(0, 15)) {
    console.log(`    @${a.x.username.padEnd(20)} ${String(a.x.public_metrics?.followers_count ?? 0).padStart(8)} followers  ${a.artist}`);
  }
  return { alive, dead };
}

async function search(queries: { label: string; q: string }[], token: string) {
  console.log(`\n=== SEARCH: ${queries.length} queries, budget ${BUDGET} posts ($${(BUDGET * COST_PER_POST_READ).toFixed(2)}) ===`);
  const results: any[] = [];
  for (const { label, q } of queries) {
    if (postsRead >= BUDGET) { console.log(`  budget exhausted, stopping`); break; }
    const room = Math.min(100, BUDGET - postsRead);
    if (room < 10) break;
    try {
      const data = await call('/tweets/search/recent', {
        query: q,
        max_results: String(Math.max(10, room)),
        'tweet.fields': 'created_at,public_metrics,entities,referenced_tweets,conversation_id',
        'user.fields': 'username,name',
        expansions: 'author_id',
        start_time: new Date(Date.now() - DAYS * 864e5).toISOString(),
      }, token);
      const posts = data.data ?? [];
      postsRead += posts.length;
      const users = new Map<string, any>((data.includes?.users ?? []).map((u: any) => [u.id, u]));
      results.push({ label, query: q, count: posts.length,
        posts: posts.map((p: any) => ({ ...p, author: users.get(p.author_id)?.username })) });
      console.log(`  ${label.padEnd(28)} ${String(posts.length).padStart(3)} posts   (running total ${postsRead})`);
    } catch (e: any) {
      console.log(`  ${label.padEnd(28)} FAILED: ${e.message}`);
      if (/rate limited/.test(e.message)) break;
    }
  }
  return results;
}

function summarise(results: any[]) {
  const all = results.flatMap((r) => r.posts.map((p: any) => ({ ...p, bucket: r.label })));
  if (!all.length) { console.log('\nNo posts returned.'); return; }
  console.log(`\n=== WHAT CAME BACK: ${all.length} posts ===`);
  const eng = (p: any) => (p.public_metrics?.like_count ?? 0) + (p.public_metrics?.retweet_count ?? 0) * 2;
  for (const p of all.sort((a, b) => eng(b) - eng(a)).slice(0, 20)) {
    const text = (p.text ?? '').replace(/\s+/g, ' ').slice(0, 180);
    console.log(`\n  [${p.bucket}] @${p.author}  ♥${p.public_metrics?.like_count ?? 0} ↺${p.public_metrics?.retweet_count ?? 0}  ${p.created_at?.slice(0, 10)}`);
    console.log(`    ${text}`);
  }
  const withLinks = all.filter((p) => (p.entities?.urls ?? []).length).length;
  const withCards = all.filter((p) => /\b[A-Z]{5,}\b/.test(p.text ?? '')).length;
  console.log(`\n  posts containing a link:            ${withLinks}`);
  console.log(`  posts containing an ALLCAPS token:  ${withCards}   (candidate card mentions)`);
}

// ---------------------------------------------------------------- main

async function main() {
  const artists = loadArtists();
  const handles = usableHandles(artists);
  const dropped = artists.length - handles.length;
  const fromQueries = batchFromQueries(handles, ' -is:retweet');
  const queries = [
    ...fromQueries.map((q, i) => ({ label: `artists ${i + 1}/${fromQueries.length}`, q })),
    ...TOPIC_QUERIES.map((q, i) => ({ label: `topic ${i + 1}`, q })),
  ];

  console.log(`roster: ${artists.length} entries (min-confidence=${MIN_CONFIDENCE}), covering ${artists.reduce((s, a) => s + a.cards, 0)} cards`);
  console.log(`        ${handles.length} unique queryable handles (${dropped} dropped: duplicates from collab credits, generic, or malformed)`);
  console.log(`plan:   ${queries.length} queries (${fromQueries.length} artist batches + ${TOPIC_QUERIES.length} topic), ${DAYS}d window`);
  const worst = queries.length * 100;
  console.log(`cost:   up to ${worst} posts = $${(worst * COST_PER_POST_READ).toFixed(2)} at $${COST_PER_POST_READ}/read (a --budget caps this)`);

  const token = bearer();
  if (!MODE_VERIFY && !MODE_SEARCH) {
    console.log('\n--- QUERIES (plan only, nothing spent) ---');
    for (const { label, q } of queries) console.log(`\n  ${label}:\n    ${q}`);
    console.log(`\ncredentials: ${token ? 'X_BEARER_TOKEN found' : 'X_BEARER_TOKEN MISSING — add it to pepe-tg/.env'}`);
    console.log('re-run with --verify (resolve handles) or --search --budget N (read posts).');
    return;
  }
  if (!token) { console.error('\nX_BEARER_TOKEN missing — add it to pepe-tg/.env. Aborting.'); process.exit(1); }

  const report: any = { at: new Date().toISOString(), roster: artists.length };
  if (MODE_VERIFY) {
    const uniq = new Set(handles.map((h) => h.toLowerCase()));
    report.verify = await verify(artists.filter((a) => uniq.delete(a.handle.toLowerCase())), token);
  }
  if (MODE_SEARCH) {
    if (!BUDGET) { console.error('\n--search requires --budget N (max posts to read). Aborting.'); process.exit(1); }
    report.search = await search(queries, token);
    summarise(report.search);
  }
  console.log(`\n=== SPEND ===\n  requests: ${requests}\n  posts read: ${postsRead}\n  estimated cost: $${(postsRead * COST_PER_POST_READ).toFixed(2)}`);
  if (OUT) { writeFileSync(OUT, JSON.stringify(report, null, 2)); console.log(`  raw report: ${OUT}`); }
}

main().catch((e) => { console.error('\nprobe failed:', e.message); process.exit(1); });
