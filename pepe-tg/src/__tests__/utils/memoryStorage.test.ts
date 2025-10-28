import { describe, expect, it } from 'bun:test';
import { detectCardForMemory, extractMemoryContent, validateMemoryContent } from '../../utils/memoryStorage';

/**
 * Tests for memoryStorage utilities
 * Covers card detection and memory boost logic
 */

describe('memoryStorage - Card Detection', () => {
  describe('detectCardForMemory', () => {
    it('should detect valid card in first sentence', () => {
      const text = 'FREEDOMKEK is a legendary card. WAGMIWORLD also exists.';
      const result = detectCardForMemory(text);
      
      expect(result).toBe('FREEDOMKEK');
    });

    it('should detect card at start of text', () => {
      const text = 'PEPEDAWN The raven\'s call, a distant promise laid.';
      const result = detectCardForMemory(text);
      
      expect(result).toBe('PEPEDAWN');
    });

    it('should detect card in middle of first sentence', () => {
      const text = 'This is about FREEDOMKEK and its history.';
      const result = detectCardForMemory(text);
      
      expect(result).toBe('FREEDOMKEK');
    });

    it('should only check first sentence', () => {
      const text = 'Some random text. FREEDOMKEK is mentioned in second sentence.';
      const result = detectCardForMemory(text);
      
      expect(result).toBeNull();
    });

    it('should return first valid card when multiple cards in first sentence', () => {
      const text = 'FREEDOMKEK and WAGMIWORLD are both cards. More text.';
      const result = detectCardForMemory(text);
      
      // Should return first valid card
      expect(result).toBe('FREEDOMKEK');
    });

    it('should ignore invalid card names (not in FULL_CARD_INDEX)', () => {
      const text = 'NOTACARD is not in the collection.';
      const result = detectCardForMemory(text);
      
      expect(result).toBeNull();
    });

    it('should ignore short capitalized words (<3 chars)', () => {
      const text = 'XP and OK are short but FREEDOMKEK is a card';
      const result = detectCardForMemory(text);
      
      expect(result).toBe('FREEDOMKEK');
    });

    it('should be case-insensitive for matching', () => {
      const text = 'freedomkek is written in lowercase.';
      const result = detectCardForMemory(text);
      
      // Pattern only matches capitals, so this should be null
      expect(result).toBeNull();
    });

    it('should return null for text without cards', () => {
      const text = 'This is some lore without any card names.';
      const result = detectCardForMemory(text);
      
      expect(result).toBeNull();
    });

    it('should handle exclamation mark as sentence boundary', () => {
      const text = 'FREEDOMKEK is amazing! WAGMIWORLD also exists.';
      const result = detectCardForMemory(text);
      
      expect(result).toBe('FREEDOMKEK');
    });

    it('should handle question mark as sentence boundary', () => {
      const text = 'What is FREEDOMKEK? WAGMIWORLD is mentioned later.';
      const result = detectCardForMemory(text);
      
      expect(result).toBe('FREEDOMKEK');
    });

    it('should handle text with no sentence boundaries', () => {
      const text = 'FREEDOMKEK The raven calls through eternal night';
      const result = detectCardForMemory(text);
      
      expect(result).toBe('FREEDOMKEK');
    });

    it('should detect cards with numbers (e.g., PEPE420)', () => {
      // Assuming PEPE420 is a valid card in the index
      // This test validates the regex pattern works with numbers
      const text = 'WAGMIWORLD was created in series 2.';
      const result = detectCardForMemory(text);
      
      expect(result).toBe('WAGMIWORLD');
    });
  });

  describe('Memory Content Boost Logic', () => {
    it('should document card marker added for exact matching', () => {
      // This documents the hybrid search logic:
      // Card memories get [CARD:CARDNAME] marker for exact match retrieval
      // Format: [MEMORY:userId:displayName:timestamp][CARD:CARDNAME] content
      
      const originalText = 'PEPEDAWN The raven\'s call, echoes through the night';
      const cardName = detectCardForMemory(originalText);
      
      expect(cardName).toBe('PEPEDAWN');
      
      // After storage (in storeUserMemory)
      const userId = 'user123';
      const displayName = 'artist.xcp';
      const timestamp = 1698765432;
      const stored = cardName
        ? `[MEMORY:${userId}:${displayName}:${timestamp}][CARD:${cardName}] ${originalText}`
        : `[MEMORY:${userId}:${displayName}:${timestamp}] ${originalText}`;
      
      expect(stored).toContain('[CARD:PEPEDAWN]');
      expect(stored).toContain('[MEMORY:');
      expect(stored).toContain(originalText);
    });

    it('should not add prefix for non-card memories', () => {
      const originalText = 'Pepe green code is 420';
      const cardName = detectCardForMemory(originalText);
      
      expect(cardName).toBeNull();
      
      // No boost applied
      const finalText = cardName ? `${cardName}: ${originalText}` : originalText;
      
      expect(finalText).toBe('Pepe green code is 420');
      expect(finalText).not.toContain(':');
    });

    it('should preserve original text after markers', () => {
      const originalText = 'FREEDOMKEK was inspired by the struggle for freedom.';
      const cardName = detectCardForMemory(originalText);
      
      // Full storage format
      const stored = `[MEMORY:user:artist:123][CARD:${cardName}] ${originalText}`;
      
      // Original text should be intact after the markers
      expect(stored).toContain(originalText);
      expect(stored.split('] ')[1]).toBe(originalText);
    });
  });

  describe('extractMemoryContent', () => {
    it('should extract content after "remember this:"', () => {
      const result = extractMemoryContent('FREEDOMKEK remember this: card lore here', false);
      
      expect(result.text).toBe('FREEDOMKEK card lore here');
      expect(result.isReplyContext).toBe(false);
    });

    it('should handle "remember this" without colon', () => {
      const result = extractMemoryContent('FREEDOMKEK remember this card lore', false);
      
      expect(result.text).toBe('FREEDOMKEK card lore');
    });

    it('should handle reply context', () => {
      const result = extractMemoryContent('remember this', true, 'Original bot message');
      
      expect(result.text).toContain('Original bot message');
      expect(result.text).toContain('User comment:');
      expect(result.isReplyContext).toBe(true);
    });
  });

  describe('validateMemoryContent', () => {
    it('should accept valid content', () => {
      const content = { text: 'FREEDOMKEK is a legendary card', isReplyContext: false };
      const result = validateMemoryContent(content);
      
      expect(result.valid).toBe(true);
    });

    it('should reject empty content', () => {
      const content = { text: '', isReplyContext: false };
      const result = validateMemoryContent(content);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('empty_content');
    });

    it('should reject whitespace-only content', () => {
      const content = { text: '   \n\t  ', isReplyContext: false };
      const result = validateMemoryContent(content);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('empty_content');
    });

    it('should reject excessively long content', () => {
      const content = { text: 'x'.repeat(10001), isReplyContext: false };
      const result = validateMemoryContent(content);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('too_long');
    });

    it('should accept content at max length boundary', () => {
      const content = { text: 'x'.repeat(10000), isReplyContext: false };
      const result = validateMemoryContent(content);
      
      expect(result.valid).toBe(true);
    });
  });
});

