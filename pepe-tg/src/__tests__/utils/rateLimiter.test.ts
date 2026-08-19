/**
 * Rate limiter tests.
 *
 * The scenario throughout is the real one: a bot in a loop firing /fr, which is
 * how 21 submissions arrived in 18 minutes on 2026-08-19.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateRate,
  formatDuration,
  DEFAULT_RATE_LIMIT,
  type UserRecord,
} from '../../utils/rateLimiter';

const T = 1_700_000_000_000;
const fresh = (): UserRecord => ({ hits: [], level: 0 });

describe('burst threshold', () => {
  it('allows five commands in a minute', () => {
    const r = fresh();
    for (let i = 0; i < 5; i++) {
      expect(evaluateRate(r, T + i * 1000).allowed, `command ${i + 1}`).toBe(true);
    }
  });

  it('silences the sixth', () => {
    const r = fresh();
    for (let i = 0; i < 5; i++) evaluateRate(r, T + i * 1000);
    const v = evaluateRate(r, T + 5000);
    expect(v.allowed).toBe(false);
    expect(v.justSilenced).toBe(true);
    expect(v.penalty).toBe('10 minutes');
  });

  it('does not silence a user spread across windows', () => {
    const r = fresh();
    for (let i = 0; i < 20; i++) {
      // One command every 30s — steady use, never a burst.
      expect(evaluateRate(r, T + i * 30_000).allowed).toBe(true);
    }
  });
});

describe('escalation ladder', () => {
  /** Drive the user past the threshold once, at time `at`. */
  const trip = (r: UserRecord, at: number) => {
    let last;
    for (let i = 0; i <= DEFAULT_RATE_LIMIT.maxPerWindow; i++) last = evaluateRate(r, at + i);
    return last!;
  };

  it('climbs 10 minutes → 1 hour → 1 day → 1 week', () => {
    const r = fresh();
    const penalties: string[] = [];
    let at = T;
    for (let i = 0; i < 4; i++) {
      penalties.push(trip(r, at).penalty!);
      // Wait out the silence, but stay well inside the decay window.
      at = r.silencedUntil! + 1000;
    }
    expect(penalties).toEqual(['10 minutes', '1 hour', '1 day', '7 days']);
  });

  it('stays at the top rung rather than growing without bound', () => {
    const r = fresh();
    let at = T;
    for (let i = 0; i < 6; i++) {
      trip(r, at);
      at = r.silencedUntil! + 1000;
    }
    expect(trip(r, at).penalty).toBe('7 days');
  });

  it('does not extend an active silence when the bot keeps retrying', () => {
    const r = fresh();
    trip(r, T);
    const until = r.silencedUntil!;
    // A loop hammering during the ban must not push the end time out.
    for (let i = 0; i < 50; i++) {
      const v = evaluateRate(r, T + 1000 + i * 100);
      expect(v.allowed).toBe(false);
      expect(v.justSilenced).toBe(false);
    }
    expect(r.silencedUntil).toBe(until);
  });

  it('warns exactly once, on the transition into silence', () => {
    const r = fresh();
    const warned = [trip(r, T).justSilenced];
    for (let i = 0; i < 10; i++) warned.push(evaluateRate(r, T + 2000 + i * 100).justSilenced);
    expect(warned.filter(Boolean)).toHaveLength(1);
  });
});

describe('ladder decay', () => {
  const trip = (r: UserRecord, at: number) => {
    let last;
    for (let i = 0; i <= DEFAULT_RATE_LIMIT.maxPerWindow; i++) last = evaluateRate(r, at + i);
    return last!;
  };

  it('resets a user who behaves for the decay period', () => {
    const r = fresh();
    trip(r, T);
    expect(r.level).toBe(1);

    // Decay is counted from when the silence lifted, not from the offence.
    const later = r.silencedUntil! + DEFAULT_RATE_LIMIT.decayMs + 60_000;
    expect(trip(r, later).penalty).toBe('10 minutes');
  });

  it('does not reset someone who reoffends inside the window', () => {
    const r = fresh();
    trip(r, T);
    const soon = r.silencedUntil! + 1000;
    expect(trip(r, soon).penalty).toBe('1 hour');
  });
});

describe('formatDuration', () => {
  it('reads naturally', () => {
    expect(formatDuration(10 * 60 * 1000)).toBe('10 minutes');
    expect(formatDuration(60 * 60 * 1000)).toBe('1 hour');
    expect(formatDuration(24 * 60 * 60 * 1000)).toBe('1 day');
    expect(formatDuration(7 * 24 * 60 * 60 * 1000)).toBe('7 days');
  });
});
