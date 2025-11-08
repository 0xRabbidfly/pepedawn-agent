import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { rarePepesCardAction } from '../../actions/rarePepesCard';
import type { IAgentRuntime, Memory } from '@elizaos/core';

describe('rarePepesCardAction', () => {
  const mockRuntime = {
    agentId: 'test-agent',
    getService: mock(() => null),
  } as unknown as IAgentRuntime;

  beforeEach(() => {
    mock.restore();
  });

  describe('validate', () => {
    it('should accept /p commands', async () => {
      const tests = ['/p', '/p RAREPEPE', '/p@bot RAREPEPE', '@bot /p RAREPEPE'];

      for (const text of tests) {
        const message: Memory = {
          userId: 'user1',
          agentId: 'agent1',
          roomId: 'room1',
          content: { text },
        };

        const isValid = await rarePepesCardAction.validate(mockRuntime, message);
        expect(isValid).toBe(true);
      }
    });

    it('should reject non-/p commands', async () => {
      const tests = ['/f RAREPEPE', '/c RAREPEPE', 'show me RAREPEPE', ''];

      for (const text of tests) {
        const message: Memory = {
          userId: 'user1',
          agentId: 'agent1',
          roomId: 'room1',
          content: { text },
        };

        const isValid = await rarePepesCardAction.validate(mockRuntime, message);
        expect(isValid).toBe(false);
      }
    });
  });

  describe('handler', () => {
    it('should return random card with 🎲 when no asset provided', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/p' },
      };

      const callback = mock();
      const result = await rarePepesCardAction.handler(
        { agentId: 'test-agent', getService: () => null } as any,
        message,
        undefined,
        undefined,
        callback,
      );

      expect(result.success).toBe(true);
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('🎲');
      expect(callbackArg.attachments?.[0]?.source).toBe('rare-pepes');
    });

    it('should display exact card when asset exists', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/p RAREPEPE' },
      };

      const callback = mock();
      const result = await rarePepesCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback,
      );

      expect(result.success).toBe(true);
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('RAREPEPE');
      expect(callbackArg.text).toMatch(/S \d+ - C \d+/);
    });

    it('should auto-correct close match', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/p RAREPEP' },
      };

      const callback = mock();
      const result = await rarePepesCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback,
      );

      expect(result.success).toBe(true);
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('Close enough');
      expect(callbackArg.text).toContain('RAREPEPE');
    });

    it('should show suggestions for moderate matches', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/p SATOSHIX' },
      };

      const callback = mock();
      const result = await rarePepesCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback,
      );

      expect(result.success).toBe(false);
      expect(result.data.reason).toBe('card_not_found_with_suggestions');
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('Did you mean');
      const payloads = (callbackArg.buttons || []).map(
        (b: any) => b.switch_inline_query_current_chat,
      );
      expect(payloads.some((text: string) => text?.startsWith('/p '))).toBe(true);
    });

    it('should show error when no match found', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/p ZZZZRARE' },
      };

      const callback = mock();
      const result = await rarePepesCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback,
      );

      expect(result.success).toBe(false);
      const callbackArg = callback.mock.calls[0][0];
    expect(callbackArg.text).toContain('Could not find');
    });

    it('should handle mention-prefixed commands', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '@pepedawn_bot /p RAREPEPE' },
      };

      const callback = mock();
      const result = await rarePepesCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback,
      );

      expect(result.success).toBe(true);
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('RAREPEPE');
      expect(callbackArg.text).not.toContain('🎲');
    });
  });
});

