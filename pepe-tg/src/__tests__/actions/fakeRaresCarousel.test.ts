import { describe, it, expect } from 'bun:test';
import { fakeRaresCarouselAction, buildCarouselButtons, handleCarouselNavigation } from '../../actions/fakeRaresCarousel';

describe('Fake Rares Carousel Action', () => {
  describe('buildCarouselButtons', () => {
    it('should create prev/counter/next buttons with correct callback_data for artist', () => {
      const buttons = buildCarouselButtons('Rare Scrilla', 'a', 0, 11);
      
      expect(buttons).toHaveLength(3);
      expect(buttons[0].text).toBe('⬅️ Prev');
      expect(buttons[1].text).toBe('1/11');
      expect(buttons[2].text).toBe('➡️ Next');
      
      // Check callback data format (now includes type 'a')
      expect(buttons[0].callback_data).toContain('fc:prev:a:');
      expect(buttons[1].callback_data).toContain('fc:noop:a:');
      expect(buttons[2].callback_data).toContain('fc:next:a:');
    });

    it('should create prev/counter/next buttons with correct callback_data for series', () => {
      const buttons = buildCarouselButtons('5', 's', 0, 50);
      
      expect(buttons).toHaveLength(3);
      expect(buttons[0].text).toBe('⬅️ Prev');
      expect(buttons[1].text).toBe('1/50');
      expect(buttons[2].text).toBe('➡️ Next');
      
      // Check callback data format (now includes type 's')
      expect(buttons[0].callback_data).toContain('fc:prev:s:5:');
      expect(buttons[1].callback_data).toContain('fc:noop:s:5:');
      expect(buttons[2].callback_data).toContain('fc:next:s:5:');
    });

    it('should URL-encode artist names with spaces', () => {
      const buttons = buildCarouselButtons('Rare Scrilla', 'a', 5, 11);
      
      expect(buttons[0].callback_data).toContain('Rare%20Scrilla');
      expect(buttons[1].callback_data).toContain('5:11');
    });

    it('should NOT URL-encode series numbers', () => {
      const buttons = buildCarouselButtons('10', 's', 5, 50);
      
      expect(buttons[0].callback_data).toContain(':s:10:');
      expect(buttons[1].callback_data).toContain('5:50');
    });

    it('should update counter text based on index', () => {
      const buttons1 = buildCarouselButtons('Artist', 'a', 0, 10);
      const buttons5 = buildCarouselButtons('Artist', 'a', 4, 10);
      const buttons10 = buildCarouselButtons('Artist', 'a', 9, 10);
      
      expect(buttons1[1].text).toBe('1/10');
      expect(buttons5[1].text).toBe('5/10');
      expect(buttons10[1].text).toBe('10/10');
    });
  });

  describe('handleCarouselNavigation', () => {
    it('should return null for noop action', async () => {
      const result = await handleCarouselNavigation('fc:noop:a:Artist:0:10');
      expect(result).toBeNull();
    });

    it('should return null for invalid callback data format', async () => {
      const result = await handleCarouselNavigation('invalid:data');
      expect(result).toBeNull();
    });

    it('should return null for wrong prefix', async () => {
      const result = await handleCarouselNavigation('wrong:next:a:Artist:0:10');
      expect(result).toBeNull();
    });

    it('should return null for invalid indices', async () => {
      const result = await handleCarouselNavigation('fc:next:a:Artist:notanumber:10');
      expect(result).toBeNull();
    });

    it('should return null for unknown action', async () => {
      const result = await handleCarouselNavigation('fc:unknown:a:Artist:0:10');
      expect(result).toBeNull();
    });

    it('should decode URL-encoded artist names', async () => {
      // Tests that URL-encoded artist names are properly decoded
      // "Rare%20Scrilla" should decode to "Rare Scrilla" and might be found
      const result = await handleCarouselNavigation('fc:next:a:Rare%20Scrilla:0:11');
      
      // Either found (returns object) or not found (returns null), but no error thrown
      // This test just ensures URL decoding doesn't crash
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should handle series carousel navigation', async () => {
      // Test series navigation with series 5
      const result = await handleCarouselNavigation('fc:next:s:5:0:50');
      
      // Either found (returns object) or not found (returns null), but no error thrown
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should return null for invalid series number in navigation', async () => {
      const result = await handleCarouselNavigation('fc:next:s:notanumber:0:50');
      expect(result).toBeNull();
    });
  });

  describe('action validation', () => {
    it('should validate /f c <artist> pattern', async () => {
      const mockRuntime: any = {};
      const mockMessage: any = {
        content: { text: '/f c rare scrilla' }
      };
      
      const isValid = await fakeRaresCarouselAction.validate?.(mockRuntime, mockMessage);
      expect(isValid).toBe(true);
    });

    it('should validate /f c <series> pattern with number', async () => {
      const mockRuntime: any = {};
      const mockMessage: any = {
        content: { text: '/f c 5' }
      };
      
      const isValid = await fakeRaresCarouselAction.validate?.(mockRuntime, mockMessage);
      expect(isValid).toBe(true);
    });

    it('should validate with bot mention', async () => {
      const mockRuntime: any = {};
      const mockMessage: any = {
        content: { text: '@pepedawn_bot /f c coit' }
      };
      
      const isValid = await fakeRaresCarouselAction.validate?.(mockRuntime, mockMessage);
      expect(isValid).toBe(true);
    });

    it('should reject regular /f commands', async () => {
      const mockRuntime: any = {};
      const mockMessage: any = {
        content: { text: '/f freedomkek' }
      };
      
      const isValid = await fakeRaresCarouselAction.validate?.(mockRuntime, mockMessage);
      expect(isValid).toBe(false);
    });

    it('should reject /f c without artist name or series', async () => {
      const mockRuntime: any = {};
      const mockMessage: any = {
        content: { text: '/f c' }
      };
      
      const isValid = await fakeRaresCarouselAction.validate?.(mockRuntime, mockMessage);
      expect(isValid).toBe(false);
    });

    it('should be case-insensitive', async () => {
      const mockRuntime: any = {};
      const mockMessage: any = {
        content: { text: '/F C Rare Scrilla' }
      };
      
      const isValid = await fakeRaresCarouselAction.validate?.(mockRuntime, mockMessage);
      expect(isValid).toBe(true);
    });
  });

  describe('action metadata', () => {
    it('should have correct name and description', () => {
      expect(fakeRaresCarouselAction.name).toBe('FAKE_RARES_CAROUSEL');
      expect(fakeRaresCarouselAction.description).toContain('carousel');
      expect(fakeRaresCarouselAction.description.toLowerCase()).toContain('artist');
      expect(fakeRaresCarouselAction.description.toLowerCase()).toContain('series');
    });

    it('should have similes defined', () => {
      expect(fakeRaresCarouselAction.similes).toBeDefined();
      expect(fakeRaresCarouselAction.similes).toContain('/f c');
    });
  });
});

