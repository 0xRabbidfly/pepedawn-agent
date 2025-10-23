/**
 * Token Usage Logger
 * Tracks all AI API calls with token counts and costs
 */

import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { IAgentRuntime } from '@elizaos/core';

// Track if we've already patched this runtime (to avoid double-patching)
const patchedRuntimes = new WeakSet<any>();

// Track the current call context (for labeling)
let currentCallContext: string | null = null;

const LOG_FILE = join(process.cwd(), 'src', 'data', 'token-logs.jsonl');
const ARCHIVE_DIR = join(process.cwd(), 'src', 'data', 'archives');

// Pricing per 1M tokens (USD)
// Note: Pricing for unreleased models (GPT-5, o3, GPT-4.1) are estimates
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // GPT-4o series (verified pricing)
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'chatgpt-4o-latest': { input: 2.5, output: 10.0 },
  
  // GPT-4 series (verified pricing)
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  
  // o1 series reasoning models (verified pricing)
  'o1': { input: 15.0, output: 60.0 },
  'o1-preview': { input: 15.0, output: 60.0 },
  'o1-mini': { input: 3.0, output: 12.0 },
  'o1-pro': { input: 20.0, output: 80.0 }, // estimated
  
  // o3 series reasoning models (estimated - likely similar or higher than o1)
  'o3': { input: 20.0, output: 80.0 },
  'o3-mini': { input: 4.0, output: 16.0 },
  
  // GPT-5 series (estimated - likely premium pricing)
  'gpt-5': { input: 5.0, output: 20.0 },
  'gpt-5-pro': { input: 25.0, output: 100.0 },
  'gpt-5-mini': { input: 0.3, output: 1.2 },
  'gpt-5-nano': { input: 0.1, output: 0.4 },
  'gpt-5-codex': { input: 5.0, output: 20.0 },
  'gpt-5-search-api': { input: 5.0, output: 20.0 },
  
  // GPT-4.1 series (estimated - between GPT-4o and GPT-4-turbo)
  'gpt-4.1': { input: 5.0, output: 20.0 },
  'gpt-4.1-mini': { input: 0.5, output: 2.0 },
  'gpt-4.1-nano': { input: 0.2, output: 0.8 },
};

interface TokenLog {
  timestamp: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  source: string;
}

/**
 * Estimate token count from text (rough: 1 token ≈ 4 chars)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate cost based on model and token counts
 */
export function calculateCost(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
  const inputCost = (tokensIn / 1_000_000) * pricing.input;
  const outputCost = (tokensOut / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Archive previous month's logs and clear main log file
 */
function archiveAndClearLogs(): void {
  try {
    // Read all current logs
    const allLogs = readTokenLogs(new Date(0)); // Read all logs from epoch
    
    if (allLogs.length === 0) {
      return; // Nothing to archive
    }
    
    // Group logs by month
    const logsByMonth = new Map<string, TokenLog[]>();
    
    for (const log of allLogs) {
      const date = new Date(log.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!logsByMonth.has(monthKey)) {
        logsByMonth.set(monthKey, []);
      }
      logsByMonth.get(monthKey)!.push(log);
    }
    
    // Create archives directory if it doesn't exist
    if (!existsSync(ARCHIVE_DIR)) {
      const fs = require('fs');
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }
    
    // Archive each month's data
    for (const [monthKey, logs] of logsByMonth.entries()) {
      const stats = calculateTotalCost(logs);
      const archiveFile = join(ARCHIVE_DIR, `token-logs-${monthKey}.json`);
      
      const archiveData = {
        month: monthKey,
        summary: {
          totalCost: stats.totalCost,
          totalTokensIn: stats.totalTokensIn,
          totalTokensOut: stats.totalTokensOut,
          callCount: stats.callCount,
          byModel: stats.byModel,
          bySource: stats.bySource,
        },
        logs, // Full log entries for reference
      };
      
      writeFileSync(archiveFile, JSON.stringify(archiveData, null, 2), 'utf8');
      console.log(`[TokenLogger] 📦 Archived ${logs.length} logs to ${monthKey}`);
    }
    
    // Clear main log file
    writeFileSync(LOG_FILE, '', 'utf8');
    console.log('[TokenLogger] 🗑️  Cleared main log file for new month');
    
  } catch (err) {
    console.error('[TokenLogger] Failed to archive logs:', err);
  }
}

/**
 * Check if we're in a new month and need to archive
 */
function checkAndArchiveIfNewMonth(): void {
  const lastCheckFile = join(process.cwd(), 'src', 'data', '.last-archive-check');
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  try {
    let lastMonth = '';
    if (existsSync(lastCheckFile)) {
      lastMonth = readFileSync(lastCheckFile, 'utf8').trim();
    }
    
    // If month changed, archive and clear
    if (lastMonth && lastMonth !== currentMonth) {
      archiveAndClearLogs();
    }
    
    // Update last check
    writeFileSync(lastCheckFile, currentMonth, 'utf8');
    
  } catch (err) {
    console.error('[TokenLogger] Failed to check archive status:', err);
  }
}

/**
 * Log token usage to JSONL file
 */
export function logTokenUsage(log: TokenLog): void {
  try {
    // Check if we need to archive (once per month)
    checkAndArchiveIfNewMonth();
    
    // Create file if it doesn't exist
    if (!existsSync(LOG_FILE)) {
      writeFileSync(LOG_FILE, '', 'utf8');
    }
    
    appendFileSync(LOG_FILE, JSON.stringify(log) + '\n', 'utf8');
  } catch (err) {
    console.error('[TokenLogger] Failed to write log:', err);
  }
}

/**
 * Set context for the next AI call (for labeling)
 */
export function setCallContext(context: string): void {
  currentCallContext = context;
}

/**
 * Clear call context
 */
export function clearCallContext(): void {
  currentCallContext = null;
}

/**
 * Read and parse token logs for a date range
 */
export function readTokenLogs(startDate?: Date, endDate?: Date): TokenLog[] {
  try {
    if (!existsSync(LOG_FILE)) {
      return [];
    }
    
    const content = require('fs').readFileSync(LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter((line: string) => line.length > 0);
    
    let logs: TokenLog[] = lines.map((line: string) => JSON.parse(line));
    
    // Filter by date range if provided
    if (startDate) {
      logs = logs.filter(log => new Date(log.timestamp) >= startDate);
    }
    if (endDate) {
      logs = logs.filter(log => new Date(log.timestamp) <= endDate);
    }
    
    return logs;
  } catch (err) {
    console.error('[TokenLogger] Failed to read logs:', err);
    return [];
  }
}

/**
 * Calculate total costs for a date range
 */
export function calculateTotalCost(logs: TokenLog[]): {
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
  callCount: number;
  byModel: Record<string, { cost: number; calls: number }>;
  bySource: Record<string, { cost: number; calls: number }>;
} {
  const byModel: Record<string, { cost: number; calls: number }> = {};
  const bySource: Record<string, { cost: number; calls: number }> = {};
  
  let totalCost = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  
  for (const log of logs) {
    totalCost += log.cost;
    totalTokensIn += log.tokensIn;
    totalTokensOut += log.tokensOut;
    
    // By model
    if (!byModel[log.model]) {
      byModel[log.model] = { cost: 0, calls: 0 };
    }
    byModel[log.model].cost += log.cost;
    byModel[log.model].calls += 1;
    
    // By source (call type)
    if (!bySource[log.source]) {
      bySource[log.source] = { cost: 0, calls: 0 };
    }
    bySource[log.source].cost += log.cost;
    bySource[log.source].calls += 1;
  }
  
  return {
    totalCost,
    totalTokensIn,
    totalTokensOut,
    callCount: logs.length,
    byModel,
    bySource,
  };
}

/**
 * Monkey-patch runtime to intercept ALL AI calls (including bootstrap)
 * Call this once during plugin initialization
 */
export function patchRuntimeForTracking(runtime: IAgentRuntime): void {
  // Avoid double-patching
  if (patchedRuntimes.has(runtime)) {
    return;
  }
  
  // Skip if runtime doesn't have useModel (e.g., test mocks)
  if (!runtime.useModel || typeof runtime.useModel !== 'function') {
    return;
  }
  
  patchedRuntimes.add(runtime);
  
  // Patch useModel (primary method for TEXT_SMALL/TEXT_LARGE)
  const originalUseModel = runtime.useModel.bind(runtime);
  (runtime as any).useModel = async function(modelType: any, params: any) {
    // Skip embeddings
    if (modelType && (modelType.includes('EMBEDDING') || modelType === 'TEXT_EMBEDDING')) {
      return await originalUseModel(modelType, params);
    }
    
    const startTime = Date.now();
    const prompt = params?.prompt || params?.text || '';
    const tokensIn = estimateTokens(prompt);
    
    // Determine model from type
    let model: string;
    if (modelType === 'TEXT_SMALL' || modelType?.includes?.('SMALL')) {
      model = process.env.OPENAI_SMALL_MODEL || 'gpt-4o-mini';
    } else if (modelType === 'TEXT_LARGE' || modelType?.includes?.('LARGE')) {
      model = process.env.OPENAI_LARGE_MODEL || 'gpt-4o';
    } else {
      model = process.env.TEXT_MODEL || 'gpt-4o-mini';
    }
    
    // Use context if set, otherwise assume it's a conversation
    const source = currentCallContext || 'Conversation';
    
    try {
      const result = await originalUseModel(modelType, params);
      const text = typeof result === 'string' ? result : (result as any)?.text || result?.toString() || '';
      const tokensOut = estimateTokens(text);
      const cost = calculateCost(model, tokensIn, tokensOut);
      
      logTokenUsage({
        timestamp: new Date().toISOString(),
        model,
        tokensIn,
        tokensOut,
        cost,
        source,
      });
      
      const latency = Date.now() - startTime;
      console.log(`[TokenLogger] ${model} [${source}]: ${tokensIn}→${tokensOut} tokens, $${cost.toFixed(6)}, ${latency}ms`);
      
      return result;
    } catch (err) {
      console.error('[TokenLogger] Error:', err);
      throw err;
    }
  };
}

