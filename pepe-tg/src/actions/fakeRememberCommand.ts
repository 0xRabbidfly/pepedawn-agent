import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State, logger } from '@elizaos/core';
import { MemoryStorageService } from '../services/MemoryStorageService';

/**
 * /fr command - Fake Remember: Store user-contributed memories
 * Usage: 
 *   /fr CARDNAME <lore>   - Store card-specific memory
 *   /fr <general lore>    - Store general memory
 * 
 * Complements the "remember this" flow with a dedicated slash command.
 * Reuses MemoryStorageService for consistency.
 */

export const fakeRememberCommand: Action = {
  name: 'FAKE_REMEMBER_COMMAND',
  description: 'Handles /fr command to store user-contributed memories',
  similes: ['REMEMBER', 'MEMORY'],
  examples: [],

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.trim().toLowerCase() || '';
    return text.startsWith('/fr');
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback
  ) => {
    const raw = message.content.text || '';
    const content = raw.replace(/^\s*\/fr(?:@[A-Za-z0-9_]+)?\s*/i, '').trim();

    logger.info(`\n━━━━━ /fr ━━━━━ ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`);

    // Validate content
    if (!content || content.length === 0) {
      const errorMsg = '⚠️ Please provide something to remember!\n\n' +
                       'Usage:\n' +
                       '• `/fr CARDNAME <lore>` - Store card-specific memory\n' +
                       '• `/fr <general lore>` - Store general memory';
      
      if (callback) {
        await callback({ text: errorMsg });
      }
      
      return {
        success: false,
        text: 'Empty memory content'
      };
    }

    try {
      // Get MemoryStorageService
      const memoryService = runtime.getService(
        MemoryStorageService.serviceType
      ) as MemoryStorageService;
      
      if (!memoryService) {
        throw new Error('MemoryStorageService not available');
      }

      // Create a modified message with the content in the right format
      // The MemoryStorageService expects "remember this" format, so we prepend it
      const modifiedMessage: Memory = {
        ...message,
        content: {
          ...message.content,
          text: `remember this: ${content}`
        }
      };

      // Store the memory (reuses existing service logic)
      const result = await memoryService.storeMemory(modifiedMessage, (message as any).rawMessage);

      if (result.success && !result.ignoredReason) {
        // Memory stored successfully
        const successMsg = '💾 Memory stored! Access it anytime with `/fl`\n\n' +
                          'Your contribution is now part of the community knowledge base 🐸✨';
        
        if (callback) {
          await callback({ text: successMsg });
        }
        
        logger.info(`[/fr] Memory stored successfully (ID: ${result.memoryId})`);
        
        return {
          success: true,
          text: 'Memory stored via /fr command',
          memoryId: result.memoryId
        };
      } else if (result.ignoredReason) {
        // Content was ignored (empty, too long, etc.)
        const ignoreMsg = `⚠️ Memory not stored: ${result.ignoredReason}`;
        
        if (callback) {
          await callback({ text: ignoreMsg });
        }
        
        return {
          success: true,
          text: `Memory ignored: ${result.ignoredReason}`
        };
      } else {
        // Storage failed
        const errorMsg = `❌ Failed to store memory: ${result.error || 'Unknown error'}`;
        
        if (callback) {
          await callback({ text: errorMsg });
        }
        
        return {
          success: false,
          text: 'Memory storage failed',
          error: new Error(result.error)
        };
      }
    } catch (err) {
      logger.error({ error: err }, '❌ [/fr ERROR]');
      
      const errorMsg = 'Bruh, something went wrong storing that memory. Try again? 🐸';
      
      if (callback) {
        await callback({ text: errorMsg });
      }
      
      return {
        success: false,
        text: 'Memory storage error',
        error: err as Error
      };
    }
  },
};

