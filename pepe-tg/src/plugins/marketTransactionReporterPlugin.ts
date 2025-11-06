/**
 * Market Transaction Reporter Plugin
 * 
 * Plugin for monitoring Fake Rare market transactions and posting notifications.
 * Also handles periodic educational content (tips and card showcases).
 * 
 * Registered services:
 * - TransactionHistory: SQLite database for transaction storage
 * - TokenScanClient: Counterparty blockchain API client
 * - DispenserQueryService: Real-time dispenser query service
 * - TransactionMonitor: Polls blockchain for market activity
 * - TelegramNotificationService: Posts market notifications to Telegram
 * - PeriodicContentService: Posts helpful tips and card showcases
 */

import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { TransactionHistory } from '../services/transactionHistory.js';
import { TokenScanClient } from '../services/tokenscanClient.js';
import { DispenserQueryService } from '../services/dispenserQuery.js';
import { TransactionMonitor } from '../services/transactionMonitor.js';
import { TelegramNotificationService } from '../services/telegramNotification.js';
import { PeriodicContentService } from '../services/periodicContent.js';
import { fakeMarketAction } from '../actions/fakeMarketAction.js';

export const marketTransactionReporterPlugin: Plugin = {
  name: 'market-transaction-reporter',
  description: 'Monitors Fake Rare market transactions, posts notifications, and shares periodic educational content',
  priority: 1000, // Lower priority than fake-rares plugin
  
  async init() {
    logger.info('Initializing Market Transaction Reporter Plugin');
  },
  
  services: [
    TransactionHistory,   // Database - no dependencies
    TokenScanClient,      // HTTP client - no dependencies
    DispenserQueryService, // Real-time dispenser query - depends on TokenScanClient
    TelegramNotificationService, // Notification service - no dependencies
    TransactionMonitor,   // Depends on TokenScanClient and TransactionHistory
    PeriodicContentService, // Periodic tips and card showcases - depends on TransactionHistory (must be last)
  ],
  
  actions: [
    fakeMarketAction,           // /fm command for querying transaction history
  ],
  
  providers: [],
  
  evaluators: [],
  
  events: {}, // Event handlers are registered in services directly
};

