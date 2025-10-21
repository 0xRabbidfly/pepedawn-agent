import { describe, expect, it, beforeEach } from 'bun:test';
import { fakeRaresPlugin } from '../plugins/fakeRaresPlugin';

/**
 * Bootstrap Suppression Logic Tests
 * 
 * These tests ensure the MESSAGE_RECEIVED handler correctly:
 * 1. Suppresses bootstrap when SUPPRESS_BOOTSTRAP=true
 * 2. Allows bootstrap ONLY when:
 *    - User replied to the bot
 *    - Message has capitals (3+ letter word)
 *    - Message mentions @pepedawn_bot
 * 3. Handles /f and /fl commands via custom actions
 */
describe('Bootstrap Suppression Logic', () => {
  const messageHandler = fakeRaresPlugin.events?.MESSAGE_RECEIVED?.[0];

  beforeEach(() => {
    // Reset env var before each test
    delete process.env.SUPPRESS_BOOTSTRAP;
  });

  it('should have MESSAGE_RECEIVED handler', () => {
    expect(messageHandler).toBeDefined();
    expect(typeof messageHandler).toBe('function');
  });

  // ========================================
  // SUPPRESS_BOOTSTRAP=true Tests
  // ========================================

  describe('Global Suppression (SUPPRESS_BOOTSTRAP=true)', () => {
    it('should suppress all messages when SUPPRESS_BOOTSTRAP=true', async () => {
      process.env.SUPPRESS_BOOTSTRAP = 'true';

      const message = {
        id: 'test-1',
        content: { text: 'FREEDOMKEK is amazing' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      // Should mark as handled
      expect(message.metadata).toBeDefined();
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should suppress even with bot mention when SUPPRESS_BOOTSTRAP=true', async () => {
      process.env.SUPPRESS_BOOTSTRAP = 'true';

      const message = {
        id: 'test-2',
        content: { text: '@pepedawn_bot hello' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should suppress even when replying to bot when SUPPRESS_BOOTSTRAP=true', async () => {
      process.env.SUPPRESS_BOOTSTRAP = 'true';

      const message = {
        id: 'test-3',
        content: { 
          text: 'cool thanks',
          inReplyTo: 'bot-message-id' 
        },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });
  });

  // ========================================
  // Bootstrap ALLOWED Tests
  // ========================================

  describe('Bootstrap Allowed (trigger conditions met)', () => {
    it('should allow bootstrap when message has capitalized word (3+ letters)', async () => {
      const message = {
        id: 'test-4',
        content: { text: 'I love FREEDOMKEK' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      // Should NOT mark as handled (let bootstrap process it)
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should allow bootstrap when message mentions @pepedawn_bot', async () => {
      const message = {
        id: 'test-5',
        content: { text: '@pepedawn_bot what is fake rares?' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should allow bootstrap when message is a reply to bot', async () => {
      const message = {
        id: 'test-6',
        content: { 
          text: 'tell me more',
          inReplyTo: 'bot-message-id'
        },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should detect capitalized words with numbers (e.g., WAGMIWORLD, PEPE420)', async () => {
      const message = {
        id: 'test-7',
        content: { text: 'Check out WAGMIWORLD' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });
  });

  // ========================================
  // Bootstrap SUPPRESSED Tests
  // ========================================

  describe('Bootstrap Suppressed (no trigger conditions)', () => {
    it('should suppress casual conversation without caps or mention', async () => {
      const message = {
        id: 'test-8',
        content: { text: 'why are you replying to me' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should suppress short questions', async () => {
      const message = {
        id: 'test-9',
        content: { text: 'what?' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should suppress acknowledgements', async () => {
      const message = {
        id: 'test-10',
        content: { text: 'ok cool' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should suppress messages with only 2-letter caps (e.g., OK, PM)', async () => {
      const message = {
        id: 'test-11',
        content: { text: 'OK thanks' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      // "OK" has only 2 letters, should be suppressed
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should suppress lowercase messages without triggers', async () => {
      const message = {
        id: 'test-12',
        content: { text: 'nice one' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });
  });

  // ========================================
  // Custom Action Tests (/f and /fl)
  // ========================================

  describe('Custom Actions (/f and /fl commands)', () => {
    it('should handle /f commands via custom action', async () => {
      const message = {
        id: 'test-13',
        content: { text: '/f FREEDOMKEK' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {
          agentId: 'test-agent',
        },
        callback: async () => [],
        state: {},
      };

      await messageHandler!(params);

      // /f commands should be marked as handled
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle /fl commands via custom action', async () => {
      const message = {
        id: 'test-14',
        content: { text: '/fl FREEDOMKEK' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {
          agentId: 'test-agent',
        },
        callback: async () => [],
        state: {},
      };

      await messageHandler!(params);

      // /fl commands should be marked as handled
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle /f with @mention prefix', async () => {
      const message = {
        id: 'test-15',
        content: { text: '@pepedawn_bot /f FREEDOMKEK' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {
          agentId: 'test-agent',
        },
        callback: async () => [],
        state: {},
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe('Edge Cases', () => {
    it('should handle empty messages', async () => {
      const message = {
        id: 'test-16',
        content: { text: '' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      // Empty messages should be suppressed
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle messages with only whitespace', async () => {
      const message = {
        id: 'test-17',
        content: { text: '   ' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle null/undefined text gracefully', async () => {
      const message = {
        id: 'test-18',
        content: {},
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      // Should not throw - just run it
      await messageHandler!(params);
      
      // Should suppress (no text = no triggers)
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle multiple capitalized words', async () => {
      const message = {
        id: 'test-19',
        content: { text: 'Both FREEDOMKEK and WAGMIWORLD are amazing' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      // Should allow bootstrap
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should handle mixed case @mention variations', async () => {
      const message = {
        id: 'test-20',
        content: { text: '@PEPEDAWN_BOT hello' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      // Should allow bootstrap (case-insensitive mention)
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });
  });

  // ========================================
  // Regression Tests
  // ========================================

  describe('Regression: Ensure no over-responding', () => {
    it('should NOT respond to "why are you replying to me"', async () => {
      const message = {
        id: 'regression-1',
        content: { text: 'why are you replying to me' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should NOT respond to single word "what?"', async () => {
      const message = {
        id: 'regression-2',
        content: { text: 'what?' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should NOT respond to "ok cool"', async () => {
      const message = {
        id: 'regression-3',
        content: { text: 'ok cool' },
        metadata: {},
      };

      const params = {
        message,
        runtime: {},
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });
  });
});

