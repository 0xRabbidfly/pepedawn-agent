import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { fakeRaresPlugin } from '../../plugins/fakeRaresPlugin';
import { MemoryStorageService } from '../../services/MemoryStorageService';
import { SmartRouterService } from '../../services/SmartRouterService';
import { _resetCache as _resetLedger } from '../../utils/loreInventory';
import { _resetCache as _resetRates } from '../../utils/rateLimiter';
import { _resetCache as _resetProposals } from '../../utils/vouching';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

const messageHandler = fakeRaresPlugin.events?.MESSAGE_RECEIVED?.[0];

describe('fakeRaresPlugin MESSAGE_RECEIVED – memory capture and filters', () => {
  /**
   * The storeMemory mock is created once per runtime, not per getService call.
   * Returning a fresh mock each call made "not.toHaveBeenCalled" assertions
   * pass vacuously - they were inspecting an instance the handler never used.
   */
  const createRuntimeWithMemory = (storeResult: any, smartRouter?: any) => {
    const storeMemory = mock().mockResolvedValue(storeResult);
    const service = { serviceType: MemoryStorageService.serviceType, storeMemory };
    return {
      agentId: 'test-agent',
      storeMemory, // exposed for assertions
      useModel: mock().mockResolvedValue([0.1, 0.2, 0.3]),
      searchMemories: mock().mockResolvedValue([]),
      getService: mock((serviceType: string) => {
        if (serviceType === MemoryStorageService.serviceType) return service;
        if (serviceType === SmartRouterService.serviceType) return smartRouter ?? null;
        return null;
      }),
    };
  };

  beforeEach(() => {
    // Establish test user so they are not treated as a newcomer
    delete process.env.SUPPRESS_BOOTSTRAP;
    // Keep the /fr quota ledger and rate-limit state out of real data files.
    process.env.LORE_LEDGER_PATH = join(tmpdir(), `lore-ledger-plugin-${process.pid}.json`);
    process.env.RATE_LIMIT_PATH = join(tmpdir(), `rate-limits-plugin-${process.pid}.json`);
    process.env.PROPOSALS_PATH = join(tmpdir(), `proposals-plugin-${process.pid}.json`);
    process.env.PARTICIPANTS_PATH = join(tmpdir(), `participants-plugin-${process.pid}.json`);
    delete process.env.OPENAI_API_KEY;
    rmSync(process.env.LORE_LEDGER_PATH, { force: true });
    rmSync(process.env.RATE_LIMIT_PATH, { force: true });
    rmSync(process.env.PROPOSALS_PATH, { force: true });
    rmSync(process.env.PARTICIPANTS_PATH, { force: true });
    _resetProposals();
    _resetLedger();
    _resetRates();
  });

  /**
   * The natural-language "remember this" path writes to the same knowledge base
   * as /fr, so as of 2026-08-19 it runs through the same gate. These assert the
   * gate, because an ungated second door would make the /fr rules decorative.
   */
  const artistCtx = {
    message: { from: { id: '4242', username: 'rarescrilla', first_name: 'Rare', last_name: 'Scrilla' } },
  };
  const LORE = "it was inspired by Free Kekistan and drawn the week of the fork";

  it('stores lore when the credited artist asks it to remember', async () => {
    const runtime = createRuntimeWithMemory({ success: true, memoryId: 'mem-1' });

    const callback = mock();
    const message = {
      id: 'mem-1',
      entityId: 'test-user',
      roomId: 'test-room',
      content: { text: `remember this FREEDOMKEK ${LORE}` },
      metadata: {},
    };

    await messageHandler!({ runtime, message, callback, ctx: artistCtx });

    expect(runtime.storeMemory).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    expect((message.metadata as any).__handledByCustom).toBe(true);
  });

  it('sends a stranger\'s "remember this" to the room for vouching', async () => {
    const runtime = createRuntimeWithMemory({ success: true, memoryId: 'mem-2' });

    const callback = mock();
    const message = {
      id: 'mem-2',
      entityId: 'test-user',
      roomId: 'test-room',
      content: { text: `remember this FREEDOMKEK ${LORE}` },
      metadata: {},
    };

    await messageHandler!({
      runtime,
      message,
      callback,
      ctx: { message: { from: { id: '9999', username: 'coit', first_name: 'Coit' } } },
    });

    // Same policy as /fr: nothing reaches the corpus without confirmation.
    expect(runtime.storeMemory).not.toHaveBeenCalled();
    expect(callback.mock.calls[0][0].text).toContain('/vouch');
  });

  it('refuses the false-attribution shape via "remember this" too', async () => {
    const runtime = createRuntimeWithMemory({ success: true, memoryId: 'mem-3' });

    const callback = mock();
    const message = {
      id: 'mem-3',
      entityId: 'test-user',
      roomId: 'test-room',
      content: { text: 'remember this djpepe made by coit' },
      metadata: {},
    };

    await messageHandler!({ runtime, message, callback, ctx: artistCtx });

    expect(runtime.storeMemory).not.toHaveBeenCalled();
  });

  it('blocks FAKEASF burn requests with a fixed response and no router involvement', async () => {
    const smartRouterStub = {
      recordUserTurn: mock().mockReturnValue(undefined),
      recordBotTurn: mock().mockReturnValue(undefined),
      planRouting: mock().mockResolvedValue(null),
    };

    const runtime = {
      agentId: 'test-agent',
      useModel: mock().mockResolvedValue([0.1, 0.2, 0.3]),
      searchMemories: mock().mockResolvedValue([]),
      getService: mock((serviceType: string) => {
        if (serviceType === SmartRouterService.serviceType) return smartRouterStub;
        return null;
      }),
    };

    const callback = mock();
    const message = {
      id: 'fakeasf-1',
      entityId: 'test-user',
      roomId: 'test-room',
      content: { text: 'can we burn FAKEASF?' },
      metadata: {},
    };

    const params = { runtime, message, callback, ctx: {} };

    await messageHandler!(params);

    expect(callback).toHaveBeenCalledTimes(1);
    const payload = callback.mock.calls[0][0];
    expect(payload.text).toContain('FAKEASF destroying or burning');
    expect(payload.text).toContain('fake-rares-submission-rules');
    expect((message.metadata as any).__handledByCustom).toBe(true);
    expect(smartRouterStub.planRouting).not.toHaveBeenCalled();
  });

  it('auto-replies with the owner address when an artist posts an address callout', async () => {
    const smartRouterStub = {
      recordUserTurn: mock().mockReturnValue(undefined),
      recordBotTurn: mock().mockReturnValue(undefined),
      planRouting: mock().mockResolvedValue(null),
    };

    const runtime = {
      agentId: 'test-agent',
      useModel: mock().mockResolvedValue([0.1, 0.2, 0.3]),
      searchMemories: mock().mockResolvedValue([]),
      getService: mock((serviceType: string) => {
        if (serviceType === SmartRouterService.serviceType) return smartRouterStub;
        return null;
      }),
    };

    const callback = mock();
    const message = {
      id: 'address-callout',
      entityId: 'artist',
      roomId: 'test-room',
      content: { text: 'next 4 addresses' },
      metadata: {},
    };

    await messageHandler!({ runtime, message, callback, ctx: {} });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].text).toContain('1L17y13ty6pvZjX8PhWiF89wf5AW7AfFZN');
    expect((message.metadata as any).__handledByCustom).toBe(true);
    expect(smartRouterStub.planRouting).not.toHaveBeenCalled();
    expect(smartRouterStub.recordBotTurn).toHaveBeenCalledWith(
      'test-room',
      '1L17y13ty6pvZjX8PhWiF89wf5AW7AfFZN'
    );
  });

  it('suppresses bare bitcoin address replies without invoking the router', async () => {
    const smartRouterStub = {
      recordUserTurn: mock().mockReturnValue(undefined),
      recordBotTurn: mock().mockReturnValue(undefined),
      planRouting: mock().mockResolvedValue(null),
    };

    const runtime = {
      agentId: 'test-agent',
      useModel: mock().mockResolvedValue([0.1, 0.2, 0.3]),
      searchMemories: mock().mockResolvedValue([]),
      getService: mock((serviceType: string) => {
        if (serviceType === SmartRouterService.serviceType) return smartRouterStub;
        return null;
      }),
    };

    const callback = mock();
    const bareAddress = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
    const message = {
      id: 'bare-address',
      entityId: 'collector',
      roomId: 'test-room',
      content: { text: bareAddress, inReplyTo: { id: 'artist-call' } },
      metadata: {},
    };

    await messageHandler!({
      runtime,
      message,
      callback,
      ctx: { message: { reply_to_message: { message_id: 42 } } },
    });

    expect(callback).not.toHaveBeenCalled();
    expect((message.metadata as any).__handledByCustom).toBe(true);
    expect(smartRouterStub.planRouting).not.toHaveBeenCalled();
  });
});


