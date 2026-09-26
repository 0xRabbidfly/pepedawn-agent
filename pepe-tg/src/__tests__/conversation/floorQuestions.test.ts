/**
 * 26 September 2026: "@pepedawn_bot what's the FAKEASF floor?" was answered
 * from the card's lore - "no stated floor in the notes" - with 24 dispensers
 * open. A price question now goes to /fm, which reads the live market for any
 * Counterparty asset; and /fm itself stops being Fake Rares only.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService } from '../../services/SmartRouterService';
import { DispenserQueryService } from '../../services/dispenserQuery';
import { fakeMarketAction } from '../../actions/fakeMarketAction';
import * as modelGateway from '../../utils/modelGateway';
import type { AssetMarket } from '../../utils/assetMarket';

/** Counterparty as far as these tests are concerned. */
function fakeMarket(assets: Record<string, AssetMarket | 'down'>) {
  const asked: string[] = [];
  const service = {
    asked,
    async assetExists(a: string) {
      asked.push(a);
      const m = assets[a.toUpperCase()];
      return m === 'down' ? null : !!m;
    },
    async getAssetMarket(a: string) {
      asked.push(a);
      const m = assets[a.toUpperCase()];
      if (m === 'down') throw new Error('ECONNRESET');
      return m ?? null;
    },
  };
  return service;
}

const market = (asset: string, floorBtc: number): AssetMarket => ({
  info: { asset, divisible: false },
  dispensers: [{ kind: 'dispenser', quote: 'BTC', unitPrice: floorBtc, batch: 1, available: 1, source: '1addr0000', txHash: 'tx' }],
  dex: [],
  fetchedAt: Date.now(),
});

describe('price questions in the room', () => {
  let dir: string;
  const saved = { shadow: process.env.V5_SHADOW_DIR, volunteer: process.env.VOLUNTEER_REPLIES };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pepedawn-floor-'));
    process.env.V5_SHADOW_DIR = dir;
    process.env.VOLUNTEER_REPLIES = 'false';
  });
  afterEach(async () => {
    const { flushShadow, resetShadowState } = await import('../../conversation/shadow');
    await flushShadow();
    resetShadowState();
    if (saved.shadow === undefined) delete process.env.V5_SHADOW_DIR; else process.env.V5_SHADOW_DIR = saved.shadow;
    if (saved.volunteer === undefined) delete process.env.VOLUNTEER_REPLIES; else process.env.VOLUNTEER_REPLIES = saved.volunteer;
    rmSync(dir, { recursive: true, force: true });
  });

  function router(svc: ReturnType<typeof fakeMarket>) {
    const spy = spyOn(modelGateway, 'callTextModel').mockImplementation(async () =>
      ({ text: '{"intent":"FACTS","command":""}', tokensIn: 1, tokensOut: 1, model: 'test', cost: 0, duration: 0 }) as any);
    const runtime = {
      agentId: 'test',
      getService: (t: string) => (t === DispenserQueryService.serviceType ? svc : null),
      searchMemories: async () => [],
      useModel: async () => [],
      getSetting: () => undefined,
    } as unknown as IAgentRuntime;
    return { service: new SmartRouterService(runtime), spy };
  }

  it('the question from the room goes to /fm, without asking Counterparty whether a card exists', async () => {
    const svc = fakeMarket({});
    const { service, spy } = router(svc);
    const plan = await service.planRouting("@pepedawn_bot what's the FAKEASF floor?", 'room-floor-1', true);
    spy.mockRestore();
    expect(plan.kind).toBe('CMDROUTE');
    expect(plan.reason).toBe('floor_question');
    expect(plan.command).toBe('/fm FAKEASF');
    expect(svc.asked).toEqual([]);
  });

  it('any asset typed in capitals, once Counterparty confirms it exists', async () => {
    // BITCORN is in none of the three collections.
    const svc = fakeMarket({ BITCORN: market('BITCORN', 1e-6) });
    const { service, spy } = router(svc);
    const plan = await service.planRouting('pepedawn whats the floor on BITCORN', 'room-floor-2', true);
    spy.mockRestore();
    expect(plan.command).toBe('/fm BITCORN');
    expect(svc.asked).toEqual(['BITCORN']);
  });

  it('a card from any collection, however it is typed', async () => {
    // PEPECASH is Rare Pepe series 1, card 11.
    const { service, spy } = router(fakeMarket({}));
    const plan = await service.planRouting('pepedawn whats the pepecash floor', 'room-floor-5', true);
    spy.mockRestore();
    expect(plan.command).toBe('/fm PEPECASH');
  });

  it('a word that is not an asset, or not typed as one, is left to the rest of the router', async () => {
    const svc = fakeMarket({ BITCORN: market('BITCORN', 1e-6) });
    const { service, spy } = router(svc);
    for (const t of ['pepedawn whats the floor on NOTANASSET', 'pepedawn whats the bitcorn floor']) {
      const plan = await service.planRouting(t, 'room-floor-3', true);
      expect(plan.reason).not.toBe('floor_question');
    }
    spy.mockRestore();
    expect(svc.asked).toEqual(['NOTANASSET']);
  });

  it('stays out of traders asking each other', async () => {
    const svc = fakeMarket({});
    const { service, spy } = router(svc);
    const plan = await service.planRouting("what's the FAKEASF floor?", 'room-floor-4', false);
    spy.mockRestore();
    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.reason).toBe('unaddressed_floor');
    expect(svc.asked).toEqual([]);
  });
});

describe('/fm for any asset', () => {
  async function fm(text: string, svc: ReturnType<typeof fakeMarket>): Promise<string> {
    let out = '';
    const runtime = {
      getService: (t: string) => (t === DispenserQueryService.serviceType ? svc : null),
    } as unknown as IAgentRuntime;
    await fakeMarketAction.handler(runtime, { content: { text } } as any, undefined, {}, (async (c: any) => {
      out = c.text;
      return [];
    }) as any);
    return out;
  }

  it('answers for an asset that is not a card', async () => {
    const out = await fm('/fm PEPECASH', fakeMarket({ PEPECASH: market('PEPECASH', 12e-8) }));
    expect(out.split('\n')[0]).toBe('🎰 *PEPECASH* floor: 12 sats on a dispenser');
  });

  it('never corrects a real asset into a look-alike card', async () => {
    const svc = fakeMarket({ FAKEASFX: market('FAKEASFX', 0.001), FAKEASF: market('FAKEASF', 0.0075) });
    const out = await fm('/fm FAKEASFX', svc);
    expect(out).toContain('*FAKEASFX* floor');
    expect(svc.asked).toEqual(['FAKEASFX']);
  });

  it('falls back to the card a non-asset is a typo of, and says so', async () => {
    const out = await fm('/fm FAKEASFX', fakeMarket({ FAKEASF: market('FAKEASF', 0.0075) }));
    expect(out).toStartWith('🔎 No asset called FAKEASFX; showing FAKEASF.');
    expect(out).toContain('*FAKEASF* floor: 0.0075 BTC');
  });

  it('says when a name is not an asset at all', async () => {
    expect(await fm('/fm NOTAREALASSETXYZ', fakeMarket({}))).toBe("❌ NOTAREALASSETXYZ isn't a Counterparty asset.");
  });

  it('says it could not check, rather than guessing, when Counterparty is down', async () => {
    expect(await fm('/fm FAKEASF', fakeMarket({ FAKEASF: 'down' }))).toBe(
      "⚠️ Couldn't reach Counterparty to check FAKEASF just now. Try again in a minute.",
    );
  });
});
