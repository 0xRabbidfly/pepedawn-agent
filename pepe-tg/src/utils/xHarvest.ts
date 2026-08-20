/**
 * X harvest — recent community activity from X, kept deliberately apart from
 * the lore corpus.
 *
 * Why a separate store rather than ingesting into PGlite with the wiki and card
 * facts: a harvested post is an unreviewed third-party claim. `/fr` is gated by
 * card match, quality, quota and vouching precisely because `memories` carries
 * a 3.0 retrieval weight; a search-driven feed would reopen that hole wider,
 * since the author need not even be in the channel. Provenance is also lost at
 * ingest (every fragment is stamped `rag-service-fragment-sync` and the source
 * re-derived by heuristics that are ~22% wrong), so a tweet would sooner or
 * later be answered as `wiki` at 2.0 weight.
 *
 * So harvested posts are: quoted, attributed, dated, expiring — and never
 * retrievable as fact. PEPEDAWN may say "subterranean_1 posted this yesterday".
 * It may never learn it.
 *
 * Two consumers:
 *   push — `selectForVolunteer` offers an item when the room has gone quiet.
 *   pull — `matchForConversation` surfaces one when live chatter connects to it.
 *
 * Measured 2026-08-19 against the xAI Agent Tools API: of four candidate query
 * shapes, phrase search and market search returned ~50% useful posts; hashtag
 * and card-ticker search returned almost none and are not used. See
 * HARVEST_QUERIES.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { CARD_INFO_MAP } from '../data/fullCardIndex';
import { RARE_PEPES_CARD_INFO_MAP } from '../data/rarePepesIndex';
import { COMMONS_CARD_INFO_MAP } from '../data/fakeCommonsIndex';

export interface HarvestedPost {
  /** Stable id: author + timestamp, so re-harvesting cannot duplicate. */
  id: string;
  author: string;
  text: string;
  /** Epoch ms of the post itself, not of the harvest. */
  postedAt: number;
  harvestedAt: number;
  /** Which query found it, for telemetry and for tuning the query set. */
  query: string;
  /** Card assets named in the post, resolved against the real index. */
  cards: string[];
  /** 0..1 — how likely this is worth saying out loud. */
  interest: number;
  /** Permalink. Absent when the model declined to supply one. */
  url?: string;
  likes?: number;
  retweets?: number;
  replies?: number;
  /** Set once PEPEDAWN has volunteered it, so it is never offered twice. */
  volunteeredAt?: number;
  /** Set when it was woven into a live conversation. */
  usedAt?: number;
}

export interface HarvestQuery {
  key: string;
  /** Natural-language instruction for the x_search tool. */
  instruction: string;
}

/**
 * Only the query shapes that survived measurement.
 *
 * Dropped, with reasons, so they are not re-added:
 *  - hashtag/mention (`#fakerares`, `@FAKERARES_XCP`): returns the reply
 *    threads of those accounts — "GM", emoji, chatter. 1 useful post in 9.
 *  - card tickers: many Fake Rares assets are English-word-shaped, and
 *    FAKEASF collides with the high-volume slang hashtag #fakeasf. Worst
 *    precision of the four and the highest volume — the combination most
 *    likely to poison the store.
 */
export const HARVEST_QUERIES: HarvestQuery[] = [
  {
    key: 'phrase',
    instruction:
      'Search X for the exact phrases "fake rare" and "fake rares" in a crypto, ' +
      'Counterparty, Bitcoin or NFT-art context.',
  },
  {
    key: 'market',
    instruction:
      'Search X for posts about Counterparty XCP dispensers, Fake Rares or Rare Pepes ' +
      'sales, floor prices, drops or auctions.',
  },
  {
    key: 'curated',
    instruction:
      'Search X for the most recent posts by @subterranean_1, including the daily ' +
      '"Rare Pepe Lore Lesson" series.',
  },
];

/**
 * Shared tail. Two things are load-bearing here:
 *
 * JSON, because the prose format the model produces by default puts an
 * RFC date containing its own comma inside a comma-separated line.
 *
 * "Do NOT summarise", because asked an interpretive question the model answers
 * with its own judgement of the activity instead of the posts — which during
 * measurement read as "activity is thin" over a week that in fact contained a
 * series drop, an auction and nine lore posts.
 */
export const RAW_POSTS_RULE =
  'Return ONLY a JSON array, no prose and no code fences. Each element: ' +
  '{"author":"handle without @","date":"ISO 8601","text":"full text verbatim",' +
  '"url":"https://x.com/<handle>/status/<id>","likes":<int>,"retweets":<int>,"replies":<int>}. ' +
  'Include like/retweet/reply counts and the permalink for every post; use 0 if a count is genuinely unavailable. ' +
  'Do NOT summarise, do NOT filter for relevance, do NOT editorialise. ' +
  'Up to 30 posts, last {DAYS} days. Return [] if nothing matched.';

export interface HarvestConfig {
  /** Posts older than this are dropped: drops and floors go stale fast. */
  maxAgeMs: number;
  /** Hard cap on the store. */
  maxPosts: number;
  /** Below this interest score a post is never stored. */
  minInterest: number;
  /** Room must be silent this long before PEPEDAWN volunteers anything. */
  quietMs: number;
  /** Minimum gap between two volunteered posts. */
  volunteerGapMs: number;
}

export const DEFAULT_HARVEST_CONFIG: HarvestConfig = {
  maxAgeMs: 14 * 24 * 60 * 60 * 1000,
  maxPosts: 200,
  minInterest: 0.35,
  quietMs: 90 * 60 * 1000,
  volunteerGapMs: 6 * 60 * 60 * 1000,
};

// ---------------------------------------------------------------- scoring

/** Terms that mark a post as actually about this community, not homophones. */
const CONTEXT_TERMS = [
  'fake rare', 'fakerare', 'rare pepe', 'rarepepe', 'counterparty', 'xcp',
  'pepecash', 'dispenser', 'emblem', 'series', 'card', 'pepe', 'bitcoin', 'btc',
  'mint', 'burn', 'wallet', 'collection', 'artist', 'nft',
];

/** Signals that a post carries news or substance rather than noise. */
const SUBSTANCE_TERMS = [
  'dropping', 'drop', 'launch', 'launching', 'auction', 'minted', 'minting',
  'series', 'floor', 'sold', 'sale', 'listed', 'dispenser', 'supply',
  'announce', 'released', 'lore', 'created', 'artist', 'collab',
];

/**
 * "fake rare bird sighting" matched cleanly during measurement — a news article
 * about AI-corrupted wildlife databases. The phrase alone is not enough.
 */
const DISQUALIFYING = [
  'bird', 'wildlife', 'birder', 'sighting', 'species',
];

const SERIES_CARD_RE = /\bseries\s*\d+\b|\bcard\s*\d+\b|\bS\d+\s*C\d+\b/i;
const TICKER_RE = /\b[A-Z][A-Z0-9]{4,}\b/g;

/**
 * Card assets named in the post, checked against all three collections.
 *
 * Fake Rares alone is not enough: every "Rare Pepe Lore Lesson" - the richest
 * thing the harvest finds - is about a Rare Pepe, so checking only the 898-card
 * Fake Rares index left the highest-value posts with no card attached and
 * therefore unreachable by the conversation matcher.
 */
export function cardsMentioned(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.match(TICKER_RE) ?? []) {
    if (CARD_INFO_MAP[m] || RARE_PEPES_CARD_INFO_MAP[m] || COMMONS_CARD_INFO_MAP[m]) {
      found.add(m);
    }
  }
  return [...found];
}

/**
 * How likely this post is worth saying out loud, 0..1.
 *
 * Tuned against the 62 posts returned by the four measured queries: the aim is
 * that "GM", "🤝" and "This is my dad btw" fall below `minInterest` while a
 * series drop, a card reference or a lore lesson clear it comfortably.
 */
export function scoreInterest(text: string, author?: string): number {
  const lower = text.toLowerCase();
  const words = lower.trim().split(/\s+/).filter(Boolean);

  // A post with no community context is a homophone match, not a hit.
  const contextHits = CONTEXT_TERMS.filter((t) => lower.includes(t)).length;
  if (contextHits === 0) return 0;
  if (DISQUALIFYING.some((t) => lower.includes(t)) && contextHits < 2) return 0;

  // Nothing under a handful of words carries news. "GM" is the canonical case.
  if (words.length < 6) return 0;

  let score = 0.2;
  score += Math.min(contextHits, 4) * 0.06;
  score += Math.min(SUBSTANCE_TERMS.filter((t) => lower.includes(t)).length, 4) * 0.08;
  if (SERIES_CARD_RE.test(text)) score += 0.2;
  if (cardsMentioned(text).length > 0) score += 0.25;
  if (words.length >= 25) score += 0.1;          // considered, not a one-liner
  if (/https?:\/\//.test(text)) score += 0.05;   // a link to something real

  // A wall of contract addresses is shilling, whatever else it contains.
  if ((text.match(/0x[a-fA-F0-9]{20,}/g) ?? []).length >= 2) score -= 0.5;

  return Math.max(0, Math.min(1, score));
}

// ---------------------------------------------------------------- parsing

/**
 * `author, date, text` — but the date is RFC-style and contains its own comma
 * ("Wed, 19 Aug 2026 15:55:37 GMT"), so the date shape has to be matched
 * explicitly rather than splitting on commas.
 */
const POST_LINE_RE =
  /^\s*[-*]?\s*(?:Author:\s*)?@?([A-Za-z0-9_]{2,15})\s*,\s*(?:Date:\s*)?((?:[A-Z][a-z]{2},\s*)?\d{1,2}\s+[A-Z][a-z]{2,}\s+\d{4}[^,]*?)\s*,\s*(?:Text:\s*)?([\s\S]*)$/;

/**
 * Parse Grok's list output into posts.
 *
 * The model is asked for `author, date, text` per line but formats loosely —
 * sometimes with `Author:`/`Date:`/`Text:` labels, sometimes bold, and multi-line
 * posts continue on following lines. Anything unparseable is skipped rather
 * than guessed at.
 */
export function parseHarvestResponse(
  raw: string,
  query: string,
  now = Date.now(),
  config: HarvestConfig = DEFAULT_HARVEST_CONFIG
): HarvestedPost[] {
  const fromJson = parseJsonPosts(raw, query, now, config);
  if (fromJson) return fromJson;
  return parseLinePosts(raw, query, now, config);
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Preferred path. Returns null (not []) when the response is not JSON at all,
 * so the caller can fall back rather than silently reporting an empty harvest.
 */
function parseJsonPosts(
  raw: string, query: string, now: number, config: HarvestConfig
): HarvestedPost[] | null {
  const body = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  let rows: unknown;
  try {
    rows = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;

  const out: HarvestedPost[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const author = String(r.author ?? '').replace(/^@/, '').trim();
    const text = String(r.text ?? '').trim();
    if (!author || !text) continue;
    const postedAt = Date.parse(String(r.date ?? ''));
    if (Number.isNaN(postedAt)) continue;
    const post = buildPost(author, text, postedAt, query, now, config);
    if (!post) continue;
    const url = typeof r.url === 'string' && /^https:\/\/(x|twitter)\.com\//.test(r.url)
      ? r.url : undefined;
    out.push({ ...post, url,
      likes: num(r.likes), retweets: num(r.retweets), replies: num(r.replies) });
  }
  return out;
}

/** Shared gate: freshness and interest, applied identically on both paths. */
function buildPost(
  author: string, text: string, postedAt: number,
  query: string, now: number, config: HarvestConfig
): HarvestedPost | null {
  if (now - postedAt > config.maxAgeMs) return null;
  const interest = scoreInterest(text, author);
  if (interest < config.minInterest) return null;
  return {
    id: `${author.toLowerCase()}-${postedAt}`,
    author, text, postedAt, harvestedAt: now, query,
    cards: cardsMentioned(text),
    interest,
  };
}

/** Fallback for when the model ignores the JSON instruction. */
function parseLinePosts(
  raw: string, query: string, now: number, config: HarvestConfig
): HarvestedPost[] {
  const out: HarvestedPost[] = [];
  // Split on list markers at line start so multi-line post bodies stay intact.
  const blocks = raw.split(/\n(?=\s*[-*]\s)/);
  for (const block of blocks) {
    const cleaned = block.replace(/\*\*/g, '').trim();
    const m = cleaned.match(POST_LINE_RE);
    if (!m) continue;
    const [, author, dateStr, textRaw] = m;
    const text = textRaw.replace(/\s*show render_inline_citation[^\n]*/gi, '').trim();
    if (!text || /^\(no text content\)$/i.test(text)) continue;

    const postedAt = Date.parse(dateStr);
    if (Number.isNaN(postedAt)) continue;
    const post = buildPost(author, text, postedAt, query, now, config);
    if (post) out.push(post);
  }
  return out;
}

// ---------------------------------------------------------------- store

function storePath(): string {
  return process.env.X_HARVEST_PATH || join(process.cwd(), 'src', 'data', 'x-harvest.json');
}

let cache: HarvestedPost[] | null = null;

export function allPosts(): HarvestedPost[] {
  if (cache) return cache;
  try {
    const p = storePath();
    cache = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')).posts ?? []) : [];
  } catch {
    cache = [];   // a corrupt harvest file must never take the bot down
  }
  return cache!;
}

function write(posts: HarvestedPost[]): void {
  cache = posts;
  const p = storePath();
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify({ updatedAt: Date.now(), posts }, null, 1), 'utf8');
  renameSync(tmp, p);
}

/**
 * Merge new posts in, drop expired ones, keep the store bounded.
 * Existing posts win on conflict so `volunteeredAt`/`usedAt` survive a re-harvest.
 */
export function mergePosts(
  incoming: HarvestedPost[],
  now = Date.now(),
  config: HarvestConfig = DEFAULT_HARVEST_CONFIG
): { added: number; total: number } {
  const byId = new Map<string, HarvestedPost>();
  for (const p of allPosts()) {
    if (now - p.postedAt <= config.maxAgeMs) byId.set(p.id, p);
  }
  let added = 0;
  for (const p of incoming) {
    if (byId.has(p.id)) continue;
    byId.set(p.id, p);
    added++;
  }
  const kept = [...byId.values()]
    .sort((a, b) => b.postedAt - a.postedAt)
    .slice(0, config.maxPosts);
  write(kept);
  return { added, total: kept.length };
}

export function markVolunteered(id: string, now = Date.now()): void {
  const posts = allPosts().map((p) => (p.id === id ? { ...p, volunteeredAt: now } : p));
  write(posts);
}

export function markUsed(id: string, now = Date.now()): void {
  const posts = allPosts().map((p) => (p.id === id ? { ...p, usedAt: now } : p));
  write(posts);
}

/** Test helper. */
export function _resetCache(): void {
  cache = null;
}

// ------------------------------------------------------- chat ↔ room map

/**
 * Telegram chat id → ElizaOS room UUID, learned from live messages.
 *
 * The two are not interchangeable and neither can be derived from the other
 * outside the runtime: `roomId = createUniqueUuid(runtime, chatId)` normally,
 * but `createUniqueUuid(runtime, `${chatId}-${threadId}`)` inside a forum
 * topic. Sends need the chat id; room history is keyed by the UUID. Guessing
 * either direction is how the volunteer check would silently read every room
 * as empty.
 *
 * In-memory by design: until the bot has seen a message it has no business
 * volunteering into that room anyway.
 */
const chatToRoom = new Map<string, string>();

export function noteRoom(chatId: string, roomId: string): void {
  if (chatId && roomId) chatToRoom.set(chatId, roomId);
}

export function roomForChat(chatId: string): string | undefined {
  return chatToRoom.get(chatId);
}

// ---------------------------------------------------------------- push

/**
 * Pick something to volunteer into a quiet room, or null.
 *
 * Deliberately conservative: the room must have been silent a while, PEPEDAWN
 * must not have volunteered recently, and the post must be fresh and unused.
 * A bot that fills every lull is worse than one that says nothing.
 */
export function selectForVolunteer(
  opts: {
    lastUserAt?: number;
    lastVolunteerAt?: number;
    now?: number;
    posts?: HarvestedPost[];
  },
  config: HarvestConfig = DEFAULT_HARVEST_CONFIG
): HarvestedPost | null {
  const now = opts.now ?? Date.now();
  // An empty room is not a quiet room — with no history at all there is no
  // conversation to join, and volunteering would be talking to nobody.
  if (opts.lastUserAt === undefined) return null;
  if (now - opts.lastUserAt < config.quietMs) return null;
  if (opts.lastVolunteerAt !== undefined && now - opts.lastVolunteerAt < config.volunteerGapMs) {
    return null;
  }
  const candidates = (opts.posts ?? allPosts())
    .filter((p) => !p.volunteeredAt && !p.usedAt)
    .filter((p) => now - p.postedAt <= config.maxAgeMs)
    .sort((a, b) => b.interest - a.interest || b.postedAt - a.postedAt);
  return candidates[0] ?? null;
}

// ---------------------------------------------------------------- pull

const STOPWORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'for', 'you', 'are', 'was', 'have',
  'has', 'but', 'not', 'from', 'they', 'what', 'when', 'who', 'his', 'her',
  'its', 'been', 'were', 'them', 'then', 'than', 'just', 'like', 'about',
  'into', 'out', 'all', 'can', 'get', 'got', 'one', 'now', 'how', 'why',
  'pepe', 'fake', 'rare', 'rares', 'card', 'cards',
]);

/** Light plural folding, so "lore lessons" reaches a post saying "Lore Lesson". */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function terms(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
      .map(stem)
      .filter((w) => !STOPWORDS.has(w))
  );
}

/** Strip digits and separators so "subterranean" reaches @subterranean_1. */
function normaliseHandle(handle: string): string {
  return handle.toLowerCase().replace(/[^a-z]/g, '');
}

/** Asking for the newest thing should be answered by recency, not by score. */
const RECENCY_RE = /\b(latest|newest|recent|recently|today|this week|new)\b/i;

/**
 * Find a harvested post that genuinely connects to what is being said, or null.
 *
 * Four ways to connect, in descending strength:
 *   1. the post is by someone the message names ("lore from subterranean")
 *   2. a card asset in common
 *   3. a distinctive term in common - one rare enough across the store to be
 *      a real signal on its own, which is how "tell me about PEPELEO" works
 *      even though PEPELEO appears in only one post
 *   4. two or more ordinary terms in common
 *
 * Generic overlap cannot fire: "pepe", "card", "fake" and "rare" are stopworded,
 * because a bot that answers every message with "speaking of which, someone
 * tweeted..." is precisely the failure mode to avoid.
 */
export function matchForConversation(
  userText: string,
  opts: { now?: number; posts?: HarvestedPost[]; minOverlap?: number } = {},
  config: HarvestConfig = DEFAULT_HARVEST_CONFIG
): HarvestedPost | null {
  const now = opts.now ?? Date.now();
  const minOverlap = opts.minOverlap ?? 2;
  const userTerms = terms(userText);
  const userCards = cardsMentioned(userText.toUpperCase());
  if (userTerms.size === 0 && userCards.length === 0) return null;

  const live = (opts.posts ?? allPosts())
    .filter((p) => !p.usedAt && now - p.postedAt <= config.maxAgeMs);
  if (live.length === 0) return null;

  // Document frequency across the live store, so a term that appears
  // everywhere counts for little and a proper noun counts for a lot.
  const docFreq = new Map<string, number>();
  const postTerms = new Map<string, Set<string>>();
  for (const p of live) {
    const t = terms(p.text);
    postTerms.set(p.id, t);
    for (const term of t) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }
  const distinctive = (term: string) =>
    term.length >= 6 && (docFreq.get(term) ?? 0) <= Math.max(1, live.length * 0.2);

  const wantsLatest = RECENCY_RE.test(userText);

  const matches: Array<{ post: HarvestedPost; score: number }> = [];
  for (const p of live) {
    const authorHit = [...userTerms].some((t) => {
      const h = normaliseHandle(p.author);
      return t.length >= 5 && (h.includes(t) || t.includes(h));
    });
    const cardHit = p.cards.some((c) => userCards.includes(c));
    const shared = [...(postTerms.get(p.id) ?? [])].filter((t) => userTerms.has(t));
    // Two distinctive terms, not one.
    //
    // "who created DJPEPE?" surfaced a post about lost JSONs on the strength of
    // "created" against "create" - one stemmed verb. It qualified as
    // distinctive only because the store is small: the threshold is "in at most
    // a fifth of posts", and with 35 posts that is anything appearing 6 times
    // or fewer, which is most of the language. Cards and authors are their own
    // signals below; anything weaker than those needs corroboration before it
    // is worth interrupting a conversation with.
    const distinctiveShared = shared.filter(distinctive);
    const hasDistinctive = distinctiveShared.length >= 2;

    // A post about other cards is not a post about this one, whatever words it
    // shares. "who created DJPEPE?" surfaced a lore post about PEPONG on the
    // strength of "created" against "creator" - one stemmed term, distinctive
    // only because the store is small. When the user names cards and the post
    // names cards, they have to be the same cards.
    if (userCards.length > 0 && p.cards.length > 0 && !cardHit) continue;

    if (!authorHit && !cardHit && !hasDistinctive && shared.length < minOverlap) continue;

    matches.push({
      post: p,
      score:
        (authorHit ? 2 : 0) +
        (cardHit ? 1.5 : 0) +
        distinctiveShared.length * 0.5 +
        shared.length * 0.2 +
        p.interest * 0.5,
    });
  }
  if (matches.length === 0) return null;

  // "What's the LATEST from X" is a question about recency, so among posts that
  // all connect, the newest wins outright rather than the best-scoring one.
  matches.sort((a, b) =>
    wantsLatest
      ? b.post.postedAt - a.post.postedAt || b.score - a.score
      : b.score - a.score || b.post.postedAt - a.post.postedAt
  );
  return matches[0].post;
}

/** Render a post for a prompt — attributed and dated, never as fact. */
export function formatForPrompt(p: HarvestedPost): string {
  const when = new Date(p.postedAt).toISOString().slice(0, 10);
  return `@${p.author} posted on X (${when}):\n"${p.text.slice(0, 500)}"`;
}

// ---------------------------------------------------------------- rendering

/**
 * Telegram's legacy Markdown parse mode is unusable here: `_` is an italic
 * delimiter, and a great many handles carry underscores (@subterranean_1,
 * @h_u_e_s_, @Easy_to_the_b). An unmatched one makes Telegram reject the whole
 * message with a 400. Post text is arbitrary too. HTML needs only `&<>`
 * escaped, so these cards are sent as HTML regardless of what the rest of the
 * service uses.
 */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Lore lessons run well over a thousand characters; the link carries the rest. */
const MAX_QUOTE_CHARS = 600;

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export interface TelegramCard {
  text: string;
  parseMode: 'HTML';
  /** Previews would duplicate the quote we just rendered. */
  disableWebPagePreview: true;
}

/**
 * Render a harvested post as a Telegram card: X mark, linked handle, the post
 * itself, and its engagement.
 *
 * `lead` is PEPEDAWN's own sentence — why this is being shown now. It is kept
 * outside the quote so the community can always see where the bot stops and
 * the quoted stranger begins.
 */
export function formatForTelegram(p: HarvestedPost, lead?: string): TelegramCard {
  const permalink = p.url ?? `https://x.com/${p.author}`;
  const when = new Date(p.postedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  let body = p.text.trim();
  if (body.length > MAX_QUOTE_CHARS) {
    body = `${body.slice(0, MAX_QUOTE_CHARS).trimEnd()}…`;
  }

  const metrics: string[] = [];
  if (p.likes !== undefined) metrics.push(`♥ ${compact(p.likes)}`);
  if (p.retweets !== undefined) metrics.push(`🔁 ${compact(p.retweets)}`);
  if (p.replies !== undefined) metrics.push(`💬 ${compact(p.replies)}`);

  const lines = [
    lead ? `${esc(lead)}\n` : '',
    `𝕏 <b><a href="${esc(permalink)}">@${esc(p.author)}</a></b> · <i>${esc(when)}</i>`,
    `<blockquote>${esc(body)}</blockquote>`,
    metrics.length
      ? `${metrics.join('   ')}   ·   <a href="${esc(permalink)}">view on X</a>`
      : `<a href="${esc(permalink)}">view on X</a>`,
  ].filter(Boolean);

  return { text: lines.join('\n'), parseMode: 'HTML', disableWebPagePreview: true };
}

// ---------------------------------------------------------------- digest

/**
 * "What are people saying about Fake Rares on X?" is a different question from
 * "tell me about PEPELEO" — it wants the state of the room over there, not one
 * post. Revealing a single tweet is the wrong shape of answer.
 */
const X_ACTIVITY_RE =
  /\b(?:on|over on|from|via)\s+(?:x|twitter)\b|\b(?:x|twitter)\s+(?:chatter|activity|feed|timeline)\b|what(?:'s| is| are)?\s+(?:the\s+)?(?:people|folks|everyone|anyone)?\s*(?:saying|posting|talking)\b/i;

/**
 * Must actually be a question. Since the digest fires whether or not the bot
 * was addressed, a statement like "I saw it on twitter" or "posted this on X"
 * would otherwise make PEPEDAWN dump a digest on someone mid-conversation.
 */
const QUESTIONISH_RE =
  /\?|^\s*(?:what|whats|what's|any|anything|anyone|anybody|how|who|hows|how's|is|are|did|does|do|tell me)\b/i;

export function isXActivityQuestion(text: string): boolean {
  if (!X_ACTIVITY_RE.test(text)) return false;
  // "saying" alone is not enough — it must be about X, not about the channel.
  if (!/\b(x|twitter)\b/i.test(text)) return false;
  return QUESTIONISH_RE.test(text.trim());
}

/**
 * The digest's few slots are chosen by substance and then shown newest-first.
 *
 * Picking purely by recency put "I bet DJPEPE won't say that to FAKEDJPEPE face
 * tho" in a three-slot digest ahead of an unannounced series drop. Recency
 * decides the running order, not who gets in.
 *
 * Ignores used/volunteered flags: a digest is a summary, so repeating something
 * already shown is correct here.
 */
export function buildDigest(
  limit = 3,
  opts: { now?: number; posts?: HarvestedPost[] } = {},
  config: HarvestConfig = DEFAULT_HARVEST_CONFIG
): HarvestedPost[] {
  const now = opts.now ?? Date.now();
  const ranked = (opts.posts ?? allPosts())
    .filter((p) => now - p.postedAt <= config.maxAgeMs)
    .filter((p) => p.interest >= config.minInterest)
    .sort((a, b) => b.interest - a.interest || b.postedAt - a.postedAt);

  // One prolific account (subterranean_1 posts daily) would otherwise fill
  // every slot, which does not answer "what are PEOPLE saying".
  const perAuthor = Math.max(1, Math.ceil(limit / 2));
  const counts = new Map<string, number>();
  const picked: HarvestedPost[] = [];
  for (const p of ranked) {
    if (picked.length >= limit) break;
    const key = p.author.toLowerCase();
    const n = counts.get(key) ?? 0;
    if (n >= perAuthor) continue;
    counts.set(key, n + 1);
    picked.push(p);
  }
  // Backfill if the diversity cap left slots empty.
  for (const p of ranked) {
    if (picked.length >= limit) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked.sort((a, b) => b.postedAt - a.postedAt);
}

const DIGEST_QUOTE_CHARS = 220;

/**
 * Render several posts as one Telegram card. Each stays attributed and linked —
 * the point is to show what was said and by whom, not to summarise it into
 * PEPEDAWN's own voice, which would be indistinguishable from lore.
 */
export function formatDigestForTelegram(
  posts: HarvestedPost[],
  lead = 'Here is what has been going round on X lately:'
): TelegramCard {
  if (posts.length === 0) {
    return {
      text: 'Nothing much on X lately — it has been quiet over there.',
      parseMode: 'HTML',
      disableWebPagePreview: true,
    };
  }

  const entries = posts.map((p) => {
    const permalink = p.url ?? `https://x.com/${p.author}`;
    const when = new Date(p.postedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    let body = p.text.replace(/\s+/g, ' ').trim();
    if (body.length > DIGEST_QUOTE_CHARS) body = `${body.slice(0, DIGEST_QUOTE_CHARS).trimEnd()}…`;

    const metrics: string[] = [];
    if (p.likes !== undefined) metrics.push(`♥ ${compact(p.likes)}`);
    if (p.retweets !== undefined) metrics.push(`🔁 ${compact(p.retweets)}`);
    if (p.replies !== undefined) metrics.push(`💬 ${compact(p.replies)}`);

    return [
      `<b><a href="${esc(permalink)}">@${esc(p.author)}</a></b> · <i>${esc(when)}</i>`,
      `<blockquote>${esc(body)}</blockquote>`,
      metrics.length ? `${metrics.join('  ')}  ·  <a href="${esc(permalink)}">view</a>` : `<a href="${esc(permalink)}">view</a>`,
    ].join('\n');
  });

  return {
    text: `𝕏 ${esc(lead)}\n\n${entries.join('\n\n')}`,
    parseMode: 'HTML',
    disableWebPagePreview: true,
  };
}
