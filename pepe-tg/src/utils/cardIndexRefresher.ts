/**
 * Card Index Auto-Refresher
 * 
 * Periodically fetches the latest fake-rares-data.json from GitHub
 * and updates the in-memory card index without requiring a restart.
 * 
 * This enables zero-downtime updates when new cards are added.
 */

import type { CardInfo } from '../data/fullCardIndex';
import { logger as coreLogger } from '@elizaos/core';

// Configuration
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (once per day)
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/0xRabbidfly/pepedawn-agent/master/pepe-tg/src/data/fake-rares-data.json';

// In-memory card data (updated periodically)
let cardIndex: CardInfo[] = [];
let cardInfoMap: Record<string, CardInfo> = {};
let lastRefreshTime: Date | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

/**
 * Logger for refresh operations
 */
const logger = {
  info: (msg: string, data?: any) => {
    const timestamp = new Date().toISOString();
    coreLogger.info(`[${timestamp}] [CardRefresh] ${msg}`, data || '');
  },
  error: (msg: string, error: any) => {
    const timestamp = new Date().toISOString();
    coreLogger.error(`[${timestamp}] [CardRefresh] ERROR: ${msg}`, error);
  },
};

/**
 * Fetches latest card data from GitHub
 */
async function fetchLatestCardData(): Promise<CardInfo[] | null> {
  try {
    logger.info('Fetching latest card data from GitHub...');
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const response = await fetch(GITHUB_RAW_URL, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      logger.error(`GitHub fetch failed with status ${response.status}`, null);
      return null;
    }
    
    const data = await response.json() as CardInfo[];
    
    if (!Array.isArray(data) || data.length === 0) {
      logger.error('Invalid data format from GitHub', null);
      return null;
    }
    
    logger.info(`Successfully fetched ${data.length} cards from GitHub`);
    return data;
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        logger.error('Fetch timeout after 10s', error);
      } else {
        logger.error('Fetch failed', error);
      }
    }
    return null;
  }
}

/**
 * Updates in-memory card index with new data
 */
function updateCardIndex(newData: CardInfo[]): void {
  const previousCount = cardIndex.length;
  
  // Update arrays and maps
  cardIndex = newData;
  cardInfoMap = Object.fromEntries(
    newData.map(card => [card.asset.toUpperCase(), card])
  );
  
  lastRefreshTime = new Date();
  
  const addedCount = newData.length - previousCount;
  if (addedCount > 0) {
    logger.info(`✨ Card index updated: +${addedCount} new cards (total: ${newData.length})`);
  } else if (addedCount < 0) {
    logger.info(`⚠️  Card index updated: ${addedCount} cards removed (total: ${newData.length})`);
  } else {
    logger.info(`✓ Card index refreshed (no changes, total: ${newData.length})`);
  }
}

/**
 * Performs a refresh check
 */
async function performRefresh(): Promise<void> {
  try {
    const latestData = await fetchLatestCardData();
    
    if (latestData) {
      updateCardIndex(latestData);
    } else {
      logger.info('Refresh failed - keeping existing index');
    }
  } catch (error) {
    logger.error('Exception during refresh', error);
  }
}

/**
 * Starts the auto-refresh timer
 */
export function startAutoRefresh(initialData: CardInfo[]): void {
  // Initialize with data from disk
  cardIndex = initialData;
  cardInfoMap = Object.fromEntries(
    initialData.map(card => [card.asset.toUpperCase(), card])
  );
  
  logger.info(`🚀 Auto-refresh started with ${initialData.length} cards`);
  logger.info(`   Refresh interval: ${REFRESH_INTERVAL_MS / 1000 / 60 / 60} hours (once per day)`);
  logger.info(`   GitHub source: ${GITHUB_RAW_URL}`);
  
  // Perform first refresh after 5 minutes
  setTimeout(() => {
    logger.info('Performing initial refresh check...');
    performRefresh();
  }, 5 * 60 * 1000);
  
  // Then refresh every hour
  refreshTimer = setInterval(() => {
    logger.info('Performing scheduled refresh...');
    performRefresh();
  }, REFRESH_INTERVAL_MS);
  
  logger.info('✅ Auto-refresh configured successfully\n');
}

/**
 * Stops the auto-refresh timer
 */
export function stopAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    logger.info('Auto-refresh stopped');
  }
}

/**
 * Manually triggers a refresh
 */
export async function manualRefresh(): Promise<{ success: boolean; cardCount: number }> {
  logger.info('Manual refresh triggered...');
  await performRefresh();
  return {
    success: true,
    cardCount: cardIndex.length,
  };
}

/**
 * Gets current card info (hot-reloadable)
 */
export function getCardInfo(cardName: string): CardInfo | undefined {
  return cardInfoMap[cardName.toUpperCase()];
}

/**
 * Gets the full card index (hot-reloadable)
 */
export function getFullCardIndex(): CardInfo[] {
  return cardIndex;
}

/**
 * Gets refresh statistics
 */
export function getRefreshStats(): {
  lastRefresh: Date | null;
  cardCount: number;
  isActive: boolean;
} {
  return {
    lastRefresh: lastRefreshTime,
    cardCount: cardIndex.length,
    isActive: refreshTimer !== null,
  };
}

