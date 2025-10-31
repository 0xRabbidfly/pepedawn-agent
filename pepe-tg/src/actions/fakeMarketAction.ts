/**
 * FakeMarketAction
 * 
 * Handles /fm command for querying Fake Rare transaction history.
 * Supports:
 * - /fm N - Last N sales and listings (combined)
 * - /fm S N - Last N sales only
 * - /fm L N - Last N listings only
 */

import type { Action, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { TransactionHistory } from '../services/transactionHistory.js';
import type { Transaction } from '../models/transaction.js';

/**
 * Parse /fm command and extract query parameters
 */
function parseCommand(text: string): { type: 'SALE' | 'LISTING' | null; limit: number; error: string | null } {
  const trimmed = text.trim();
  
  // Default: /fm alone = last 10 combined
  if (trimmed === '/fm') {
    return { type: null, limit: 10, error: null };
  }
  
  // Match patterns: /fm N, /fm S N, /fm L N
  const combinedPattern = /^\/fm\s+(\d+)$/i;
  const salesPattern = /^\/fm\s+s\s+(\d+)$/i;
  const listingsPattern = /^\/fm\s+l\s+(\d+)$/i;
  
  let match = trimmed.match(combinedPattern);
  if (match) {
    const limit = parseInt(match[1], 10);
    if (limit < 1 || limit > 20) {
      return { type: null, limit: 0, error: 'Limit must be between 1 and 20' };
    }
    return { type: null, limit, error: null };
  }
  
  match = trimmed.match(salesPattern);
  if (match) {
    const limit = parseInt(match[1], 10);
    if (limit < 1 || limit > 20) {
      return { type: null, limit: 0, error: 'Limit must be between 1 and 20' };
    }
    return { type: 'SALE', limit, error: null };
  }
  
  match = trimmed.match(listingsPattern);
  if (match) {
    const limit = parseInt(match[1], 10);
    if (limit < 1 || limit > 20) {
      return { type: null, limit: 0, error: 'Limit must be between 1 and 20' };
    }
    return { type: 'LISTING', limit, error: null };
  }
  
  return { type: null, limit: 0, error: 'Invalid command format' };
}

/**
 * Format price from satoshis to decimal string
 */
function formatPrice(priceSatoshis: number, paymentAsset: string): string {
  if (paymentAsset === 'BTC' || paymentAsset === 'XCP') {
    const amount = priceSatoshis / 100000000;
    return amount.toString().replace(/\.?0+$/, '');
  }
  // Generic: assume 8 decimals
  const amount = priceSatoshis / 100000000;
  return amount.toString().replace(/\.?0+$/, '');
}

/**
 * Format Unix timestamp to "MMM DD HH:mm" UTC format
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const month = months[date.getUTCMonth()];
  const day = date.getUTCDate().toString().padStart(2, '0');
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');

  return `${month} ${day} ${hours}:${minutes}`;
}

/**
 * Format a single transaction as a one-line entry
 */
function formatTransactionLine(tx: Transaction): string {
  const price = formatPrice(tx.price, tx.paymentAsset);
  const timestamp = formatTimestamp(tx.timestamp);
  
  // Icons for transaction types
  const isSale = tx.type === 'DIS_SALE' || tx.type === 'DEX_SALE';
  const saleIcon = tx.type === 'DIS_SALE' ? '💰' : '⚡';
  const listingIcon = tx.type === 'DIS_LISTING' ? '📋' : '🔄';
  const typeIcon = (tx.type === 'DIS_SALE' || tx.type === 'DIS_LISTING') ? '🎰' : '📊';
  
  if (isSale) {
    return `• ${tx.asset} x${tx.amount.toLocaleString()} | ${price} ${tx.paymentAsset} | ${timestamp} ${typeIcon}`;
  } else {
    return `• ${tx.asset} | Qty: ${tx.amount.toLocaleString()} | ${price} ${tx.paymentAsset} | ${timestamp} ${typeIcon}`;
  }
}

/**
 * Format combined query response
 */
function formatCombinedResponse(
  sales: Transaction[],
  listings: Transaction[],
  totalSales: number,
  totalListings: number,
  limit: number
): string {
  let response = '';
  
  if (sales.length > 0) {
    response += `💰 Fake Rare SALES (${sales.length}):\n`;
    response += sales.map(formatTransactionLine).join('\n');
    response += '\n\n';
  }
  
  if (listings.length > 0) {
    response += `📋 Fake Rare LISTINGS (${listings.length}):\n`;
    response += listings.map(formatTransactionLine).join('\n');
    response += '\n\n';
  }
  
  response += `30-day total: ${totalSales} sales, ${totalListings} listings`;
  
  return response;
}

/**
 * Format sales-only query response
 */
function formatSalesResponse(sales: Transaction[], totalSales: number, limit: number): string {
  let response = sales.map(formatTransactionLine).join('\n');
  response += `\n\n30-day total: ${totalSales} sales`;
  return response;
}

/**
 * Format listings-only query response
 */
function formatListingsResponse(listings: Transaction[], totalListings: number, limit: number): string {
  let response = listings.map(formatTransactionLine).join('\n');
  response += `\n\n30-day total: ${totalListings} listings`;
  return response;
}

/**
 * Format empty results message
 */
function formatEmptyResponse(type: 'SALE' | 'LISTING' | null): string {
  if (type === 'SALE') {
    return 'ℹ️ No sales found in the last 30 days.';
  } else if (type === 'LISTING') {
    return 'ℹ️ No listings found in the last 30 days.';
  } else {
    return 'ℹ️ No transactions found in the last 30 days.';
  }
}

/**
 * Format help/error message
 */
function formatHelpMessage(): string {
  return `❌ Invalid command format.

Usage:
  /fm - Recent sales + listings (default 10)
  /fm N - Last N sales and listings (max 20)
  /fm S N - Last N sales (max 20)
  /fm L N - Last N listings (max 20)`;
}

/**
 * Format error message for system errors
 */
function formatSystemErrorMessage(): string {
  return '⚠️ Unable to retrieve transaction data. Please try again later.';
}

/**
 * Truncate message if it exceeds Telegram's 4096 character limit
 */
function truncateIfNeeded(message: string): string {
  const MAX_LENGTH = 4000; // Leave some buffer below 4096
  if (message.length <= MAX_LENGTH) {
    return message;
  }
  
  const truncated = message.slice(0, MAX_LENGTH - 50);
  return truncated + '\n\n⚠️ Message truncated due to length limit.';
}

export const fakeMarketAction: Action = {
  name: 'FAKE_MARKET_QUERY',
  description: 'Query Fake Rare transaction history with /fm command',
  similes: ['MARKET_QUERY', 'FM', 'TRANSACTION_HISTORY'],
  examples: [],
  
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').trim();
    // Match /fm command patterns
    return /^\/fm(\s+(s|l)\s+\d+|\s+\d+)?$/i.test(text);
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback
  ) => {
    try {
      const text = (message.content.text || '').trim();
      
      logger.info(`\n━━━━━ /fm ━━━━━ ${text}`);
      
      // Parse command
      const parseResult = parseCommand(text);
      if (parseResult.error) {
        const helpMessage = formatHelpMessage();
        if (callback) {
          await callback({ text: helpMessage });
        }
        return {
          success: false,
          text: 'Invalid command format',
        };
      }
      
      // Get TransactionHistory service
      const transactionHistory = runtime.getService(TransactionHistory.serviceType) as TransactionHistory;
      if (!transactionHistory) {
        logger.error('TransactionHistory service not found');
        const errorMessage = formatSystemErrorMessage();
        if (callback) {
          await callback({ text: errorMessage });
        }
        return {
          success: false,
          text: 'Service not available',
        };
      }
      
      // Execute query based on type
      let response: string;
      let sales: Transaction[] = [];
      let listings: Transaction[] = [];
      let totalSales = 0;
      let totalListings = 0;
      
      if (parseResult.type === 'SALE') {
        sales = await transactionHistory.querySales(parseResult.limit);
        totalSales = await transactionHistory.getTotalSales();
        
        if (sales.length === 0) {
          response = formatEmptyResponse('SALE');
        } else {
          response = formatSalesResponse(sales, totalSales, parseResult.limit);
        }
      } else if (parseResult.type === 'LISTING') {
        listings = await transactionHistory.queryListings(parseResult.limit);
        totalListings = await transactionHistory.getTotalListings();
        
        if (listings.length === 0) {
          response = formatEmptyResponse('LISTING');
        } else {
          response = formatListingsResponse(listings, totalListings, parseResult.limit);
        }
      } else {
        // Combined query
        const combined = await transactionHistory.queryCombined(parseResult.limit);
        sales = combined.sales;
        listings = combined.listings;
        totalSales = await transactionHistory.getTotalSales();
        totalListings = await transactionHistory.getTotalListings();
        
        if (sales.length === 0 && listings.length === 0) {
          response = formatEmptyResponse(null);
        } else {
          response = formatCombinedResponse(sales, listings, totalSales, totalListings, parseResult.limit);
        }
      }
      
      // Truncate if needed
      response = truncateIfNeeded(response);
      
      // Send response
      if (callback) {
        await callback({ text: response });
      }
      
      logger.info(`/fm complete: ${sales.length} sales, ${listings.length} listings (${parseResult.type || 'combined'}, limit ${parseResult.limit})`);
      
      return {
        success: true,
        text: 'Transaction query sent',
      };
    } catch (error) {
      logger.error({ error }, 'Failed to execute transaction query');
      const errorMessage = formatSystemErrorMessage();
      if (callback) {
        await callback({ text: errorMessage });
      }
      return {
        success: false,
        text: 'Query failed',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

