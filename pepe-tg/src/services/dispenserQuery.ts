/**
 * DispenserQueryService
 *
 * The live market for any Counterparty asset, read from Counterparty API v2
 * with no database: open dispensers and open DEX sell orders, priced per unit
 * by utils/assetMarket.ts.
 *
 *   GET /assets/{asset}                         does it exist, is it divisible
 *   GET /assets/{asset}/dispensers?status=open  every open dispenser
 *   GET /orders/{asset}/XCP, /orders/{asset}/BTC  the two order books a floor is in
 *
 * The status filter is the API's, not ours. This used to fetch one page of
 * every dispenser the asset ever had and keep the open ones, so an asset with
 * a long history could have its live dispensers fall off the page.
 *
 * Requests use Bun's fetch, not the TokenScanClient's axios instance. Measured
 * on the droplet on 2026-09-26: axios on Bun's node:https layer never answered
 * 1 request in 90 as configured, and 18 in 90 when each opened a fresh
 * connection; fetch, 0 in 90. One such request froze the bot for five minutes.
 */

import type { IAgentRuntime } from '@elizaos/core';
import { Service, logger } from '@elizaos/core';
import { dexListings, dispenserListings, type AssetInfo, type AssetMarket } from '../utils/assetMarket.js';

/** A market is a minute old at most: long enough to spare the API a burst of the same question. */
export const MARKET_TTL_MS = 60_000;
/**
 * Every request for one answer shares this deadline, and it is a real one - an
 * abort signal. The client's own 30s timeout is an idle timeout: on 2026-09-26
 * an /fm call sat for five minutes, and because Telegram updates are handled in
 * batches, the whole bot sat with it until the plugin's 300s handler timeout.
 */
export const MARKET_DEADLINE_MS = 15_000;
const EXISTS_TTL_MS = 6 * 3600_000;

/** A bound nothing inside can extend, whatever a request does with its signal. */
function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms}ms`)), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
const MISSING_TTL_MS = 10 * 60_000;
const PAGE = 1000;
const MAX_PAGES = 5;
/** One attempt at one request. A stalled attempt is retried, within the overall deadline. */
const ATTEMPT_MS = 4_000;
const ATTEMPTS = 2;
const DEFAULT_API = 'https://api.counterparty.io:4000/v2';

class NotFound extends Error {}

export class DispenserQueryService extends Service {
  static serviceType = 'dispenserQuery';
  capabilityDescription = 'Live floor, dispensers and DEX orders for any Counterparty asset';

  private markets = new Map<string, AssetMarket>();
  private existence = new Map<string, { exists: boolean; at: number }>();

  private apiUrl(): string {
    return ((this.runtime.getSetting('COUNTERPARTY_API_URL') as string) || DEFAULT_API).replace(/\/+$/, '');
  }

  /**
   * GET a Counterparty v2 path. Each attempt has its own short limit, and every
   * attempt is bound by the caller's signal. 404 is NotFound; a 5xx, a network
   * error or a stall is retried once; anything else is an error.
   */
  private async get(path: string, params: Record<string, string | number | boolean>, signal: AbortSignal): Promise<any> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    const url = `${this.apiUrl()}${path}${qs ? `?${qs}` : ''}`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      if (signal.aborted) break;
      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.any([signal, AbortSignal.timeout(ATTEMPT_MS)]),
        });
        if (res.status === 404) throw new NotFound(path);
        if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { final: true });
        return await res.json();
      } catch (error: any) {
        if (error instanceof NotFound || error?.final) throw error;
        lastError = error;
        logger.warn({ path, attempt, error: String(error?.name || error) }, '[Market] request failed');
      }
    }
    throw lastError ?? new Error(`gave up on ${path}`);
  }

  /** null when the API says there is no such asset. Throws when the API cannot be reached. */
  private async fetchInfo(asset: string, signal: AbortSignal): Promise<AssetInfo | null> {
    let data: any;
    try {
      data = await this.get(`/assets/${encodeURIComponent(asset)}`, { verbose: true }, signal);
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
    const r = data?.result;
    if (!r?.asset) return null;
    const supply = parseFloat(r.supply_normalized);
    return {
      asset: r.asset,
      longname: r.asset_longname ?? null,
      divisible: !!r.divisible,
      locked: !!r.locked,
      supply: Number.isFinite(supply) ? supply : undefined,
    };
  }

  private async fetchAll(path: string, signal: AbortSignal): Promise<any[]> {
    const rows: any[] = [];
    let cursor: string | number | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.get(path, { status: 'open', verbose: true, limit: PAGE, ...(cursor ? { cursor } : {}) }, signal);
      const result: any[] = data?.result ?? [];
      rows.push(...result);
      cursor = data?.next_cursor ?? undefined;
      if (!cursor || result.length < PAGE) break;
    }
    return rows;
  }

  /**
   * Does this asset exist? Cached: hours when it does, minutes when it does
   * not. null when the API could not say - the caller decides what that means.
   */
  async assetExists(asset: string, timeoutMs = 6000): Promise<boolean | null> {
    const key = asset.toUpperCase();
    const hit = this.existence.get(key);
    if (hit && Date.now() - hit.at < (hit.exists ? EXISTS_TTL_MS : MISSING_TTL_MS)) return hit.exists;
    try {
      const exists = (await within(this.fetchInfo(key, AbortSignal.timeout(timeoutMs)), timeoutMs + 500, `existence check for ${key}`)) !== null;
      this.existence.set(key, { exists, at: Date.now() });
      return exists;
    } catch (error) {
      logger.warn({ asset: key, error: String(error) }, '[Market] could not check whether the asset exists');
      return null;
    }
  }

  /**
   * The asset's market, cheapest first. null when there is no such asset.
   * Throws when the API cannot be reached: a floor is never guessed.
   */
  async getAssetMarket(asset: string): Promise<AssetMarket | null> {
    const key = asset.toUpperCase();
    const cached = this.markets.get(key);
    if (cached && Date.now() - cached.fetchedAt < MARKET_TTL_MS) return cached;
    return within(this.fetchMarket(key), MARKET_DEADLINE_MS + 1000, `market for ${key}`);
  }

  private async fetchMarket(key: string): Promise<AssetMarket | null> {
    const signal = AbortSignal.timeout(MARKET_DEADLINE_MS);
    const info = await this.fetchInfo(key, signal);
    this.existence.set(key, { exists: !!info, at: Date.now() });
    if (!info) return null;

    // The pair books, not /assets/{asset}/orders: that is every order touching
    // the asset, and for XCP it is 2,400 rows over three pages to find five.
    const a = encodeURIComponent(info.asset);
    const books = ['XCP', 'BTC'].filter((quote) => quote !== info.asset);
    const [dispenserRows, ...bookRows] = await Promise.all([
      this.fetchAll(`/assets/${a}/dispensers`, signal),
      ...books.map((quote) => this.fetchAll(`/orders/${a}/${quote}`, signal)),
    ]);
    const orderRows = bookRows.flat();
    const market: AssetMarket = {
      info,
      dispensers: dispenserListings(dispenserRows),
      dex: dexListings(orderRows, info.asset),
      fetchedAt: Date.now(),
    };
    this.markets.set(key, market);
    logger.info(
      { asset: info.asset, dispensers: market.dispensers.length, dex: market.dex.length, floor: market.dispensers[0]?.unitPrice },
      '[Market] fetched'
    );
    return market;
  }

  async stop(): Promise<void> {
    logger.info('DispenserQueryService stopped');
  }

  static async start(runtime: IAgentRuntime): Promise<DispenserQueryService> {
    const service = new DispenserQueryService(runtime);
    logger.info('DispenserQueryService started');
    return service;
  }

  static async stop(_runtime: IAgentRuntime): Promise<void> {
    logger.info('DispenserQueryService stopped');
  }
}
