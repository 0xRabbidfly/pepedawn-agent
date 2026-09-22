/**
 * The repetition guard: one check on the way out, for every reply path.
 */
import { describe, expect, it } from 'bun:test';
import { REPEAT_WINDOW_MS, findRepeat, similarity } from '../../utils/repeatGuard';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

const first =
  'The Scrilla birthday counter is at 5 years, with the next anniversary on September 21, 2026. ' +
  'Five years since FREEDOMKEK kicked off Fake Rares—still a remarkably long afterlife for getting banned over one card.';
const second =
  'The Scrilla birthday counter is still 5 years; the next anniversary lands on September 21, 2026. ' +
  'Five years since FREEDOMKEK kicked off the Fake Rare movement—an impressively durable legacy for getting banned over one card.';

describe('similarity', () => {
  it('is 1 for the same words, 0 for nothing shared, and high for a reworded repeat', () => {
    expect(similarity('FREEDOMKEK supply is 298', 'freedomkek supply is 298.')).toBe(1);
    expect(similarity('gm frens', 'supply is 298')).toBe(0);
    expect(similarity(first, second)).toBeGreaterThan(0.5);
    expect(similarity('Who made it? Rare Scrilla, 2017.', 'PEPEDAWN is Series 18, card 22, by rabbidfly.')).toBeLessThan(0.2);
  });
});

describe('findRepeat', () => {
  const said = [{ text: first, at: NOW - 10 * MIN }];

  it('catches the counter answer given twice in ten minutes', () => {
    // The two real replies from 06:32 and 06:42, reworded by the model.
    expect(findRepeat(second, said, NOW, { threshold: 0.5 })).toBe(said[0]);
    // Identical fast-path facts are the clearest case.
    expect(findRepeat(first, said, NOW)).toBe(said[0]);
  });

  it('lets a genuinely different reply through', () => {
    expect(findRepeat('Two so far today, running at 0.7 an hour.', said, NOW)).toBeNull();
  });

  it('forgets after the window, and never blocks a short reply', () => {
    expect(findRepeat(first, said, NOW - 10 * MIN + REPEAT_WINDOW_MS + 1)).toBeNull();
    expect(findRepeat('gm ser', [{ text: 'gm ser', at: NOW - MIN }], NOW)).toBeNull();
  });

  it('only looks at recent turns, newest first', () => {
    const turns = [
      { text: first, at: NOW - 2 * REPEAT_WINDOW_MS },
      { text: 'something else entirely, about a card', at: NOW - MIN },
    ];
    expect(findRepeat(first, turns, NOW)).toBeNull();
  });
});
