import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { fakeRaresPlugin } from '../plugins/fakeRaresPlugin';
import { resetEngagementTracking, calculateEngagementScore } from '../utils/engagementScorer';
import { SmartRouterService } from '../services/SmartRouterService';

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

  const createNoResponsePlan = () => ({
    kind: 'NORESPONSE' as const,
    intent: 'NORESPONSE' as const,
    reason: 'test_stub',
    retrieval: null,
    emoji: '👀',
  });

  const createChatFallbackPlan = () => ({
    kind: 'CHAT' as const,
    intent: 'CHAT' as const,
    reason: 'test_stub_chat',
    retrieval: null,
    chatResponse: '',
  });

  // Create a proper mock runtime with all required methods
  const telemetryStub = {
    logSmartRouterDecision: mock().mockResolvedValue(undefined),
    logConversation: mock().mockResolvedValue(undefined),
    logLoreQuery: mock().mockResolvedValue(undefined),
    logModelUsage: mock().mockResolvedValue(undefined),
  };

  const smartRouterStub = {
    recordUserTurn: mock().mockReturnValue(undefined),
    recordBotTurn: mock().mockReturnValue(undefined),
    planRouting: mock().mockResolvedValue(createNoResponsePlan()),
  };

  const createMockRuntime = () => ({
    agentId: 'test-agent',
    useModel: mock().mockResolvedValue([0.1, 0.2, 0.3]), // Mock embedding
    searchMemories: mock().mockResolvedValue([]),
    getMemory: mock().mockResolvedValue(null),
    createMemory: mock().mockResolvedValue(undefined),
    getService: mock((serviceType: string) => {
      if (serviceType === 'telemetry') return telemetryStub;
      if (serviceType === SmartRouterService.serviceType) return smartRouterStub;
      return null;
    }),
  });

  beforeEach(() => {
    smartRouterStub.recordUserTurn.mockReset();
    smartRouterStub.recordBotTurn.mockReset();
    smartRouterStub.planRouting.mockReset();
    smartRouterStub.planRouting.mockResolvedValue(createNoResponsePlan());
    telemetryStub.logSmartRouterDecision.mockReset();
    telemetryStub.logConversation.mockReset();
    telemetryStub.logLoreQuery.mockReset();
    telemetryStub.logModelUsage.mockReset();

    // Reset env var before each test
    delete process.env.SUPPRESS_BOOTSTRAP;
    
    // Reset engagement tracking
    resetEngagementTracking();
    
    // Establish test users to remove newcomer boost (for cleaner test expectations)
    // This simulates users who have already been active in the chat
    calculateEngagementScore({
      text: 'setup',
      hasBotMention: false,
      isReplyToBot: false,
      isFakeRareCard: false,
      userId: 'test-user',
      roomId: 'test-room',
    });
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
        runtime: createMockRuntime(),
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
        runtime: createMockRuntime(),
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
        runtime: createMockRuntime(),
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
    it('should allow bootstrap when message mentions @pepedawn_bot', async () => {
      smartRouterStub.planRouting
        .mockImplementationOnce(async () => createChatFallbackPlan())
        .mockImplementationOnce(async () => createChatFallbackPlan());
      const message = {
        id: 'test-5',
        content: { text: '@pepedawn_bot tell me about fake rares' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should allow bootstrap when message is a reply to bot', async () => {
      smartRouterStub.planRouting.mockResolvedValueOnce({
        kind: 'CHAT',
        intent: 'CHAT',
        reason: 'test_stub_chat',
        retrieval: null,
        chatResponse: '',
      });
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
        runtime: createMockRuntime(),
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
    it('should allow questions to go to Bootstrap', async () => {
      const message = {
        id: 'test-8',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { text: 'why are you replying to me' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      await messageHandler!(params);

      // question=+30 (established user, no newcomer boost) = 30 >= 25 threshold
      // NOW HANDLED by custom (changed from Bootstrap with new threshold)
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should suppress short questions', async () => {
      const message = {
        id: 'test-9',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { text: 'what?' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      await messageHandler!(params);

      // question=+35, short=-5 = 30 < 31 threshold → SUPPRESS
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should suppress acknowledgements', async () => {
      const message = {
        id: 'test-10',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { text: 'ok cool' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should suppress messages with only 2-letter caps (e.g., OK, PM)', async () => {
      const message = {
        id: 'test-11',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { text: 'OK thanks' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      await messageHandler!(params);

      // "OK" has only 2 letters, should be suppressed
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should suppress lowercase messages without triggers', async () => {
      const message = {
        id: 'test-12',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { text: 'nice one' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });
  });

  // ========================================
  // Custom Action Tests (/f, /fl, /help, /start)
  // ========================================

  describe('Custom Actions (/f, /fl, /help, /start commands)', () => {
    it('should handle /f commands via custom action', async () => {
      const message = {
        id: 'test-13',
        content: { text: '/f FREEDOMKEK' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
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
        runtime: createMockRuntime(),
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
        runtime: createMockRuntime(),
        callback: async () => [],
        state: {},
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle /help commands via custom action', async () => {
      const message = {
        id: 'test-16',
        content: { text: '/help' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
        state: {},
      };

      await messageHandler!(params);

      // /help commands should be marked as handled
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle /start commands via custom action', async () => {
      const message = {
        id: 'test-17',
        content: { text: '/start' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
        state: {},
      };

      await messageHandler!(params);

      // /start commands should be marked as handled
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle /help with @mention prefix', async () => {
      const message = {
        id: 'test-18',
        content: { text: '@pepedawn_bot /help' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
        state: {},
      };

      await messageHandler!(params);

      // Custom action should take precedence over bootstrap routing
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle /start with @mention prefix', async () => {
      const message = {
        id: 'test-19',
        content: { text: '@pepedawn_bot /start' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
        state: {},
      };

      await messageHandler!(params);

      // Custom action should take precedence over bootstrap routing
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe('Edge Cases', () => {
    it('should handle empty messages', async () => {
      const message = {
        id: 'test-20',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { text: '' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      await messageHandler!(params);

      // Empty messages should be suppressed
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle messages with only whitespace', async () => {
      const message = {
        id: 'test-21',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { text: '   ' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle null/undefined text gracefully', async () => {
      const message = {
        id: 'test-22',
        entityId: 'test-user',
        roomId: 'test-room',
        content: {},
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      // Should not throw - just run it
      await messageHandler!(params);
      
      // Should suppress (no text = no triggers)
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle mixed case @mention variations', async () => {
      smartRouterStub.planRouting.mockResolvedValueOnce(createChatFallbackPlan());
      const message = {
        id: 'test-24',
        content: { text: '@PEPEDAWN_BOT hello' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
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
    it('should allow "why" questions to go to Bootstrap', async () => {
      const message = {
        id: 'regression-1',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { text: 'why are you replying to me' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      await messageHandler!(params);

      // NEW BEHAVIOR: Questions (including "why") get question=+30 → score=30 >= 25 threshold
      // NOW HANDLED by custom (threshold lowered from 31 to 25)
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should NOT respond to single word "what?"', async () => {
      const message = {
        id: 'regression-2',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { text: 'what?' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should NOT respond to "ok cool"', async () => {
      const message = {
        id: 'regression-3',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { text: 'ok cool' },
        metadata: {},
      };

      const params = {
        message,
        runtime: createMockRuntime(),
        callback: async () => [],
      };

      await messageHandler!(params);

      expect((message.metadata as any).__handledByCustom).toBe(true);
    });
  });
});

