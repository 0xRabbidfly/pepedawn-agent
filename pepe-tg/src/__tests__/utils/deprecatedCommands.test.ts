import { describe, expect, it, mock } from 'bun:test';
import { executeCommand } from '../../utils/commandHandler';
import {
  DEPRECATED_COMMANDS,
  DEPRECATION_REMOVE_AFTER,
  formatDeprecationNotice,
  getDeprecation,
  isDeprecatedCommand,
} from '../../config/deprecatedCommands';
import type { Action } from '@elizaos/core';

describe('deprecatedCommands registry', () => {
  it('covers exactly the commands approved for deprecation', () => {
    expect(Object.keys(DEPRECATED_COMMANDS).sort()).toEqual([
      '/dawn',
      '/educate',
      '/fl',
      '/ft',
      '/fv',
    ]);
  });

  it('does not deprecate commands that are still in active use', () => {
    // /fr is deliberately NOT deprecated: it is being repositioned as the
    // artist lore contribution channel (wiki-class entries).
    for (const live of ['/f', '/c', '/fm', '/xcp', '/fc', '/help', '/start', '/fr']) {
      expect(isDeprecatedCommand(live)).toBe(false);
    }
  });

  it('looks up with or without the leading slash', () => {
    expect(getDeprecation('/fl')?.command).toBe('/fl');
    expect(getDeprecation('fl')?.command).toBe('/fl');
    expect(getDeprecation('/nope')).toBeNull();
    expect(getDeprecation('')).toBeNull();
  });

  it('gives every entry a replacement, a reason and a removal date', () => {
    for (const info of Object.values(DEPRECATED_COMMANDS)) {
      expect(info.replacement.length).toBeGreaterThan(0);
      expect(info.reason.length).toBeGreaterThan(0);
      expect(info.removeAfter).toBe(DEPRECATION_REMOVE_AFTER);
    }
  });

  it('names the command and the removal date in the notice', () => {
    const notice = formatDeprecationNotice(DEPRECATED_COMMANDS['/fl']);
    expect(notice).toContain('/fl');
    expect(notice).toContain(DEPRECATION_REMOVE_AFTER);
  });
});

describe('executeCommand deprecation behaviour', () => {
  const createMockAction = (shouldValidate = true): Action =>
    ({
      name: 'TEST_ACTION',
      description: 'Test action',
      similes: [],
      examples: [],
      validate: mock().mockResolvedValue(shouldValidate),
      handler: mock().mockResolvedValue({ success: true, text: 'Handled' }),
    }) as any;

  const createMockParams = () => {
    const logCommandUsage = mock().mockResolvedValue(undefined);
    // executeCommand swaps params.callback for a no-op to suppress bootstrap,
    // so keep our own handle on the original to inspect what was sent.
    const callback = mock().mockResolvedValue([]);
    return {
      logCommandUsage,
      callback,
      params: {
        runtime: {
          agentId: 'test-agent',
          getService: (name: string) => (name === 'telemetry' ? { logCommandUsage } : undefined),
        } as any,
        message: {
          id: 'msg-1',
          roomId: 'room-1',
          entityId: 'user-1',
          content: { text: '/fl SOMECARD' },
          metadata: {},
        } as any,
        state: {},
        callback,
      },
    };
  };

  it('still runs a deprecated command', async () => {
    const action = createMockAction(true);
    const { params } = createMockParams();

    const result = await executeCommand(action, params, '/fl');

    expect(result).toBe(true);
    expect(action.handler).toHaveBeenCalled();
  });

  it('appends a deprecation notice after the command response', async () => {
    const action = createMockAction(true);
    const { params, callback } = createMockParams();

    await executeCommand(action, params, '/fl');

    const texts = (callback as any).mock.calls.map((c: any[]) => c[0]?.text ?? '');
    expect(texts.some((t: string) => t.includes('deprecated'))).toBe(true);
    expect(texts.some((t: string) => t.includes(DEPRECATION_REMOVE_AFTER))).toBe(true);
  });

  it('does not add a notice for a live command', async () => {
    const action = createMockAction(true);
    const { params, callback } = createMockParams();

    await executeCommand(action, params, '/f');

    const texts = (callback as any).mock.calls.map((c: any[]) => c[0]?.text ?? '');
    expect(texts.some((t: string) => t.includes('deprecated'))).toBe(false);
  });

  it('records command usage with the deprecated flag set', async () => {
    const action = createMockAction(true);
    const { params, logCommandUsage } = createMockParams();

    await executeCommand(action, params, '/fl');

    expect(logCommandUsage).toHaveBeenCalled();
    const logged = (logCommandUsage as any).mock.calls[0][0];
    expect(logged.command).toBe('/fl');
    expect(logged.deprecated).toBe(true);
    expect(logged.success).toBe(true);
    expect(logged.roomId).toBe('room-1');
  });

  it('records live commands as not deprecated', async () => {
    const action = createMockAction(true);
    const { params, logCommandUsage } = createMockParams();

    await executeCommand(action, params, '/f');

    expect((logCommandUsage as any).mock.calls[0][0].deprecated).toBe(false);
  });

  it('records a failed validation as an unsuccessful invocation', async () => {
    const action = createMockAction(false);
    const { params, logCommandUsage } = createMockParams();

    await executeCommand(action, params, '/fl');

    const logged = (logCommandUsage as any).mock.calls[0][0];
    expect(logged.success).toBe(false);
    expect(logged.deprecated).toBe(true);
  });

  it('survives a runtime with no telemetry service', async () => {
    const action = createMockAction(true);
    const { params } = createMockParams();
    (params.runtime as any).getService = () => undefined;

    await expect(executeCommand(action, params, '/fl')).resolves.toBe(true);
  });
});
