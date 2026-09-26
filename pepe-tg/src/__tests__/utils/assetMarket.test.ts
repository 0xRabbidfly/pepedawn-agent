/**
 * The floor of any Counterparty asset. Fixtures are shaped like Counterparty
 * API v2 rows with verbose=true, taken from the live API on 2026-09-26.
 */
import { describe, expect, it } from 'bun:test';
import {
  dexListings, dispenserListings, floorQuestionCandidates, formatAssetMarket, formatBtc, type AssetMarket,
} from '../../utils/assetMarket';

const disp = (o: Record<string, unknown>) => ({
  status: 0, source: '1APxNaxSaddr', tx_hash: 'tx', oracle_address: null,
  give_quantity_normalized: '1', give_remaining_normalized: '1', satoshirate: 750000, satoshi_price: 750000, ...o,
});
const order = (o: Record<string, unknown>) => ({
  status: 'open', give_asset: 'FAKEASF', get_asset: 'XCP', source: '1CLCpMFzaddr', tx_hash: 'tx',
  give_quantity_normalized: '1', get_quantity_normalized: '259', give_remaining_normalized: '1', ...o,
});
const link = (tx: string) => `https://cp20.tokenscan.io/tx/${tx}`;

describe('dispensers, priced per unit', () => {
  it('ranks by the price of one unit, not of one dispense', () => {
    // 0.012 BTC buys two: 0.006 each, cheaper than the 0.0075 single.
    const rows = [disp({ satoshi_price: 750000 }), disp({ satoshi_price: 1_200_000, give_quantity_normalized: '2', give_remaining_normalized: '4' })];
    const l = dispenserListings(rows);
    expect(l[0].unitPrice).toBeCloseTo(0.006, 10);
    expect(l[0].batch).toBe(2);
    expect(l[1].unitPrice).toBeCloseTo(0.0075, 10);
  });

  it('is not fooled by a 1-sat dispenser that sells a sliver of a divisible asset', () => {
    // PEPECASH: 1 sat for 0.00000001 units is 1 BTC per unit. The old /fm showed it as the floor.
    const rows = [
      disp({ satoshi_price: 1, satoshirate: 1, give_quantity_normalized: '0.00000001', give_remaining_normalized: '5' }),
      disp({ satoshi_price: 12, satoshirate: 12, give_quantity_normalized: '1.00000000', give_remaining_normalized: '32003' }),
    ];
    const l = dispenserListings(rows);
    expect(l[0].unitPrice).toBeCloseTo(12e-8, 14);
    expect(l[1].unitPrice).toBeCloseTo(1, 10);
  });

  it('prices an oracle dispenser by the converted satoshi price, not its rate in cents', () => {
    const [l] = dispenserListings([disp({
      satoshirate: 251200, satoshi_price: 3633839, oracle_address: '1BTCUSDupRmeaNferCFoxmF6bYV5cAR2X2', fiat_price: 2512, fiat_unit: 'USD',
    })]);
    expect(l.unitPrice).toBeCloseTo(0.03633839, 10);
    expect(l.fiat).toEqual({ price: 2512, unit: 'USD' });
  });

  it('leaves out closed and empty dispensers', () => {
    expect(dispenserListings([disp({ status: 10 }), disp({ give_remaining_normalized: '0' })])).toEqual([]);
  });
});

describe('DEX sell orders', () => {
  it('keeps orders selling the asset for XCP or BTC, cheapest first', () => {
    const l = dexListings([
      order({ get_quantity_normalized: '260', give_remaining_normalized: '2' }),
      order({}),
      order({ get_asset: 'DARKPILLPEPE' }),
      order({ give_asset: 'XCP', get_asset: 'FAKEASF' }),
      order({ status: 'filled' }),
    ], 'FAKEASF');
    expect(l.map((x) => x.unitPrice)).toEqual([259, 260]);
    expect(l.every((x) => x.quote === 'XCP')).toBe(true);
  });
});

describe('the reply', () => {
  const market = (over: Partial<AssetMarket> = {}): AssetMarket => ({
    info: { asset: 'FAKEASF', divisible: false },
    dispensers: dispenserListings([disp({}), disp({ satoshi_price: 1_000_000, give_remaining_normalized: '9' })]),
    dex: dexListings([order({})], 'FAKEASF'),
    fetchedAt: 0,
    ...over,
  });

  it('opens with the floor on both markets', () => {
    const text = formatAssetMarket(market(), link);
    expect(text.split('\n')[0]).toBe('🎰 *FAKEASF* floor: 0.0075 BTC on a dispenser · 259 XCP on the DEX');
    expect(text).toContain('Cheapest dispensers (2 open):');
    expect(text).toContain('• 0.01 BTC | 9 left | 1APxNaxS… | 🔗 [View](https://cp20.tokenscan.io/tx/tx)');
    expect(text).toContain('DEX sell orders (1 open):');
  });

  it('says plainly when nothing is for sale', () => {
    expect(formatAssetMarket(market({ dispensers: [], dex: [] }), link)).toBe(
      'ℹ️ Nothing for sale on *FAKEASF* right now: no open dispensers and no DEX sell orders.',
    );
  });

  it('writes small prices in sats', () => {
    expect(formatBtc(0.0075)).toBe('0.0075 BTC');
    expect(formatBtc(12e-8)).toBe('12 sats');
    expect(formatBtc(6000e-8)).toBe('6,000 sats');
    expect(formatBtc(1e-8)).toBe('1 sat');
    expect(formatBtc(0.5e-8)).toBe('0.5 sats');
  });
});

describe('recognising a price question', () => {
  const tokens = (t: string) => floorQuestionCandidates(t).map((c) => c.token);

  it('finds the asset in the slot a name fills', () => {
    expect(tokens("@pepedawn_bot what's the FAKEASF floor?")).toEqual(['FAKEASF']);
    expect(tokens('whats the floor on FAKEASF')).toEqual(['FAKEASF']);
    expect(tokens('price of PEPECASH?')).toEqual(['PEPECASH']);
    expect(tokens('how much is a FREEDOMKEK these days')).toEqual(['FREEDOMKEK']);
    expect(tokens('where can i buy FAKEASF')).toEqual(['FAKEASF']);
    expect(tokens("what's XCP going for")).toEqual(['XCP']);
    expect(tokens('any dispensers for $pepecash')).toEqual(['PEPECASH']);
  });

  it('knows whether the name was typed in capitals', () => {
    expect(floorQuestionCandidates('PEPECASH floor?')[0].typedInCaps).toBe(true);
    expect(floorQuestionCandidates('pepecash floor?')[0].typedInCaps).toBe(false);
  });

  it('does not take ordinary words for assets', () => {
    for (const t of ["what's the floor", 'whats the market floor', 'the fake floor is dumping', 'what is the price of fakes', 'gm', '/fm FAKEASF']) {
      expect(tokens(t)).toEqual([]);
    }
  });
});
