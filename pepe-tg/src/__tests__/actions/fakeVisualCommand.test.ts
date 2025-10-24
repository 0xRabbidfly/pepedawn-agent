/**
 * Fake Visual Command Tests
 * 
 * Tests the /fv command for card visual analysis
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { fakeVisualCommand } from '../../actions/fakeVisualCommand';
import type { IAgentRuntime, Memory } from '@elizaos/core';

// Mock dependencies
mock.module('../../utils/cardIndexRefresher', () => ({
  getCardInfo: mock((cardName: string) => {
    if (cardName === 'FREEDOMKEK') {
      return {
        asset: 'FREEDOMKEK',
        series: 1,
        supply: 300,
        artist: 'Rare Scrilla',
        ext: 'jpg',
      };
    }
    if (cardName === 'WAGMIWORLD') {
      return {
        asset: 'WAGMIWORLD',
        series: 2,
        supply: 100,
        artist: 'Pepenardo',
        ext: 'mp4',
      };
    }
    return null;
  }),
}));

mock.module('../../utils/cardUrlUtils', () => ({
  determineImageUrlForAnalysis: mock((cardInfo: any, cardName: string) => {
    if (!cardInfo) return null;
    if (cardInfo.ext === 'mp4') {
      return `https://fakeraredirectory.com/frs/${cardInfo.series}/${cardName}.jpg`;
    }
    return `https://fakeraredirectory.com/frs/${cardInfo.series}/${cardName}.${cardInfo.ext}`;
  }),
}));

mock.module('../../utils/visionAnalyzer', () => ({
  analyzeWithVision: mock(() => Promise.resolve({
    analysis: 'Mock analysis result',
    tokensIn: 865,
    tokensOut: 200,
    model: 'gpt-4o',
    cost: 0.005,
    duration: 1500,
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

describe('fakeVisualCommand', () => {
  let mockRuntime: IAgentRuntime;
  let mockCallback: any;

  beforeEach(() => {
    mockRuntime = {} as IAgentRuntime;
    mockCallback = mock(() => Promise.resolve());
  });

  describe('validate', () => {
    it('should validate /fv with card name (no attachment)', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: {
          text: '/fv FREEDOMKEK',
          attachments: [],
        },
      } as any;

      const result = await fakeVisualCommand.validate?.(mockRuntime, message);
      expect(result).toBe(true);
    });

    it('should reject /fv without card name', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: {
          text: '/fv',
          attachments: [],
        },
      } as any;

      const result = await fakeVisualCommand.validate?.(mockRuntime, message);
      expect(result).toBe(false);
    });

    it('should reject /fv with attachment', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: {
          text: '/fv FREEDOMKEK',
          attachments: [{ url: 'https://example.com/image.jpg' }],
        },
      } as any;

      const result = await fakeVisualCommand.validate?.(mockRuntime, message);
      expect(result).toBe(false);
    });

    it('should handle @mentions', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        content: {
          text: '@pepedawn_bot /fv FREEDOMKEK',
          attachments: [],
        },
      } as any;

      const result = await fakeVisualCommand.validate?.(mockRuntime, message);
      expect(result).toBe(true);
    });
  });

  describe('handler', () => {
    it('should analyze a valid card successfully', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/fv FREEDOMKEK',
          attachments: [],
        },
      } as any;

      const result = await fakeVisualCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(true);
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback.mock.calls[0][0].text).toContain('MEMETIC ANALYSIS');
      expect(mockCallback.mock.calls[0][0].text).toContain('FREEDOMKEK');
    });

    it('should handle card not found', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/fv NONEXISTENT',
          attachments: [],
        },
      } as any;

      const result = await fakeVisualCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(false);
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback.mock.calls[0][0].text).toContain('not found');
    });

    it('should handle missing card name with helpful error', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/fv',
          attachments: [],
        },
      } as any;

      const result = await fakeVisualCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(false);
      expect(mockCallback).toHaveBeenCalled();
      const errorText = mockCallback.mock.calls[0][0].text;
      expect(errorText).toContain('/fv CARDNAME');
      expect(errorText).toContain('/ft'); // Should suggest /ft for images
    });

    it('should handle animated cards by using static version', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/fv WAGMIWORLD',
          attachments: [],
        },
      } as any;

      const result = await fakeVisualCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(true);
      // Should have analyzed using JPG version
    });

    it('should return analysis data in response', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/fv FREEDOMKEK',
          attachments: [],
        },
      } as any;

      const result = await fakeVisualCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.data).toMatchObject({
        cardName: 'FREEDOMKEK',
        analysis: expect.any(String),
        cost: expect.any(Number),
        tokensIn: expect.any(Number),
        tokensOut: expect.any(Number),
        duration: expect.any(Number),
      });
    });
  });

  describe('command parsing', () => {
    it('should parse card name in uppercase', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/fv freedomkek', // lowercase input
          attachments: [],
        },
      } as any;

      const result = await fakeVisualCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.data?.cardName).toBe('FREEDOMKEK'); // uppercase output
    });

    it('should handle extra whitespace', async () => {
      const message: Memory = {
        id: '1',
        userId: 'user1',
        agentId: 'agent1',
        roomId: 'room1',
        entityId: 'user1',
        content: {
          text: '/fv    FREEDOMKEK   ',
          attachments: [],
        },
      } as any;

      const result = await fakeVisualCommand.handler?.(
        mockRuntime,
        message,
        undefined,
        undefined,
        mockCallback
      );

      expect(result?.success).toBe(true);
    });
  });

  describe('action metadata', () => {
    it('should have correct action name', () => {
      expect(fakeVisualCommand.name).toBe('FAKE_VISUAL_ANALYSIS');
    });

    it('should have similes', () => {
      expect(fakeVisualCommand.similes).toContain('FV');
      expect(fakeVisualCommand.similes).toContain('ANALYZE_CARD_VISUAL');
    });

    it('should have description', () => {
      expect(fakeVisualCommand.description).toContain('vision');
    });
  });
});

