import { describe, expect, it } from 'bun:test';
import {
  CallbackLimiter,
  DEFAULT_DECAY,
  InMemorySocialStore,
  decayFactor,
  formatForPrompt,
  involvesAnyone,
  rankMemories,
  recallForPerson,
  type MemoryRecord,
} from '../../conversation/socialMemory';
import {
  buildCapturePrompt,
  formatSession,
  parseCaptureResponse,
  sessionClosed,
  splitSessions,
  worthCapturing,
} from '../../conversation/memoryCapture';
import type { ConversationTurn } from '../../conversation/types';

const DAY = 86_400_000;
const NOW = 1_760_000_000_000;

const rec = (over: Partial<MemoryRecord> = {}): MemoryRecord => ({
  id: over.id ?? 'r1',
  kind: over.kind ?? 'quote',
  summary: over.summary ?? 'bob would sell a kidney for a FREEDOMKEK',
  text: over.text,
  participants: over.participants ?? [{ id: 'u-bob', name: 'bob', role: 'author' }],
  roomId: over.roomId ?? 'room-1',
  at: over.at ?? NOW,
  pinned: over.pinned,
  cards: over.cards,
  tags: over.tags,
});

describe('decay', () => {
  it('halves a quote every 90 days', () => {
    const r = rec({ at: NOW - 90 * DAY });
    expect(decayFactor(r, NOW)).toBeCloseTo(0.5, 2);
  });

  it('halves a highlight every 30 days', () => {
    const r = rec({ kind: 'highlight', at: NOW - 30 * DAY });
    expect(decayFactor(r, NOW)).toBeCloseTo(0.5, 2);
  });

  it('never fades a pinned record', () => {
    const r = rec({ pinned: true, at: NOW - 3650 * DAY });
    expect(decayFactor(r, NOW)).toBe(1);
  });

  it('never fades an episode', () => {
    const r = rec({ kind: 'episode', at: NOW - 3650 * DAY });
    expect(decayFactor(r, NOW)).toBe(1);
  });

  it('treats a future timestamp as fresh rather than negative-aging', () => {
    const r = rec({ at: NOW + 10 * DAY });
    expect(decayFactor(r, NOW)).toBe(1);
  });
});

describe('participant linking', () => {
  it('detects someone present', () => {
    expect(involvesAnyone(rec(), new Set(['u-bob']))).toBe(true);
    expect(involvesAnyone(rec(), new Set(['u-carol']))).toBe(false);
  });

  it('boosts a record whose person is in the room', () => {
    const mine = rec({ id: 'mine', participants: [{ id: 'u-bob', name: 'bob' }] });
    const theirs = rec({ id: 'theirs', participants: [{ id: 'u-zoe', name: 'zoe' }] });
    // theirs matches the query slightly better, but bob is here.
    const ranked = rankMemories(
      [mine, theirs],
      (r) => (r.id === 'theirs' ? 0.62 : 0.5),
      new Set(['u-bob']),
      NOW
    );
    expect(ranked[0].record.id).toBe('mine');
    expect(ranked[0].boosted).toBe(true);
  });

  it('drops records below the floor', () => {
    const ancient = rec({ id: 'old', at: NOW - 900 * DAY });
    const ranked = rankMemories([ancient], () => 0.5, new Set(), NOW);
    expect(ranked).toHaveLength(0);
  });

  it('recalls everything about one person, freshest first', () => {
    const records = [
      rec({ id: 'a', at: NOW - 200 * DAY }),
      rec({ id: 'b', at: NOW - 1 * DAY }),
      rec({ id: 'c', participants: [{ id: 'u-zoe', name: 'zoe' }] }),
    ];
    const out = recallForPerson(records, 'u-bob', NOW);
    expect(out.map((s) => s.record.id)).toEqual(['b', 'a']);
  });
});

describe('store', () => {
  it('scopes records to a room', async () => {
    const store = new InMemorySocialStore();
    await store.add(rec({ id: '1', roomId: 'a' }));
    await store.add(rec({ id: '2', roomId: 'b' }));
    expect(await store.all('a')).toHaveLength(1);
  });

  it('removes a single record', async () => {
    const store = new InMemorySocialStore();
    await store.add(rec({ id: '1' }));
    expect(await store.remove('1')).toBe(true);
    expect(await store.remove('1')).toBe(false);
  });

  it('forgets a person on request, keeping records they only reacted to', async () => {
    const store = new InMemorySocialStore();
    await store.add(rec({ id: 'authored', participants: [{ id: 'u-bob', name: 'bob', role: 'author' }] }));
    await store.add(
      rec({
        id: 'reacted',
        participants: [
          { id: 'u-zoe', name: 'zoe', role: 'author' },
          { id: 'u-bob', name: 'bob', role: 'reactor' },
        ],
      })
    );
    const removed = await store.forgetPerson('u-bob');
    expect(removed).toBe(1);
    const left = await store.all('room-1');
    expect(left).toHaveLength(1);
    // The surviving record no longer references bob at all.
    expect(left[0].participants.some((p) => p.id === 'u-bob')).toBe(false);
  });
});

describe('callback limiter', () => {
  it('rate-limits how often old memories are referenced', () => {
    const limiter = new CallbackLimiter(30 * 60 * 1000);
    expect(limiter.allowed('r', NOW)).toBe(true);
    limiter.record('r', NOW);
    expect(limiter.allowed('r', NOW + 60_000)).toBe(false);
    expect(limiter.allowed('r', NOW + 31 * 60_000)).toBe(true);
    // Rooms are independent.
    expect(limiter.allowed('other', NOW + 60_000)).toBe(true);
  });
});

describe('prompt rendering', () => {
  it('names the people and the card', () => {
    const line = formatForPrompt({
      record: rec({ cards: ['FREEDOMKEK'] }),
      score: 1,
      decay: 1,
      boosted: true,
    });
    expect(line).toContain('bob');
    expect(line).toContain('FREEDOMKEK');
    expect(line).toContain('quote');
  });
});

describe('session capture', () => {
  const turn = (text: string, author: string, minutes: number): ConversationTurn => ({
    role: 'user',
    text,
    author,
    at: NOW + minutes * 60_000,
  });

  it('closes a session after the gap', () => {
    const turns = [turn('hi', 'a', 0)];
    expect(sessionClosed(turns, NOW + 5 * 60_000)).toBe(false);
    expect(sessionClosed(turns, NOW + 25 * 60_000)).toBe(true);
    expect(sessionClosed([], NOW + 60 * 60_000)).toBe(false);
  });

  it('splits on the gap boundary', () => {
    const turns = [
      turn('a', 'alice', 0),
      turn('b', 'bob', 1),
      turn('c', 'alice', 40), // new session
      turn('d', 'bob', 41),
    ];
    const sessions = splitSessions(turns);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toHaveLength(2);
  });

  it('skips sessions too small or single-voiced to be memorable', () => {
    expect(worthCapturing([turn('a', 'alice', 0), turn('b', 'alice', 1)])).toBe(false);
    const twoPeople = [
      turn('a', 'alice', 0),
      turn('b', 'bob', 1),
      turn('c', 'alice', 2),
      turn('d', 'bob', 3),
    ];
    expect(worthCapturing(twoPeople)).toBe(true);
  });

  it('formats a transcript with speakers', () => {
    const text = formatSession([turn('gm', 'alice', 0), { role: 'bot', text: 'gm', at: NOW }]);
    expect(text).toContain('alice: gm');
    expect(text).toContain('PEPEDAWN: gm');
  });

  it('biases the prompt toward returning nothing', () => {
    const prompt = buildCapturePrompt('alice: gm');
    expect(prompt).toContain('{"records":[]}');
    expect(prompt.toLowerCase()).toContain('not worth remembering');
  });
});

describe('capture parsing', () => {
  const ctx = {
    roomId: 'room-1',
    at: NOW,
    authorIds: new Map([['bob', 'u-bob']]),
  };

  it('parses records and links known people to ids', () => {
    const raw = JSON.stringify({
      records: [
        {
          kind: 'quote',
          summary: "bob would sell a kidney for a FREEDOMKEK",
          text: "I'd sell a kidney for a FREEDOMKEK",
          people: ['bob'],
          cards: ['freedomkek'],
        },
      ],
    });
    const out = parseCaptureResponse(raw, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].participants[0].id).toBe('u-bob');
    expect(out[0].cards).toEqual(['FREEDOMKEK']);
    expect(out[0].pinned).toBe(false); // explicit, not absent
  });

  it('pins episodes', () => {
    const raw = JSON.stringify({
      records: [{ kind: 'episode', summary: 'the FAKEASF burn argument', people: [] }],
    });
    expect(parseCaptureResponse(raw, ctx)[0].pinned).toBe(true);
  });

  it('keeps unknown people attributed by name rather than dropping them', () => {
    const raw = JSON.stringify({
      records: [{ kind: 'reaction', summary: 'zoe defends the ugly cards', people: ['zoe'] }],
    });
    expect(parseCaptureResponse(raw, ctx)[0].participants[0].id).toBe('name:zoe');
  });

  it('handles an empty list, prose wrapping, and malformed output', () => {
    expect(parseCaptureResponse('{"records":[]}', ctx)).toHaveLength(0);
    expect(parseCaptureResponse('Sure! {"records":[]} hope that helps', ctx)).toHaveLength(0);
    expect(parseCaptureResponse('not json at all', ctx)).toHaveLength(0);
    expect(parseCaptureResponse('', ctx)).toHaveLength(0);
  });

  it('drops records with no summary', () => {
    const raw = JSON.stringify({ records: [{ kind: 'quote', people: ['bob'] }] });
    expect(parseCaptureResponse(raw, ctx)).toHaveLength(0);
  });
});
