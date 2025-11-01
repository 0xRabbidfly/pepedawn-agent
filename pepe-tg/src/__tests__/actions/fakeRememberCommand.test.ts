import { describe, it, expect, mock } from 'bun:test';
import { fakeRememberCommand } from '../../actions/fakeRememberCommand';
import type { IAgentRuntime, Memory } from '@elizaos/core';

/**
 * Tests for /fr command (Fake Remember)
 * Validates the new slash command alternative for memory capture
 */

describe('fakeRememberCommand', () => {
  // Create a shared storeMemory mock that persists across getService calls
  const storeMemoryMock = mock(async () => ({
    success: true,
    memoryId: 'test-memory-123'
  }));

  const mockRuntime = {
    agentId: 'test-agent',
    getService: mock((serviceType: string) => {
      if (serviceType === 'memory-storage') {
        return {
          storeMemory: storeMemoryMock
        };
      }
      return null;
    })
  } as unknown as IAgentRuntime;

  describe('validate', () => {
    it('should accept /fr commands', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/fr FREEDOMKEK this is lore' }
      };

      const isValid = await fakeRememberCommand.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it('should accept /fr with bot mention', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/fr@pepedawn_bot FREEDOMKEK this is lore' }
      };

      const isValid = await fakeRememberCommand.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it('should reject non-/fr commands', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: 'FREEDOMKEK remember this: lore' }
      };

      const isValid = await fakeRememberCommand.validate(mockRuntime, message);
      expect(isValid).toBe(false);
    });
  });

  describe('handler', () => {
    it('should store card-specific memory via /fr', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/fr FREEDOMKEK it was inspired by Free Kekistan' }
      };

      const callback = mock();
      const result = await fakeRememberCommand.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
      expect(callback).toHaveBeenCalled();
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('💾 Memory stored!');
    });

    it('should store general memory via /fr', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/fr Pepe green code is 420' }
      };

      const callback = mock();
      const result = await fakeRememberCommand.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(true);
      expect(callback).toHaveBeenCalled();
    });

    it('should reject empty /fr command', async () => {
      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/fr' }
      };

      const callback = mock();
      const result = await fakeRememberCommand.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        callback
      );

      expect(result.success).toBe(false);
      expect(callback).toHaveBeenCalled();
      const callbackArg = callback.mock.calls[0][0];
      expect(callbackArg.text).toContain('⚠️');
    });

    it('should transform /fr content to "remember this" format internally', async () => {
      // Clear previous calls
      storeMemoryMock.mockClear();

      const message: Memory = {
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: { text: '/fr FREEDOMKEK test lore' }
      };

      await fakeRememberCommand.handler(mockRuntime, message);

      expect(storeMemoryMock).toHaveBeenCalled();
      const storedMessage = storeMemoryMock.mock.calls[0][0];
      expect(storedMessage.content.text).toContain('remember this:');
      expect(storedMessage.content.text).toContain('FREEDOMKEK test lore');
    });
  });
});

