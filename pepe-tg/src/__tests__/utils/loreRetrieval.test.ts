import { describe, expect, it, mock } from 'bun:test';
import { searchKnowledgeWithExpansion } from '../../utils/loreRetrieval';

/**
 * Tests for loreRetrieval hybrid search and card detection
 * 
 * CRITICAL: These tests prevent regressions in card memory retrieval
 */

describe('loreRetrieval - Hybrid Card Search', () => {
  
  describe('Card Detection (Case Insensitivity)', () => {
    
    it('should detect uppercase card names (e.g., PEPEDAWN)', () => {
      const query = "PEPEDAWN";
      const words = query.match(/\b[A-Za-z]{3,}[A-Za-z0-9]*\b/g) || [];
      
      expect(words).toContain('PEPEDAWN');
      expect(words.length).toBeGreaterThan(0);
    });
    
    it('should detect lowercase card names (e.g., pepedawn)', () => {
      const query = "pepedawn";
      const words = query.match(/\b[A-Za-z]{3,}[A-Za-z0-9]*\b/g) || [];
      
      expect(words).toContain('pepedawn');
      expect(words.length).toBeGreaterThan(0);
    });
    
    it('should detect mixed case card names (e.g., PepeDawn)', () => {
      const query = "PepeDawn";
      const words = query.match(/\b[A-Za-z]{3,}[A-Za-z0-9]*\b/g) || [];
      
      expect(words).toContain('PepeDawn');
      expect(words.length).toBeGreaterThan(0);
    });
    
    it('should detect card names in longer queries', () => {
      const query = "tell me about pepedawn lore";
      const words = query.match(/\b[A-Za-z]{3,}[A-Za-z0-9]*\b/g) || [];
      
      expect(words).toContain('pepedawn');
      expect(words).toContain('tell');
      expect(words).toContain('about');
      expect(words).toContain('lore');
    });
    
    it('should detect cards with numbers (e.g., PEPE420)', () => {
      const query = "PEPE420";
      const words = query.match(/\b[A-Za-z]{3,}[A-Za-z0-9]*\b/g) || [];
      
      expect(words).toContain('PEPE420');
    });
    
    it('should NOT detect 2-letter words', () => {
      const query = "ok hi";
      const words = query.match(/\b[A-Za-z]{3,}[A-Za-z0-9]*\b/g) || [];
      
      expect(words).not.toContain('ok');
      expect(words).not.toContain('hi');
    });
  });
  
  describe('Card Name Normalization', () => {
    
    it('should uppercase card names for marker matching', () => {
      const detectedCard = "pepedawn";
      const normalizedCard = detectedCard.toUpperCase();
      const expectedMarker = `[CARD:${normalizedCard}]`;
      
      expect(normalizedCard).toBe('PEPEDAWN');
      expect(expectedMarker).toBe('[CARD:PEPEDAWN]');
    });
    
    it('should handle already uppercase cards', () => {
      const detectedCard = "FREEDOMKEK";
      const normalizedCard = detectedCard.toUpperCase();
      const expectedMarker = `[CARD:${normalizedCard}]`;
      
      expect(normalizedCard).toBe('FREEDOMKEK');
      expect(expectedMarker).toBe('[CARD:FREEDOMKEK]');
    });
  });
  
  describe('Card Memory Marker Filtering', () => {
    
    it('should filter results to only include [CARD:NAME] markers', () => {
      const cardMarker = '[CARD:PEPEDAWN]';
      
      const mockResults = [
        { content: { text: '[CARD:PEPEDAWN] The raven\'s call...' } },
        { content: { text: 'Some wiki content about PEPEDAWN' } },
        { content: { text: '[CARD:FREEDOMKEK] Different card' } },
        { text: '[CARD:PEPEDAWN] Another memory' },
      ];
      
      const filtered = mockResults.filter((m: any) => {
        const text = m.content?.text || m.text || '';
        return text.includes(cardMarker);
      });
      
      expect(filtered.length).toBe(2);
      expect(filtered[0].content.text).toContain('[CARD:PEPEDAWN]');
      expect(filtered[1].text).toContain('[CARD:PEPEDAWN]');
    });
    
    it('should not match partial card names in markers', () => {
      const cardMarker = '[CARD:PEPE]';
      
      const mockResults = [
        { content: { text: '[CARD:PEPEDAWN] Should not match' } },
        { content: { text: '[CARD:PEPE] Should match' } },
        { content: { text: '[CARD:PEPE420] Should not match' } },
      ];
      
      const filtered = mockResults.filter((m: any) => {
        const text = m.content?.text || m.text || '';
        return text.includes(cardMarker);
      });
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].content.text).toBe('[CARD:PEPE] Should match');
    });
  });
  
  describe('searchKnowledgeWithExpansion Integration', () => {
    
    it('should use knowledge service when available', async () => {
      const mockKnowledgeService = {
        getKnowledge: mock().mockResolvedValue([
          { content: { text: 'Mock wiki result' }, similarity: 0.8 }
        ])
      };
      
      const mockRuntime = {
        getService: mock().mockReturnValue(mockKnowledgeService),
        searchMemories: mock(),
      } as any;
      
      const results = await searchKnowledgeWithExpansion(mockRuntime, 'test query', 'room123');
      
      expect(mockKnowledgeService.getKnowledge).toHaveBeenCalled();
      expect(mockRuntime.searchMemories).not.toHaveBeenCalled();
      expect(results.length).toBeGreaterThan(0);
    });
    
    it('should fallback to searchMemories when knowledge service unavailable', async () => {
      const mockRuntime = {
        getService: mock().mockReturnValue(null),
        searchMemories: mock().mockResolvedValue([
          { content: { text: 'Fallback result' }, similarity: 0.7 }
        ])
      } as any;
      
      const results = await searchKnowledgeWithExpansion(mockRuntime, 'test query', 'room123');
      
      expect(mockRuntime.searchMemories).toHaveBeenCalled();
      expect(results.length).toBeGreaterThan(0);
    });
    
    it('should handle knowledge service errors gracefully', async () => {
      const mockKnowledgeService = {
        getKnowledge: mock().mockRejectedValue(new Error('Service error'))
      };
      
      const mockRuntime = {
        getService: mock().mockReturnValue(mockKnowledgeService),
        searchMemories: mock().mockResolvedValue([])
      } as any;
      
      const results = await searchKnowledgeWithExpansion(mockRuntime, 'test query', 'room123');
      
      // Should not throw, should return empty array
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
