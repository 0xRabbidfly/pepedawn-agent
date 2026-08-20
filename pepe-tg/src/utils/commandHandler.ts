/**
 * Command Handler Utility
 * 
 * Reduces boilerplate for executing ElizaOS actions in response to commands.
 * Provides consistent error handling and metadata marking.
 */

import { logger, MemoryType, type IAgentRuntime, type Memory } from '@elizaos/core';
import { runWithAction } from './actionContext';

export interface Action {
  validate?: (runtime: IAgentRuntime, message: Memory) => Promise<boolean>;
  handler?: (
    runtime: IAgentRuntime,
    message: Memory,
    state: any,
    options: any,
    callback?: (response: any) => Promise<any>
  ) => Promise<any>;
}

export interface CommandHandlerParams {
  runtime: IAgentRuntime;
  message: Memory;
  state: any;
  callback?: (response: any) => Promise<any>;
  /**
   * Raw Telegram context. Carried so a command can identify its caller.
   *
   * Without this, `message.rawMessage` is undefined and every /fr submission
   * was stored as userId "unknown" - which made the artist check, per-user rate
   * limiting and any purge-by-author impossible. See utils/loreSubmission.ts.
   */
  ctx?: any;
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
      // Attribute every model call made inside the handler to this command,
      // so /fc can separate an explicit /fl from an auto-routed lore query.
      await runWithAction(commandName, () =>
        action.handler!(
          params.runtime,
          params.message,
          params.state,
          { ctx: params.ctx },
          actionCallback ?? undefined
        )
      );


      // Mark as handled to prevent Bootstrap processing
      try {
        // `MemoryMetadata` requires a `type`; a bare {} is not one. The
        // sentinel itself is what matters - it is what keeps bootstrap from
        // answering a message a command has already handled.
        params.message.metadata = params.message.metadata ?? { type: MemoryType.CUSTOM };
        (params.message.metadata as any).__handledByCustom = true;
      } catch (err) {
        logger.debug(`[CommandHandler] Failed to mark as handled: ${err}`);
      }

      logger.debug(`[CommandHandler] ${commandName} completed successfully`);
      recordCommandUsage(params, commandName, true);
      return true;
    } else {
      logger.debug(`[CommandHandler] ${commandName} validation failed`);
      recordCommandUsage(params, commandName, false);
      return false;
    }
  } catch (err) {
    logger.error(`[CommandHandler] ${commandName} execution error:`, err);
    recordCommandUsage(params, commandName, false);
    return false;
  }
}

/**
 * Record a command invocation to telemetry.
 *
 * Fire-and-forget: telemetry must never break or delay a command response.
 */
function recordCommandUsage(
  params: CommandHandlerParams,
  commandName: string,
  success: boolean
): void {
  try {
    const telemetry = (params.runtime as any)?.getService?.('telemetry');
    if (!telemetry?.logCommandUsage) return;

    void telemetry
      .logCommandUsage({
        timestamp: new Date().toISOString(),
        command: commandName,
        success,
        roomId: params.message?.roomId,
        entityId: params.message?.entityId,
        messageId: params.message?.id,
      })
      .catch(() => {});
  } catch {
    // Telemetry is best-effort only.
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
      params.message.metadata = params.message.metadata ?? { type: MemoryType.CUSTOM };
      (params.message.metadata as any).__handledByCustom = true;
    } catch {}
  }
  
  return result;
}

