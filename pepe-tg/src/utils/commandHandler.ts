/**
 * Command Handler Utility
 * 
 * Reduces boilerplate for executing ElizaOS actions in response to commands.
 * Provides consistent error handling and metadata marking.
 */

import { logger, type IAgentRuntime, type Memory } from '@elizaos/core';

export interface Action {
  validate?: (runtime: IAgentRuntime, message: Memory) => Promise<boolean>;
  handler?: (
    runtime: IAgentRuntime,
    message: Memory,
    state: any,
    options: any,
    callback?: (response: any) => Promise<void>
  ) => Promise<any>;
}

export interface CommandHandlerParams {
  runtime: IAgentRuntime;
  message: Memory;
  state: any;
  callback?: (response: any) => Promise<any[] | void>;
}

/**
 * Execute an action with consistent error handling and suppression
 * 
 * @param action ElizaOS action to execute
 * @param params Runtime, message, state, and callback
 * @param commandName Name of command (for logging)
 * @returns true if action was executed, false otherwise
 */
export async function executeCommand(
  action: Action,
  params: CommandHandlerParams,
  commandName: string
): Promise<boolean> {
  logger.debug(`[CommandHandler] Executing ${commandName}`);
  
  // Prepare callback
  const actionCallback = typeof params.callback === 'function' ? params.callback : null;
  
  // Suppress Bootstrap by replacing callback with no-op
  // Keep reference to original for action's use
  if (params.callback) {
    (params as any).callback = async () => [];
  }
  
  // Execute action
  if (!action.validate || !action.handler) {
    logger.warn(`[CommandHandler] ${commandName} missing validate or handler`);
    return false;
  }
  
  try {
    const isValid = await action.validate(params.runtime, params.message);
    
    if (isValid) {
      await action.handler(
        params.runtime,
        params.message,
        params.state,
        {},
        actionCallback ?? undefined
      );
      
      // Mark as handled to prevent Bootstrap processing
      try {
        params.message.metadata = params.message.metadata || {};
        (params.message.metadata as any).__handledByCustom = true;
      } catch (err) {
        logger.debug(`[CommandHandler] Failed to mark as handled: ${err}`);
      }
      
      logger.debug(`[CommandHandler] ${commandName} completed successfully`);
      return true;
    } else {
      logger.debug(`[CommandHandler] ${commandName} validation failed`);
      return false;
    }
  } catch (err) {
    logger.error(`[CommandHandler] ${commandName} execution error:`, err);
    return false;
  }
}

/**
 * Execute a command that should always mark as handled (even on validation failure)
 * Used for commands like /help and /start that should suppress Bootstrap regardless
 */
export async function executeCommandAlways(
  action: Action,
  params: CommandHandlerParams,
  commandName: string
): Promise<boolean> {
  const result = await executeCommand(action, params, commandName);
  
  // Mark as handled even if validation failed
  if (!result) {
    logger.debug(`[CommandHandler] ${commandName} failed, but marking as handled`);
    try {
      params.message.metadata = params.message.metadata || {};
      (params.message.metadata as any).__handledByCustom = true;
    } catch {}
  }
  
  return result;
}

