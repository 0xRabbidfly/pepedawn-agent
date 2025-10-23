/**
 * Action Logger - Structured logging for bot actions
 * 
 * Provides consistent, searchable log format with context for debugging
 * and monitoring bot actions.
 */

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
      console.log(`🔍 ${prefix} ${message}${ctx}`);
    },
    
    info: (message: string, context?: LogContext) => {
      const ctx = context ? ` ${JSON.stringify(context)}` : '';
      console.log(`ℹ️  ${prefix} ${message}${ctx}`);
    },
    
    success: (message: string, context?: LogContext) => {
      const ctx = context ? ` ${JSON.stringify(context)}` : '';
      console.log(`✅ ${prefix} ${message}${ctx}`);
    },
    
    warning: (message: string, context?: LogContext) => {
      const ctx = context ? ` ${JSON.stringify(context)}` : '';
      console.log(`⚠️  ${prefix} ${message}${ctx}`);
    },
    
    error: (message: string, error?: Error | string, context?: LogContext) => {
      const errorMsg = error instanceof Error ? error.message : error;
      const ctx = context ? ` ${JSON.stringify(context)}` : '';
      console.error(`❌ ${prefix} ${message}${errorMsg ? ` - ${errorMsg}` : ''}${ctx}`);
    },
    
    step: (stepNumber: number, description: string) => {
      console.log(`\n🔧 ${prefix} STEP ${stepNumber}: ${description}`);
    },
    
    separator: () => {
      console.log(`${'='.repeat(60)}`);
    },
  };
}

