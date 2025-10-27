/**
 * Type Definitions for User Memory Capture
 * 
 * These interfaces define the structure of user-contributed memories
 * stored via the "remember this" command.
 */

import type { UUID } from '@elizaos/core';

/**
 * Source type enumeration for knowledge entries
 */
export type MemorySourceType = 'wiki' | 'telegram' | 'memory';

/**
 * Metadata structure for user-contributed memories
 * Stored in the knowledge table's metadata JSON column
 */
export interface UserMemoryMetadata {
  /**
   * Source type marker - always 'memory' for user memories
   */
  sourceType: 'memory';

  /**
   * Telegram user ID (stable identifier)
   */
  userId: string;

  /**
   * User's display name at time of storage
   */
  displayName: string;

  /**
   * Telegram chat/room ID where memory was created
   */
  roomId: string;

  /**
   * Telegram message ID
   */
  messageId: string;

  /**
   * Unix timestamp in milliseconds
   */
  timestamp: number;

  /**
   * Original context for REPLY flow (optional)
   */
  originalContext?: string;
}

/**
 * Extracted content structure for storage
 */
export interface MemoryContent {
  /**
   * The actual text to be stored
   */
  text: string;

  /**
   * Whether this memory came from a REPLY flow
   */
  isReplyContext: boolean;

  /**
   * Original bot message (only if isReplyContext === true)
   */
  originalMessage?: string;

  /**
   * User's comment/addition
   */
  userComment: string;
}

/**
 * Result of memory storage operation
 */
export interface MemoryStorageResult {
  /**
   * Whether the memory was successfully stored
   */
  success: boolean;

  /**
   * Error message if storage failed
   */
  error?: string;

  /**
   * UUID of stored memory (if successful)
   */
  memoryId?: string;

  /**
   * Reason for silent ignore (if applicable)
   */
  ignoredReason?: string;
}

