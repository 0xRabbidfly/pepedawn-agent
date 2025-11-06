/**
 * XCP Dispenser List Command
 * 
 * Allows authorized user to update XCP dispenser list
 * and all users to view it.
 */

import type { Action, HandlerCallback, IAgentRuntime, Memory } from '@elizaos/core';
import { logger } from '@elizaos/core';
import fs from 'fs';
import path from 'path';

// Authorized users (Telegram username without @)
const AUTHORIZED_USERNAMES = ['Niftyboss1'];

// Storage file path
const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const XCP_FILE = path.join(DATA_DIR, 'xcp-dispensers.json');

interface XCPData {
  content: string;
  lastUpdated: number;
  updatedBy: string;
}

/**
 * Load XCP dispenser list from storage
 */
function loadXCPList(): XCPData | null {
  try {
    if (!fs.existsSync(XCP_FILE)) {
      return null;
    }
    const data = fs.readFileSync(XCP_FILE, 'utf-8');
    return JSON.parse(data) as XCPData;
  } catch (error) {
    logger.error('[XCPCommand] Error loading XCP list:', error);
    return null;
  }
}

/**
 * Save XCP dispenser list to storage
 */
function saveXCPList(content: string, username: string): boolean {
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const data: XCPData = {
      content,
      lastUpdated: Date.now(),
      updatedBy: username,
    };

    fs.writeFileSync(XCP_FILE, JSON.stringify(data, null, 2));
    logger.info(`[XCPCommand] XCP list updated by @${username}`);
    return true;
  } catch (error) {
    logger.error('[XCPCommand] Error saving XCP list:', error);
    return false;
  }
}

/**
 * Check if user is authorized to update the list
 * Checks both username AND Telegram ID (from TELEGRAM_ADMIN_IDS env var)
 */
function isAuthorized(username: string | undefined, telegramId: string | undefined): boolean {
  // Check username against authorized usernames
  if (username && AUTHORIZED_USERNAMES.some(u => u.toLowerCase() === username.toLowerCase())) {
    return true;
  }
  
  // Check Telegram ID against TELEGRAM_ADMIN_IDS env var
  if (telegramId) {
    const authorizedIds = process.env.TELEGRAM_ADMIN_IDS?.split(',').map(id => id.trim()) || [];
    if (authorizedIds.includes(telegramId)) {
      return true;
    }
  }
  
  return false;
}

export const xcpCommand: Action = {
  name: 'XCP_COMMAND',
  description: 'Handles /xcp command to view or update XCP dispenser list',
  similes: ['XCP', 'DISPENSER'],
  examples: [],

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.trim().toLowerCase() || '';
    return text.startsWith('/xcp');
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: any,
    _options?: any,
    callback?: HandlerCallback
  ) => {
    const raw = message.content.text || '';
    const content = raw.replace(/^\s*\/xcp(?:@[A-Za-z0-9_]+)?\s*/i, '').trim();
    
    // Extract username and telegram ID from message metadata
    const metadata = (message.metadata as any) || {};
    const username = metadata.entityUserName as string | undefined;
    const telegramId = metadata.fromId?.toString() as string | undefined;
    
    logger.info(`━━━━━ /xcp ━━━━━ user: ${username || 'unknown'} (${telegramId || 'unknown'}), hasContent: ${!!content}`);

    try {
      // Case 1: User wants to update the list (has content)
      if (content) {
        // Check authorization
        if (!isAuthorized(username, telegramId)) {
          logger.warn(`[XCPCommand] Unauthorized update attempt by @${username} (${telegramId})`);
          
          if (callback) {
            await callback({
              text: '❌ Sorry, only authorized users can update the XCP dispenser list.\n\nUse /xcp without any text to view the current list.',
            });
          }
          
          return { success: false, text: 'Unauthorized' };
        }

        // Save the new list (complete replace)
        const saved = saveXCPList(content, username || 'unknown');
        
        if (!saved) {
          if (callback) {
            await callback({
              text: '❌ Failed to save the XCP dispenser list. Please try again.',
            });
          }
          return { success: false, text: 'Save failed' };
        }

        if (callback) {
          await callback({
            text: '✅ XCP dispenser list has been updated successfully!',
          });
        }

        return { success: true, text: 'XCP list updated' };
      }

      // Case 2: User wants to view the list (no content)
      const xcpData = loadXCPList();
      
      if (!xcpData) {
        if (callback) {
          await callback({
            text: '📋 No XCP dispenser list available yet.',
          });
        }
        return { success: true, text: 'No data available' };
      }

      // Format the response with the stored content
      const lastUpdatedDate = new Date(xcpData.lastUpdated).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const response = `${xcpData.content}\n\n━━━━━━━━━━━━━━━\nLast updated by @${xcpData.updatedBy} on ${lastUpdatedDate}`;

      if (callback) {
        await callback({ text: response });
      }

      return { success: true, text: 'XCP list displayed' };

    } catch (error) {
      logger.error('[XCPCommand] Error handling /xcp command:', error);
      
      if (callback) {
        await callback({
          text: '❌ An error occurred while processing your request.',
        });
      }
      
      return { success: false, text: 'Error occurred' };
    }
  },
};

