import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State } from '@elizaos/core';
import { readTokenLogs, calculateTotalCost } from '../utils/tokenLogger';

/**
 * /fc Command - Token usage and cost tracking (admin-only)
 * 
 * Usage:
 *   /fc d  → Today's costs + 12-day chart
 *   /fc m  → Current month's costs + 12-month chart
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

/**
 * Generate a mini ASCII bar chart
 */
function generateMiniChart(data: { label: string; value: number }[], maxBarLength: number = 10): string {
  if (data.length === 0) return '';
  
  const maxValue = Math.max(...data.map(d => d.value));
  if (maxValue === 0) return '';
  
  let chart = '\n📊 **Trend:**\n```\n';
  
  for (const item of data) {
    const barLength = Math.round((item.value / maxValue) * maxBarLength);
    const bar = '█'.repeat(barLength) + '░'.repeat(maxBarLength - barLength);
    const valueStr = item.value > 0 ? `$${item.value.toFixed(3)}` : '$0';
    chart += `${item.label} ${bar} ${valueStr}\n`;
  }
  
  chart += '```';
  return chart;
}

/**
 * Get last N days of data
 */
function getLast12Days(): { label: string; value: number }[] {
  const now = new Date();
  const result: { label: string; value: number }[] = [];
  
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const logs = readTokenLogs(date, nextDate);
    const stats = calculateTotalCost(logs);
    
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    result.push({ label, value: stats.totalCost });
  }
  
  return result;
}

/**
 * Get last N months of data
 */
function getLast12Months(): { label: string; value: number }[] {
  const now = new Date();
  const result: { label: string; value: number }[] = [];
  
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
    const nextDate = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
    
    const logs = readTokenLogs(date, nextDate);
    const stats = calculateTotalCost(logs);
    
    const label = date.toLocaleDateString('en-US', { month: 'short' });
    result.push({ label, value: stats.totalCost });
  }
  
  return result;
}

function formatCostReport(logs: ReturnType<typeof readTokenLogs>, period: string, chart?: string): string {
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
      report += `• ${model}: $${data.cost.toFixed(4)} [${data.calls}]\n`;
    }
  }
  
  // Breakdown by call type
  if (Object.keys(stats.bySource).length > 0) {
    report += `\n**By Type:**\n`;
    // Sort by cost descending
    const sortedSources = Object.entries(stats.bySource)
      .sort(([, a], [, b]) => b.cost - a.cost);
    
    for (const [source, data] of sortedSources) {
      report += `• ${source}: $${data.cost.toFixed(4)} [${data.calls}]\n`;
    }
  }
  
  // Add chart if provided
  if (chart) {
    report += chart;
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
    
    // Only work in DMs (private chats) - fromId positive = user, negative = group
    const metadata = (message as any).metadata || {};
    const isDM = metadata.fromId && metadata.fromId > 0;
    
    if (!isDM) {
      // Not a DM - don't even process the command
      return false;
    }
    
    return true;
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    const metadata = (message as any).metadata || {};
    
    // Extract user ID from DM (we know it's a DM because validate() already checked)
    const telegramId = metadata.fromId.toString();
    
    // Check authorized users (bot owner + group admins via env var)
    const authorizedIds = process.env.TELEGRAM_ADMIN_IDS?.split(',').map(id => id.trim()) || [];
    
    if (!authorizedIds.includes(telegramId)) {
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
    
    // Determine period and generate chart
    let period: string;
    let startDate: Date;
    let chart: string | undefined;
    
    if (periodArg === 'm') {
      period = 'This Month';
      startDate = getStartOfMonth();
      // Generate 12-month chart
      const monthData = getLast12Months();
      chart = generateMiniChart(monthData);
    } else {
      // Daily report (default)
      period = 'Today';
      startDate = getStartOfDay();
      // Generate 12-day chart
      const dayData = getLast12Days();
      chart = generateMiniChart(dayData);
    }
    
    // Read logs and generate report
    const logs = readTokenLogs(startDate);
    const report = formatCostReport(logs, period, chart);
    
    // Send response to DM
    if (callback) {
      await callback({ text: report });
    }
    
    return {
      success: true,
      text: 'Cost report sent',
    };
  },
};

