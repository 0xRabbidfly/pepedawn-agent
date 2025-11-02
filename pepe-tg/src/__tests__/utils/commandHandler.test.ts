import { describe, expect, it, mock } from 'bun:test';
import { executeCommand, executeCommandAlways } from '../../utils/commandHandler';
import type { Action } from '@elizaos/core';

describe('commandHandler', () => {
  const createMockAction = (shouldValidate: boolean = true): Action => ({
    name: 'TEST_ACTION',
    description: 'Test action',
    similes: [],
    examples: [],
    validate: mock().mockResolvedValue(shouldValidate),
    handler: mock().mockResolvedValue({ success: true, text: 'Handled' }),
  });

  const createMockParams = () => ({
    runtime: { agentId: 'test-agent' } as any,
    message: {
      id: 'msg-1',
      roomId: 'room-1',
      content: { text: '/test' },
      metadata: {},
    } as any,
    state: {},
    callback: mock(),
  });

  describe('executeCommand', () => {
    it('should execute action when validation passes', async () => {
      const action = createMockAction(true);
      const params = createMockParams();
      
      const result = await executeCommand(action, params, '/test');
      
      expect(result).toBe(true);
      expect(action.validate).toHaveBeenCalled();
      expect(action.handler).toHaveBeenCalled();
      expect((params.message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should NOT execute action when validation fails', async () => {
      const action = createMockAction(false);
      const params = createMockParams();
      
      const result = await executeCommand(action, params, '/test');
      
      expect(result).toBe(false);
      expect(action.validate).toHaveBeenCalled();
      expect(action.handler).not.toHaveBeenCalled();
      expect((params.message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('should mark message as handled when action succeeds', async () => {
      const action = createMockAction(true);
      const params = createMockParams();
      
      await executeCommand(action, params, '/test');
      
      expect((params.message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should handle validation errors gracefully', async () => {
      const action = createMockAction(true);
      action.validate = mock().mockRejectedValue(new Error('Validation error'));
      const params = createMockParams();
      
      const result = await executeCommand(action, params, '/test');
      
      expect(result).toBe(false);
      expect(action.handler).not.toHaveBeenCalled();
    });

    it('should handle handler errors gracefully', async () => {
      const action = createMockAction(true);
      action.handler = mock().mockRejectedValue(new Error('Handler error'));
      const params = createMockParams();
      
      const result = await executeCommand(action, params, '/test');
      
      // Returns false on error, message NOT marked as handled
      expect(result).toBe(false);
      expect((params.message.metadata as any).__handledByCustom).toBeUndefined();
    });
  });

  describe('executeCommandAlways', () => {
    it('should execute action when validation passes', async () => {
      const action = createMockAction(true);
      const params = createMockParams();
      
      const result = await executeCommandAlways(action, params, '/test');
      
      expect(result).toBe(true);
      expect(action.validate).toHaveBeenCalled();
      expect(action.handler).toHaveBeenCalled();
      expect((params.message.metadata as any).__handledByCustom).toBe(true);
    });

    it('should STILL mark as handled when validation fails', async () => {
      const action = createMockAction(false);
      const params = createMockParams();
      
      const result = await executeCommandAlways(action, params, '/test');
      
      expect(result).toBe(false); // Returns false (validation failed)
      expect(action.validate).toHaveBeenCalled();
      expect(action.handler).not.toHaveBeenCalled();
      expect((params.message.metadata as any).__handledByCustom).toBe(true); // But still marked as handled
    });

    it('should mark as handled even on validation error', async () => {
      const action = createMockAction(true);
      action.validate = mock().mockRejectedValue(new Error('Error'));
      const params = createMockParams();
      
      const result = await executeCommandAlways(action, params, '/test');
      
      expect(result).toBe(false); // Returns false on error
      expect((params.message.metadata as any).__handledByCustom).toBe(true); // But still marked
    });

    it('should mark as handled even on handler error', async () => {
      const action = createMockAction(true);
      action.handler = mock().mockRejectedValue(new Error('Error'));
      const params = createMockParams();
      
      const result = await executeCommandAlways(action, params, '/test');
      
      expect(result).toBe(false); // Returns false on error
      expect((params.message.metadata as any).__handledByCustom).toBe(true); // Still marked (executeCommandAlways marks even on error)
    });
  });

  describe('Difference between executeCommand and executeCommandAlways', () => {
    it('executeCommand should NOT mark as handled on validation failure', async () => {
      const action = createMockAction(false);
      const params = createMockParams();
      
      await executeCommand(action, params, '/test');
      
      expect((params.message.metadata as any).__handledByCustom).toBeUndefined();
    });

    it('executeCommandAlways SHOULD mark as handled on validation failure', async () => {
      const action = createMockAction(false);
      const params = createMockParams();
      
      await executeCommandAlways(action, params, '/test');
      
      expect((params.message.metadata as any).__handledByCustom).toBe(true);
    });
  });

  describe('Command Label Logging', () => {
    it('should pass command label to handler', async () => {
      const action = createMockAction(true);
      const params = createMockParams();
      
      await executeCommand(action, params, '/custom-label');
      
      expect(action.validate).toHaveBeenCalled();
      expect(action.handler).toHaveBeenCalled();
    });
  });
});

