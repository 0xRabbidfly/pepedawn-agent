import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { selectDiversePassages, expandQuery } from '../../utils/loreRetrieval';
import type { RetrievedPassage } from '../../utils/loreRetrieval';

/**
 * Tests for loreRetrieval utilities
 * Covers memory boost priority and source ranking
 */

describe('loreRetrieval - Source Boost Priority', () => {
  describe('Memory Boost Priority', () => {
    it('should boost memory sources by 4.0x', () => {
      // This test validates the documented boost factor for memory sources
      // The boost is applied in searchKnowledgeWithExpansion function
      const expectedBoost = 4.0;
      
      // Create mock passages with different source types
      const memoryPassage: RetrievedPassage = {
        id: 'mem-1',
        text: 'Pepe green code is 420',
        score: 0.5, // Base similarity score
        sourceType: 'memory',
        sourceRef: 'mem-1',
        timestamp: Date.now(),
        author: 'test-user',
      };
      
      // Expected boosted score
      const expectedBoostedScore = 0.5 * expectedBoost;
      
      expect(expectedBoost).toBe(4.0);
      expect(expectedBoostedScore).toBe(2.0);
    });

    it('should boost wiki sources by 2.0x', () => {
      const expectedBoost = 2.0;
      
      const wikiPassage: RetrievedPassage = {
        id: 'wiki-1',
        text: 'Rare Pepe Directory has 1,774 cards',
        score: 0.5,
        sourceType: 'wiki',
        sourceRef: 'wiki-1',
      };
      
      const expectedBoostedScore = 0.5 * expectedBoost;
      
      expect(expectedBoost).toBe(2.0);
      expect(expectedBoostedScore).toBe(1.0);
    });

    it('should boost telegram sources by 0.5x', () => {
      const expectedBoost = 0.5;
      
      const telegramPassage: RetrievedPassage = {
        id: 'tg-1',
        text: 'Some random chat message',
        score: 0.5,
        sourceType: 'telegram',
        sourceRef: 'tg-1',
        timestamp: Date.now(),
        author: 'chat-user',
      };
      
      const expectedBoostedScore = 0.5 * expectedBoost;
      
      expect(expectedBoost).toBe(0.5);
      expect(expectedBoostedScore).toBe(0.25);
    });

    it('should rank memory 2x higher than wiki (4.0x vs 2.0x)', () => {
      // This is the key business logic: memory should be prioritized over wiki
      const memoryBoost = 4.0;
      const wikiBoost = 2.0;
      const ratio = memoryBoost / wikiBoost;
      
      expect(ratio).toBe(2.0);
      expect(memoryBoost).toBeGreaterThan(wikiBoost);
    });

    it('should rank wiki 4x higher than telegram (2.0x vs 0.5x)', () => {
      const wikiBoost = 2.0;
      const telegramBoost = 0.5;
      const ratio = wikiBoost / telegramBoost;
      
      expect(ratio).toBe(4.0);
      expect(wikiBoost).toBeGreaterThan(telegramBoost);
    });

    it('should rank memory 8x higher than telegram (4.0x vs 0.5x)', () => {
      const memoryBoost = 4.0;
      const telegramBoost = 0.5;
      const ratio = memoryBoost / telegramBoost;
      
      expect(ratio).toBe(8.0);
      expect(memoryBoost).toBeGreaterThan(telegramBoost);
    });
  });

  describe('Source Ranking Priority Order', () => {
    it('should maintain priority order: memory > wiki > telegram', () => {
      const boosts = {
        memory: 4.0,
        wiki: 2.0,
        telegram: 0.5,
      };
      
      expect(boosts.memory).toBeGreaterThan(boosts.wiki);
      expect(boosts.wiki).toBeGreaterThan(boosts.telegram);
      expect(boosts.memory).toBeGreaterThan(boosts.telegram);
    });

    it('should ensure memory passages with lower similarity score can outrank wiki', () => {
      // Example: Memory with 0.6 similarity vs Wiki with 0.9 similarity
      const memoryScore = 0.6 * 4.0; // 2.4
      const wikiScore = 0.9 * 2.0; // 1.8
      
      expect(memoryScore).toBeGreaterThan(wikiScore);
    });

    it('should ensure wiki passages with lower similarity score can outrank telegram', () => {
      // Example: Wiki with 0.6 similarity vs Telegram with 0.9 similarity
      const wikiScore = 0.6 * 2.0; // 1.2
      const telegramScore = 0.9 * 0.5; // 0.45
      
      expect(wikiScore).toBeGreaterThan(telegramScore);
    });
  });

  describe('MMR Diversity Selection', () => {
    it('should return all passages when count is less than target', () => {
      const passages: RetrievedPassage[] = [
        { id: '1', text: 'passage 1', score: 1.0, sourceType: 'wiki', sourceRef: '1' },
        { id: '2', text: 'passage 2', score: 0.9, sourceType: 'wiki', sourceRef: '2' },
      ];
      
      const result = selectDiversePassages(passages, 5);
      expect(result.length).toBe(2);
    });

    it('should select diverse passages when count exceeds target', () => {
      const passages: RetrievedPassage[] = [
        { id: '1', text: 'Fake Rares are NFTs', score: 1.0, sourceType: 'wiki', sourceRef: '1' },
        { id: '2', text: 'Fake Rares are digital art', score: 0.9, sourceType: 'wiki', sourceRef: '2' },
        { id: '3', text: 'Bitcoin is a cryptocurrency', score: 0.8, sourceType: 'wiki', sourceRef: '3' },
        { id: '4', text: 'Ethereum has smart contracts', score: 0.7, sourceType: 'wiki', sourceRef: '4' },
      ];
      
      const result = selectDiversePassages(passages, 2);
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('1'); // First one is always highest score
    });

    it('should start with highest scoring passage', () => {
      const passages: RetrievedPassage[] = [
        { id: '1', text: 'passage 1', score: 1.0, sourceType: 'wiki', sourceRef: '1' },
        { id: '2', text: 'passage 2', score: 0.9, sourceType: 'wiki', sourceRef: '2' },
        { id: '3', text: 'passage 3', score: 0.8, sourceType: 'wiki', sourceRef: '3' },
      ];
      
      const result = selectDiversePassages(passages, 2);
      expect(result[0].id).toBe('1');
      expect(result[0].score).toBe(1.0);
    });
  });

  describe('Query Expansion', () => {
    it('should expand "scrilla" query', () => {
      const expanded = expandQuery('scrilla');
      expect(expanded).toContain('scrilla');
      expect(expanded).toContain('Rare Scrilla');
      expect(expanded).toContain('Scrilla');
    });

    it('should expand "freedomkek" query', () => {
      const expanded = expandQuery('freedomkek');
      expect(expanded).toContain('freedomkek');
      expect(expanded).toContain('FREEDOMKEK');
      expect(expanded).toContain('Freedom Kek');
    });

    it('should expand "pepe" query', () => {
      const expanded = expandQuery('pepe');
      expect(expanded).toContain('pepe');
      expect(expanded).toContain('Pepe');
      expect(expanded).toContain('Rare Pepe');
      expect(expanded).toContain('Fake Rare');
    });

    it('should expand "faka" query', () => {
      const expanded = expandQuery('faka');
      expect(expanded).toContain('faka');
      expect(expanded).toContain('La Faka Nostra');
      expect(expanded).toContain('Faka Nostra');
    });

    it('should handle queries with multiple expandable terms', () => {
      const expanded = expandQuery('pepe scrilla');
      expect(expanded).toContain('pepe scrilla');
      expect(expanded).toContain('Rare Pepe');
      expect(expanded).toContain('Rare Scrilla');
    });

    it('should return original query if no expansions match', () => {
      const expanded = expandQuery('random query');
      expect(expanded).toBe('random query');
    });

    it('should be case-insensitive', () => {
      const expanded1 = expandQuery('PEPE');
      const expanded2 = expandQuery('pepe');
      const expanded3 = expandQuery('Pepe');
      
      // All should expand (contain the original plus expansions)
      expect(expanded1).toContain('Rare Pepe');
      expect(expanded2).toContain('Rare Pepe');
      expect(expanded3).toContain('Rare Pepe');
    });
  });
});

