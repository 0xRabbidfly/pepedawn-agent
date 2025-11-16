/**
 * Telemetry Service
 * 
 * ElizaOS Service for tracking model usage, costs, and action metrics.
 * Uses ElizaOS event system (MODEL_USED, ACTION_COMPLETED) instead of monkey-patching.
 * 
 * Features:
 * - Event-based tracking (no runtime modification)
 * - JSONL persistence with monthly archiving
 * - Cost calculation per model
 * - Action execution metrics
 * - Queryable reports for /fc command
 */

import { Service, type IAgentRuntime } from '@elizaos/core';
import { writeFileSync, appendFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const LOG_FILE = join(process.cwd(), 'src', 'data', 'token-logs.jsonl');
const CONVERSATION_LOG_FILE = join(process.cwd(), 'src', 'data', 'conversation-logs.jsonl');
const LORE_QUERY_LOG_FILE = join(process.cwd(), 'src', 'data', 'lore-query-logs.jsonl');
const SMART_ROUTER_LOG_FILE = join(process.cwd(), 'src', 'data', 'smart-router-logs.jsonl');

// Pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // GPT-4o series
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'chatgpt-4o-latest': { input: 2.5, output: 10.0 },
  
  // GPT-4 series
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  
  // o1 series
  'o1': { input: 15.0, output: 60.0 },
  'o1-preview': { input: 15.0, output: 60.0 },
  'o1-mini': { input: 3.0, output: 12.0 },
  'o1-pro': { input: 20.0, output: 80.0 },
  
  // o3 series (estimated)
  'o3': { input: 20.0, output: 80.0 },
  'o3-mini': { input: 4.0, output: 16.0 },
  
  // GPT-5 series (estimated)
  'gpt-5': { input: 5.0, output: 20.0 },
  'gpt-5-pro': { input: 25.0, output: 100.0 },
  'gpt-5-mini': { input: 0.3, output: 1.2 },
  'gpt-5-nano': { input: 0.1, output: 0.4 },
};

export interface TokenLog {
  timestamp: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  source: string;
  actionName?: string;  // For action tracking
  duration?: number;    // For performance tracking
  messageId?: string;   // For grouping Bootstrap's multi-call conversations
}

export interface ConversationLog {
  timestamp: string;
  messageId: string;
  source: 'bootstrap' | 'auto-route';
}

export interface LoreQueryLog {
  timestamp: string;
  queryId: string;
  query: string;
  source: 'fl-command' | 'auto-route';
}

export interface ActionLog {
  timestamp: string;
  actionName: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface SmartRouterDecisionLog {
  timestamp: string;
  messageId: string;
  userText: string;
  intent: string;
  kind: string;
  reason: string;
  command?: string;
  emoji?: string;
  fastPath?: {
    score: number;
    asset?: string;
    metrics?: Record<string, any>;
  };
  retrieval?: {
    totalPassages: number;
    totalCandidates: number;
    countsBySource: Record<string, number>;
    weightedBySource: Record<string, number>;
  };
  handled?: boolean;
  result?: 'pending' | 'handled' | 'fallback' | 'skipped';
}

export interface CostStats {
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
  callCount: number;
  conversationCount?: number;  // Unique user conversations
  loreQueryCount?: number;     // Unique lore queries
  byModel: Record<string, { cost: number; calls: number }>;
  bySource: Record<string, { cost: number; calls: number }>;
  byAction?: Record<string, { cost: number; calls: number; avgDuration: number }>;
}

export class TelemetryService extends Service {
  static serviceType = 'telemetry';
  
  capabilityDescription = 
    'Tracks model usage, costs, and action metrics via ElizaOS events. ' +
    'Provides queryable reports for /fc command.';

  private archiveTimer: NodeJS.Timeout | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime): Promise<TelemetryService> {
    logger.info('📊 [Telemetry] Starting service...');
    const service = new TelemetryService(runtime);
    logger.info('✅ [Telemetry] Service ready');
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('🛑 [Telemetry] Stopping service...');
    logger.info('✅ [Telemetry] Service stopped');
  }

  /**
   * Log model usage (called from MODEL_USED event or manual SDK calls)
   */
  async logModelUsage(log: TokenLog): Promise<void> {
    try {
      // Persist
      if (!existsSync(LOG_FILE)) {
        writeFileSync(LOG_FILE, '', 'utf8');
      }
      
      appendFileSync(LOG_FILE, JSON.stringify(log) + '\n', 'utf8');
      
      // Console output
      const durationStr = log.duration ? `, ${log.duration}ms` : '';
      logger.debug(
        `[Telemetry] ${log.model} [${log.source}]: ` +
        `${log.tokensIn}→${log.tokensOut} tokens, ` +
        `$${log.cost.toFixed(6)}${durationStr}`
      );
    } catch (err) {
      logger.error('[Telemetry] Failed to log:', err);
    }
  }

  /**
   * Log a user conversation (once per message, not per API call)
   */
  async logConversation(log: ConversationLog): Promise<void> {
    try {
      if (!existsSync(CONVERSATION_LOG_FILE)) {
        writeFileSync(CONVERSATION_LOG_FILE, '', 'utf8');
      }
      
      appendFileSync(CONVERSATION_LOG_FILE, JSON.stringify(log) + '\n', 'utf8');
      logger.debug(`[Telemetry] Conversation logged: ${log.source} ${log.messageId}`);
    } catch (err) {
      logger.error('[Telemetry] Failed to log conversation:', err);
    }
  }

  /**
   * Log a lore query (once per query, not per API call)
   */
  async logLoreQuery(log: LoreQueryLog): Promise<void> {
    try {
      if (!existsSync(LORE_QUERY_LOG_FILE)) {
        writeFileSync(LORE_QUERY_LOG_FILE, '', 'utf8');
      }
      
      appendFileSync(LORE_QUERY_LOG_FILE, JSON.stringify(log) + '\n', 'utf8');
      logger.debug(`[Telemetry] Lore query logged: ${log.source} "${log.query.substring(0, 50)}..."`);
    } catch (err) {
      logger.error('[Telemetry] Failed to log lore query:', err);
    }
  }

  /**
   * Log smart router decisions and execution details
   */
  async logSmartRouterDecision(log: SmartRouterDecisionLog): Promise<void> {
    try {
      if (!existsSync(SMART_ROUTER_LOG_FILE)) {
        writeFileSync(SMART_ROUTER_LOG_FILE, '', 'utf8');
      }

      const record = {
        ...log,
        userText: log.userText.length > 240 ? `${log.userText.slice(0, 240)}…` : log.userText,
      };

      appendFileSync(SMART_ROUTER_LOG_FILE, JSON.stringify(record) + '\n', 'utf8');
      logger.debug(
        `[Telemetry] SmartRouter logged: intent=${log.intent} kind=${log.kind} handled=${
          log.result ?? 'pending'
        }`
      );
    } catch (err) {
      logger.error('[Telemetry] Failed to log smart router decision:', err);
    }
  }

  /**
   * Get cost report for date range
   */
  async getCostReport(startDate?: Date, endDate?: Date): Promise<CostStats> {
    const logs = this.readLogs(startDate, endDate);
    const conversations = this.readConversationLogs(startDate, endDate);
    const loreQueries = this.readLoreQueryLogs(startDate, endDate);
    const stats = this.calculateStats(logs);
    stats.conversationCount = conversations.length;
    stats.loreQueryCount = loreQueries.length;
    return stats;
  }

  /**
   * Estimate token count from text
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate cost for a model call
   */
  calculateCost(model: string, tokensIn: number, tokensOut: number): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
    const inputCost = (tokensIn / 1_000_000) * pricing.input;
    const outputCost = (tokensOut / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Read logs from file with optional date filtering
   */
  private readLogs(startDate?: Date, endDate?: Date): TokenLog[] {
    try {
      if (!existsSync(LOG_FILE)) {
        return [];
      }
      
      const content = readFileSync(LOG_FILE, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      let logs: TokenLog[] = lines.map(line => JSON.parse(line));
      
      if (startDate) {
        logs = logs.filter(log => new Date(log.timestamp) >= startDate);
      }
      if (endDate) {
        logs = logs.filter(log => new Date(log.timestamp) <= endDate);
      }
      
      return logs;
    } catch (err) {
      logger.error('[Telemetry] Failed to read logs:', err);
      return [];
    }
  }

  /**
   * Read conversation logs from file
   */
  private readConversationLogs(startDate?: Date, endDate?: Date): ConversationLog[] {
    try {
      if (!existsSync(CONVERSATION_LOG_FILE)) {
        return [];
      }
      
      const content = readFileSync(CONVERSATION_LOG_FILE, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      let logs: ConversationLog[] = lines.map(line => JSON.parse(line));
      
      if (startDate) {
        logs = logs.filter(log => new Date(log.timestamp) >= startDate);
      }
      if (endDate) {
        logs = logs.filter(log => new Date(log.timestamp) <= endDate);
      }
      
      return logs;
    } catch (err) {
      logger.error('[Telemetry] Failed to read conversation logs:', err);
      return [];
    }
  }

  /**
   * Read lore query logs from file
   */
  private readLoreQueryLogs(startDate?: Date, endDate?: Date): LoreQueryLog[] {
    try {
      if (!existsSync(LORE_QUERY_LOG_FILE)) {
        return [];
      }
      
      const content = readFileSync(LORE_QUERY_LOG_FILE, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      let logs: LoreQueryLog[] = lines.map(line => JSON.parse(line));
      
      if (startDate) {
        logs = logs.filter(log => new Date(log.timestamp) >= startDate);
      }
      if (endDate) {
        logs = logs.filter(log => new Date(log.timestamp) <= endDate);
      }
      
      return logs;
    } catch (err) {
      logger.error('[Telemetry] Failed to read lore query logs:', err);
      return [];
    }
  }

  /**
   * Calculate statistics from logs
   */
  private calculateStats(logs: TokenLog[]): CostStats {
    const byModel: Record<string, { cost: number; calls: number }> = {};
    const bySource: Record<string, { cost: number; calls: number }> = {};
    const byAction: Record<string, { cost: number; calls: number; totalDuration: number }> = {};
    
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
      
      // By source
      if (!bySource[log.source]) {
        bySource[log.source] = { cost: 0, calls: 0 };
      }
      bySource[log.source].cost += log.cost;
      bySource[log.source].calls += 1;
      
      // By action (if tracked)
      if (log.actionName) {
        if (!byAction[log.actionName]) {
          byAction[log.actionName] = { cost: 0, calls: 0, totalDuration: 0 };
        }
        byAction[log.actionName].cost += log.cost;
        byAction[log.actionName].calls += 1;
        if (log.duration) {
          byAction[log.actionName].totalDuration += log.duration;
        }
      }
    }
    
    // Calculate average durations
    const byActionWithAvg: Record<string, { cost: number; calls: number; avgDuration: number }> = {};
    for (const [action, stats] of Object.entries(byAction)) {
      byActionWithAvg[action] = {
        cost: stats.cost,
        calls: stats.calls,
        avgDuration: stats.calls > 0 ? stats.totalDuration / stats.calls : 0
      };
    }
    
    return {
      totalCost,
      totalTokensIn,
      totalTokensOut,
      callCount: logs.length,
      byModel,
      bySource,
      byAction: byActionWithAvg,
    };
  }

}

