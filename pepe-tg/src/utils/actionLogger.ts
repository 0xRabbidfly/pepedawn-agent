/**
 * Action Logger - Structured logging for bot actions
 * 
 * Provides consistent, searchable log format with context for debugging
 * and monitoring bot actions.
 */

import { logger } from '@elizaos/core';

export interface LogContext {
  [key: string]: any;
}

/**
 * Creates a namespaced logger for a specific action or module
 */
export function createLogger(namespace: string) {
  const prefix = `[${namespace}]`;
  
  return {
    debug: (message: string, context?: LogContext) => {
      const ctx = context ? ` ${JSON.stringify(context)}` : '';
      logger.debug(`🔍 ${prefix} ${message}${ctx}`);
    },
    
    info: (message: string, context?: LogContext) => {
      const ctx = context ? ` ${JSON.stringify(context)}` : '';
      logger.info(`ℹ️  ${prefix} ${message}${ctx}`);
    },
    
    success: (message: string, context?: LogContext) => {
      const ctx = context ? ` ${JSON.stringify(context)}` : '';
      logger.info(`✅ ${prefix} ${message}${ctx}`);
    },
    
    warning: (message: string, context?: LogContext) => {
      const ctx = context ? ` ${JSON.stringify(context)}` : '';
      logger.warn(`⚠️  ${prefix} ${message}${ctx}`);
    },
    
    error: (message: string, error?: Error | string, context?: LogContext) => {
      const errorMsg = error instanceof Error ? error.message : error;
      const ctx = context ? ` ${JSON.stringify(context)}` : '';
      logger.error(`❌ ${prefix} ${message}${errorMsg ? ` - ${errorMsg}` : ''}${ctx}`);
    },
    
    step: (stepNumber: number, description: string) => {
      logger.debug(`\n🔧 ${prefix} STEP ${stepNumber}: ${description}`);
    },
    
    separator: () => {
      logger.debug(`${'='.repeat(60)}`);
    },
  };
}

