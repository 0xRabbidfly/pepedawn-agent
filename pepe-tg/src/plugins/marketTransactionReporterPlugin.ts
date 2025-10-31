/**
 * Market Transaction Reporter Plugin
 * 
 * Plugin for monitoring Fake Rare market transactions and posting notifications.
 * Registers services: TransactionHistory, TokenScanClient, TransactionMonitor, TelegramNotificationService
 * 
 * Actions will be registered in Phase 4.
 */

import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { TransactionHistory } from '../services/transactionHistory.js';
import { TokenScanClient } from '../services/tokenscanClient.js';
import { TransactionMonitor } from '../services/transactionMonitor.js';
import { TelegramNotificationService } from '../services/telegramNotification.js';
import { fakeMarketAction } from '../actions/fakeMarketAction.js';

export const marketTransactionReporterPlugin: Plugin = {
  name: 'market-transaction-reporter',
  description: 'Monitors Fake Rare market transactions and posts notifications to Telegram',
  priority: 1000, // Lower priority than fake-rares plugin
  
  async init() {
    logger.info('Initializing Market Transaction Reporter Plugin');
  },
  
  services: [
    TransactionHistory,   // Database - no dependencies
    TokenScanClient,      // HTTP client - no dependencies  
    TelegramNotificationService, // Notification service - no dependencies
    TransactionMonitor,   // Depends on TokenScanClient and TransactionHistory (must be last)
  ],
  
  actions: [
    fakeMarketAction,           // /fm command for querying transaction history
  ],
  
  providers: [],
  
  evaluators: [],
  
  events: {}, // Event handlers are registered in services directly
};

