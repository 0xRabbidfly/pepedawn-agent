/**
 * The same card is not shown five times because it was said five times.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { CARD_SHOW_COOLDOWN_MS, _resetCardShows, noteShown, recentlyShown } from '../../utils/cardShowCooldown';

const NOW = 1_800_000_000_000;

beforeEach(() => _resetCardShows());

describe('card show cooldown', () => {
  it('remembers a show per room and per card, case-insensitively, for the window', () => {
    expect(recentlyShown('room', 'FREEDOMKEK', NOW)).toBe(false);
    noteShown('room', 'freedomkek', NOW);
    expect(recentlyShown('room', 'FREEDOMKEK', NOW + 60_000)).toBe(true);
    expect(recentlyShown('room', 'FAKEASF', NOW + 60_000)).toBe(false);
    expect(recentlyShown('other-room', 'FREEDOMKEK', NOW + 60_000)).toBe(false);
    expect(recentlyShown('room', 'FREEDOMKEK', NOW + CARD_SHOW_COOLDOWN_MS)).toBe(false);
  });

  it('keeps the map bounded', () => {
    for (let i = 0; i < 600; i++) noteShown('room', `CARD${i}`, NOW - CARD_SHOW_COOLDOWN_MS - 1);
    noteShown('room', 'FRESH', NOW);
    expect(recentlyShown('room', 'FRESH', NOW)).toBe(true);
    expect(recentlyShown('room', 'CARD1', NOW)).toBe(false);
  });
});
