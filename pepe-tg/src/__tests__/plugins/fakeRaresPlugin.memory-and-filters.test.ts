import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { fakeRaresPlugin } from '../../plugins/fakeRaresPlugin';
import { MemoryStorageService } from '../../services/MemoryStorageService';
import { SmartRouterService } from '../../services/SmartRouterService';
import { resetEngagementTracking, calculateEngagementScore } from '../../utils/engagementScorer';

const messageHandler = fakeRaresPlugin.events?.MESSAGE_RECEIVED?.[0];

describe('fakeRaresPlugin MESSAGE_RECEIVED – memory capture and filters', () => {
  const createRuntimeWithMemory = (storeResult: any, smartRouter?: any) => ({
    agentId: 'test-agent',
    useModel: mock().mockResolvedValue([0.1, 0.2, 0.3]),
    searchMemories: mock().mockResolvedValue([]),
    getService: mock((serviceType: string) => {
      if (serviceType === MemoryStorageService.serviceType) {
        return {
          serviceType: MemoryStorageService.serviceType,
          storeMemory: mock().mockResolvedValue(storeResult),
        };
      }
      if (serviceType === SmartRouterService.serviceType) {
        return smartRouter ?? null;
      }
      return null;
    }),
  });

  beforeEach(() => {
    resetEngagementTracking();
    // Establish test user so they are not treated as a newcomer
    calculateEngagementScore({
      text: 'setup',
      hasBotMention: false,
      isReplyToBot: false,
      isFakeRareCard: false,
      userId: 'test-user',
      roomId: 'test-room',
    });
    delete process.env.SUPPRESS_BOOTSTRAP;
  });

  it('stores memory and marks message as handled on success', async () => {
    const runtime = createRuntimeWithMemory({
      success: true,
      memoryId: 'mem-1',
    });

    const callback = mock();
    const message = {
      id: 'mem-1',
      entityId: 'test-user',
      roomId: 'test-room',
      content: { text: 'remember this FREEDOMKEK lore' },
      metadata: {},
    };

    const params = { runtime, message, callback, ctx: {} };

    await messageHandler!(params);

    expect(callback).toHaveBeenCalledTimes(1);
    const payload = callback.mock.calls[0][0];
    expect(typeof payload.text).toBe('string');
    expect((message.metadata as any).__handledByCustom).toBe(true);
  });

  it('silently ignores when memory storage returns an ignoredReason', async () => {
    const runtime = createRuntimeWithMemory({
      success: false,
      ignoredReason: 'empty_content',
    });

    const callback = mock();
    const message = {
      id: 'mem-2',
      entityId: 'test-user',
      roomId: 'test-room',
      content: { text: 'remember this FREEDOMKEK lore' },
      metadata: {},
    };

    const params = { runtime, message, callback, ctx: {} };

    await messageHandler!(params);

    // No confirmation; message may still be marked handled later by engagement/router,
    // but the memory branch itself does not send a response.
    expect(callback).not.toHaveBeenCalled();
  });

  it('reports an error when memory storage fails', async () => {
    const runtime = createRuntimeWithMemory({
      success: false,
      error: 'boom',
    });

    const callback = mock();
    const message = {
      id: 'mem-3',
      entityId: 'test-user',
      roomId: 'test-room',
      content: { text: 'remember this FREEDOMKEK lore' },
      metadata: {},
    };

    const params = { runtime, message, callback, ctx: {} };

    await messageHandler!(params);

    expect(callback).toHaveBeenCalledTimes(1);
    const payload = callback.mock.calls[0][0];
    expect(payload.text).toContain('Failed to store memory');
    // Error path responds but does not mark as handled
    expect((message.metadata as any).__handledByCustom).toBeUndefined();
  });

  it('uses card discovery hint to call SmartRouter with forceCardFacts=true', async () => {
    const planRouting = mock().mockResolvedValue({
      kind: 'FACTS',
      intent: 'FACTS',
      reason: 'test_card_intent',
      retrieval: null,
      story: 'test',
    });
    const smartRouterStub = {
      recordUserTurn: mock().mockReturnValue(undefined),
      recordBotTurn: mock().mockReturnValue(undefined),
      planRouting,
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
      id: 'card-intent-1',
      entityId: 'test-user',
      roomId: 'test-room',
      content: { text: 'show me a card about pepe art' },
      metadata: {},
    };

    const params = { runtime, message, callback, ctx: {} };

    await messageHandler!(params);

    expect(planRouting).toHaveBeenCalled();
    const firstCallArgs = planRouting.mock.calls[0];
    expect(firstCallArgs[0]).toBe('show me a card about pepe art');
    expect(firstCallArgs[2]).toMatchObject({ forceCardFacts: true });
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
});


