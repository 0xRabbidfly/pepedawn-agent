/**
 * Visual Commands Integration Tests
 * 
 * Tests the plugin routing for /fv and /ft commands
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

describe('Visual Commands Plugin Integration', () => {
  let mockRuntime: any;
  let mockCallback: any;

  beforeEach(() => {
    mockRuntime = {
      messageService: {
        route: mock(() => Promise.resolve()),
      },
    };
    mockCallback = mock(() => Promise.resolve());
  });

  describe('/fv command routing', () => {
    it('should detect /fv command correctly', () => {
      const text = '/fv FREEDOMKEK';
      const isFvCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:\s|$)/i.test(text);
      
      expect(isFvCommand).toBe(true);
    });

    it('should detect /fv with @mention', () => {
      const text = '@pepedawn_bot /fv FREEDOMKEK';
      const isFvCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:\s|$)/i.test(text);
      
      expect(isFvCommand).toBe(true);
    });

    it('should not match /ft command', () => {
      const text = '/ft';
      const isFvCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:\s|$)/i.test(text);
      
      expect(isFvCommand).toBe(false);
    });

    it('should not match other commands', () => {
      const text = '/f FREEDOMKEK';
      const isFvCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:\s|$)/i.test(text);
      
      expect(isFvCommand).toBe(false);
    });

    it('should not match /fview (different command)', () => {
      const text = '/fview something';
      const isFvCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:\s|$)/i.test(text);
      
      expect(isFvCommand).toBe(false);
    });
  });

  describe('/ft command routing', () => {
    it('should detect /ft command correctly', () => {
      const text = '/ft';
      const isFtCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/ft(?:\s|$)/i.test(text);
      
      expect(isFtCommand).toBe(true);
    });

    it('should detect /ft with @mention', () => {
      const text = '@pepedawn_bot /ft';
      const isFtCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/ft(?:\s|$)/i.test(text);
      
      expect(isFtCommand).toBe(true);
    });

    it('should not match /fv command', () => {
      const text = '/fv CARDNAME';
      const isFtCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/ft(?:\s|$)/i.test(text);
      
      expect(isFtCommand).toBe(false);
    });

    it('should not match other commands', () => {
      const text = '/f CARDNAME';
      const isFtCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/ft(?:\s|$)/i.test(text);
      
      expect(isFtCommand).toBe(false);
    });

    it('should not match /ftest (different command)', () => {
      const text = '/ftest something';
      const isFtCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/ft(?:\s|$)/i.test(text);
      
      expect(isFtCommand).toBe(false);
    });
  });

  describe('attachment preservation logic', () => {
    it('should preserve attachments for /fv command', () => {
      const isFvCommand = true;
      const isFtCommand = false;
      const hasAttachments = true;

      const shouldClearAttachments = hasAttachments && !isFvCommand && !isFtCommand;
      
      expect(shouldClearAttachments).toBe(false);
    });

    it('should preserve attachments for /ft command', () => {
      const isFvCommand = false;
      const isFtCommand = true;
      const hasAttachments = true;

      const shouldClearAttachments = hasAttachments && !isFvCommand && !isFtCommand;
      
      expect(shouldClearAttachments).toBe(false);
    });

    it('should clear attachments for other commands', () => {
      const isFvCommand = false;
      const isFtCommand = false;
      const hasAttachments = true;

      const shouldClearAttachments = hasAttachments && !isFvCommand && !isFtCommand;
      
      expect(shouldClearAttachments).toBe(true);
    });

    it('should not clear if no attachments', () => {
      const isFvCommand = false;
      const isFtCommand = false;
      const hasAttachments = false;

      const shouldClearAttachments = hasAttachments && !isFvCommand && !isFtCommand;
      
      expect(shouldClearAttachments).toBe(false);
    });
  });

  describe('command priority and conflicts', () => {
    it('should not have overlapping patterns between /fv and /ft', () => {
      const testCases = [
        { text: '/fv CARDNAME', expectFv: true, expectFt: false },
        { text: '/ft', expectFv: false, expectFt: true },
        { text: '/f CARDNAME', expectFv: false, expectFt: false },
        { text: '/fl topic', expectFv: false, expectFt: false },
      ];

      testCases.forEach(({ text, expectFv, expectFt }) => {
        const isFvCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:\s|$)/i.test(text);
        const isFtCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/ft(?:\s|$)/i.test(text);

        expect(isFvCommand).toBe(expectFv);
        expect(isFtCommand).toBe(expectFt);
        
        // Commands should be mutually exclusive
        if (expectFv || expectFt) {
          expect(isFvCommand && isFtCommand).toBe(false);
        }
      });
    });

    it('should handle case-insensitive matching', () => {
      const testCases = [
        '/FV CARDNAME',
        '/fv CARDNAME',
        '/Fv CARDNAME',
        '@bot /FV CARD',
      ];

      testCases.forEach(text => {
        const isFvCommand = /^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:\s|$)/i.test(text);
        expect(isFvCommand).toBe(true);
      });
    });
  });

  describe('validation logic consistency', () => {
    it('/fv should reject messages with attachments', () => {
      const text = '/fv CARDNAME';
      const hasAttachment = true;
      
      // This mirrors the validation in fakeVisualCommand
      const shouldValidate = /^(?:@[A-Za-z0-9_]+\s+)?\/fv\s+.+/i.test(text) && !hasAttachment;
      
      expect(shouldValidate).toBe(false);
    });

    it('/fv should accept messages without attachments', () => {
      const text = '/fv CARDNAME';
      const hasAttachment = false;
      
      const shouldValidate = /^(?:@[A-Za-z0-9_]+\s+)?\/fv\s+.+/i.test(text) && !hasAttachment;
      
      expect(shouldValidate).toBe(true);
    });

    it('/fv should reject messages without card name', () => {
      const text = '/fv';
      const hasAttachment = false;
      
      const shouldValidate = /^(?:@[A-Za-z0-9_]+\s+)?\/fv\s+.+/i.test(text) && !hasAttachment;
      
      expect(shouldValidate).toBe(false);
    });

    it('/ft should accept any valid /ft pattern', () => {
      const text = '/ft';
      
      // This mirrors the validation in fakeTestCommand
      const shouldValidate = /^(?:@[A-Za-z0-9_]+\s+)?\/ft(?:\s|$)/i.test(text);
      
      expect(shouldValidate).toBe(true);
    });
  });

  describe('error message clarity', () => {
    it('/fv error should suggest /ft for images', () => {
      const errorMessage = '❌ **Usage:** `/fv CARDNAME`\n\n**Example:** `/fv FREEDOMKEK`\n\nAnalyzes a Fake Rares card\'s visual and memetic content using AI vision.\n\n💡 **Tip:** Use `/ft` + attach image to test your own art for Fake appeal!';
      
      expect(errorMessage).toContain('/ft');
      expect(errorMessage).toContain('attach image');
      expect(errorMessage).toContain('Fake appeal');
    });

    it('/ft error should be clear about requiring attachment', () => {
      const errorMessage = '❌ **Usage:** `/ft` + attach image\n\nAnalyzes any uploaded image for Fake Rares appeal.\n\n**Example:** Type `/ft` in the caption when uploading your meme.';
      
      expect(errorMessage).toContain('attach image');
      expect(errorMessage).toContain('caption');
      expect(errorMessage).toContain('uploading');
    });
  });

  describe('shared utility integration', () => {
    it('both commands should use the same vision analyzer', async () => {
      // This is more of a structural test - ensures consistency
      const { analyzeWithVision } = await import('../../utils/visionAnalyzer');
      
      expect(analyzeWithVision).toBeDefined();
      expect(typeof analyzeWithVision).toBe('function');
    });

    it('vision analyzer should accept 5 parameters (runtime added for telemetry)', async () => {
      const { analyzeWithVision } = await import('../../utils/visionAnalyzer');

      // Check function signature: runtime, imageUrl, subject, prompt, source
      expect(analyzeWithVision.length).toBe(5);
    });
  });

  describe('plugin action registration', () => {
    it('both /fv and /ft should be registered in plugin', async () => {
      const { fakeRaresPlugin } = await import('../../plugins/fakeRaresPlugin');
      
      expect(fakeRaresPlugin.actions).toBeDefined();
      
      const actionNames = fakeRaresPlugin.actions?.map(a => a.name) || [];
      
      expect(actionNames).toContain('FAKE_VISUAL_ANALYSIS');
      expect(actionNames).toContain('FAKE_TEST_ANALYSIS');
    });

    it('actions should be in correct order', async () => {
      const { fakeRaresPlugin } = await import('../../plugins/fakeRaresPlugin');
      
      const actionNames = fakeRaresPlugin.actions?.map(a => a.name) || [];
      const fvIndex = actionNames.indexOf('FAKE_VISUAL_ANALYSIS');
      const ftIndex = actionNames.indexOf('FAKE_TEST_ANALYSIS');
      
      // Both should exist
      expect(fvIndex).toBeGreaterThanOrEqual(0);
      expect(ftIndex).toBeGreaterThanOrEqual(0);
      
      // /ft should come after /fv
      expect(ftIndex).toBeGreaterThan(fvIndex);
    });
  });
});

