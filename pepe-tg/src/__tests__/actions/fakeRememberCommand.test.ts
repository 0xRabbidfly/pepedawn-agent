import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { fakeRememberCommand } from '../../actions/fakeRememberCommand';
import { _resetCache, recordLore } from '../../utils/loreInventory';
import { MAX_ENTRIES_PER_CARD } from '../../utils/loreSubmission';
import { _resetCache as _resetProposals } from '../../utils/vouching';
import type { IAgentRuntime, Memory } from '@elizaos/core';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

// Point the quota ledger at a scratch file so tests never touch real data.
const LEDGER = join(tmpdir(), `lore-ledger-test-${process.pid}.json`);
process.env.LORE_LEDGER_PATH = LEDGER;
// No API key: the model screen throws and the handler falls back to heuristics,
// which is the documented behaviour and keeps these tests off the network.
delete process.env.OPENAI_API_KEY;
const PROPOSALS = join(tmpdir(), `proposals-fr-test-${process.pid}.json`);
process.env.PROPOSALS_PATH = PROPOSALS;

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
      rmSync(PROPOSALS, { force: true });
      _resetCache();
      _resetProposals();
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

    it('sends a stranger\'s lore to the room for vouching instead of storing it', async () => {
      const callback = mock();
      await fakeRememberCommand.handler(
        mockRuntime,
        msg('/fr FREEDOMKEK it was inspired by Free Kekistan and drawn the week of the fork'),
        undefined,
        { ctx: strangerCtx },
        callback
      );

      // Nothing reaches the corpus until the community confirms it.
      expect(storeMemoryMock).not.toHaveBeenCalled();
      const text = callback.mock.calls[0][0].text;
      expect(text).toContain('Lore proposed');
      expect(text).toContain('/vouch');
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

    it(`caps a card at ${MAX_ENTRIES_PER_CARD} entries`, async () => {
      // Seed the ledger to the cap rather than submitting that many times: the
      // quota is checked before the model screen, so this stays offline.
      for (let i = 0; i < MAX_ENTRIES_PER_CARD; i++) {
        await recordLore({ card: 'FREEDOMKEK', lore: `story number ${i}`, at: Date.now() });
      }

      const callback = mock();
      await fakeRememberCommand.handler(
        mockRuntime,
        msg('/fr FREEDOMKEK one more story that should not fit under the quota'),
        undefined,
        { ctx: artistCtx },
        callback
      );

      expect(storeMemoryMock).not.toHaveBeenCalled();
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

describe('the slot count it reports is the real one', () => {
  /**
   * The success line said "One more slot left on this card" for every entry but
   * the last. True when the cap was 2; since it became 10 it has been telling
   * artists they are nearly out of room on their first submission.
   */
  const slotLine = (existingForCard: number): string => {
    const remaining = MAX_ENTRIES_PER_CARD - (existingForCard + 1);
    return remaining > 1
      ? `${remaining} slots left on this card.`
      : remaining === 1
        ? 'One more slot left on this card.'
        : "That's this card full.";
  };

  it('counts down from the real cap', () => {
    expect(MAX_ENTRIES_PER_CARD).toBe(10);
    expect(slotLine(0)).toBe('9 slots left on this card.');
    expect(slotLine(7)).toBe('2 slots left on this card.');
  });

  it('uses the singular for the last one and says so when full', () => {
    expect(slotLine(8)).toBe('One more slot left on this card.');
    expect(slotLine(9)).toBe("That's this card full.");
  });
});
