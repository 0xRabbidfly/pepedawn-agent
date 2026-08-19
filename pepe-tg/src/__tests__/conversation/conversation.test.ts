import { describe, expect, it } from 'bun:test';
import { readRoomTemperature } from '../../conversation/roomTemperature';
import { applyCaps, evaluateCadence } from '../../conversation/cadenceGovernor';
import { route } from '../../conversation/router';
import {
  MemoryRoomHistoryStore,
  RoomHistory,
} from '../../conversation/roomHistory';
import { minRegister, stepDown, retrievalAllowed } from '../../conversation/types';
import type { ConversationTurn } from '../../conversation/types';

const T0 = 1_700_000_000_000;
const user = (text: string, atOffsetSec: number, author = 'alice', addressedBot = false): ConversationTurn =>
  ({ role: 'user', text, author, at: T0 + atOffsetSec * 1000, addressedBot });
const bot = (text: string, atOffsetSec: number): ConversationTurn =>
  ({ role: 'bot', text, at: T0 + atOffsetSec * 1000 });

describe('register ordering', () => {
  it('takes the quieter register', () => {
    expect(minRegister('DEEP', 'BANTER')).toBe('BANTER');
    expect(minRegister('SILENT', 'DEEP')).toBe('SILENT');
  });

  it('steps down and floors at SILENT', () => {
    expect(stepDown('DEEP')).toBe('ANSWER');
    expect(stepDown('DEEP', 3)).toBe('REACT');
    expect(stepDown('REACT', 9)).toBe('SILENT');
  });

  it('only retrieves at ANSWER and above', () => {
    expect(retrievalAllowed('DEEP')).toBe(true);
    expect(retrievalAllowed('ANSWER')).toBe(true);
    expect(retrievalAllowed('BANTER')).toBe(false);
    expect(retrievalAllowed('REACT')).toBe(false);
    expect(retrievalAllowed('SILENT')).toBe(false);
  });
});

describe('room temperature', () => {
  it('reads fast terse multi-party chatter as hot and caps at BANTER', () => {
    const turns = [
      user('gm', 0, 'alice'),
      user('gm fam', 3, 'bob'),
      user('lfg', 6, 'carol'),
      user('kek', 9, 'alice'),
      user('based', 12, 'bob'),
      user('wagmi', 15, 'carol'),
    ];
    const temp = readRoomTemperature(turns, T0 + 16_000, { text: 'nice' });
    expect(temp.label).toBe('hot');
    expect(temp.cap).toBe('BANTER');
    expect(temp.signals.distinctParticipants).toBe(3);
  });

  it('allows DEEP when the room is quiet', () => {
    const turns = [user('anyone around', 0, 'alice')];
    const temp = readRoomTemperature(turns, T0 + 20 * 60_000, { text: 'so about that' });
    expect(temp.label).toBe('cool');
    expect(temp.cap).toBe('DEEP');
  });

  it('allows DEEP for a direct question even in a busy room', () => {
    const turns = [
      user('gm', 0, 'alice'),
      user('gm', 2, 'bob'),
      user('lfg', 4, 'carol'),
      user('kek', 6, 'alice'),
      user('based', 8, 'bob'),
    ];
    const temp = readRoomTemperature(turns, T0 + 9_000, {
      text: 'what is the story behind FREEDOMKEK?',
    });
    expect(temp.cap).toBe('DEEP');
  });

  it('allows DEEP when the bot is addressed, however busy the room', () => {
    const turns = [
      user('gm', 0, 'alice'),
      user('gm', 1, 'bob'),
      user('lfg', 2, 'carol'),
      user('kek', 3, 'alice'),
    ];
    const temp = readRoomTemperature(turns, T0 + 4_000, {
      text: 'pepedawn thoughts',
      addressedBot: true,
    });
    expect(temp.cap).toBe('DEEP');
  });
});

describe('cadence governor', () => {
  it('bans two bot turns in a row', () => {
    const turns = [user('hi', 0), bot('hey', 10)];
    const v = evaluateCadence(turns, T0 + 200_000, { addressed: false });
    expect(v.cap).toBe('SILENT');
    expect(v.reason).toBe('consecutive_bot_turns');
  });

  it('enforces a minimum gap between unprompted contributions', () => {
    const turns = [user('a', 0), bot('x', 10), user('b', 20)];
    const v = evaluateCadence(turns, T0 + 30_000, { addressed: false });
    expect(v.cap).toBe('SILENT');
    expect(v.reason).toBe('min_gap');
  });

  it('caps share of voice', () => {
    // 4 bot turns already in a 10-turn window; a 5th would exceed 20%.
    const turns: ConversationTurn[] = [];
    for (let i = 0; i < 5; i++) {
      turns.push(user(`msg ${i}`, i * 40, 'alice'));
      turns.push(bot(`reply ${i}`, i * 40 + 20));
    }
    turns.push(user('another', 300, 'bob'));
    const v = evaluateCadence(turns, T0 + 400_000, { addressed: false });
    expect(v.cap).toBe('SILENT');
    expect(v.reason).toBe('share_of_voice');
  });

  it('exempts direct address from every rule', () => {
    const turns = [user('hi', 0), bot('hey', 10)];
    const v = evaluateCadence(turns, T0 + 11_000, { addressed: true });
    expect(v.cap).toBe('DEEP');
    expect(v.exempt).toBe(true);
  });

  it('backs off as unaddressed contributions accumulate', () => {
    const turns = [
      user('a', 0, 'alice'),
      bot('one', 100),
      user('b', 200, 'alice'),
      bot('two', 300),
      user('c', 400, 'alice'),
    ];
    const v = evaluateCadence(turns, T0 + 500_000, { addressed: false });
    expect(v.reason).toMatch(/^backoff_unaddressed/);
    expect(v.cap).not.toBe('DEEP');
  });

  it('is clear when the bot has been quiet', () => {
    const turns = [user('a', 0, 'alice'), user('b', 60, 'bob'), user('c', 120, 'carol')];
    const v = evaluateCadence(turns, T0 + 180_000, { addressed: false });
    expect(v.cap).toBe('DEEP');
    expect(v.reason).toBe('clear');
  });
});

describe('applyCaps', () => {
  it('never raises the register', () => {
    expect(applyCaps('BANTER', 'DEEP', 'DEEP')).toBe('BANTER');
    expect(applyCaps('DEEP', 'BANTER', 'DEEP')).toBe('BANTER');
    expect(applyCaps('DEEP', 'DEEP', 'SILENT')).toBe('SILENT');
  });
});

describe('route', () => {
  const quietRoom = [user('anyone here', 0, 'alice')];

  it('requirement 4: no wall of lore while the room is chit-chatting', () => {
    const hot = [
      user('gm', 0, 'alice'),
      user('gm', 3, 'bob'),
      user('lfg', 6, 'carol'),
      user('kek', 9, 'alice'),
      user('based', 12, 'bob'),
    ];
    const decision = route(
      { text: 'FREEDOMKEK', turns: hot, now: T0 + 13_000 },
      { knowledge: 'CARD_WIKI', register: 'DEEP', reason: 'classifier_lore', card: 'FREEDOMKEK' }
    );
    expect(decision.register).toBe('BANTER');
    // And because BANTER never retrieves, no lore is fetched at all.
    expect(decision.knowledge).toBe('NONE');
    expect(decision.reason).toContain('capped_by:');
  });

  it('allows a full answer when directly asked in a quiet room', () => {
    const decision = route(
      {
        text: 'what is the story behind FREEDOMKEK?',
        turns: quietRoom,
        now: T0 + 10 * 60_000,
        addressedBot: true,
      },
      { knowledge: 'CARD_WIKI', register: 'DEEP', reason: 'classifier_facts', card: 'FREEDOMKEK' }
    );
    expect(decision.register).toBe('DEEP');
    expect(decision.knowledge).toBe('CARD_WIKI');
    expect(decision.card).toBe('FREEDOMKEK');
  });

  it('silences a second consecutive bot turn even when the classifier wants to speak', () => {
    const turns = [user('hi', 0, 'alice'), bot('hey', 30)];
    const decision = route(
      { text: 'cool', turns, now: T0 + 40_000 },
      { knowledge: 'NONE', register: 'ANSWER', reason: 'classifier_chat' }
    );
    expect(decision.register).toBe('SILENT');
    expect(decision.trace?.cadence.reason).toBe('consecutive_bot_turns');
  });

  it('never retrieves below ANSWER', () => {
    const turns = [user('hi', 0, 'alice'), bot('hey', 30), user('ok', 60, 'bob')];
    const decision = route(
      { text: 'ok', turns, now: T0 + 70_000 },
      { knowledge: 'CARD', register: 'BANTER', reason: 'classifier_chat', card: 'FAKEASF' }
    );
    expect(decision.knowledge).toBe('NONE');
    expect(decision.card).toBeUndefined();
  });

  it('records which ceiling bound the decision', () => {
    const turns = [user('hi', 0, 'alice'), bot('hey', 30)];
    const decision = route(
      { text: 'more', turns, now: T0 + 40_000 },
      { knowledge: 'NONE', register: 'DEEP', reason: 'classifier_chat' }
    );
    expect(decision.reason).toContain('capped_by:cadence');
    expect(decision.trace?.proposedRegister).toBe('DEEP');
  });
});

describe('RoomHistory persistence', () => {
  it('survives a process restart', async () => {
    const store = new MemoryRoomHistoryStore();
    const first = new RoomHistory(store, {
      limit: 50,
      maxAgeMs: 86_400_000,
      flushDebounceMs: 0,
    });
    await first.append('room-1', user('remember me', 0));
    await first.flushAll();

    // New instance, same store — this is the nightly PM2 restart.
    const second = new RoomHistory(store, {
      limit: 50,
      maxAgeMs: 86_400_000,
      flushDebounceMs: 0,
    });
    const turns = await second.get('room-1');
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe('remember me');
  });

  it('prunes to the limit', async () => {
    const store = new MemoryRoomHistoryStore();
    const history = new RoomHistory(store, {
      limit: 3,
      maxAgeMs: 86_400_000,
      flushDebounceMs: 0,
    });
    for (let i = 0; i < 6; i++) await history.append('r', user(`m${i}`, i));
    const turns = await history.get('r');
    expect(turns.map((t) => t.text)).toEqual(['m3', 'm4', 'm5']);
  });

  it('drops turns older than maxAge', async () => {
    const store = new MemoryRoomHistoryStore();
    const history = new RoomHistory(store, {
      limit: 100,
      maxAgeMs: 60_000,
      flushDebounceMs: 0,
    });
    await history.append('r', user('ancient', 0));
    await history.append('r', user('recent', 3600));
    const turns = await history.get('r');
    expect(turns.map((t) => t.text)).toEqual(['recent']);
  });

  it('keeps rooms isolated', async () => {
    const store = new MemoryRoomHistoryStore();
    const history = new RoomHistory(store, {
      limit: 10,
      maxAgeMs: 86_400_000,
      flushDebounceMs: 0,
    });
    await history.append('a', user('in a', 0));
    await history.append('b', user('in b', 0));
    expect(await history.get('a')).toHaveLength(1);
    expect((await history.get('b'))[0].text).toBe('in b');
  });
});

describe('enforcement gating', () => {
  it('suppresses only when V5_ENFORCE is on and cadence says SILENT', async () => {
    const { observeUserMessage, resetShadowState } = await import('../../conversation/shadow');
    try {
    const dir = `${process.env.TMPDIR || '/tmp'}/pepedawn-enforce-${Date.now()}`;
    process.env.V5_SHADOW_DIR = dir;

    // Shadow only: never suppresses, however hot the room.
    process.env.V5_SHADOW = 'true';
    delete process.env.V5_ENFORCE;
    resetShadowState();
    await observeUserMessage({ roomId: 'r1', text: 'gm', addressedBot: false });
    const shadowVerdict = await observeUserMessage({ roomId: 'r1', text: 'gm again', addressedBot: false });
    expect(shadowVerdict.suppress).toBe(false);

    // Enforcing: a direct address is still never suppressed.
    process.env.V5_ENFORCE = 'true';
    resetShadowState();
    const addressed = await observeUserMessage({ roomId: 'r2', text: 'pepedawn?', addressedBot: true });
    expect(addressed.suppress).toBe(false);
    expect(addressed.reason).toBe('addressed_exempt');

    // Cleared in a finally so a failing assertion above cannot leak enforcement
    // into every later test file - which is exactly how a single broken
    // expectation turned into a dozen unrelated failures.
    } finally {
      delete process.env.V5_ENFORCE;
      delete process.env.V5_SHADOW;
      delete process.env.V5_SHADOW_DIR;
      resetShadowState();
    }
  });
});

describe('active exchange lifts the cadence caps', () => {
  const T = 1_700_000_000_000;
  const usr = (text: string, sec: number, addressed = false): ConversationTurn => ({
    role: 'user',
    text,
    author: 'bob',
    at: T + sec * 1000,
    addressedBot: addressed,
  });
  const bot2 = (text: string, sec: number): ConversationTurn => ({
    role: 'bot',
    text,
    at: T + sec * 1000,
  });

  it('stands down when someone is engaging with what the bot said', async () => {
    const { inActiveExchange, evaluateCadence } = await import('../../conversation/cadenceGovernor');
    const turns = [usr('what is FREEDOMKEK', 0), bot2('series 0', 5), usr('and who made it?', 20, true)];
    expect(inActiveExchange(turns, T + 30_000)).toBe(true);
    // Every rule below would otherwise throttle a live conversation.
    const v = evaluateCadence(turns, T + 30_000, { addressed: false });
    expect(v.cap).toBe('DEEP');
    expect(v.reason).toBe('active_exchange');
  });

  it('is not fooled by a busy room where nobody is talking to the bot', async () => {
    const { inActiveExchange } = await import('../../conversation/cadenceGovernor');
    const turns = [usr('gm', 0), bot2('gm', 5), usr('lfg', 10), usr('kek', 15)];
    expect(inActiveExchange(turns, T + 30_000)).toBe(false);
  });

  it('does not count the bot merely having spoken', async () => {
    const { inActiveExchange } = await import('../../conversation/cadenceGovernor');
    expect(inActiveExchange([bot2('showcase', 0), usr('unrelated', 10)], T + 30_000)).toBe(false);
  });

  it('expires once the exchange goes quiet', async () => {
    const { inActiveExchange } = await import('../../conversation/cadenceGovernor');
    const turns = [bot2('reply', 0), usr('following up', 10, true)];
    expect(inActiveExchange(turns, T + 30_000)).toBe(true);
    expect(inActiveExchange(turns, T + 700_000)).toBe(false);
  });
});
