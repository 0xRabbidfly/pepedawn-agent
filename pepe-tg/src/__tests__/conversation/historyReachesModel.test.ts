import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { observeUserMessage, observeBotMessage, recentTurns, flushShadow, resetShadowState } from '../../conversation/shadow';

/**
 * Conversation history must reach the model, and must survive a restart.
 *
 * The router kept its own in-memory Map, so PM2's nightly 02:00 restart and
 * `pm2 delete` on every deploy left the model with no recollection each morning.
 * The persisted store existed for the cadence governor but never reached a
 * prompt. These assert the single source of truth.
 */
describe('history reaches the model and survives restarts', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pepedawn-hist-'));
    process.env.V5_SHADOW_DIR = dir;
    delete process.env.V5_SHADOW;
    delete process.env.V5_ENFORCE;
    resetShadowState();
  });

  afterEach(async () => {
    await flushShadow();
    delete process.env.V5_SHADOW_DIR;
    resetShadowState();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  it('records turns even with shadow mode off', async () => {
    // History is what the model reads, not shadow bookkeeping.
    await observeUserMessage({ roomId: 'r', text: 'what is FREEDOMKEK supply?', author: 'bob', addressedBot: false });
    await observeBotMessage({ roomId: 'r', text: '298.' });
    await observeUserMessage({ roomId: 'r', text: 'and who made it?', author: 'bob', addressedBot: false });

    const turns = recentTurns('r', 10);
    expect(turns.length).toBeGreaterThanOrEqual(3);
    expect(turns.map((t) => t.text)).toContain('what is FREEDOMKEK supply?');
    expect(turns.some((t) => t.role === 'bot' && t.text === '298.')).toBe(true);
  });

  it('keeps rooms separate', async () => {
    await observeUserMessage({ roomId: 'a', text: 'in room a', author: 'x', addressedBot: false });
    await observeUserMessage({ roomId: 'b', text: 'in room b', author: 'y', addressedBot: false });
    expect(recentTurns('a', 5).map((t) => t.text)).toEqual(['in room a']);
    expect(recentTurns('b', 5).map((t) => t.text)).toEqual(['in room b']);
  });

  it('returns the most recent turns, newest last', async () => {
    for (let i = 0; i < 8; i++) {
      await observeUserMessage({ roomId: 'r', text: `m${i}`, author: 'bob', addressedBot: false });
    }
    const turns = recentTurns('r', 3);
    expect(turns.map((t) => t.text)).toEqual(['m5', 'm6', 'm7']);
  });

  it('survives a process restart', async () => {
    await observeUserMessage({ roomId: 'r', text: 'remember this exchange', author: 'bob', addressedBot: false });
    await flushShadow();

    // resetShadowState drops every cache, as a restart would.
    resetShadowState();
    const { recentTurns: freshRecent } = await import('../../conversation/shadow');
    // Cold read goes through the file store rather than the cache.
    const { RoomHistory } = await import('../../conversation/roomHistory');
    const { FileSocialStore } = await import('../../conversation/socialMemoryRuntime');
    void RoomHistory;
    void FileSocialStore;
    void freshRecent;
    const { FileRoomHistoryStore } = await import('../../conversation/fileRoomHistoryStore');
    const store = new FileRoomHistoryStore(join(dir, 'room-history.json'));
    const persisted = await store.load('r');
    expect(persisted.map((t) => t.text)).toContain('remember this exchange');
  });

  it('is empty, not throwing, for an unknown room', () => {
    expect(recentTurns('never-seen', 5)).toEqual([]);
  });
});
