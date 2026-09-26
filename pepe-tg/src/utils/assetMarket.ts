/**
 * The floor of any Counterparty asset: what it costs right now, from open
 * dispensers (priced in BTC) and open DEX sell orders (priced in XCP or BTC).
 *
 * 26 September 2026: "@pepedawn_bot what's the FAKEASF floor?" was answered
 * "FAKEASF has no stated floor in the notes" - with 24 open dispensers, the
 * cheapest at 0.0075 BTC. The question went to the card's lore instead of the
 * market.
 *
 * The price is per unit, never per dispense. A dispenser's rate buys its whole
 * give_quantity, and /fm used to show the rate as the unit price. Fake Rares
 * mostly dispense one at a time, so it hid; PEPECASH dispensers dispense in
 * batches of base units, and the "cheapest" one it would have shown at 1 sat
 * charges 1 BTC per PEPECASH. satoshi_price is used rather than satoshirate
 * because for an oracle dispenser (priced in USD) the rate is in cents; the
 * API converts it at the oracle's last price.
 *
 * Pure: the API calls live in services/dispenserQuery.ts.
 */

/** One way to buy the asset now, priced per unit. */
export interface MarketListing {
  kind: 'dispenser' | 'dex';
  /** What the price is paid in. Dispensers are always BTC. */
  quote: 'BTC' | 'XCP';
  /** Price of one unit, in `quote` (BTC or XCP, not satoshis). */
  unitPrice: number;
  /** Units bought per dispense (dispensers only). */
  batch?: number;
  /** Units still for sale here. */
  available: number;
  source: string;
  txHash: string;
  /** A dispenser priced in fiat through an oracle. */
  fiat?: { price: number; unit: string };
}

export interface AssetInfo {
  asset: string;
  longname?: string | null;
  divisible: boolean;
  locked?: boolean;
  supply?: number;
}

export interface AssetMarket {
  info: AssetInfo;
  dispensers: MarketListing[];
  dex: MarketListing[];
  fetchedAt: number;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : NaN;
};

/** Open dispensers with stock, cheapest per unit first. Rows are API v2 dispensers with verbose=true. */
export function dispenserListings(rows: any[]): MarketListing[] {
  const out: MarketListing[] = [];
  for (const r of rows || []) {
    if (r?.status !== 0) continue;
    const batch = num(r.give_quantity_normalized);
    const available = num(r.give_remaining_normalized);
    // satoshi_price: sats per dispense, oracle-converted where it applies.
    const sats = num(r.satoshi_price ?? r.satoshirate);
    if (!(batch > 0) || !(available > 0) || !(sats > 0)) continue;
    const listing: MarketListing = {
      kind: 'dispenser',
      quote: 'BTC',
      unitPrice: sats / batch / 1e8,
      batch,
      available,
      source: String(r.source || ''),
      txHash: String(r.tx_hash || ''),
    };
    if (r.oracle_address && num(r.fiat_price) > 0) {
      listing.fiat = { price: num(r.fiat_price) / batch, unit: String(r.fiat_unit || 'USD') };
    }
    out.push(listing);
  }
  return out.sort((a, b) => a.unitPrice - b.unitPrice);
}

/**
 * Open DEX orders selling the asset for XCP or BTC, cheapest per unit first.
 * Swaps for other assets are left out: a price in DARKPILLPEPE is not a floor.
 */
export function dexListings(rows: any[], asset: string): MarketListing[] {
  const out: MarketListing[] = [];
  for (const r of rows || []) {
    if (r?.status !== 'open' || r.give_asset !== asset) continue;
    if (r.get_asset !== 'XCP' && r.get_asset !== 'BTC') continue;
    const give = num(r.give_quantity_normalized);
    const get = num(r.get_quantity_normalized);
    const available = num(r.give_remaining_normalized);
    if (!(give > 0) || !(get > 0) || !(available > 0)) continue;
    out.push({
      kind: 'dex',
      quote: r.get_asset,
      unitPrice: get / give,
      available,
      source: String(r.source || ''),
      txHash: String(r.tx_hash || ''),
    });
  }
  return out.sort((a, b) => a.quote.localeCompare(b.quote) || a.unitPrice - b.unitPrice);
}

/** 0.0075 BTC; below 0.0001 BTC in sats, where the digits are readable. */
export function formatBtc(btc: number): string {
  if (btc >= 0.0001) return `${trim(btc.toFixed(8))} BTC`;
  const sats = btc * 1e8;
  const shown = sats >= 1
    ? Number(sats.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : trim(sats.toPrecision(2));
  return `${shown} sat${shown === '1' ? '' : 's'}`;
}

export function formatAmount(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return n.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function trim(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

function formatQuote(l: MarketListing): string {
  return l.quote === 'BTC' ? formatBtc(l.unitPrice) : `${formatAmount(Number(l.unitPrice.toPrecision(6)))} XCP`;
}

/** Telegram's legacy Markdown has no escapes inside bold: bold only plain names. */
function name(info: AssetInfo): string {
  const n = info.longname || info.asset;
  return /^[A-Za-z0-9.]+$/.test(n) ? `*${n}*` : n;
}

function line(l: MarketListing, link: (tx: string) => string): string {
  const each = l.batch && l.batch !== 1 ? ` each (${formatAmount(l.batch)} per dispense)` : '';
  const fiat = l.fiat ? ` ≈ ${formatAmount(Number(l.fiat.price.toFixed(2)))} ${l.fiat.unit}` : '';
  const addr = l.source ? ` | ${l.source.slice(0, 8)}…` : '';
  return `• ${formatQuote(l)}${each}${fiat} | ${formatAmount(l.available)} left${addr} | 🔗 [View](${link(l.txHash)})`;
}

/**
 * The /fm answer. The first line is the floor itself, so a reader who stops
 * there has the answer; the cheapest few follow.
 */
export function formatAssetMarket(m: AssetMarket, link: (tx: string) => string, shown = 5): string {
  const n = name(m.info);
  const cheapest = m.dispensers[0];
  const dexXcp = m.dex.find((l) => l.quote === 'XCP');
  const dexBtc = m.dex.find((l) => l.quote === 'BTC');

  if (!cheapest && !dexXcp && !dexBtc) {
    return `ℹ️ Nothing for sale on ${n} right now: no open dispensers and no DEX sell orders.`;
  }

  const lines: string[] = [];
  const floors: string[] = [];
  if (cheapest) floors.push(`${formatBtc(cheapest.unitPrice)} on a dispenser`);
  if (dexBtc && (!cheapest || dexBtc.unitPrice < cheapest.unitPrice)) floors.push(`${formatBtc(dexBtc.unitPrice)} on the DEX`);
  if (dexXcp) floors.push(`${formatQuote(dexXcp)} on the DEX`);
  lines.push(`🎰 ${n} floor: ${floors.join(' · ')}`);

  if (m.dispensers.length) {
    lines.push('', `Cheapest dispensers (${m.dispensers.length} open):`);
    for (const l of m.dispensers.slice(0, shown)) lines.push(line(l, link));
  }
  if (m.dex.length) {
    lines.push('', `DEX sell orders (${m.dex.length} open):`);
    for (const l of m.dex.slice(0, 3)) lines.push(line(l, link));
  }
  return lines.join('\n');
}

// ── Recognising a floor question in plain language ─────────────────────────

const WORDS = '(?<![A-Za-z0-9])\\$?([A-Za-z][A-Za-z0-9]{2,})';
/**
 * Where a price question names its asset. Anchored to the cue on purpose: many
 * dictionary words are registered Counterparty assets (MARKET, WHAT), so a
 * token is taken only from the slot a name would fill - "X floor", "floor of
 * X", "how much is X", "where can I buy X".
 */
const SLOTS: RegExp[] = [
  new RegExp(`\\b(?:floor|floors|price|prices|cost|dispensers?)\\s+(?:of|on|for)\\s+(?:the\\s+|a\\s+|an\\s+)?${WORDS}`, 'gi'),
  new RegExp(`${WORDS}(?:'s|’s)?\\s+(?:floor|floors|price|prices|dispensers?)\\b`, 'gi'),
  new RegExp(`\\bhow\\s+much\\s+(?:is|are|for|does|do|would)\\s+(?:a\\s+|an\\s+|one\\s+|the\\s+)?${WORDS}`, 'gi'),
  new RegExp(`\\bwhere\\s+(?:can|do|to|could)\\s+(?:i\\s+|u\\s+|you\\s+|we\\s+|one\\s+)?(?:buy|get|find|grab|cop)\\s+(?:a\\s+|an\\s+|one\\s+|some\\s+)?${WORDS}`, 'gi'),
  new RegExp(`\\bwhat(?:'s|’s|s|\\s+is)\\s+(?:the\\s+)?${WORDS}\\s+(?:going|selling|trading)\\s+for\\b`, 'gi'),
];

const NOT_NAMES = new Set([
  'THE', 'THIS', 'THAT', 'THESE', 'THOSE', 'ITS', 'YOUR', 'OUR', 'THEIR', 'HIS', 'HER', 'MY', 'ANY', 'EVERY', 'EACH',
  'WHAT', 'WHATS', 'WHICH', 'CURRENT', 'LOWEST', 'CHEAPEST', 'NEW', 'OLD', 'NEXT', 'LAST', 'SAME', 'REAL', 'TRUE',
  'CARD', 'CARDS', 'FAKE', 'FAKES', 'RARE', 'RARES', 'PEPE', 'PEPES', 'COMMON', 'COMMONS', 'DANK', 'DANKS',
  'COLLECTION', 'SERIES', 'SET', 'ONE', 'ONES', 'FLOOR', 'PRICE', 'MARKET', 'DISPENSER', 'DISPENSERS', 'ASSET',
  'TOKEN', 'TOKENS', 'NFT', 'NFTS', 'STUFF', 'THING', 'THINGS', 'IT', 'THEM', 'GAS', 'FEE', 'FEES', 'BTC', 'BITCOIN',
]);

/**
 * Asset names a message asks the price of, in the order they appear, each with
 * whether it was typed in capitals. Empty when there is no price question.
 */
export function floorQuestionCandidates(text: string): Array<{ token: string; typedInCaps: boolean }> {
  const t = (text || '').trim();
  if (!t || t.startsWith('/')) return [];
  const found: Array<{ token: string; typedInCaps: boolean; at: number }> = [];
  for (const re of SLOTS) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const raw = m[1];
      const upper = raw.toUpperCase();
      if (NOT_NAMES.has(upper)) continue;
      if (found.some((f) => f.token === upper)) continue;
      found.push({ token: upper, typedInCaps: raw === upper && /[A-Z]/.test(raw), at: m.index ?? 0 });
    }
  }
  return found.sort((a, b) => a.at - b.at).map(({ token, typedInCaps }) => ({ token, typedInCaps }));
}
