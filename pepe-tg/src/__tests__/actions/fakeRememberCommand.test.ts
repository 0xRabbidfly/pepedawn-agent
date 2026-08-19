import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { fakeRememberCommand } from '../../actions/fakeRememberCommand';
import { _resetCache } from '../../utils/loreInventory';
import type { IAgentRuntime, Memory } from '@elizaos/core';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

// Point the quota ledger at a scratch file so tests never touch real data.
const LEDGER = join(tmpdir(), `lore-ledger-test-${process.pid}.json`);
process.env.LORE_LEDGER_PATH = LEDGER;

/**
 * Tests for /fr command (Fake Remember).
 *
 * /fr is gated as of 2026-08-19: a real card, the card's artist, at most two
 * entries per card, and content that reads like lore. The handler tests below
 * assert the gate, not just the plumbing - an ungated /fr is the bug.
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
    /** A submitter who is the credited artist for FREEDOMKEK. */
    const artistCtx = {
      message: { from: { id: '4242', username: 'rarescrilla', first_name: 'Rare', last_name: 'Scrilla' } },
    };
    const strangerCtx = {
      message: { from: { id: '9999', username: 'coit', first_name: 'Coit' } },
    };

    const msg = (text: string): Memory =>
      ({ userId: 'user1', agentId: 'agent1', roomId: 'room1', content: { text } }) as Memory;

    beforeEach(() => {
      storeMemoryMock.mockClear();
      rmSync(LEDGER, { force: true });
      _resetCache();
    });

    it('stores lore from the credited artist', async () => {
      const callback = mock();
      const result = await fakeRememberCommand.handler(
        mockRuntime,
        msg('/fr FREEDOMKEK it was inspired by Free Kekistan and drawn the week of the fork'),
        undefined,
        { ctx: artistCtx },
        callback
      );

      expect(result.success).toBe(true);
      expect(storeMemoryMock).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].text).toContain('FREEDOMKEK');
    });

    it('refuses a stranger writing lore onto someone else\'s card', async () => {
      const callback = mock();
      await fakeRememberCommand.handler(
        mockRuntime,
        msg('/fr FREEDOMKEK it was inspired by Free Kekistan and drawn the week of the fork'),
        undefined,
        { ctx: strangerCtx },
        callback
      );

      expect(storeMemoryMock).not.toHaveBeenCalled();
      expect(callback.mock.calls[0][0].text).toContain('Only');
    });

    it('refuses lore with no card attached', async () => {
      const callback = mock();
      await fakeRememberCommand.handler(
        mockRuntime,
        msg('/fr Pepe green code is 420'),
        undefined,
        { ctx: artistCtx },
        callback
      );

      expect(storeMemoryMock).not.toHaveBeenCalled();
      expect(callback.mock.calls[0][0].text).toContain('needs a card');
    });

    it('refuses an empty /fr', async () => {
      const callback = mock();
      await fakeRememberCommand.handler(mockRuntime, msg('/fr'), undefined, { ctx: artistCtx }, callback);

      expect(storeMemoryMock).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
    });

    it('refuses the false-attribution shape that was actually spammed', async () => {
      const callback = mock();
      await fakeRememberCommand.handler(
        mockRuntime,
        msg('/fr djpepe made by coit'),
        undefined,
        { ctx: strangerCtx },
        callback
      );

      expect(storeMemoryMock).not.toHaveBeenCalled();
    });

    it('caps a card at two entries', async () => {
      const good = [
        '/fr FREEDOMKEK it was inspired by Free Kekistan and drawn the week of the fork',
        '/fr FREEDOMKEK the frog holds a receipt because Counterparty fees spiked that month',
        '/fr FREEDOMKEK a third story that should never be accepted by the quota gate',
      ];

      for (const text of good.slice(0, 2)) {
        await fakeRememberCommand.handler(mockRuntime, msg(text), undefined, { ctx: artistCtx }, mock());
      }
      expect(storeMemoryMock).toHaveBeenCalledTimes(2);

      const callback = mock();
      await fakeRememberCommand.handler(mockRuntime, msg(good[2]), undefined, { ctx: artistCtx }, callback);

      expect(storeMemoryMock).toHaveBeenCalledTimes(2);
      expect(callback.mock.calls[0][0].text).toContain('limit');
    });

    it('refuses a duplicate — seven copies of one line is a retrieval attack', async () => {
      const text = '/fr FREEDOMKEK it was inspired by Free Kekistan and drawn the week of the fork';
      await fakeRememberCommand.handler(mockRuntime, msg(text), undefined, { ctx: artistCtx }, mock());

      const callback = mock();
      await fakeRememberCommand.handler(mockRuntime, msg(text), undefined, { ctx: artistCtx }, callback);

      expect(storeMemoryMock).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].text).toContain('Already recorded');
    });

    it('still passes the content through in "remember this" form', async () => {
      await fakeRememberCommand.handler(
        mockRuntime,
        msg('/fr FREEDOMKEK it was inspired by Free Kekistan and drawn the week of the fork'),
        undefined,
        { ctx: artistCtx },
        mock()
      );

      const stored = storeMemoryMock.mock.calls[0][0];
      expect(stored.content.text).toContain('remember this:');
      expect(stored.content.text).toContain('FREEDOMKEK');
    });
  });
});
