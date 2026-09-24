/**
 * The vision pass, made repeatable: which cards still need looking at, which
 * image to show the model, and that what gets imported is byte-for-byte the
 * shape (and the ids) the original by-hand import wrote, so re-importing is
 * a no-op and prod's 875 cards are not duplicated.
 */
import { describe, expect, it } from 'bun:test';
import type { CardInfo } from '../../data/fullCardIndex';
import {
  blocksToImport,
  cardsNeedingFacts,
  extractSections,
  factFromAnalysis,
  imageCandidatesForVisualAnalysis,
  imageForVisualAnalysis,
  importMissingFacts,
  memoryFromFact,
  memoryIdFor,
  memoryTextFor,
  mergeTraits,
  stripRarityFeels,
} from '../../utils/cardVisualFacts';

const CDN = 'https://raw.githubusercontent.com/fakerares/cdn/refs/heads/main';
const card = (over: Partial<CardInfo>): CardInfo =>
  ({ asset: 'X', series: 18, card: 32, ext: 'gif', artist: 'A', artistSlug: 'a', supply: 10, issuance: 'May 2026', ...over }) as CardInfo;

const ANALYSIS = `📝 **TEXT ON CARD:**
PEPEFLOW

🎨 **VISUAL BREAKDOWN:**
A green frog surfs a purple wave under an orange sky. Bold flat colours, thick outlines.

🧬 **MEMETIC DNA:**
- Pepe the Frog
- "go with the flow" surf culture

🎯 **RARITY FEELS:**
Pure gm vibes. Feels mid-rare.`;

describe('which cards, which image', () => {
  it('needs facts for live cards not on file; retired and recorded ones are skipped', () => {
    const cards = [card({ asset: 'A' }), card({ asset: 'B', retired: true } as any), card({ asset: 'c' })];
    expect(cardsNeedingFacts(cards, new Set(['C'])).map((c) => c.asset)).toEqual(['A']);
  });

  it('an MP4 card offers its scraped still, then the directory image and thumbnail - never the video', () => {
    const dir = { image: `${CDN}/cards/6/18_X.mp4`, small: `${CDN}/optimized/6/18_X.webp`, video: `${CDN}/cards/6/18_X.mp4`, url: null };
    expect(imageCandidatesForVisualAnalysis(card({ ext: 'mp4', memeUri: 'https://tokenscan.io/x.gif', directory: dir }))).toEqual(['https://tokenscan.io/x.gif', `${CDN}/optimized/6/18_X.webp`]);
    expect(imageForVisualAnalysis(card({ ext: 'mp4', directory: dir }))).toBe(`${CDN}/optimized/6/18_X.webp`);
    expect(imageForVisualAnalysis(card({ ext: 'mp4' }))).toBeNull();
  });

  it('an old-site override is never offered; the directory copies follow the own source, S3 is the default', () => {
    const old = 'https://fakeraredirectory.com/wp-content/uploads/2025/09/x.gif';
    const dir = { image: `${CDN}/cards/18/32_X.gif`, small: `${CDN}/optimized/18/32_X.webp`, video: null, url: null };
    expect(imageCandidatesForVisualAnalysis(card({ imageUri: old, directory: dir }))).toEqual([`${CDN}/cards/18/32_X.gif`, `${CDN}/optimized/18/32_X.webp`]);
    expect(imageForVisualAnalysis(card({ imageUri: old }))).toBeNull();
    // A big GIF that OpenAI refuses (>20MB) falls through to the small copy.
    expect(imageCandidatesForVisualAnalysis(card({ imageUri: 'https://arweave.net/abc.gif', directory: dir }))).toEqual([
      'https://arweave.net/abc.gif', `${CDN}/cards/18/32_X.gif`, `${CDN}/optimized/18/32_X.webp`,
    ]);
    expect(imageForVisualAnalysis(card({ asset: 'FREEDOMKEK', series: 0, ext: 'jpeg' }))).toBe('https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/0/FREEDOMKEK.jpeg');
  });
});

describe('from the answer to a fact to a memory', () => {
  it('parses the three sections and drops rarity feels', () => {
    const s = extractSections(stripRarityFeels(ANALYSIS));
    expect(s.textOnCard.content).toBe('PEPEFLOW');
    expect(s.visualBreakdown.content).toMatch(/^A green frog/);
    expect(s.memeticDna.content).toContain('surf culture');
    expect(stripRarityFeels(ANALYSIS)).not.toContain('RARITY');
  });

  it('builds the same memory shape the original pipeline did, with the summary when there is one', () => {
    const c = card({ asset: 'PEPEFLOW', card: 32 });
    const fact = factFromAnalysis(c, ANALYSIS);
    expect(fact.card).toEqual({ asset: 'PEPEFLOW', series: 18, cardNumber: 32, artist: 'A', supply: 10, issuance: 'May 2026', collection: 'Fake Rares' });

    const m = memoryFromFact(fact, c, { summary: 'A frog surfs. Purple wave.', keywords: ['frog', 'purple wave', 'orange sky'] });
    expect(m.textOnCard).toEqual(['PEPEFLOW']);
    expect(m.memeticReferences).toEqual(['Pepe the Frog', '"go with the flow" surf culture']);
    expect(m.visualSummaryShort).toBe('A frog surfs. Purple wave.');
    expect(m.visualKeywords).toEqual(['frog', 'purple wave', 'orange sky']);
    expect(m.textKeywords).toEqual(['pepeflow']);
    expect(m.keywords).toEqual(['frog', 'purple wave', 'orange sky', 'pepeflow']);
    expect(m.embeddingBlocks.map((b) => b.id)).toEqual(['PEPEFLOW#text', 'PEPEFLOW#memetic', 'PEPEFLOW#visual', 'PEPEFLOW#raw']);
    expect(m.embeddingInput).toBe(
      'PEPEFLOW (Fake Rares) - Series 18 Card 32\nArtist: A\nSupply 10 Issued May 2026\nOn-card text: PEPEFLOW\n' +
        'Visual summary: A green frog surfs a purple wave under an orange sky. Bold flat colours, thick outlines.\n' +
        'Memetic references: Pepe the Frog; "go with the flow" surf culture',
    );

    // No summary: the breakdown stands in and keywords come from its words.
    const bare = memoryFromFact(fact, c, null);
    expect(bare.visualSummaryShort).toMatch(/^A green frog/);
    expect(bare.visualKeywords).toContain('green');
  });

  it('merges new keywords into the trait index without touching existing entries', () => {
    const m = memoryFromFact(factFromAnalysis(card({ asset: 'NEW' }), ANALYSIS), undefined, { summary: 's', keywords: ['Red ', 'blue'] });
    const out = mergeTraits({ OLD: ['green'] }, [m]);
    expect(out.OLD).toEqual(['green']);
    expect(out.NEW).toEqual(['blue', 'pepeflow', 'red']);
  });
});

describe('into knowledge', () => {
  it('uses the ids the original import wrote, so prod is not duplicated', () => {
    // uuidv5("PEPEDAWN::PEPEDAWN#combined", the import script's namespace)
    expect(memoryIdFor('PEPEDAWN', 'PEPEDAWN#combined')).toBe('7b4a7736-38f5-55d7-9667-3c0c5f48a4c6');
    expect(memoryIdFor('pepedawn', 'PEPEDAWN#combined')).toBe('7b4a7736-38f5-55d7-9667-3c0c5f48a4c6');
  });

  it('imports the combined block first and the text carries the card tag', () => {
    const m = memoryFromFact(factFromAnalysis(card({ asset: 'PEPEFLOW' }), ANALYSIS), undefined, null);
    const blocks = blocksToImport(m);
    expect(blocks[0]).toMatchObject({ id: 'PEPEFLOW#combined', priority: 120, type: 'combined' });
    expect(blocks).toHaveLength(5);
    const text = memoryTextFor(m, blocks[0]);
    expect(text.startsWith('[CARD:PEPEFLOW] [CARD_FACT:COMBINED CARD FACT]\nCollection: Fake Rares\nSeries 18 • Card 32 • by A')).toBe(true);
    expect(text).toContain('Memetic references: Pepe the Frog');
    expect(memoryTextFor(m, blocks[1])).not.toContain('Memetic references:');
  });

  it('skips cards already in the database and writes every block of the rest', async () => {
    const present = memoryFromFact(factFromAnalysis(card({ asset: 'OLD' }), ANALYSIS), undefined, null);
    const missing = memoryFromFact(factFromAnalysis(card({ asset: 'NEW' }), ANALYSIS), undefined, null);
    const created: any[] = [];
    const runtime = {
      agentId: 'agent-1',
      getMemoryById: async (id: string) => (id === memoryIdFor('OLD', 'OLD#combined') ? { id } : null),
      addEmbeddingToMemory: async (m: any) => { m.embedding = [0.1]; },
      createMemory: async (m: any, table: string) => { created.push({ m, table }); },
    };
    const result = await importMissingFacts(runtime, [present, missing]);
    expect(result).toEqual({ cards: 1, blocks: 5, failed: [] });
    expect(created.every((c) => c.table === 'knowledge')).toBe(true);
    expect(created.map((c) => c.m.metadata.blockId)).toEqual(['NEW#combined', 'NEW#text', 'NEW#memetic', 'NEW#visual', 'NEW#raw']);
    expect(created[0].m.metadata).toMatchObject({ type: 'fragment', source: 'card-visual', asset: 'NEW', documentId: 'NEW#card-visual', position: 0 });
    expect(created[0].m.embedding).toEqual([0.1]);
  });
});
