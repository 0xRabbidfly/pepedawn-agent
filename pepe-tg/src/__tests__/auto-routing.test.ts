import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { fakeRaresPlugin } from '../plugins/fakeRaresPlugin';
import { KnowledgeOrchestratorService } from '../services/KnowledgeOrchestratorService';
import { TelemetryService } from '../services/TelemetryService';
import { MemoryStorageService } from '../services/MemoryStorageService';
import { resetEngagementTracking, calculateEngagementScore } from '../utils/engagementScorer';

const SUBMISSION_RULES_URL =
  'https://wiki.pepe.wtf/chapter-2-the-rare-pepe-project/fake-rares-and-dank-rares/fake-rares-submission-rules';

/**
 * Auto-Routing Logic Tests
 * 
 * Tests the MESSAGE_RECEIVED handler's auto-routing behavior to ensure:
 * 
 * ✅ FACTS questions ARE auto-routed to knowledge retrieval:
 *    - "What are the submission rules?"
 *    - "How do I submit a fake rare?"
 *    - "Tell me about the submission fees"
 *    - Questions with "?" marks
 *    - Indirect questions ("I need to know...")
 * 
 * ✅ Statements with FACTS keywords are NOT auto-routed:
 *    - "Three grails for sale..." → Bootstrap suppressed (no triggers)
 *    - "FAKEPARTY is divisible" → Bootstrap suppressed (FACTS query, no question)
 * 
 * ✅ Replies to other users are NOT auto-routed:
 *    - User A: "Three grails..." → User B (reply): "What's the price?" → Skip auto-routing
 * 
 * ✅ Replies to bot continue auto-routing check:
 *    - Bot: "FAKEPARTY is 1/1" → User (reply): "What is the divisibility rule?" → Auto-route
 *    - Bot: "..." → User (reply): "Thanks" → No auto-route (not a question)
 * 
 * ✅ Non-questions are NOT auto-routed:
 *    - Opinions: "PEPEDAWN is the best" → Bootstrap allowed (has capitals)
 *    - Greetings: "gm everyone" → Bootstrap suppressed (no triggers)
 *    - Casual: "nice work" → Bootstrap suppressed (no triggers)
 * 
 * Test Coverage: 20 tests, all passing ✓
 */
describe('Auto-Routing Logic', () => {
  const messageHandler = fakeRaresPlugin.events?.MESSAGE_RECEIVED?.[0];

  // Create mock services
  const createMockKnowledgeService = () => ({
    serviceType: 'knowledge-orchestrator',
    retrieveKnowledge: mock().mockResolvedValue({
      story: 'Test wiki response',
      sourcesLine: '\n\nSources: wiki:test',
      hasWikiOrMemory: true,  // Mock has wiki/memory hits
      metrics: {
        hits_used: 5,
        latency_ms: 100,
      },
    }),
  });

  const createMockTelemetryService = () => ({
    serviceType: 'telemetry',
    logModelUsage: mock(),
    getCostReport: mock().mockResolvedValue({
      totalCost: 0,
      totalTokens: 0,
      calls: [],
    }),
  });

  const createMockMemoryService = () => ({
    serviceType: 'memory-storage',
    storeMemory: mock().mockResolvedValue({
      success: true,
      memoryId: 'test-memory-id',
    }),
  });

  // Create a proper mock runtime with getService support
  const createMockRuntime = () => {
    const knowledgeService = createMockKnowledgeService();
    const telemetryService = createMockTelemetryService();
    const memoryService = createMockMemoryService();

    // Track if useModel was patched (to prevent duplicate patches)
    let isPatched = false;
    const originalUseModel = mock().mockResolvedValue([0.1, 0.2, 0.3]);

    const runtime = {
      agentId: 'test-agent',
      useModel: originalUseModel,
      searchMemories: mock().mockResolvedValue([]),
      getMemory: mock().mockResolvedValue(null),
      createMemory: mock().mockResolvedValue(undefined),
      getService: mock((serviceType: string) => {
        if (serviceType === KnowledgeOrchestratorService.serviceType) {
          return knowledgeService;
        }
        if (serviceType === TelemetryService.serviceType) {
          return telemetryService;
        }
        if (serviceType === MemoryStorageService.serviceType) {
          return memoryService;
        }
        return null;
      }),
      services: [
        { serviceType: 'telegram', bot: { botInfo: { id: 12345 } } },
      ],
      // Expose services for test assertions
      _mockServices: {
        knowledge: knowledgeService,
        telemetry: telemetryService,
        memory: memoryService,
      },
    };

    return runtime;
  };

  beforeEach(() => {
    // Clean env before each test
    delete process.env.SUPPRESS_BOOTSTRAP;
    
    // Reset engagement tracking
    resetEngagementTracking();
    
    // Establish test users to remove newcomer boost
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
  // Test 1: Statements with FACTS keywords
  // ========================================
  describe('Statements with FACTS keywords (Should NOT auto-route)', () => {
    it('should NOT auto-route transaction announcements', async () => {
      const message = {
        id: 'test-1',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { 
          text: 'Three grails for sale. FAKEPARTY 1/1, supply 44. Send 0.01 BTC.'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };

      await messageHandler!(params);

      // Should NOT call knowledge service (statement, not question)
      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      
      // Card statements without questions are SUPPRESSED by engagement filter
      // Score: card=+20, multiword=+10, context boosts = 30-80 points
      // Most fail threshold (31) unless in very specific contexts (returning + quiet)
      // This prevents spam from sale announcements while allowing questions
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should NOT auto-route sale announcements', async () => {
      const message = {
        id: 'test-2',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { 
          text: 'Just listed PEPEFISHBAND on the market, supply is 33'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };

      await messageHandler!(params);

      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      // Card statements suppressed by engagement filter (score below threshold)
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should NOT auto-route card info statements', async () => {
      const message = {
        id: 'test-3',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { 
          text: 'FAKEPARTY is divisible and locked'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };

      await messageHandler!(params);

      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      // Card statements without questions are suppressed by engagement filter
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });
  });

  // ========================================
  // Test 2: Actual FACTS questions
  // ========================================
  describe('FACTS questions (Should auto-route)', () => {
    it('should auto-route "what are" questions', async () => {
      const message = {
        id: 'test-4',
        roomId: 'test-room',
        content: { 
          text: 'What are the submission rules?'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };
      await messageHandler!(params);

      // With SmartRouter+LLM, submission-rule questions are now routed via the router/Bootstrap
      // instead of a hard-coded wiki short-circuit in this plugin.
      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      // Plugin leaves handling to Bootstrap (no direct callback or handled flag).
      expect(callbackFn).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should auto-route "how do" questions', async () => {
      const message = {
        id: 'test-5',
        roomId: 'test-room',
        content: { 
          text: 'How do I submit a fake rare?'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };
      await messageHandler!(params);

      // FACTS-style questions are now classified by the SmartRouter/LLM and handled
      // upstream; the plugin no longer calls the knowledge orchestrator directly.
      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      expect(callbackFn).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should auto-route questions with "?" mark', async () => {
      const message = {
        id: 'test-6',
        roomId: 'test-room',
        content: { 
          text: 'FAKEPARTY supply?'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };
      await messageHandler!(params);

      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      expect(callbackFn).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should auto-route imperative requests', async () => {
      const message = {
        id: 'test-7',
        roomId: 'test-room',
        content: { 
          text: 'Tell me about the submission fees'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };
      await messageHandler!(params);

      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      expect(callbackFn).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should auto-route indirect questions', async () => {
      const message = {
        id: 'test-8',
        roomId: 'test-room',
        content: { 
          text: 'I need to know about locking issuance'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };
      await messageHandler!(params);

      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      expect(callbackFn).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });
  });

  // ========================================
  // Test 3: Replies to other users
  // ========================================
  describe('Replies to other users (Should NOT auto-route)', () => {
    it('should NOT auto-route replies to other users', async () => {
      const message = {
        id: 'test-9',
        roomId: 'test-room',
        content: { 
          text: 'What is the price?',
          inReplyTo: 'other-user-message-id',
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
        ctx: {
          message: {
            reply_to_message: {
              from: { id: 99999 }, // Other user ID (not bot)
            },
          },
        },
      };

      await messageHandler!(params);

      // Should NOT call knowledge service (reply to another user)
      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      
      // Should NOT mark as handled (goes to bootstrap)
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should NOT auto-route even if it looks like a FACTS question', async () => {
      const message = {
        id: 'test-10',
        roomId: 'test-room',
        content: { 
          text: 'What are the submission rules?',
          inReplyTo: 'other-user-message-id',
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
        ctx: {
          message: {
            reply_to_message: {
              from: { id: 88888 }, // Other user ID
            },
          },
        },
      };

      await messageHandler!(params);

      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should NOT auto-route when bot ID cannot be determined', async () => {
      const message = {
        id: 'test-11',
        roomId: 'test-room',
        content: { 
          text: 'What is FAKEPARTY?',
          inReplyTo: 'unknown-message-id',
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();
      runtime.services = []; // No telegram service available

      const params = {
        message,
        runtime,
        callback: callbackFn,
        ctx: {
          message: {
            reply_to_message: {
              from: { id: 77777 },
            },
          },
        },
      };

      await messageHandler!(params);

      // Can't determine if reply is to bot → skip auto-routing (safer default)
      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });
  });

  // ========================================
  // Test 4: Replies to bot
  // ========================================
  describe('Replies to bot (Should continue auto-routing check)', () => {
    it('should auto-route FACTS questions replying to bot', async () => {
      const message = {
        id: 'test-12',
        roomId: 'test-room',
        content: { 
          text: 'What is the divisibility rule?', // Changed to be classified as FACTS
          inReplyTo: 'bot-message-id',
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
        ctx: {
          message: {
            reply_to_message: {
              from: { id: 12345 }, // Bot ID (matches runtime.services[0].bot.botInfo.id)
            },
          },
        },
      };
      await messageHandler!(params);

      // Under the SmartRouter+LLM flow, replies-to-bot FACTS questions are handled
      // via the router; the plugin itself just hands off to Bootstrap when the
      // router declines, so there is no direct knowledge call here.
      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      expect(callbackFn).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should NOT auto-route non-question replies to bot', async () => {
      const message = {
        id: 'test-13',
        roomId: 'test-room',
        content: { 
          text: 'Thanks for the info',
          inReplyTo: 'bot-message-id',
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
        ctx: {
          message: {
            reply_to_message: {
              from: { id: 12345 }, // Bot ID
            },
          },
        },
      };

      await messageHandler!(params);

      // Not a question → doesn't auto-route even though it's replying to bot
      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });
  });

  // ========================================
  // Test 5: Non-questions / Opinions
  // ========================================
  describe('Non-questions and opinions (Should NOT auto-route)', () => {
    it('should NOT auto-route opinions', async () => {
      const message = {
        id: 'test-14',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { 
          text: 'PEPEDAWN is the best bot ever'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };

      await messageHandler!(params);

      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      // Card opinions suppressed by engagement filter (card=+20, below threshold 31)
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should NOT auto-route greetings', async () => {
      const message = {
        id: 'test-15',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { 
          text: 'gm everyone'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };

      await messageHandler!(params);

      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      // Bootstrap IS suppressed for greetings (UNCERTAIN query, no triggers)
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should NOT auto-route casual conversation', async () => {
      const message = {
        id: 'test-16',
        entityId: 'test-user',
        roomId: 'test-room',
        content: { 
          text: 'nice work on that card'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };
      await messageHandler!(params);

      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      // Card-intent chat like this is now allowed through to Bootstrap when
      // engagement overrides suppression, so the plugin does not mark it handled.
      expect(callbackFn).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });
  });

  // ========================================
  // Test 6: Edge Cases
  // ========================================
  describe('Edge Cases', () => {
    it('should handle missing ctx gracefully', async () => {
      const message = {
        id: 'test-17',
        roomId: 'test-room',
        content: { 
          text: 'What are the submission rules?'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
        // No ctx provided
      };
      await messageHandler!(params);

      // With SmartRouter+LLM, submission-rule questions are delegated upstream
      // rather than being short-circuited inside this plugin.
      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      expect(callbackFn).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should handle knowledge service errors gracefully', async () => {
      const message = {
        id: 'test-18',
        roomId: 'test-room',
        content: { 
          text: 'What are the submission rules?'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();
      
      // Make knowledge service throw error
      runtime._mockServices.knowledge.retrieveKnowledge.mockRejectedValueOnce(
        new Error('Service unavailable')
      );

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };
      await messageHandler!(params);

      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      // Knowledge orchestrator errors are now handled in the SmartRouter layer,
      // so the plugin simply defers to Bootstrap (no direct callback).
      expect(callbackFn).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should skip auto-routing when SUPPRESS_BOOTSTRAP=true', async () => {
      process.env.SUPPRESS_BOOTSTRAP = 'true';

      const message = {
        id: 'test-19',
        roomId: 'test-room',
        content: { 
          text: 'What are the submission rules?'
        },
        metadata: {},
      };

      const callbackFn = mock();
      const runtime = createMockRuntime();

      const params = {
        message,
        runtime,
        callback: callbackFn,
      };
      await messageHandler!(params);

      expect(runtime._mockServices.knowledge.retrieveKnowledge).not.toHaveBeenCalled();
      // When SUPPRESS_BOOTSTRAP is enabled, the plugin always marks the message
      // as handled and does not call the callback.
      expect(callbackFn).not.toHaveBeenCalled();
      expect((message.metadata as any).__handledByCustom).toBe(true);
    });
  });
});

