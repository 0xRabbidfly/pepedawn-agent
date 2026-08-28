/**
 * x-post-spike.ts — proves out posting to X as PEPEDAWN, before any credential
 * exists.
 *
 * The risky parts of publishing are (a) OAuth 1.0a signing, which fails only as
 * an opaque 401, and (b) getting a postable Fake Rare image at all. Both are
 * exercised here. Nothing is posted without --post.
 *
 *   bun scripts/x-post-spike.ts                 # verify signing + media, print the requests
 *   bun scripts/x-post-spike.ts --card FAKEASF  # pick a specific card
 *   bun scripts/x-post-spike.ts --post          # actually publish (needs credentials)
 *
 * Credentials (OAuth 1.0a user context, in pepe-tg/.env):
 *   TWITTER_API_KEY, TWITTER_API_SECRET_KEY,
 *   TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
 *
 * OAuth 1.0a rather than OAuth 2.0 PKCE deliberately: four static values and no
 * refresh cycle, which suits a daemon that posts once a day. PKCE tokens expire
 * every two hours and would need refresh plumbing that can fail silently
 * overnight.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FULL_CARD_INDEX, type CardInfo } from '../src/data/fullCardIndex';
import { determineCardUrl } from '../src/actions/fakeRaresCard';

const argv = process.argv.slice(2);
const DO_POST = argv.includes('--post');
const CARD_ARG = argv[argv.indexOf('--card') + 1];

// X media limits. mp4 is excluded entirely: every sampled mp4 404s at the S3
// location determineCardUrl falls back to, so the video path is not usable.
const IMAGE_MAX = 5e6;
const GIF_MAX = 15e6;
const POSTABLE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif']);

// ---------------------------------------------------------------- oauth 1.0a

/** RFC 3986. encodeURIComponent leaves !*'() alone; OAuth requires them encoded. */
function pct(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

export function signatureBaseString(
  method: string, baseUri: string, params: Array<[string, string]>
): string {
  const normalised = params
    .map(([k, v]) => [pct(k), pct(v)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${method.toUpperCase()}&${pct(baseUri)}&${pct(normalised)}`;
}

export function hmacSign(base: string, consumerSecret: string, tokenSecret: string): string {
  return createHmac('sha1', `${pct(consumerSecret)}&${pct(tokenSecret)}`).update(base).digest('base64');
}

interface Creds { key: string; secret: string; token: string; tokenSecret: string }

/**
 * Build the Authorization header. `extraParams` must contain any
 * form-urlencoded body params — they are part of the signature. Multipart
 * bodies are NOT signed, which is why media upload passes nothing here.
 */
function authHeader(
  method: string, url: string, c: Creds, extraParams: Array<[string, string]> = []
): string {
  const u = new URL(url);
  const baseUri = `${u.origin}${u.pathname}`;
  const oauth: Array<[string, string]> = [
    ['oauth_consumer_key', c.key],
    ['oauth_nonce', randomBytes(16).toString('hex')],
    ['oauth_signature_method', 'HMAC-SHA1'],
    ['oauth_timestamp', Math.floor(Date.now() / 1000).toString()],
    ['oauth_token', c.token],
    ['oauth_version', '1.0'],
  ];
  const query: Array<[string, string]> = [...u.searchParams.entries()];
  const base = signatureBaseString(method, baseUri, [...oauth, ...query, ...extraParams]);
  const sig = hmacSign(base, c.secret, c.tokenSecret);
  const header = [...oauth, ['oauth_signature', sig] as [string, string]]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
    .join(', ');
  return `OAuth ${header}`;
}

// ---------------------------------------------------------------- self-test

/**
 * RFC 5849 §3.4.1.1, with the signature from Errata ID 2550 (verified): the
 * value printed in the RFC was computed with GET instead of POST.
 */
function selfTest(): boolean {
  const params: Array<[string, string]> = [
    ['b5', '=%3D'], ['a3', 'a'], ['c@', ''], ['a2', 'r b'],
    ['oauth_consumer_key', '9djdj82h48djs9d2'], ['oauth_token', 'kkk9d7dh3k39sjv7'],
    ['oauth_signature_method', 'HMAC-SHA1'], ['oauth_timestamp', '137131201'],
    ['oauth_nonce', '7d8f3e4a'], ['c2', ''], ['a3', '2 q'],
  ];
  const base = signatureBaseString('POST', 'http://example.com/request', params);
  const sig = hmacSign(base, 'j49sk3j29djd', 'dh893hdasih9');
  const ok = sig === 'r6/TJjbCOr97/+UU0NsvSne7s5g=';
  console.log(`  OAuth 1.0a signing vs RFC 5849 (errata 2550): ${ok ? 'PASS' : `FAIL — got ${sig}`}`);
  return ok;
}

// ---------------------------------------------------------------- media

function creds(): Creds | null {
  let env = '';
  try { env = readFileSync(join(process.cwd(), '.env'), 'utf8'); } catch { /* none */ }
  const pick = (k: string) =>
    process.env[k] || (env.match(new RegExp(`^\\s*${k}\\s*=\\s*(.+)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
  const c = {
    key: pick('TWITTER_API_KEY'), secret: pick('TWITTER_API_SECRET_KEY'),
    token: pick('TWITTER_ACCESS_TOKEN'), tokenSecret: pick('TWITTER_ACCESS_TOKEN_SECRET'),
  };
  return c.key && c.secret && c.token && c.tokenSecret ? c : null;
}

function pickCard(): CardInfo {
  if (CARD_ARG) {
    const found = FULL_CARD_INDEX.find((c) => c.asset === CARD_ARG.toUpperCase());
    if (!found) throw new Error(`no such card: ${CARD_ARG}`);
    return found;
  }
  const pool = FULL_CARD_INDEX.filter((c) => POSTABLE_EXT.has((c.ext || '').toLowerCase()));
  return pool[Math.floor(Math.random() * pool.length)];
}

async function fetchImage(card: CardInfo): Promise<{ bytes: Buffer; type: string; url: string }> {
  const { url, extension } = determineCardUrl(card, card.asset);
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`image fetch failed: HTTP ${res.status} for ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') || 'application/octet-stream';
  if (!type.startsWith('image/')) throw new Error(`not an image: ${type} (${url})`);
  const cap = extension === 'gif' ? GIF_MAX : IMAGE_MAX;
  if (bytes.length > cap) throw new Error(`too large: ${(bytes.length / 1e6).toFixed(2)}MB > ${cap / 1e6}MB`);
  return { bytes, type, url };
}

// ---------------------------------------------------------------- publish

async function uploadMedia(bytes: Buffer, type: string, c: Creds): Promise<string> {
  const url = 'https://api.x.com/2/media/upload';
  const form = new FormData();
  form.append('media', new Blob([bytes], { type }), 'card');
  form.append('media_category', 'tweet_image');
  // Multipart bodies are excluded from the OAuth signature base string.
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader('POST', url, c) },
    body: form,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`media upload ${res.status}: ${body.slice(0, 300)}`);
  const parsed = JSON.parse(body);
  const id = parsed?.data?.id ?? parsed?.media_id_string ?? parsed?.id;
  if (!id) throw new Error(`no media id in response: ${body.slice(0, 200)}`);
  return String(id);
}

async function createPost(text: string, mediaId: string, c: Creds): Promise<string> {
  const url = 'https://api.x.com/2/tweets';
  // JSON body: not form-urlencoded, so no body params enter the signature.
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader('POST', url, c), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, media: { media_ids: [mediaId] } }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`create post ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body)?.data?.id ?? '(unknown id)';
}

// ---------------------------------------------------------------- main

async function main() {
  console.log('=== 1. OAuth signing ===');
  const signingOk = selfTest();

  console.log('\n=== 2. Media ===');
  const card = pickCard();
  console.log(`  card: ${card.asset} (series ${card.series}, card ${card.card}, .${card.ext}) by ${card.artist}`);
  const img = await fetchImage(card);
  console.log(`  fetched ${(img.bytes.length / 1e6).toFixed(3)}MB ${img.type}`);
  console.log(`  from ${img.url}`);

  const text = `Fake Rare of the day: ${card.asset} by ${card.artist} — series ${card.series}, card ${card.card}.`;
  console.log('\n=== 3. Post that would be created ===');
  console.log(`  text (${text.length}/280): ${text}`);
  console.log(`  media: 1 image attached`);
  console.log(`  cost:  $0.015 (no link) — a URL in the text would make it $0.20`);

  const c = creds();
  console.log(`\n=== 4. Credentials ===`);
  console.log(`  ${c ? 'found all four OAuth 1.0a values' : 'MISSING — set TWITTER_API_KEY / _API_SECRET_KEY / _ACCESS_TOKEN / _ACCESS_TOKEN_SECRET'}`);

  if (!DO_POST) {
    console.log('\nDry run. Nothing was posted. Re-run with --post to publish.');
    process.exit(signingOk ? 0 : 1);
  }
  if (!c) { console.error('\nCannot post without credentials.'); process.exit(1); }

  console.log('\n=== 5. Publishing ===');
  const mediaId = await uploadMedia(img.bytes, img.type, c);
  console.log(`  media_id: ${mediaId}`);
  const id = await createPost(text, mediaId, c);
  console.log(`  posted: https://x.com/pepedawn/status/${id}`);
}

main().catch((e) => { console.error('\nspike failed:', e.message); process.exit(1); });
