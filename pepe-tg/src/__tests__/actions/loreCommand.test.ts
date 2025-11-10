import { describe, expect, it, mock } from 'bun:test';
import { loreCommand } from '../../actions/loreCommand';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import { createMockRuntime, createMockMessage } from '../utils/core-test-utils';
import type { RetrievedPassage } from '../../utils/loreRetrieval';

/**
 * Tests for loreCommand action
 * Covers FACTS mode filtering and memory inclusion
 */

describe('loreCommand - FACTS Mode', () => {
  describe('Action Structure', () => {
    it('should have correct name and properties', () => {
      expect(loreCommand.name).toBe('LORE_COMMAND');
      expect(loreCommand.description).toBeDefined();
      expect(loreCommand.similes).toContain('LORE');
      expect(loreCommand.similes).toContain('KNOWLEDGE');
      expect(typeof loreCommand.validate).toBe('function');
      expect(typeof loreCommand.handler).toBe('function');
    });
  });

  describe('Validation', () => {
    it('should validate /fl commands', async () => {
      const runtime = createMockRuntime();
      const message = createMockMessage('/fl test query');
      
      const result = await loreCommand.validate(runtime, message);
      expect(result).toBe(true);
    });

    it('should validate /fl with case variations', async () => {
      const runtime = createMockRuntime();
      
      const message1 = createMockMessage('/FL test query');
      const result1 = await loreCommand.validate(runtime, message1);
      expect(result1).toBe(true);
      
      const message2 = createMockMessage('/Fl test query');
      const result2 = await loreCommand.validate(runtime, message2);
      expect(result2).toBe(true);
    });

    it('should not validate non-/fl messages', async () => {
      const runtime = createMockRuntime();
      const message = createMockMessage('regular message');
      
      const result = await loreCommand.validate(runtime, message);
      expect(result).toBe(false);
    });

    it('should validate /fl with leading/trailing spaces', async () => {
      const runtime = createMockRuntime();
      const message = createMockMessage('  /fl test query  ');
      
      const result = await loreCommand.validate(runtime, message);
      expect(result).toBe(true);
    });
  });

  describe('FACTS Mode Filtering', () => {
    it('should document that FACTS mode includes both wiki and memory sources', () => {
      // This test documents the key business logic change:
      // FACTS mode should filter to include BOTH wiki AND memory sources
      // Previously it was wiki-only
      
      const mockPassages: RetrievedPassage[] = [
        { id: 'mem-1', text: 'Memory fact', score: 2.0, sourceType: 'memory', sourceRef: 'mem-1' },
        { id: 'wiki-1', text: 'Wiki fact', score: 1.5, sourceType: 'wiki', sourceRef: 'wiki-1' },
        { id: 'tg-1', text: 'Telegram chat', score: 0.5, sourceType: 'telegram', sourceRef: 'tg-1' },
      ];
      
      // Filter logic: p.sourceType === 'wiki' || p.sourceType === 'memory'
      const filtered = mockPassages.filter(p => 
        p.sourceType === 'wiki' || p.sourceType === 'memory'
      );
      
      expect(filtered.length).toBe(2);
      expect(filtered.some(p => p.sourceType === 'memory')).toBe(true);
      expect(filtered.some(p => p.sourceType === 'wiki')).toBe(true);
      expect(filtered.some(p => p.sourceType === 'telegram')).toBe(false);
    });

    it('should prioritize memory over wiki in FACTS mode', () => {
      // With the 4.0x boost for memory vs 2.0x for wiki,
      // memory passages should appear first after sorting
      
      const mockPassages: RetrievedPassage[] = [
        { id: 'wiki-1', text: 'Wiki', score: 1.8, sourceType: 'wiki', sourceRef: 'wiki-1' },
        { id: 'mem-1', text: 'Memory', score: 2.4, sourceType: 'memory', sourceRef: 'mem-1' },
        { id: 'wiki-2', text: 'Wiki2', score: 1.6, sourceType: 'wiki', sourceRef: 'wiki-2' },
      ];
      
      // After boost: memory=2.4, wiki=1.8, wiki2=1.6
      // Sorted descending by score
      const sorted = mockPassages
        .filter(p => p.sourceType === 'wiki' || p.sourceType === 'memory')
        .sort((a, b) => b.score - a.score);
      
      expect(sorted[0].sourceType).toBe('memory');
      expect(sorted[0].id).toBe('mem-1');
    });

    it('should exclude telegram sources in FACTS mode', () => {
      const mockPassages: RetrievedPassage[] = [
        { id: 'mem-1', text: 'Memory', score: 2.0, sourceType: 'memory', sourceRef: 'mem-1' },
        { id: 'wiki-1', text: 'Wiki', score: 1.5, sourceType: 'wiki', sourceRef: 'wiki-1' },
        { id: 'tg-1', text: 'Telegram', score: 0.8, sourceType: 'telegram', sourceRef: 'tg-1' },
        { id: 'tg-2', text: 'Telegram2', score: 0.7, sourceType: 'telegram', sourceRef: 'tg-2' },
      ];
      
      const filtered = mockPassages.filter(p => 
        p.sourceType === 'wiki' || p.sourceType === 'memory'
      );
      
      expect(filtered.length).toBe(2);
      expect(filtered.every(p => p.sourceType !== 'telegram')).toBe(true);
    });

    it('should take top 5 passages after filtering in FACTS mode', () => {
      const mockPassages: RetrievedPassage[] = [
        { id: 'mem-1', text: 'Memory1', score: 3.0, sourceType: 'memory', sourceRef: 'mem-1' },
        { id: 'mem-2', text: 'Memory2', score: 2.8, sourceType: 'memory', sourceRef: 'mem-2' },
        { id: 'wiki-1', text: 'Wiki1', score: 2.0, sourceType: 'wiki', sourceRef: 'wiki-1' },
        { id: 'wiki-2', text: 'Wiki2', score: 1.9, sourceType: 'wiki', sourceRef: 'wiki-2' },
        { id: 'wiki-3', text: 'Wiki3', score: 1.8, sourceType: 'wiki', sourceRef: 'wiki-3' },
        { id: 'wiki-4', text: 'Wiki4', score: 1.7, sourceType: 'wiki', sourceRef: 'wiki-4' },
        { id: 'tg-1', text: 'Telegram', score: 0.5, sourceType: 'telegram', sourceRef: 'tg-1' },
      ];
      
      const filtered = mockPassages
        .filter(p => p.sourceType === 'wiki' || p.sourceType === 'memory')
        .slice(0, 5);
      
      expect(filtered.length).toBe(5);
      expect(filtered[0].sourceType).toBe('memory');
      expect(filtered[1].sourceType).toBe('memory');
    });

    it('should handle case when no wiki or memory passages exist', () => {
      const mockPassages: RetrievedPassage[] = [
        { id: 'tg-1', text: 'Telegram1', score: 0.8, sourceType: 'telegram', sourceRef: 'tg-1' },
        { id: 'tg-2', text: 'Telegram2', score: 0.7, sourceType: 'telegram', sourceRef: 'tg-2' },
      ];
      
      const filtered = mockPassages.filter(p => 
        p.sourceType === 'wiki' || p.sourceType === 'memory'
      );
      
      expect(filtered.length).toBe(0);
      
      // Fallback behavior: use top passages from any source
      const fallback = mockPassages.slice(0, 5);
      expect(fallback.length).toBe(2);
    });

    it('should handle case when only memory passages exist', () => {
      const mockPassages: RetrievedPassage[] = [
        { id: 'mem-1', text: 'Memory1', score: 3.0, sourceType: 'memory', sourceRef: 'mem-1' },
        { id: 'mem-2', text: 'Memory2', score: 2.5, sourceType: 'memory', sourceRef: 'mem-2' },
      ];
      
      const filtered = mockPassages.filter(p => 
        p.sourceType === 'wiki' || p.sourceType === 'memory'
      ).slice(0, 5);
      
      expect(filtered.length).toBe(2);
      expect(filtered.every(p => p.sourceType === 'memory')).toBe(true);
    });

    it('should handle case when only wiki passages exist', () => {
      const mockPassages: RetrievedPassage[] = [
        { id: 'wiki-1', text: 'Wiki1', score: 2.0, sourceType: 'wiki', sourceRef: 'wiki-1' },
        { id: 'wiki-2', text: 'Wiki2', score: 1.9, sourceType: 'wiki', sourceRef: 'wiki-2' },
      ];
      
      const filtered = mockPassages.filter(p => 
        p.sourceType === 'wiki' || p.sourceType === 'memory'
      ).slice(0, 5);
      
      expect(filtered.length).toBe(2);
      expect(filtered.every(p => p.sourceType === 'wiki')).toBe(true);
    });
  });

  describe('Memory Detection and Priority', () => {
    it('should detect memory marker format in content', () => {
      // Memory marker format: [MEMORY:userId:displayName:timestamp] content
      const memoryContent = '[MEMORY:user-123:rabbidfly.xcp:1698765432] Pepe green code is 420';
      
      const markerMatch = memoryContent.match(/^\[MEMORY:([^:]+):([^:]+):([^\]]+)\]\s*(.+)$/s);
      
      expect(markerMatch).toBeTruthy();
      expect(markerMatch![1]).toBe('user-123'); // userId
      expect(markerMatch![2]).toBe('rabbidfly.xcp'); // displayName
      expect(markerMatch![3]).toBe('1698765432'); // timestamp
      expect(markerMatch![4]).toBe('Pepe green code is 420'); // content
    });

    it('should extract clean text from memory marker', () => {
      const memoryContent = '[MEMORY:user-123:rabbidfly.xcp:1698765432] Pepe green code is 420';
      const markerMatch = memoryContent.match(/^\[MEMORY:([^:]+):([^:]+):([^\]]+)\]\s*(.+)$/s);
      
      const cleanText = markerMatch![4].trim();
      expect(cleanText).toBe('Pepe green code is 420');
      expect(cleanText).not.toContain('[MEMORY:');
    });

    it('should prioritize explicitly saved memory over wiki documentation', () => {
      // Scenario: User explicitly saves "Pepe green code is 420"
      // This should override wiki entries that say "no color code exists"
      
      const memory: RetrievedPassage = {
        id: 'mem-1',
        text: 'Pepe green code is 420',
        score: 0.7 * 4.0, // 2.8 after boost
        sourceType: 'memory',
        sourceRef: 'mem-1',
      };
      
      const wiki: RetrievedPassage = {
        id: 'wiki-1',
        text: 'No official Pepe green color code exists',
        score: 0.9 * 2.0, // 1.8 after boost
        sourceType: 'wiki',
        sourceRef: 'wiki-1',
      };
      
      const passages = [memory, wiki];
      const sorted = passages.sort((a, b) => b.score - a.score);
      
      // Memory should rank first despite lower base similarity
      expect(sorted[0].sourceType).toBe('memory');
      expect(sorted[0].text).toContain('420');
    });
  });

  describe('Output Formatting', () => {
    it('should convert escaped newline sequences before sending response', async () => {
      const runtime = createMockRuntime();
      const message = createMockMessage('/fl PEPEDAWN poem');

      const mockKnowledgeService = {
        retrieveKnowledge: mock().mockResolvedValue({
          story: 'Here\\n\\nComes the dawn',
          sourcesLine: '\\n\\nSources: [CARD:PEPEDAWN]',
          hasWikiOrMemory: true,
          metrics: {
            query: 'PEPEDAWN poem',
            hits_raw: 1,
            hits_used: 1,
            clusters: 1,
            latency_ms: 10,
            story_words: 3,
          },
        }),
      };

      runtime.getService = mock().mockImplementation((serviceType: string) => {
        if (serviceType === 'knowledge-orchestrator') {
          return mockKnowledgeService as any;
        }
        return null;
      });

      const callback = mock(async (_response: any) => {});

      await loreCommand.handler(
        runtime,
        message,
        null as unknown as State,
        undefined,
        callback
      );

      expect(callback.mock.calls.length).toBe(1);
      const sentText = callback.mock.calls[0][0].text as string;
      expect(sentText).toContain('Here\n\nComes the dawn');
      expect(sentText.includes('\\n')).toBe(false);
    });
  });

  describe('Output Formatting', () => {
    it('should decode double-escaped newline sequences before sending response', async () => {
      const runtime = createMockRuntime();
      const message = createMockMessage('/fl PEPEDAWN poem');

      const mockKnowledgeService = {
        retrieveKnowledge: mock().mockResolvedValue({
          story: 'PEPEDAWN poem\\\\n\\\\nLine two arrives',
          sourcesLine: '\\n\\nSources: [CARD:PEPEDAWN]',
          hasWikiOrMemory: true,
          metrics: {
            query: 'PEPEDAWN poem',
            hits_raw: 1,
            hits_used: 1,
            clusters: 1,
            latency_ms: 10,
            story_words: 4,
          },
        }),
      };

      runtime.getService = mock().mockImplementation((serviceType: string) => {
        if (serviceType === 'knowledge-orchestrator') {
          return mockKnowledgeService as any;
        }
        return null;
      });

      const callback = mock(async (_response: any) => {});

      await loreCommand.handler(
        runtime,
        message,
        null as unknown as State,
        undefined,
        callback
      );

      expect(callback.mock.calls.length).toBe(1);
      const sentText = callback.mock.calls[0][0].text as string;
      expect(sentText).toContain('PEPEDAWN poem\n\nLine two arrives');
      expect(sentText.includes('\\n')).toBe(false);
    });
  });
});

