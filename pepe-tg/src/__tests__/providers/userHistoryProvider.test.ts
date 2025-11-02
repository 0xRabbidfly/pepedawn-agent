import { describe, expect, it } from 'bun:test';
import { userHistoryProvider } from '../../providers/userHistoryProvider';

/**
 * userHistoryProvider Tests
 * 
 * This provider is tested primarily through integration tests.
 * Basic contract tests ensure it doesn't crash and returns strings.
 */
describe('userHistoryProvider', () => {
  const createMockRuntime = (mockMessages: any[] = []) => {
    return {
      agentId: 'bot-123',
      searchMemories: async () => mockMessages,
      logger: {
        error: () => {},
        info: () => {},
        debug: () => {},
        warn: () => {},
      },
    } as any;
  };

  const createMessage = (entityId: string, text: string) => ({
    id: `msg-${Date.now()}`,
    roomId: 'test-room',
    entityId,
    content: {
      text,
      metadata: { username: 'testuser' },
    },
    type: 'messages',
  } as any);

  describe('Basic Contract', () => {
    it('should return a string', async () => {
      const runtime = createMockRuntime();
      const message = createMessage('user-1', 'hello');
      
      const context = await userHistoryProvider.get(runtime, message);
      
      expect(typeof context).toBe('string');
    });

    it('should return empty string for bot messages', async () => {
      const runtime = createMockRuntime();
      const botMessage = createMessage('bot-123', 'hello');
      
      const context = await userHistoryProvider.get(runtime, botMessage);
      
      expect(context).toBe('');
    });

    it('should return empty string for new users (<3 messages)', async () => {
      const runtime = createMockRuntime([
        { entityId: 'user-1', content: { text: 'hi' }, type: 'messages' },
        { entityId: 'user-1', content: { text: 'hello' }, type: 'messages' },
      ]);
      
      const message = createMessage('user-1', 'what is PEPEDAWN?');
      const context = await userHistoryProvider.get(runtime, message);
      
      expect(context).toBe('');
    });

    it('should generate context for active users (3+ messages)', async () => {
      const runtime = createMockRuntime([
        { entityId: 'user-1', content: { text: 'hi', metadata: { username: 'alice' } }, type: 'messages' },
        { entityId: 'user-1', content: { text: 'what is PEPEDAWN', metadata: { username: 'alice' } }, type: 'messages' },
        { entityId: 'user-1', content: { text: 'tell me about FREEDOMKEK', metadata: { username: 'alice' } }, type: 'messages' },
        { entityId: 'user-1', content: { text: 'PEPEDAWN again', metadata: { username: 'alice' } }, type: 'messages' },
      ]);
      
      const message = createMessage('user-1', 'hey');
      const context = await userHistoryProvider.get(runtime, message);
      
      expect(typeof context).toBe('string');
      expect(context.length).toBeGreaterThan(0);
    });

    it('should count card mentions correctly', async () => {
      const runtime = createMockRuntime([
        { entityId: 'user-1', content: { text: 'PEPEDAWN', metadata: { username: 'bob' } }, type: 'messages' },
        { entityId: 'user-1', content: { text: 'PEPEDAWN is cool', metadata: { username: 'bob' } }, type: 'messages' },
        { entityId: 'user-1', content: { text: 'what about PEPEDAWN?', metadata: { username: 'bob' } }, type: 'messages' },
        { entityId: 'user-1', content: { text: 'FREEDOMKEK', metadata: { username: 'bob' } }, type: 'messages' },
      ]);
      
      const message = createMessage('user-1', 'hey');
      const context = await userHistoryProvider.get(runtime, message);
      
      // PEPEDAWN mentioned 3x, FREEDOMKEK 1x
      expect(context).toContain('PEPEDAWN');
      expect(context).toContain('3x');
    });

    it('should not crash with many messages', async () => {
      const runtime = createMockRuntime(
        Array(60).fill(null).map(() => ({ 
          entityId: 'user-regular', 
          content: { text: 'test', metadata: { username: 'regular' } }, 
          type: 'messages' 
        }))
      );
      
      const message = createMessage('user-regular', 'hi');
      const context = await userHistoryProvider.get(runtime, message);
      
      expect(typeof context).toBe('string');
    });

    it('should return string within reasonable length', async () => {
      const messages = [];
      for (let i = 0; i < 50; i++) {
        messages.push({
          entityId: 'user-1',
          content: { 
            text: `PEPEDAWN FREEDOMKEK WAGMIWORLD FAKEPARTY card ${i}`, 
            metadata: { username: 'spammer' } 
          },
          type: 'messages'
        });
      }
      
      const runtime = createMockRuntime(messages);
      const message = createMessage('user-1', 'short question');
      const context = await userHistoryProvider.get(runtime, message);
      
      // Should be reasonable length (tested in integration, not mocked)
      expect(typeof context).toBe('string');
      expect(context.length).toBeLessThanOrEqual(300);
    });
  });

  describe('Error Handling', () => {
    it('should return empty string on error', async () => {
      const runtime = {
        agentId: 'bot-123',
        searchMemories: async () => { throw new Error('DB error'); },
        logger: {
          error: () => {},
          info: () => {},
          debug: () => {},
          warn: () => {},
        },
      } as any;
      
      const message = createMessage('user-1', 'test');
      const context = await userHistoryProvider.get(runtime, message);
      
      expect(context).toBe('');
    });
  });

  describe('Context Filtering', () => {
    it('should only include messages from the requesting user', async () => {
      const runtime = createMockRuntime([
        { entityId: 'user-1', content: { text: 'PEPEDAWN', metadata: { username: 'alice' } }, type: 'messages' },
        { entityId: 'user-2', content: { text: 'FREEDOMKEK', metadata: { username: 'bob' } }, type: 'messages' },
        { entityId: 'user-1', content: { text: 'WAGMIWORLD', metadata: { username: 'alice' } }, type: 'messages' },
        { entityId: 'bot-123', content: { text: 'response', metadata: { username: 'bot' } }, type: 'messages' },
        { entityId: 'user-1', content: { text: 'KEKGRAM', metadata: { username: 'alice' } }, type: 'messages' },
      ]);
      
      const message = createMessage('user-1', 'test');
      const context = await userHistoryProvider.get(runtime, message);
      
      // Should only mention cards from user-1 (PEPEDAWN, WAGMIWORLD, KEKGRAM)
      expect(context).toContain('alice');
      expect(context).not.toContain('bob');
      expect(context).not.toContain('FREEDOMKEK');
    });
  });
});

