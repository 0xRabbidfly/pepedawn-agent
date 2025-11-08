import { describe, it, expect, beforeEach } from 'bun:test';
import { CardDisplayService } from '../../services/CardDisplayService';

describe('CardDisplayService', () => {
  let service: CardDisplayService;
  let mockRuntime: any;

  beforeEach(() => {
    mockRuntime = {
      getSetting: (key: string) => {
        if (key === 'MP4_URL_MAX_MB') return '50';
        if (key === 'GIF_URL_MAX_MB') return '40';
        return undefined;
      },
    };
    service = new CardDisplayService(mockRuntime);
  });

  // checkMediaSize method was removed - size checks now handled by messageManager

  describe('sendCard', () => {
    it('should call callback with correct structure for images', async () => {
      let calledWith: any = null;
      const mockCallback = async (content: any) => {
        calledWith = content;
        return [];
      };

      await service.sendCard({
        callback: mockCallback,
        cardMessage: 'TEST CARD\nS 1 - C 1',
        mediaUrl: 'https://example.com/test.jpg',
        mediaExtension: 'jpg',
        assetName: 'TESTCARD',
      });

      expect(calledWith).toBeTruthy();
      expect(calledWith.text).toBe('TEST CARD\nS 1 - C 1');
      expect(calledWith.attachments).toBeTruthy();
      expect(calledWith.attachments.length).toBe(1);
      expect(calledWith.attachments[0].url).toBe('https://example.com/test.jpg');
      expect(calledWith.__fromAction).toBe('cardDisplay');
      expect(calledWith.suppressBootstrap).toBe(true);
    });

    it('should handle null callback gracefully', async () => {
      // Should not throw
      await service.sendCard({
        callback: null,
        cardMessage: 'TEST',
        mediaUrl: 'https://example.com/test.jpg',
        mediaExtension: 'jpg',
        assetName: 'TEST',
      });
      
      // Test passes if no error thrown
      expect(true).toBe(true);
    });

    it('should include buttons when provided', async () => {
      let calledWith: any = null;
      const mockCallback = async (content: any) => {
        calledWith = content;
        return [];
      };

      const buttons = [
        { text: 'Artist', url: 'https://example.com/artist' },
      ];

      await service.sendCard({
        callback: mockCallback,
        cardMessage: 'TEST CARD',
        mediaUrl: 'https://example.com/test.jpg',
        mediaExtension: 'jpg',
        assetName: 'TESTCARD',
        buttons,
      });

      expect(calledWith.buttons).toBeTruthy();
      expect(calledWith.buttons).toEqual(buttons);
    });
  });

  describe('buildFallbackImageUrls', () => {
    it('should return empty array when cardInfo is null', () => {
      const results = service.buildFallbackImageUrls('TESTCARD', null, 'fake-rares');
      expect(results).toEqual([]);
    });

    it('should include imageUri when available', () => {
      const cardInfo: any = {
        asset: 'TESTCARD',
        series: 1,
        ext: 'jpg',
        imageUri: 'https://custom.com/test.jpg',
      };

      const results = service.buildFallbackImageUrls('TESTCARD', cardInfo, 'fake-rares');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].url).toBe('https://custom.com/test.jpg');
      expect(results[0].contentType).toBe('image/jpeg');
    });

    it('should generate S3 URLs for different extensions', () => {
      const cardInfo: any = {
        asset: 'TESTCARD',
        series: 5,
        ext: 'jpg',
      };

      const results = service.buildFallbackImageUrls('TESTCARD', cardInfo, 'fake-rares');
      
      // Should include jpg, png, webp variants
      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results.some(r => r.url.includes('.jpg'))).toBe(true);
      expect(results.some(r => r.url.includes('.png'))).toBe(true);
      expect(results.some(r => r.url.includes('.webp'))).toBe(true);
    });

    it('should use correct base URL for different collections', () => {
      const cardInfo: any = {
        asset: 'TESTCARD',
        series: 1,
        ext: 'jpg',
      };

      const fakeRaresUrls = service.buildFallbackImageUrls('TESTCARD', cardInfo, 'fake-rares');
      const fakeCommonsUrls = service.buildFallbackImageUrls('TESTCARD', cardInfo, 'fake-commons');
      const rarePepesUrls = service.buildFallbackImageUrls('TESTCARD', cardInfo, 'rare-pepes');

      expect(fakeRaresUrls[0].url).toContain('fake-rares');
      expect(fakeCommonsUrls[0].url).toContain('fake-commons');
      expect(rarePepesUrls[0].url).toContain('rare-pepes');
    });
  });

  describe('service lifecycle', () => {
    it('should stop gracefully', async () => {
      // Stop service
      await service.stop();
      
      // If no error, test passes
      expect(true).toBe(true);
    });
  });
});

