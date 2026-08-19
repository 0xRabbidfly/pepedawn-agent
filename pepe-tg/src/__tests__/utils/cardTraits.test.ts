import { describe, expect, it } from 'bun:test';
import { findCardsByTrait, describeTraitMatch, traitTerms, traitCoverage } from '../../utils/cardTraits';

describe('visual trait search', () => {
  it('covers most of the collection', () => {
    expect(traitCoverage()).toBeGreaterThan(800);
  });

  it('finds genuinely red cards, ranked by how red they are', () => {
    const hits = findCardsByTrait('which fake rare has the most red?', 3);
    expect(hits.length).toBeGreaterThan(0);
    // Every hit must have matched on an actual red trait, not a coincidence.
    for (const h of hits) {
      expect(h.matched.some((m) => /\b(red|crimson|scarlet|blood)\b/.test(m))).toBe(true);
    }
    // More red traits should outrank fewer.
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[hits.length - 1].score);
  });

  it('never matches a term hiding inside another word', () => {
    // "incredible" contains "red" and previously scored cards with nothing red.
    for (const h of findCardsByTrait('most red', 10)) {
      expect(h.matched.every((m) => !/incredible/.test(m) || /\bred\b/.test(m))).toBe(true);
    }
  });

  it('resolves subjective-sounding but descriptive terms', () => {
    expect(findCardsByTrait('sexiest pepe', 1).length).toBeGreaterThan(0);
    expect(findCardsByTrait('most psychedelic', 1).length).toBeGreaterThan(0);
  });

  it('expands ordinary phrasing into the vision vocabulary', () => {
    expect(traitTerms('most colourful card')).toContain('vibrant');
    expect(traitTerms('a red one')).toContain('crimson');
  });

  it('drops filler words so they cannot match', () => {
    const terms = traitTerms('what is the card that looks most like a pepe');
    expect(terms).not.toContain('card');
    expect(terms).not.toContain('pepe');
    expect(terms).not.toContain('looks');
  });

  it('returns nothing when the query holds no descriptive terms', () => {
    // Every word is filler, so there is nothing to match on.
    expect(traitTerms('what is the best card for me')).toHaveLength(0);
    expect(findCardsByTrait('what is the best card for me')).toHaveLength(0);
    expect(describeTraitMatch('the one that you like')).toBeNull();
  });

  it('is gated by intent, not by the search itself', async () => {
    // findCardsByTrait is a raw search: "rules" is a real recorded trait, so
    // "submission rules and fees" does match cards. The guard is upstream -
    // looksDescriptive() requires a colour or mood word before trait search is
    // consulted at all.
    const { SmartRouterService } = await import('../../services/SmartRouterService');
    const router: any = new (SmartRouterService as any)({
      agentId: 'test',
      getService: () => null,
    } as any);
    expect(router.looksDescriptive('what are the submission rules and fees?')).toBe(false);
    expect(router.looksDescriptive('which fake rare has the most red?')).toBe(true);
    expect(router.looksDescriptive('what is the sexiest pepe')).toBe(true);
  });

  it('names the card and the traits behind the pick', () => {
    const m = describeTraitMatch('most green card');
    expect(m).not.toBeNull();
    expect(m!.fact).toContain(m!.asset);
    expect(m!.fact).toContain('vision pass recorded');
  });
});

describe('collections are kept apart', () => {
  const assets = async (file: string) => {
    const { readFileSync } = await import('fs');
    const raw = JSON.parse(readFileSync(`${import.meta.dir}/../../data/${file}`, 'utf8'));
    return new Set((raw as any[]).map((c) => String(c.asset).toUpperCase()));
  };

  it('reads which collection a question is about', async () => {
    const { detectCollection } = await import('../../utils/cardFacts');
    expect(detectCollection('what is your favourite fake commons card?')).toBe('fake-commons');
    expect(detectCollection('favourite rare pepe?')).toBe('rare-pepes');
    expect(detectCollection('your favourite fake rare?')).toBe('fake-rares');
    expect(detectCollection('which do you like most?')).toBe('fake-rares');
  });

  it('draws from the collection that was asked about', async () => {
    // "Your favourite fake commons card?" answered with a Fake Rare, because
    // every pool was the Fake Rares index.
    const { randomCard } = await import('../../utils/cardFacts');
    const commons = await assets('fake-commons-data.json');
    const rares = await assets('fake-rares-data.json');

    for (let i = 0; i < 15; i++) {
      expect(commons.has(randomCard('fake-commons')!.asset.toUpperCase())).toBe(true);
      expect(rares.has(randomCard('fake-rares')!.asset.toUpperCase())).toBe(true);
    }
  });

  it('has visual traits for Fake Rares only', async () => {
    // The /fv pass never ran over Commons or Rare Pepes, so a descriptive
    // question about them has no data and must not borrow from Fake Rares.
    const { findCardsByTrait } = await import('../../utils/cardTraits');
    const rares = await assets('fake-rares-data.json');
    for (const hit of findCardsByTrait('most red', 10)) {
      expect(rares.has(hit.asset.toUpperCase())).toBe(true);
    }
  });
});

describe('never volunteer a card for ordinary conversation', () => {
  const gateAndSearch = async (text: string) => {
    const { SmartRouterService } = await import('../../services/SmartRouterService');
    const router: any = new (SmartRouterService as any)({
      agentId: 'test',
      getService: () => null,
    } as any);
    const gated = router.concernsCards(text) && router.looksDescriptive(text);
    return gated ? findCardsByTrait(text, 1)[0] : undefined;
  };

  it('says nothing about cards when the user did not mention one', async () => {
    // "oh no, i get really awkward in small places when scrilla is there"
    // answered "DONALDTPEPE by Rodro — the vision pass recorded: get." and
    // posted the video. Three faults compounded: "really" satisfied the
    // descriptive check, "get" was scored as a trait, and trait search was
    // never gated on the message concerning cards at all.
    expect(await gateAndSearch('oh no , i get really awkawrd ni small places when scrilla is there')).toBeUndefined();
    expect(await gateAndSearch('lol - more work to do')).toBeUndefined();
    expect(await gateAndSearch('i really like this place')).toBeUndefined();
    expect(await gateAndSearch('how are you today?')).toBeUndefined();
    expect(await gateAndSearch('pepedawn i wouldnt soul my soull, but what about loaning it out?')).toBeUndefined();
  });

  it('still answers genuine descriptive questions', async () => {
    expect((await gateAndSearch('which fake rare has the most red?'))?.asset).toBeTruthy();
    expect((await gateAndSearch('what is the sexiest pepe'))?.asset).toBeTruthy();
    expect((await gateAndSearch('show me a dark scary card'))?.asset).toBeTruthy();
    expect((await gateAndSearch('most psychedelic card'))?.asset).toBeTruthy();
  });

  it('only scores recognised descriptive vocabulary', () => {
    // Arbitrary words must never reach the traits at all.
    expect(traitTerms('i get really awkward when scrilla is there')).toEqual([]);
    expect(traitTerms('lol more work to do')).toEqual([]);
    expect(traitTerms('most red card')).toContain('red');
  });
});
