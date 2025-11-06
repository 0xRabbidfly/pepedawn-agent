/**
 * FakeMarketAction
 * 
 * Handles /fm command for querying Fake Rare transaction history.
 * Supports:
 * - /fm - Last 10 sales and listings (default)
 * - /fm N - Last N sales and listings (combined)
 * - /fm S N - Last N sales only
 * - /fm L N - Last N listings only
 * - /fm CARDNAME - Active dispensers for a specific card (real-time)
 */

import type { Action, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { TransactionHistory } from '../services/transactionHistory.js';
import { DispenserQueryService, type DispenserListing } from '../services/dispenserQuery.js';
import type { Transaction } from '../types/transaction.js';
import { FULL_CARD_INDEX } from '../data/fullCardIndex.js';
import { findBestMatch, findTopMatches, FUZZY_MATCH_THRESHOLDS } from '../utils/fuzzyMatch.js';
import { buildTokenScanUrl } from '../utils/transactionUrls.js';

/**
 * Parse result with optional asset for dispenser queries
 */
interface ParseResult {
  type: 'SALE' | 'LISTING' | 'DISPENSER' | null;
  limit: number;
  asset?: string;
  error: string | null;
}

/**
 * Parse /fm command and extract query parameters
 */
function parseCommand(text: string): ParseResult {
  const trimmed = text.trim();
  
  // Default: /fm alone = last 10 combined (handle @botname suffix)
  if (/^\/fm(?:@[A-Za-z0-9_]+)?$/i.test(trimmed)) {
    return { type: null, limit: 10, error: null };
  }
  
  // NEW: /fm CARDNAME - Check for card name pattern BEFORE numeric patterns
  // Pattern: /fm CARDNAME (card names start with letter, not digit)
  const dispenserCardPattern = /^\/fm(?:@[A-Za-z0-9_]+)?\s+([A-Za-z][A-Za-z0-9]*)$/i;
  const cardMatch = trimmed.match(dispenserCardPattern);
  
  if (cardMatch) {
    const cardInput = cardMatch[1].toUpperCase();
    
    // Try exact match first
    const allAssets = FULL_CARD_INDEX.map(c => c.asset);
    const exactMatch = allAssets.find(asset => asset.toUpperCase() === cardInput);
    
    if (exactMatch) {
      return { type: 'DISPENSER', limit: 10, asset: exactMatch, error: null };
    }
    
    // Try fuzzy match (high confidence = 75%+)
    const fuzzyMatch = findBestMatch(
      cardInput, 
      allAssets, 
      FUZZY_MATCH_THRESHOLDS.HIGH_CONFIDENCE
    );
    
    if (fuzzyMatch) {
      logger.info(`Fuzzy matched "${cardInput}" → "${fuzzyMatch.name}" (${(fuzzyMatch.similarity * 100).toFixed(0)}%)`);
      return { type: 'DISPENSER', limit: 10, asset: fuzzyMatch.name, error: null };
    }
    
    // No match - show suggestions
    const topMatches = findTopMatches(cardInput, allAssets, 3);
    const suggestions = topMatches
      .filter(m => m.similarity >= FUZZY_MATCH_THRESHOLDS.MODERATE)
      .map(m => m.name)
      .join(', ');
    
    if (suggestions) {
      return { 
        type: null, 
        limit: 0, 
        error: `Card "${cardInput}" not found. Did you mean: ${suggestions}?` 
      };
    } else {
      return { 
        type: null, 
        limit: 0, 
        error: `Card "${cardInput}" not found in Fake Rares collection.` 
      };
    }
  }
  
  // Match patterns: /fm N, /fm S N, /fm L N (handle @botname suffix)
  const combinedPattern = /^\/fm(?:@[A-Za-z0-9_]+)?\s+(\d+)$/i;
  const salesPattern = /^\/fm(?:@[A-Za-z0-9_]+)?\s+s\s+(\d+)$/i;
  const listingsNumericPattern = /^\/fm(?:@[A-Za-z0-9_]+)?\s+l\s+(\d+)$/i;
  
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
  
  match = trimmed.match(listingsNumericPattern);
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
    return `• *${tx.asset}* x${tx.amount.toLocaleString()} | ${price} ${tx.paymentAsset} | ${timestamp} ${typeIcon}`;
  } else {
    return `• *${tx.asset}* | Qty: ${tx.amount.toLocaleString()} | ${price} ${tx.paymentAsset} | ${timestamp} ${typeIcon}`;
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
    response += `💰 FAKE RARE Sales (${sales.length}):\n`;
    response += sales.map(formatTransactionLine).join('\n');
    response += '\n\n';
  }
  
  if (listings.length > 0) {
    response += `📋 FAKE RARE Listings (${listings.length}):\n`;
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
 * Format dispensers for a specific asset (real-time data)
 * Shows: price | available/escrow | address (8 chars) | clickable link
 */
function formatDispensersByAsset(
  asset: string,
  dispensers: DispenserListing[]
): string {
  if (dispensers.length === 0) {
    return `ℹ️ No active dispensers found for *${asset}*\n\n💡 Dispensers may be closed or sold out. Check Horizon Market for DEX orders.`;
  }
  
  // Limit to top 5 cheapest
  const topFive = dispensers.slice(0, 5);
  
  let response = `🎰 *(${topFive.length}) Active Dispensers for ${asset} (lowest price):*\n`;
  
  for (const d of topFive) {
    // Format price in BTC
    const price = formatPrice(d.pricePerUnit, 'BTC');
    
    // Truncate address to first 8 chars with ellipsis
    const addr = d.source.slice(0, 8) + '...';
    
    // Format with bullet point, no spacing between lines
    response += `• ${price} BTC | ${d.giveRemaining}/${d.escrowQuantity} available | ${addr} | 🔗 [View](${buildTokenScanUrl(d.txHash)})\n`;
  }
  
  return response;
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
  /fm L N - Last N listings (max 20)
  /fm CARDNAME - Active dispensers for card (real-time)`;
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
    // Match /fm command patterns (with optional @botname mention)
    // Supports: /fm, /fm N, /fm S N, /fm L N, /fm CARDNAME
    return /^(?:@[A-Za-z0-9_]+\s+)?\/fm(?:@[A-Za-z0-9_]+)?(\s+([A-Za-z][A-Za-z0-9]*|(s|l)\s+\d+|\d+))?$/i.test(text);
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback
  ) => {
    const text = (message.content.text || '').trim();
    logger.info(`━━━━━ /fm ━━━━━ ${text}`);

    try {
      // Parse command
      const parseResult = parseCommand(text);
      if (parseResult.error) {
        const helpMessage = formatHelpMessage();
        if (callback) {
          await callback({ 
            text: helpMessage,
            channelType: message.content.channelType 
          });
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
          await callback({ 
            text: errorMessage,
            channelType: message.content.channelType 
          });
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
      
      if (parseResult.type === 'DISPENSER') {
        // Real-time dispenser query for specific asset
        const dispenserService = runtime.getService(DispenserQueryService.serviceType) as DispenserQueryService;
        if (!dispenserService) {
          logger.error('DispenserQueryService not found');
          const errorMessage = formatSystemErrorMessage();
          if (callback) {
            await callback({ 
              text: errorMessage,
              channelType: message.content.channelType 
            });
          }
          return {
            success: false,
            text: 'Dispenser service not available',
          };
        }
        
        logger.info(`Fetching dispensers for asset: ${parseResult.asset}`);
        const dispensers = await dispenserService.getActiveDispensersForAsset(
          parseResult.asset!,
          parseResult.limit
        );
        
        response = formatDispensersByAsset(parseResult.asset!, dispensers);
        
        if (callback) {
          await callback({ 
            text: response,
            channelType: message.content.channelType 
          });
        }
        
        logger.info(`/fm ${parseResult.asset} complete: ${dispensers.length} active dispensers`);
        
        return {
          success: true,
          text: 'Dispenser query sent',
        };
      } else if (parseResult.type === 'SALE') {
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
        await callback({ 
          text: response,
          channelType: message.content.channelType 
        });
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
        await callback({ 
          text: errorMessage,
          channelType: message.content.channelType 
        });
      }
      return {
        success: false,
        text: 'Query failed',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

