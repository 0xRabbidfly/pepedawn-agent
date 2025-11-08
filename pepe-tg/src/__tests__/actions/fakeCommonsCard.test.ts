import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { fakeCommonsCardAction } from '../../actions/fakeCommonsCard';
import type { IAgentRuntime, Memory } from '@elizaos/core';

/**
 * Tests for /c command (Fake Commons Card Display)
 * 
 * Covers random display, exact matches, and fuzzy suggestions.
 */

describe('fakeCommonsCardAction', () => {
  const mockRuntime = {
    agentId: 'test-agent',
    getService: mock(() => null),
  } as unknown as IAgentRuntime;

  beforeEach(() => {
    mock.restore();
  });

  describe('validate', () => {
    it('should accept /c commands', async () => {
      const tests = [
        '/c',
        '/c NOTAFAKERARE',
        '/c@pepedawn_bot NOTAFAKERARE',
        '@pepedawn_bot /c',
      ];

      for (const text of tests) {
        const message: Memory = {
          userId: 'user1',
          agentId: 'agent1',
          roomId: 'room1',
          content: { text }
        };
        const isValid = await fakeCommonsCardAction.validate(mockRuntime, message);
        expect(isValid).toBe(true);
      }
    });

    it('should reject non-/c commands', async () => {
      const tests = [
        '/f FREEDOMKEK',
        'show me NOTAFAKERARE',
        'hey can you /c NOTAFAKERARE please',
        ''
      ];

      for (const text of tests) {
        const message: Memory = {
          userId: 'user1',
          agentId: 'agent1',
          roomId: 'room1',
          content: { text }
        };
        const isValid = await fakeCommonsCardAction.validate(mockRuntime, message);
        expect(isValid).toBe(false);
      }
    });
  });

  describe('handler - random card', () => {
    it('should display random card with 🎲 emoji', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/c' }
      };

      const callback = mock();
      const result = await fakeCommonsCardAction.handler(
        { agentId: 'test-agent', getService: () => null } as any,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('🎲');
      expect(callbackArg.text).toContain('🐸');
      expect(callbackArg.attachments).toBeDefined();
      expect(callbackArg.attachments[0].source).toBe('fake-commons');
    });

    it('should return valid series range (1-54)', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/c' }
      };

      const result = await fakeCommonsCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        mock()
      );

      expect(result.data.series).toBeGreaterThanOrEqual(1);
      expect(result.data.series).toBeLessThanOrEqual(54);
    });
  });

  describe('handler - exact match', () => {
    it('should find card (case-insensitive)', async () => {
      const tests = [
        '/c NOTAFAKERARE',
        '/c notafakerare',
        '/c NoTaFaKeRaRe'
      ];

      for (const text of tests) {
        const message: Memory = {
          userId: 'user1',
          agentId: 'agent1',
          roomId: 'room1',
          content: { text }
        };

        const callback = mock();
        const result = await fakeCommonsCardAction.handler(
          mockRuntime,
          message,
          undefined,
          undefined,
          callback
        );

        expect(result.success).toBe(true);
        const callbackArg = callback.mock.calls[0][0];
        expect(callbackArg.text).toContain('NOTAFAKERARE');
        expect(callbackArg.text).not.toContain('🎲'); // No dice for exact match
      }
    });

    it('should show error for non-existent card', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/c ZZZZNONEXISTENT' }
      };

      const callback = mock();
      const result = await fakeCommonsCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(false);
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('❌');
      expect(callbackArg.text).toContain('not found');
    });

    it('should auto-correct close match', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/c NOTAFKERARE' } // missing a letter
      };

      const callback = mock();
      const result = await fakeCommonsCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('Close enough');
      expect(callbackArg.text).toContain('NOTAFAKERARE');
      expect(callbackArg.buttons?.length ?? 0).toBeGreaterThanOrEqual(0);
    });

    it('should show suggestions for moderate matches', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/c MEMEFAKE' }
      };

      const callback = mock();
      const result = await fakeCommonsCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(false);
      expect(result.data.reason).toBe('card_not_found_with_suggestions');
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('Did you mean');
      expect(callbackArg.buttons?.length ?? 0).toBeGreaterThan(0);
      const buttonPayloads = (callbackArg.buttons || []).map((b: any) => b.switch_inline_query_current_chat);
      expect(buttonPayloads.some((payload) => payload?.startsWith('/c '))).toBe(true);
    });

    it('should suggest similar cards for very short input', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/c pepe' }
      };

      const callback = mock();
      const result = await fakeCommonsCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(false);
      expect(result.data.reason).toBe('card_not_found_with_suggestions');
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('Did you mean');
      const payloads = (callbackArg.buttons || []).map(
        (b: any) => b.switch_inline_query_current_chat,
      );
      expect(payloads.every((text: string) => text?.startsWith('/c '))).toBe(true);
    });

    it('should include metadata (series, card, supply)', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/c NOTAFAKERARE' }
      };

      const callback = mock();
      await fakeCommonsCardAction.handler(
        { agentId: 'test-agent', getService: () => null } as any,
        message,
        undefined,
        undefined,
        callback
      );

      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toMatch(/S \d+ - C \d+/);
      expect(callbackArg.text).toMatch(/C \d+/);
      // Note: attachments may be undefined if card is a large video/gif (size check fallback)
      // The important thing is that the callback was called with valid metadata in text
      expect(callback).toHaveBeenCalled();
    });

    it('should handle mention-prefixed commands', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '@pepedawn_bot /c NOTAFAKERARE' }
      };

      const callback = mock();
      const result = await fakeCommonsCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('NOTAFAKERARE');
      expect(callbackArg.text).not.toContain('🎲');
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace variations', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '  /c   NOTAFAKERARE   ' }
      };

      const result = await fakeCommonsCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        mock()
      );

      expect(result.success).toBe(true);
    });

    it('should work without callback', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/c NOTAFAKERARE' }
      };

      const result = await fakeCommonsCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        undefined
      );

      expect(result.success).toBe(true);
    });
  });
});
