import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State } from '@elizaos/core';
import { readTokenLogs, calculateTotalCost } from '../utils/tokenLogger';

/**
 * /fc Command - Token usage and cost tracking (admin-only)
 * 
 * Usage:
 *   /fc d  → Today's costs
 *   /fc m  → Current month's costs
 */

function getStartOfDay(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function getStartOfMonth(): Date {
  const now = new Date();
  now.setDate(1);
  now.setHours(0, 0, 0, 0);
  return now;
}

function formatCostReport(logs: ReturnType<typeof readTokenLogs>, period: string): string {
  if (logs.length === 0) {
    return `📊 No token usage recorded for ${period}.`;
  }
  
  const stats = calculateTotalCost(logs);
  
  let report = `📊 **Token Usage - ${period}**\n\n`;
  report += `💰 Total Cost: $${stats.totalCost.toFixed(4)}\n`;
  report += `📥 Tokens In: ${stats.totalTokensIn.toLocaleString()}\n`;
  report += `📤 Tokens Out: ${stats.totalTokensOut.toLocaleString()}\n`;
  report += `🔢 API Calls: ${stats.callCount}\n`;
  
  // Breakdown by model
  if (Object.keys(stats.byModel).length > 0) {
    report += `\n**By Model:**\n`;
    for (const [model, data] of Object.entries(stats.byModel)) {
      report += `• ${model}: $${data.cost.toFixed(4)} (${data.calls} calls)\n`;
    }
  }
  
  // Breakdown by call type
  if (Object.keys(stats.bySource).length > 0) {
    report += `\n**By Type:**\n`;
    // Sort by cost descending
    const sortedSources = Object.entries(stats.bySource)
      .sort(([, a], [, b]) => b.cost - a.cost);
    
    for (const [source, data] of sortedSources) {
      report += `• ${source}: $${data.cost.toFixed(4)} (${data.calls} calls)\n`;
    }
  }
  
  return report.trim();
}

export const costCommand: Action = {
  name: 'COST_COMMAND',
  description: 'Shows token usage and costs (admin-only)',
  similes: ['FAKE_COST', 'FC'],
  examples: [],
  
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase().trim() || '';
    
    // Must start with /fc
    if (!text.startsWith('/fc')) {
      return false;
    }
    
    // Always validate true so handler can send error message for non-admins
    return true;
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    const telegramId = ((message as any).metadata?.fromId)?.toString() || '';
    
    // Check authorized users (bot owner + group admins via env var)
    const authorizedIds = process.env.TELEGRAM_ADMIN_IDS?.split(',').map(id => id.trim()) || [];
    
    if (!telegramId || !authorizedIds.includes(telegramId)) {
      if (callback) {
        await callback({ 
          text: '🔒 This command is admin-only. Contact the bot administrator for access.' 
        });
      }
      return { success: false, text: 'Unauthorized' };
    }
    
    const text = message.content.text?.toLowerCase().trim() || '';
    const args = text.split(/\s+/);
    const periodArg = args[1];
    
    // Validate period parameter
    if (periodArg && periodArg !== 'd' && periodArg !== 'm') {
      if (callback) {
        await callback({ 
          text: '❌ Invalid parameter. Use:\n• `/fc d` for daily\n• `/fc m` for monthly' 
        });
      }
      return { success: false, text: 'Invalid parameter' };
    }
    
    // Determine period
    let period: string;
    let startDate: Date;
    
    if (periodArg === 'm') {
      period = 'This Month';
      startDate = getStartOfMonth();
    } else {
      // Daily report (default)
      period = 'Today';
      startDate = getStartOfDay();
    }
    
    // Read logs and generate report
    const logs = readTokenLogs(startDate);
    const report = formatCostReport(logs, period);
    
    // Send response
    if (callback) {
      await callback({ text: report });
    }
    
    return {
      success: true,
      text: 'Cost report sent',
    };
  },
};

