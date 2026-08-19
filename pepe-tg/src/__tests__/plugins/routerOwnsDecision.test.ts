import { describe, expect, it, mock } from 'bun:test';
import { fakeRaresPlugin } from '../../plugins/fakeRaresPlugin';

/**
 * The router owns the response decision end to end.
 *
 * Replaces auto-routing.test.ts and bootstrap-suppression.test.ts, which
 * verified when the plugin handed a message to ElizaOS bootstrap. Bootstrap
 * served 207 of 7,132 conversations (2.9%) and was the sole reason the
 * __handledByCustom sentinel was threaded through three files. Anything the
 * router declines is now silence — the correct default for a bot in a busy room.
 */
describe('router owns the response decision', () => {
  const handler = fakeRaresPlugin.events?.MESSAGE_RECEIVED?.[0] as
    | ((p: any) => Promise<any>)
    | undefined;

  const makeParams = (text: string, smartRouter?: any) => {
    const callback = mock().mockResolvedValue([]);
    const message: any = {
      id: `m-${text.slice(0, 8)}`,
      entityId: 'user-1',
      roomId: 'room-1',
      content: { text },
      metadata: {},
    };
    return {
      callback,
      message,
      params: {
        runtime: {
          agentId: 'test',
          useModel: mock().mockResolvedValue([0.1]),
          searchMemories: mock().mockResolvedValue([]),
          createMemory: mock().mockResolvedValue(undefined),
          getService: mock((t: string) => (t === 'smart-router' ? smartRouter : null)),
          services: [{ serviceType: 'telegram', bot: { botInfo: { id: 1 } } }],
        },
        message,
        callback,
        ctx: {},
      },
    };
  };

  it('stays silent on ordinary chatter rather than handing it onward', async () => {
    const { params, message, callback } = makeParams('gm everyone');
    await handler!(params);
    expect(message.metadata.__handledByCustom).toBe(true);
    expect(callback).not.toHaveBeenCalled();
  });

  it('stays silent on statements that merely mention cards', async () => {
    const { params, message } = makeParams('Just listed PEPEFISHBAND, supply is 33');
    await handler!(params);
    expect(message.metadata.__handledByCustom).toBe(true);
  });

  it('is silent, not crashy, when the router service is unavailable', async () => {
    // Failing closed matters: an unavailable router must not mean the bot
    // replies to everything.
    const { params, message, callback } = makeParams('what are the submission rules?');
    await expect(handler!(params)).resolves.toBeUndefined();
    expect(message.metadata.__handledByCustom).toBe(true);
    expect(callback).not.toHaveBeenCalled();
  });

  it('still answers safety-critical content regardless of the router', async () => {
    const { params, callback } = makeParams('can we burn FAKEASF?');
    await handler!(params);
    const texts = callback.mock.calls.map((c: any[]) => String(c[0]?.text ?? ''));
    expect(texts.some((t) => t.includes('FAKEASF destroying or burning'))).toBe(true);
  });
});
