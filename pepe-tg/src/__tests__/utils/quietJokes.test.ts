import { describe, it, expect } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  FORMATS, TOPICS, buildJokePrompt, chooseQuietFill, cleanJoke, composeQuietJoke, drawJoke, jokeProblem,
  jokeShare, jokeTemperature, jokesBetween, parseJudge, quietJokesOn, readJokes, recordJoke, type JokeRecord,
} from '../../utils/quietJokes';
import { lastVolunteeredAt, quietSlotOpen } from '../../utils/xHarvest';
import { FULL_CARD_INDEX } from '../../data/fullCardIndex';

/** A repeatable stand-in for Math.random. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const joke = (text: string, extra: Partial<JokeRecord> = {}): JokeRecord => ({ at: 1, text, ...extra });

// 11 October, the owner: "just picked my nose and pulled out pepecash -
// 🤑🐸 going on a spreeee!" - then "Highly random / never repetitive".
describe('what fills a quiet room', () => {
  it('a joke when there is no X post, a share of the time when there is', () => {
    expect(chooseQuietFill({ hasPost: false, jokesOn: true, roll: 0.99, share: 0.33 })).toBe('joke');
    expect(chooseQuietFill({ hasPost: true, jokesOn: true, roll: 0.1, share: 0.33 })).toBe('joke');
    expect(chooseQuietFill({ hasPost: true, jokesOn: true, roll: 0.5, share: 0.33 })).toBe('post');
  });

  it('with jokes off it is exactly what it was', () => {
    expect(chooseQuietFill({ hasPost: true, jokesOn: false, roll: 0, share: 1 })).toBe('post');
    expect(chooseQuietFill({ hasPost: false, jokesOn: false, roll: 0, share: 1 })).toBeNull();
  });

  it('is on by default - no shadow, at the owner\'s call', () => {
    expect(quietJokesOn({})).toBe(true);
    expect(quietJokesOn({ QUIET_JOKES: 'off' })).toBe(false);
    expect(jokeShare({})).toBeCloseTo(0.33);
  });

  // "Make temperature 100": the API's ceiling is 2, and it 400s above it.
  it('runs as hot as the API allows, and never above it', () => {
    expect(jokeTemperature({})).toBe(2);
    expect(jokeTemperature({ QUIET_JOKE_TEMPERATURE: '100' })).toBe(2);
    expect(jokeTemperature({ QUIET_JOKE_TEMPERATURE: '1.4' })).toBe(1.4);
  });

  it('one slot for both, and a restart does not reopen it', () => {
    const now = 10 * 3600_000;
    expect(quietSlotOpen({ lastUserAt: undefined, now })).toBe(false);
    expect(quietSlotOpen({ lastUserAt: now - 30 * 60_000, now })).toBe(false);
    expect(quietSlotOpen({ lastUserAt: now - 2 * 3600_000, now })).toBe(true);
    expect(quietSlotOpen({ lastUserAt: now - 2 * 3600_000, lastVolunteerAt: now - 3600_000, now })).toBe(false);
    expect(lastVolunteeredAt([{ volunteeredAt: 5 } as any, {} as any, { volunteeredAt: 9 } as any])).toBe(9);
    expect(lastVolunteeredAt([])).toBeUndefined();
  });
});

describe('highly random', () => {
  // Ten calls with one fixed prompt gave ten "wen floor? my frog brain..." lines.
  it('draws a different combination every time, avoiding the recent ones', () => {
    const rng = seeded(11);
    const history: JokeRecord[] = [];
    for (let i = 0; i < 12; i++) {
      const d = drawJoke(history, rng);
      expect(history.slice(-12).map((h) => h.format)).not.toContain(d.format);
      expect(history.slice(-30).map((h) => h.topic)).not.toContain(d.topic);
      history.push(joke(`joke ${i}`, d));
    }
    expect(new Set(history.map((h) => h.format)).size).toBe(12);
    expect(new Set(history.map((h) => h.topic)).size).toBe(12);
  });

  it('the pools are big enough to stay fresh', () => {
    expect(FORMATS.length).toBeGreaterThanOrEqual(30);
    expect(TOPICS.length).toBeGreaterThanOrEqual(80);
  });

  it('often no emoji, never the same ones as the last joke', () => {
    const rng = seeded(3);
    const draws = Array.from({ length: 200 }, () => drawJoke([], rng));
    const none = draws.filter((d) => d.emoji.length === 0).length;
    expect(none).toBeGreaterThan(50);
    expect(none).toBeLessThan(120);
    const last = joke('x', { emoji: ['🐸'] });
    for (let i = 0; i < 50; i++) expect(drawJoke([last], rng).emoji).not.toContain('🐸');
  });

  it('the prompt carries the draw, the slang rule and what was already said', () => {
    const p = buildJokePrompt(
      { format: 'a petition', topic: 'my lily pad', wildcard: 'a toaster', emoji: [], slang: undefined },
      [joke('frog diet update: 90% pepecash, zero vegetables')],
    );
    expect(p).toContain('This one: a petition, about my lily pad, and somehow a toaster.');
    expect(p).toContain('Emoji: none at all.');
    expect(p).toContain('Slang: none this time');
    expect(p).toContain('- frog diet update: 90% pepecash, zero vegetables');
  });
});

describe('cleaning what the model wrote', () => {
  it('drops quotes, emoji it was not given, and a "kek" tacked on the end', () => {
    expect(cleanJoke('"wallet pretending it understands everything kek 🐸"', [])).toBe('wallet pretending it understands everything');
    expect(cleanJoke('the cuckoo clock approved lunch kek 🧾', ['🧾'])).toBe('the cuckoo clock approved lunch 🧾');
    expect(cleanJoke('the cuckoo clock approved lunch, ser', [], 'ser')).toBe('the cuckoo clock approved lunch, ser');
    expect(cleanJoke('nobody:\nme: croaking at the toaster', [])).toBe('nobody:\nme: croaking at the toaster');
  });
});

describe('what never goes out', () => {
  const ok = 'just picked my nose and pulled out pepecash 🤑🐸 going on a spreeee';

  it('the owner\'s own example passes', () => {
    expect(jokeProblem(ok, [])).toBeNull();
  });

  // Seen at temperature 1.8-2 on 11 October.
  it('junk from a hot model', () => {
    expect(jokeProblem('pov: ur at the dentist and the drill turns the chair into a submarine жы җумһур', [])).toBe('not latin script');
    expect(jokeProblem('if the dispenser says insert coin, try inserting confidence insteadើម្ប?', [])).toBe('not latin script');
    expect(jokeProblem('local frog plays idol[a UND SUP vpn rough soaking feels Shopify OTC-watch_', [])).toBe('junk characters');
  });

  // The 1 XCP listing bug of 5.26.1: a joke must never read as a real price.
  it('prices, mentions, scam bait and the off-limits', () => {
    expect(jokeProblem('just listed my lily pad for 1 xcp, going on a spree', [])).toBe('looks like a price');
    expect(jokeProblem('my bags are worth $5 and a sandwich', [])).toBe('looks like a price');
    expect(jokeProblem('hey @rabbidfly my toaster wants a word', [])).toBe('mentions someone');
    expect(jokeProblem('lost my seed phrase in the pond again, classic frog', [])).toBe('scam bait');
    expect(jokeProblem('use a condom dispenser as a coin bank, it pays interest in regret', [])).toBe('off limits');
    expect(jokeProblem('wen lambo, asking for a frog', [])).toBe('starts with wen');
    expect(jokeProblem('this chat is so quiet even the flies left', [])).toBe('about the quiet');
  });

  it('never names a card or an artist', () => {
    const card = FULL_CARD_INDEX.find((c) => /^[A-Z]{6,}$/.test(c.asset))!.asset;
    expect(jokeProblem(`my ${card} keeps looking at me during breakfast`, [])).toBe(`names the card ${card}`);
    expect(jokeProblem('rare scrilla walked into my pond and asked for rent', [])).toContain('names the artist');
    // Words that only happen to be someone's name stay usable.
    expect(jokeProblem('aquatic life is just a pool party with extra paperwork', [])).toBeNull();
  });

  it('never the same joke twice - by its words, its opening or its punchline', () => {
    const history = [joke('frog diet update: 90% pepecash, 10% fake rares, zero vegetables')];
    expect(jokeProblem('frog diet update: 80% pepecash, 20% fake rares, no vegetables', history)).toContain('same opening');
    expect(jokeProblem('my new plan: snacks, naps, fake rares, zero vegetables', history)).toContain('same punchline');
    expect(jokeProblem('my pond diet: pepecash, fake rares, and absolutely zero vegetables ever', history)).toContain('too close');
    expect(jokeProblem('petition to stop moving my lily pad until i finish counting', history)).toBeNull();
  });
});

describe('composing one', () => {
  const deps = (gen: string[], verdicts: string[]) => {
    const prompts: string[] = [];
    let g = 0;
    let j = 0;
    return {
      prompts,
      deps: {
        history: [],
        temperature: 2,
        rng: seeded(5),
        generate: async (prompt: string) => { prompts.push(prompt); return gen[g++] ?? ''; },
        judge: async () => verdicts[j++] ?? '{"ok":true}',
      },
    };
  };

  it('throws out junk and the judge\'s rejects, and draws again each time', async () => {
    const { deps: d, prompts } = deps(
      ['pov: the drill turns the chair into a submarine жы җумһур', 'a line the judge hates', 'petition to stop moving my lily pad until i finish counting'],
      ['{"ok": false, "why": "not english"}', '{"ok": true, "why": "fine"}'],
    );
    const out = await composeQuietJoke(d);
    expect(out?.text).toStartWith('petition to stop moving my lily pad');
    expect(prompts).toHaveLength(3);
    expect(new Set(prompts.map((p) => p.split('\n').find((l) => l.startsWith('This one:')))).size).toBe(3);
  });

  it('gives the slot back when nothing passes', async () => {
    const { deps: d } = deps(['1 xcp', '2 xcp', '3 xcp', '4 xcp'], []);
    expect(await composeQuietJoke(d)).toBeNull();
  });

  it('reads the judge strictly: anything but ok:true is a no', () => {
    expect(parseJudge('{"ok": true, "why": "fine"}').ok).toBe(true);
    expect(parseJudge('sure! {"ok": true}').ok).toBe(true);
    expect(parseJudge('{"ok": "yes"}').ok).toBe(false);
    expect(parseJudge('no idea').ok).toBe(false);
  });
});

describe('the joke log', () => {
  it('keeps every joke, in order, and finds a window of them', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'jokes-')), 'quiet-jokes.jsonl');
    expect(readJokes(path)).toEqual([]);
    recordJoke({ at: 100, text: 'one', topic: 'pizza' }, path);
    recordJoke({ at: 200, text: 'two', format: 'a petition' }, path);
    expect(readJokes(path).map((r) => r.text)).toEqual(['one', 'two']);
    expect(jokesBetween(150, 300, path).map((r) => r.text)).toEqual(['two']);
  });
});
