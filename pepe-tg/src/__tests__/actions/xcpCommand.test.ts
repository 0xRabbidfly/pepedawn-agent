/**
 * Tests for /xcp command (XCP Dispenser List)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { xcpCommand } from '../../actions/xcpCommand';
import type { Memory } from '@elizaos/core';
import fs from 'fs';
import path from 'path';

// Test data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'src', 'data');
const TEST_XCP_FILE = path.join(TEST_DATA_DIR, 'xcp-dispensers.json');

// Mock runtime
const mockRuntime = {} as any;

// Helper to create test message
function createMessage(text: string, metadata: any = {}): Memory {
  return {
    id: 'test-id',
    entityId: 'user-id',
    agentId: 'agent-id',
    roomId: 'room-id',
    content: {
      text,
      source: 'telegram',
    },
    metadata,
    createdAt: Date.now(),
  };
}

describe('XCP Command', () => {
  beforeEach(() => {
    // Clean up test file before each test
    if (fs.existsSync(TEST_XCP_FILE)) {
      fs.unlinkSync(TEST_XCP_FILE);
    }
  });

  afterEach(() => {
    // Clean up test file after each test
    if (fs.existsSync(TEST_XCP_FILE)) {
      fs.unlinkSync(TEST_XCP_FILE);
    }
  });

  describe('validate', () => {
    it('should validate /xcp commands', async () => {
      const message = createMessage('/xcp');
      const result = await xcpCommand.validate(mockRuntime, message);
      expect(result).toBe(true);
    });

    it('should validate /xcp with bot mention', async () => {
      const message = createMessage('/xcp@pepedawn_bot');
      const result = await xcpCommand.validate(mockRuntime, message);
      expect(result).toBe(true);
    });

    it('should validate /xcp with content', async () => {
      const message = createMessage('/xcp Some dispenser list');
      const result = await xcpCommand.validate(mockRuntime, message);
      expect(result).toBe(true);
    });

    it('should not validate non-xcp commands', async () => {
      const message = createMessage('/f CARDNAME');
      const result = await xcpCommand.validate(mockRuntime, message);
      expect(result).toBe(false);
    });
  });

  describe('handler - view mode', () => {
    it('should show empty message when no data exists', async () => {
      const message = createMessage('/xcp');
      let responseText = '';

      await xcpCommand.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        async (content) => {
          responseText = content.text || '';
        }
      );

      expect(responseText).toContain('No XCP dispenser list available yet');
    });

    it('should display existing XCP list', async () => {
      // Create test data
      const testData = {
        content: 'Test XCP List\n\nhttps://tokenscan.io/tx/abc123 -- 0.00001 -- 100 XCP',
        lastUpdated: Date.now(),
        updatedBy: 'testuser',
      };
      
      if (!fs.existsSync(TEST_DATA_DIR)) {
        fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(TEST_XCP_FILE, JSON.stringify(testData, null, 2));

      const message = createMessage('/xcp');
      let responseText = '';

      await xcpCommand.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        async (content) => {
          responseText = content.text || '';
        }
      );

      expect(responseText).toContain('Test XCP List');
      expect(responseText).toContain('Last updated by @testuser');
    });
  });

  describe('handler - update mode', () => {
    it('should reject update from unauthorized user', async () => {
      const message = createMessage(
        '/xcp New dispenser list',
        { entityUserName: 'unauthorizeduser', fromId: 999999 }
      );
      let responseText = '';

      await xcpCommand.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        async (content) => {
          responseText = content.text || '';
        }
      );

      expect(responseText).toContain('only authorized users can update');
    });

    it('should accept update from authorized username', async () => {
      const message = createMessage(
        '/xcp Updated List Content',
        { entityUserName: 'Niftyboss1', fromId: 123456 }
      );
      let responseText = '';

      await xcpCommand.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        async (content) => {
          responseText = content.text || '';
        }
      );

      expect(responseText).toContain('updated successfully');
      
      // Verify file was created
      expect(fs.existsSync(TEST_XCP_FILE)).toBe(true);
      
      // Verify content
      const data = JSON.parse(fs.readFileSync(TEST_XCP_FILE, 'utf-8'));
      expect(data.content).toBe('Updated List Content');
      expect(data.updatedBy).toBe('Niftyboss1');
    });

    it('should accept update from admin ID (TELEGRAM_ADMIN_IDS)', async () => {
      // Set env var for test
      const originalAdminIds = process.env.TELEGRAM_ADMIN_IDS;
      process.env.TELEGRAM_ADMIN_IDS = '111111,222222';

      const message = createMessage(
        '/xcp Admin Updated List',
        { entityUserName: 'adminuser', fromId: 111111 }
      );
      let responseText = '';

      await xcpCommand.handler(
        mockRuntime,
        message,
        undefined,
        undefined,
        async (content) => {
          responseText = content.text || '';
        }
      );

      expect(responseText).toContain('updated successfully');
      
      // Verify file was created
      expect(fs.existsSync(TEST_XCP_FILE)).toBe(true);
      
      // Restore env var
      if (originalAdminIds) {
        process.env.TELEGRAM_ADMIN_IDS = originalAdminIds;
      } else {
        delete process.env.TELEGRAM_ADMIN_IDS;
      }
    });

    it('should replace existing list with new content', async () => {
      // Create initial data
      const initialData = {
        content: 'Old Content',
        lastUpdated: Date.now(),
        updatedBy: 'olduser',
      };
      
      if (!fs.existsSync(TEST_DATA_DIR)) {
        fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(TEST_XCP_FILE, JSON.stringify(initialData, null, 2));

      // Update with new content
      const message = createMessage(
        '/xcp New Content',
        { entityUserName: 'Niftyboss1', fromId: 123456 }
      );

      await xcpCommand.handler(mockRuntime, message);

      // Verify old content was replaced
      const data = JSON.parse(fs.readFileSync(TEST_XCP_FILE, 'utf-8'));
      expect(data.content).toBe('New Content');
      expect(data.content).not.toContain('Old Content');
    });
  });
});

