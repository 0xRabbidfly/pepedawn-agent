/**
 * Fake Test Command Tests
 * 
 * Tests the /ft command for image fake appeal scoring
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { fakeTestCommand } from '../../actions/fakeTestCommand';
import type { IAgentRuntime, Memory } from '@elizaos/core';

// Mock dependencies
mock.module('../../utils/visionAnalyzer', () => ({
  analyzeWithVision: mock(() => Promise.resolve({
    analysis: '🎯 **FAKE APPEAL:** 7/10 - Mock scoring',
    tokensIn: 865,
    tokensOut: 200,
    model: 'gpt-4o',
    cost: 0.005,
    duration: 1500,
  })),
}));

mock.module('../../utils/visualEmbeddings', () => ({
  generateEmbeddingFromUrl: mock(() => Promise.resolve([0.1, 0.2, 0.3])),
  interpretSimilarity: mock((similarity: number) => {
    if (similarity >= 0.95) return 'exact';
    if (similarity >= 0.85) return 'high';
    return 'low';
  }),
}));

mock.module('../../utils/embeddingsDb', () => ({
  findMostSimilarCard: mock(() => Promise.resolve({
    asset: 'KARPEPELES',
    imageUrl: 'https://example.com/karpepeles.jpg',
    similarity: 0.30, // Low similarity by default
  })),
}));

mock.module('../../utils/actionLogger', () => ({
  createLogger: mock(() => ({
    info: mock(() => {}),
    success: mock(() => {}),
    error: mock(() => {}),
    warning: mock(() => {}),
    step: mock(() => {}),
    separator: mock(() => {}),
  })),
}));

// Mock fetch for image validation
global.fetch = mock(() => Promise.resolve({
  ok: true,
  statusText: 'OK',
})) as any;

describe('fakeTestCommand', () => {
  let mockRuntime: IAgentRuntime;
  let mockCallback: any;

  beforeEach(() => {
    mockRuntime = {} as IAgentRuntime;
    mockCallback = mock(() => Promise.resolve());
    process.env.REPLICATE_API_TOKEN = 'test-token'; // Enable embedding checks
  });

  describe('validate', () => {
    it('should validate /ft command', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: {
          text: '/ft',
          attachments: [{ url: 'https://example.com/image.jpg' }],
        },
      } as any;

      const result = await fakeTestCommand.validate?.(mockRuntime, message);
      expect(result).toBe(true);
    });

    it('should handle @mentions', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: {
          text: '@pepedawn_bot /ft',
          attachments: [{ url: 'https://example.com/image.jpg' }],
        },
      } as any;

      const result = await fakeTestCommand.validate?.(mockRuntime, message);
      expect(result).toBe(true);
    });

    it('should not validate other commands', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: {
          text: '/fv CARDNAME',
          attachments: [],
        },
      } as any;

      const result = await fakeTestCommand.validate?.(mockRuntime, message);
      expect(result).toBe(false);
    });
  });

  describe('handler - no attachment', () => {
    it('should require image attachment', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/ft',
          attachments: [],
        },
      } as any;

      const result = await fakeTestCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(false);
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback.mock.calls[0][0].text).toContain('attach image');
    });
  });

  describe('handler - with attachment', () => {
    it('should analyze uploaded image successfully', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/ft',
          attachments: [{
            url: 'https://example.com/test-image.jpg',
            source: 'Photo',
            contentType: 'image/jpeg',
          }],
        },
      } as any;

      const result = await fakeTestCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(true);
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback.mock.calls[0][0].text).toContain('FAKE TEST RESULTS');
    });

    it('should block animations', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/ft',
          attachments: [{
            url: 'https://example.com/test.mp4',
            source: 'Animation',
            contentType: 'video/mp4',
          }],
        },
      } as any;

      const result = await fakeTestCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(false);
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback.mock.calls[0][0].text).toContain('cannot analyze animations');
      expect(mockCallback.mock.calls[0][0].text).toContain('Clip the starter frame');
    });

    it('should handle missing attachment URL', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/ft',
          attachments: [{
            url: null,
            source: 'Photo',
          }],
        },
      } as any;

      const result = await fakeTestCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(false);
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback.mock.calls[0][0].text).toContain('Could not access');
    });
  });

  describe('handler - duplicate detection', () => {
    it('should detect exact match (existing Fake Rare)', async () => {
      const { findMostSimilarCard } = await import('../../utils/embeddingsDb');
      
      // Override mock to return exact match
      (findMostSimilarCard as any).mockResolvedValueOnce({
        asset: 'KARPEPELES',
        imageUrl: 'https://example.com/karpepeles.jpg',
        similarity: 0.96, // Exact match
      });

      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/ft',
          attachments: [{
            url: 'https://example.com/karpepeles-copy.jpg',
            source: 'Photo',
            contentType: 'image/jpeg',
          }],
        },
      } as any;

      const result = await fakeTestCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(true);
      expect(result?.data?.matchType).toBe('exact');
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback.mock.calls[0][0].text).toContain('HA! NICE TRY!');
      expect(mockCallback.mock.calls[0][0].text).toContain('KARPEPELES');
      expect(mockCallback.mock.calls[0][0].text).toContain('10/10');
    });

    it('should detect high similarity (modified card)', async () => {
      const { findMostSimilarCard } = await import('../../utils/embeddingsDb');
      
      // Override mock to return high similarity
      (findMostSimilarCard as any).mockResolvedValueOnce({
        asset: 'KARPEPELES',
        imageUrl: 'https://example.com/karpepeles.jpg',
        similarity: 0.88, // High similarity
      });

      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/ft',
          attachments: [{
            url: 'https://example.com/modified.jpg',
            source: 'Photo',
            contentType: 'image/jpeg',
          }],
        },
      } as any;

      const result = await fakeTestCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(true);
      expect(result?.data?.matchType).toBe('high');
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback.mock.calls[0][0].text).toContain('SNEAKY!');
      expect(mockCallback.mock.calls[0][0].text).toContain('KARPEPELES');
    });

    it('should provide full analysis for low similarity', async () => {
      const { findMostSimilarCard } = await import('../../utils/embeddingsDb');
      
      // Override mock to return low similarity
      (findMostSimilarCard as any).mockResolvedValueOnce({
        asset: 'FREEDOMKEK',
        imageUrl: 'https://example.com/freedomkek.jpg',
        similarity: 0.50, // Low similarity
      });

      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/ft',
          attachments: [{
            url: 'https://example.com/original.jpg',
            source: 'Photo',
            contentType: 'image/jpeg',
          }],
        },
      } as any;

      const result = await fakeTestCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(true);
      expect(mockCallback).toHaveBeenCalled();
      const responseText = mockCallback.mock.calls[0][0].text;
      expect(responseText).toContain('FAKE TEST RESULTS');
      expect(responseText).toContain('CLOSEST MATCH');
      expect(responseText).toContain('FREEDOMKEK');
    });

    it('should continue to LLM if embedding check fails', async () => {
      const { generateEmbeddingFromUrl } = await import('../../utils/visualEmbeddings');
      
      // Make embedding generation fail
      (generateEmbeddingFromUrl as any).mockRejectedValueOnce(new Error('Embedding failed'));

      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/ft',
          attachments: [{
            url: 'https://example.com/image.jpg',
            source: 'Photo',
            contentType: 'image/jpeg',
          }],
        },
      } as any;

      const result = await fakeTestCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      // Should still succeed with LLM analysis
      expect(result?.success).toBe(true);
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback.mock.calls[0][0].text).toContain('FAKE TEST RESULTS');
    });
  });

  describe('handler - error cases', () => {
    it('should handle inaccessible image URL', async () => {
      global.fetch = mock(() => Promise.resolve({
        ok: false,
        statusText: 'Not Found',
      })) as any;

      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/ft',
          attachments: [{
            url: 'https://example.com/404.jpg',
            source: 'Photo',
            contentType: 'image/jpeg',
          }],
        },
      } as any;

      const result = await fakeTestCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(false);
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback.mock.calls[0][0].text).toContain('Could not access');
    });

    it('should include analysis data in successful response', async () => {
      // Reset fetch mock to return success
      global.fetch = mock(() => Promise.resolve({
        ok: true,
        statusText: 'OK',
      })) as any;

      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/ft',
          attachments: [{
            url: 'https://example.com/test.jpg',
            source: 'Photo',
            contentType: 'image/jpeg',
          }],
        },
      } as any;

      const result = await fakeTestCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(true);
      expect(result?.data).toMatchObject({
        analysis: expect.any(String),
        cost: expect.any(Number),
        tokensIn: expect.any(Number),
        tokensOut: expect.any(Number),
        duration: expect.any(Number),
      });
    });
  });

  describe('action metadata', () => {
    it('should have correct action name', () => {
      expect(fakeTestCommand.name).toBe('FAKE_TEST_ANALYSIS');
    });

    it('should have similes', () => {
      expect(fakeTestCommand.similes).toContain('FT');
      expect(fakeTestCommand.similes).toContain('ANALYZE_IMAGE_APPEAL');
    });

    it('should have description', () => {
      expect(fakeTestCommand.description).toContain('appeal');
    });
  });
});

