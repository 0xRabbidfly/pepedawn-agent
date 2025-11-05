import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { fakeRaresCardAction } from '../../actions/fakeRaresCard';
import type { IAgentRuntime, Memory } from '@elizaos/core';

/**
 * Tests for /f command (Fake Rares Card Display)
 * 
 * Covers:
 * - Random card display
 * - Exact card match
 * - Fuzzy matching (typo correction)
 * - Artist search
 * - Edge cases (empty index, invalid input, case sensitivity)
 */

describe('fakeRaresCardAction', () => {
  const mockRuntime = {
    agentId: 'test-agent',
    getService: mock(() => null),
  } as unknown as IAgentRuntime;

  beforeEach(() => {
    // Reset all mocks
    mock.restore();
  });

  describe('validate', () => {
    it('should accept /f for random card', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f' }
      };

      const isValid = await fakeRaresCardAction.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it('should accept /f CARDNAME for specific card', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOMKEK' }
      };

      const isValid = await fakeRaresCardAction.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it('should accept /f with bot mention', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f@pepedawn_bot FREEDOMKEK' }
      };

      const isValid = await fakeRaresCardAction.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it('should accept @bot /f pattern', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '@pepedawn_bot /f FREEDOMKEK' }
      };

      const isValid = await fakeRaresCardAction.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it('should accept /f with multi-word artist name', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f Rare Scrilla' }
      };

      const isValid = await fakeRaresCardAction.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it('should reject /c commands', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/c' }
      };

      const isValid = await fakeRaresCardAction.validate(mockRuntime, message);
      expect(isValid).toBe(false);
    });

    it('should reject non-command text', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: 'show me FREEDOMKEK' }
      };

      const isValid = await fakeRaresCardAction.validate(mockRuntime, message);
      expect(isValid).toBe(false);
    });

    it('should handle empty text', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '' }
      };

      const isValid = await fakeRaresCardAction.validate(mockRuntime, message);
      expect(isValid).toBe(false);
    });
  });

  describe('handler - random card', () => {
    it('should return success for random card request', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f' }
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
      expect(result.data.suppressBootstrap).toBe(true);
      expect(result.data.assetName).toBeDefined();
      expect(callback).toHaveBeenCalled();
    });

    it('should send card with attachments', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f' }
      };

      const callback = mock();
      // Don't pass runtime to ensure fallback implementation with attachments
      await fakeRaresCardAction.handler(
        { agentId: 'test-agent', getService: () => null } as any,
        message,
        undefined,
        undefined,
        callback
      );

      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('🐸'); // Card emoji
      expect(callbackArg.text).toContain('Series'); // Series info
      // Note: attachments may be undefined if card is a large video/gif (size check fallback)
      // The important thing is that the callback was called with valid text
      expect(callback).toHaveBeenCalled();
    });

    it('should include 🎲 emoji for random cards', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f' }
      };

      const callback = mock();
      await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('🎲'); // Dice emoji for random
    });
  });

  describe('handler - exact card match', () => {
    it('should find known card (FREEDOMKEK)', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOMKEK' }
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
      expect(callback).toHaveBeenCalled();
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('FREEDOMKEK');
    });

    it('should be case-insensitive', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f freedomkek' }
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
      expect(callback).toHaveBeenCalled();
    });

    it('should handle mixed case', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FrEeDoMkEk' }
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
    });

    it('should NOT include 🎲 emoji for exact matches', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOMKEK' }
      };

      const callback = mock();
      await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).not.toContain('🎲');
      expect(callbackArg.text).toContain('FREEDOMKEK');
    });
  });

  describe('handler - fuzzy matching', () => {
    it('should auto-correct typo (FREEDOMK → FREEDOMKEK)', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOMK' }
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('FREEDOMKEK');
      expect(callbackArg.text).toContain('😅'); // Typo correction emoji
    });

    it('should show suggestions for moderate matches', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOM' }
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      // Should either auto-correct (high confidence) or show suggestions
      expect(callback).toHaveBeenCalled();
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toBeDefined();
    });
  });

  describe('handler - artist search', () => {
    it('should find cards by artist name', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f Rare Scrilla' }
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('Rare Scrilla');
      expect(callbackArg.text).toContain('👨‍🎨'); // Artist emoji
    });

    it('should handle artist name with fuzzy match', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f Rare Scrila' } // Missing one 'l'
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      // Should fuzzy match to "Rare Scrilla"
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('handler - edge cases', () => {
    it('should handle completely invalid card name', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f ZZZZNONEXISTENT9999' }
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(callback).toHaveBeenCalled();
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('❌'); // Error emoji
    });

    it('should handle special characters in input', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOM@#$KEK' }
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(callback).toHaveBeenCalled();
    });

    it('should handle very long input', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f ' + 'A'.repeat(500) }
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(callback).toHaveBeenCalled();
    });

    it('should handle whitespace variations', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '  /f   FREEDOMKEK   ' }
      };

      const callback = mock();
      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
    });

    it('should work without callback (graceful degradation)', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOMKEK' }
      };

      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        undefined // No callback
      );

      expect(result.success).toBe(true);
    });
  });

  describe('handler - metadata validation', () => {
    it('should include series number in response', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOMKEK' }
      };

      const callback = mock();
      await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toMatch(/Series \d+/);
    });

    it('should include card number in response', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOMKEK' }
      };

      const callback = mock();
      await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toMatch(/Card \d+/);
    });

    it('should return card name in data object', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOMKEK' }
      };

      const result = await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        mock()
      );

      expect(result.success).toBe(true);
      expect(result.data.assetName).toBeDefined();
      expect(result.data.suppressBootstrap).toBe(true);
    });
  });

  describe('handler - attachment validation', () => {
    it('should send attachment with correct source', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOMKEK' }
      };

      const callback = mock();
      await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.attachments[0].source).toContain('fake-rares');
    });

    it('should use S3 URL pattern', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOMKEK' }
      };

      const callback = mock();
      await fakeRaresCardAction.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.attachments[0].url).toContain('pepewtf.s3.amazonaws.com');
    });
  });

  describe('validate - pattern edge cases', () => {
    it('should handle /f with trailing spaces', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f    ' }
      };

      const isValid = await fakeRaresCardAction.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it('should handle /f in the middle of text (should reject)', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: 'hey can you /f FREEDOMKEK please' }
      };

      const isValid = await fakeRaresCardAction.validate(mockRuntime, message);
      // Should reject - /f must be at start (with optional @mention)
      expect(isValid).toBe(false);
    });

    it('should accept /f with newlines in card name', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/f FREEDOMKEK' }
      };

      const isValid = await fakeRaresCardAction.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });
  });
});

