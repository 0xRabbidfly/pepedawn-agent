/**
 * TransactionMonitor Service
 * 
 * Monitors Counterparty protocol for Fake Rare transactions via TokenScan API.
 * Polls dispenses (sales) and dispensers (listings), filters by Fake Rare collection,
 * deduplicates, stores in database, and emits events for notification services.
 */

import type { IAgentRuntime } from '@elizaos/core';
import { Service, logger } from '@elizaos/core';
import type { Transaction, TransactionType } from '../models/transaction.js';
import type { FakeRareTransactionEvent } from '../events/transactionEvents.js';
import { TransactionHistory } from './transactionHistory.js';
import { TokenScanClient, type DispenseResponse, type DispenserResponse } from './tokenscanClient.js';
import { TelegramNotificationService } from './telegramNotification.js';
import { buildTokenScanUrl, buildXChainUrl } from '../utils/transactionUrls.js';

export class TransactionMonitor extends Service {
  static serviceType = 'transactionMonitor';
  capabilityDescription = 'Monitors Counterparty protocol for Fake Rare market transactions';

  private pollingInterval: NodeJS.Timeout | null = null;
  private currentBlockCursor: number = 0;
  private isRunning: boolean = false;
  private pollIntervalMs: number;
  private lastPollTime: number = 0;
  private lastTransactionTime: number = 0;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    
    // Get polling interval from settings (default: 3 minutes)
    const intervalSeconds = parseInt(
      (runtime.getSetting('POLL_INTERVAL_SECONDS') as string) || '180',
      10
    );
    this.pollIntervalMs = intervalSeconds * 1000;
  }

  /**
   * Wait for a service to become available with retries
   */
  private async waitForService<T>(
    serviceType: string,
    maxRetries: number = 10,
    retryDelay: number = 100
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      const service = this.runtime.getService(serviceType) as T;
      if (service) {
        return service;
      }
      logger.debug({ serviceType, attempt: i + 1 }, 'Waiting for service to become available');
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    throw new Error(`Service ${serviceType} not found after ${maxRetries} attempts`);
  }

  /**
   * Initialize and start monitoring
   */
  async start(): Promise<void> {
    try {
      // Wait for dependencies to be ready (services may initialize in parallel)
      const tokenScanClient = await this.waitForService<TokenScanClient>(
        TokenScanClient.serviceType
      );
      const transactionHistory = await this.waitForService<TransactionHistory>(
        TransactionHistory.serviceType
      );

      // Query current Counterparty block height and set as initial cursor
      // No historical catchup per FR-027, FR-028
      // Optional: Override starting block for testing/debugging
      const testBlockOverride = this.runtime.getSetting('TEST_START_BLOCK') as string | undefined;
      if (testBlockOverride) {
        this.currentBlockCursor = parseInt(testBlockOverride, 10);
        logger.info(`Starting from block ${this.currentBlockCursor} (TEST_START_BLOCK override)`);
      } else {
        this.currentBlockCursor = await tokenScanClient.getCurrentBlockHeight();
      }
      
      // Start polling loop
      this.isRunning = true;
      this.startPolling();

      logger.info(`TransactionMonitor started at block ${this.currentBlockCursor}`);
    } catch (error) {
      logger.error({ error }, 'Failed to start TransactionMonitor');
      throw error;
    }
  }

  /**
   * Start polling loop
   */
  private startPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Poll immediately, then schedule periodic polls
    this.pollOnce().catch((error) => {
      logger.error({ error }, 'Error in initial poll');
    });

    this.pollingInterval = setInterval(() => {
      if (this.isRunning) {
        this.pollOnce().catch((error) => {
          logger.error({ error }, 'Error in periodic poll');
        });
      }
    }, this.pollIntervalMs);
  }

  /**
   * Execute one polling cycle
   */
  private async pollOnce(): Promise<void> {
    try {
      this.lastPollTime = Date.now();
      
      const tokenScanClient = this.runtime.getService(TokenScanClient.serviceType) as TokenScanClient;
      const transactionHistory = this.runtime.getService(TransactionHistory.serviceType) as TransactionHistory;

      if (!tokenScanClient || !transactionHistory) {
        logger.warn('Required services not available for polling');
        return;
      }

      // Poll all transaction types in parallel:
      // - Dispenses: Sales from dispensers (vending machines)
      // - Dispensers: Listings/vending machines
      // - Order Matches: DEX atomic swap sales
      // - Orders: DEX listings
      // - Block info: To get timestamp
      const [dispenses, dispensers, orderMatches, orders, blockInfo] = await Promise.all([
        tokenScanClient.pollDispenses(this.currentBlockCursor),
        tokenScanClient.pollDispensers(this.currentBlockCursor),
        tokenScanClient.pollOrderMatches(this.currentBlockCursor),
        tokenScanClient.pollOrders(this.currentBlockCursor),
        tokenScanClient.getBlock(this.currentBlockCursor).catch(() => null),
      ]);
      
      // Get block timestamp (fallback to 0 if block fetch fails)
      const blockTimestamp = blockInfo?.block_time || 0;

      let processedCount = 0;
      let salesFound = 0;
      let listingsFound = 0;
      let latestBlockIndex = this.currentBlockCursor;

      // Process dispenses (sales)
      for (const dispense of dispenses) {
        if (this.shouldProcessTransaction(dispense, tokenScanClient)) {
          const transaction = await this.processDispense(dispense, transactionHistory, blockTimestamp);
          if (transaction) {
            processedCount++;
            salesFound++;
            this.lastTransactionTime = Date.now();
            latestBlockIndex = Math.max(latestBlockIndex, dispense.block_index);
            this.emitTransactionEvent(transaction);
          }
        }
        latestBlockIndex = Math.max(latestBlockIndex, dispense.block_index);
      }

      // Process dispensers (listings)
      for (const dispenser of dispensers) {
        if (this.shouldProcessDispenser(dispenser, tokenScanClient)) {
          const transaction = await this.processDispenser(dispenser, transactionHistory, blockTimestamp);
          if (transaction) {
            processedCount++;
            listingsFound++;
            this.lastTransactionTime = Date.now();
            latestBlockIndex = Math.max(latestBlockIndex, dispenser.block_index);
            this.emitTransactionEvent(transaction);
          }
        }
        latestBlockIndex = Math.max(latestBlockIndex, dispenser.block_index);
      }

      // Process order matches (DEX atomic swap sales)
      for (const orderMatch of orderMatches) {
        if (this.shouldProcessOrderMatch(orderMatch, tokenScanClient)) {
          const transaction = await this.processOrderMatch(orderMatch, transactionHistory, blockTimestamp);
          if (transaction) {
            processedCount++;
            salesFound++;
            this.lastTransactionTime = Date.now();
            latestBlockIndex = Math.max(latestBlockIndex, orderMatch.block_index);
            this.emitTransactionEvent(transaction);
          }
        }
        latestBlockIndex = Math.max(latestBlockIndex, orderMatch.block_index);
      }

      // Process orders (DEX listings)
      for (const order of orders) {
        if (this.shouldProcessOrder(order, tokenScanClient)) {
          const transaction = await this.processOrder(order, transactionHistory, blockTimestamp);
          if (transaction) {
            processedCount++;
            listingsFound++;
            this.lastTransactionTime = Date.now();
            latestBlockIndex = Math.max(latestBlockIndex, order.block_index);
            this.emitTransactionEvent(transaction);
          }
        }
        latestBlockIndex = Math.max(latestBlockIndex, order.block_index);
      }

      // Update cursor to latest block + 1
      if (latestBlockIndex > this.currentBlockCursor) {
        this.currentBlockCursor = latestBlockIndex + 1;
      } else {
        // No transactions found in this poll - advance by 1 block to continue scanning
        // This ensures we don't skip blocks when there's no activity
        this.currentBlockCursor += 1;
        
        // But don't go beyond current blockchain height
        const currentHeight = await tokenScanClient.getCurrentBlockHeight();
        if (this.currentBlockCursor > currentHeight) {
          this.currentBlockCursor = currentHeight;
        }
      }

      // Single consolidated log line (only info if there's activity)
      if (salesFound > 0 || listingsFound > 0) {
        logger.info(`📊 Counterparty Market Poll: block ${this.currentBlockCursor} - ${salesFound} sales, ${listingsFound} listings`);
      } else {
        logger.debug(`📊 Counterparty Market Poll: block ${this.currentBlockCursor} - no activity`);
      }
    } catch (error) {
      logger.error({ error }, 'Error in polling cycle - continuing monitoring');
      // Continue monitoring per FR-022
    }
  }

  /**
   * Check if dispense should be processed
   */
  private shouldProcessTransaction(
    dispense: DispenseResponse['data'][0],
    tokenScanClient: TokenScanClient
  ): boolean {
    // Only process valid transactions
    if (dispense.status !== 'valid') {
      return false;
    }

    // Check if asset is in Fake Rare collection
    return tokenScanClient.isFakeRareAsset(dispense.asset, dispense.asset_longname);
  }

  /**
   * Check if dispenser should be processed
   */
  private shouldProcessDispenser(
    dispenser: DispenserResponse['data'][0],
    tokenScanClient: TokenScanClient
  ): boolean {
    // Only process open dispensers
    if (dispenser.status !== 'open') {
      return false;
    }

    // Check if asset is in Fake Rare collection
    return tokenScanClient.isFakeRareAsset(dispenser.asset, dispenser.asset_longname);
  }

  /**
   * Process a dispense (sale) transaction
   */
  private async processDispense(
    dispense: DispenseResponse['data'][0],
    transactionHistory: TransactionHistory,
    blockTimestamp: number
  ): Promise<Transaction | null> {
    try {
      // Deduplication check
      if (await transactionHistory.exists(dispense.tx_hash)) {
        return null;
      }

      // Map dispense to Transaction
      const transaction: Transaction = {
        txHash: dispense.tx_hash,
        type: 'DIS_SALE',
        asset: dispense.asset_longname || dispense.asset,
        amount: parseInt(dispense.dispense_quantity, 10),
        price: 0, // Dispenses don't include price directly - need to look up dispenser
        paymentAsset: 'BTC', // Default assumption for dispensers
        timestamp: blockTimestamp,
        blockIndex: dispense.block_index,
        notified: false,
        tokenscanUrl: buildTokenScanUrl(dispense.tx_hash),
        xchainUrl: buildXChainUrl(dispense.tx_hash),
        createdAt: Math.floor(Date.now() / 1000),
      };

      // Look up dispenser to get price
      try {
        const tokenScanClient = this.runtime.getService(TokenScanClient.serviceType) as TokenScanClient;
        const txDetails = await tokenScanClient.getTransaction(dispense.tx_hash);

        if (txDetails) {
          if (typeof txDetails.btc_amount === 'number' && txDetails.btc_amount > 0) {
            transaction.price = txDetails.btc_amount;
            transaction.paymentAsset = 'BTC';
          } else if (typeof txDetails.xcp_amount === 'number' && txDetails.xcp_amount > 0) {
            transaction.price = txDetails.xcp_amount;
            transaction.paymentAsset = 'XCP';
          }
        }

        // Fallback: attempt to infer price from dispenser listing in the same block
        if (transaction.price === 0) {
          const dispensers = await tokenScanClient.pollDispensers(dispense.block_index);
          const matchingDispenser = dispensers.find(
            (d) => d.tx_hash === dispense.dispenser_tx_hash
          );
          
          if (matchingDispenser) {
            transaction.price = parseInt(matchingDispenser.satoshirate, 10);
            transaction.paymentAsset = 'BTC';
          }
        }
      } catch (error) {
        logger.warn({ txHash: dispense.tx_hash }, 'Could not lookup dispenser price');
      }

      // Store transaction
      const inserted = await transactionHistory.insert(transaction);
      if (!inserted) {
        logger.debug({ txHash: transaction.txHash }, 'Transaction already exists (race condition)');
        return null;
      }

      logger.debug({ txHash: transaction.txHash, type: transaction.type }, 'Transaction stored');
      return transaction;
    } catch (error) {
      logger.error({ error, txHash: dispense.tx_hash }, 'Failed to process dispense');
      return null;
    }
  }

  /**
   * Process a dispenser (listing) transaction
   */
  private async processDispenser(
    dispenser: DispenserResponse['data'][0],
    transactionHistory: TransactionHistory,
    blockTimestamp: number
  ): Promise<Transaction | null> {
    try {
      // Deduplication check
      if (await transactionHistory.exists(dispenser.tx_hash)) {
        return null;
      }

      // Map dispenser to Transaction
      const transaction: Transaction = {
        txHash: dispenser.tx_hash,
        type: 'DIS_LISTING',
        asset: dispenser.asset_longname || dispenser.asset,
        amount: parseInt(dispenser.give_quantity, 10),
        price: parseInt(dispenser.satoshirate, 10),
        paymentAsset: 'BTC', // Dispensers use BTC
        timestamp: blockTimestamp,
        blockIndex: dispenser.block_index,
        notified: false,
        tokenscanUrl: buildTokenScanUrl(dispenser.tx_hash),
        xchainUrl: buildXChainUrl(dispenser.tx_hash),
        createdAt: Math.floor(Date.now() / 1000),
      };

      // Store transaction
      const inserted = await transactionHistory.insert(transaction);
      if (!inserted) {
        return null;
      }

      logger.debug({ txHash: transaction.txHash, type: transaction.type }, 'Transaction stored');
      return transaction;
    } catch (error) {
      logger.error({ error, txHash: dispenser.tx_hash }, 'Failed to process dispenser');
      return null;
    }
  }

  /**
   * Check if order match should be processed
   */
  private shouldProcessOrderMatch(
    orderMatch: import('./tokenscanClient.js').OrderMatchResponse['data'][0],
    tokenScanClient: TokenScanClient
  ): boolean {
    // Only process completed order matches
    if (orderMatch.status !== 'completed') {
      return false;
    }

    // Check if either asset is a Fake Rare
    return tokenScanClient.isFakeRareAsset(orderMatch.forward_asset, orderMatch.forward_asset_longname) ||
           tokenScanClient.isFakeRareAsset(orderMatch.backward_asset, orderMatch.backward_asset_longname);
  }

  /**
   * Check if order should be processed
   */
  private shouldProcessOrder(
    order: import('./tokenscanClient.js').OrderResponse['data'][0],
    tokenScanClient: TokenScanClient
  ): boolean {
    // Only process open orders
    if (order.status !== 'open') {
      return false;
    }

    // Check if give_asset is a Fake Rare (selling a card)
    return tokenScanClient.isFakeRareAsset(order.give_asset, order.give_asset_longname);
  }

  /**
   * Process an order match (DEX atomic swap sale)
   */
  private async processOrderMatch(
    orderMatch: import('./tokenscanClient.js').OrderMatchResponse['data'][0],
    transactionHistory: TransactionHistory,
    blockTimestamp: number
  ): Promise<Transaction | null> {
    try {
      // Use match ID as unique identifier (since there's no single tx_hash)
      const uniqueId = orderMatch.id;
      
      // Deduplication check
      if (await transactionHistory.exists(uniqueId)) {
        return null;
      }

      // Determine which asset is the Fake Rare (for now, assume forward_asset)
      // In test mode, we'll track both assets
      const asset = orderMatch.forward_asset_longname || orderMatch.forward_asset;
      const paymentAsset = orderMatch.backward_asset_longname || orderMatch.backward_asset;

      const transaction: Transaction = {
        txHash: uniqueId, // Use match ID
        type: 'DEX_SALE',
        asset,
        amount: parseInt(orderMatch.forward_quantity, 10),
        price: parseInt(orderMatch.backward_quantity, 10),
        paymentAsset,
        timestamp: blockTimestamp,
        blockIndex: orderMatch.block_index,
        notified: false,
        tokenscanUrl: buildTokenScanUrl(orderMatch.tx0_hash),
        xchainUrl: buildXChainUrl(orderMatch.tx0_hash),
        createdAt: Math.floor(Date.now() / 1000),
      };

      // Store transaction
      const inserted = await transactionHistory.insert(transaction);
      if (!inserted) {
        logger.debug({ txHash: transaction.txHash }, 'Transaction already exists (race condition)');
        return null;
      }

      logger.debug({ txHash: transaction.txHash, type: transaction.type }, 'DEX order match stored');
      return transaction;
    } catch (error) {
      logger.error({ error, matchId: orderMatch.id }, 'Failed to process order match');
      return null;
    }
  }

  /**
   * Process an order (DEX listing)
   */
  private async processOrder(
    order: import('./tokenscanClient.js').OrderResponse['data'][0],
    transactionHistory: TransactionHistory,
    blockTimestamp: number
  ): Promise<Transaction | null> {
    try {
      // Deduplication check
      if (await transactionHistory.exists(order.tx_hash)) {
        return null;
      }

      const asset = order.give_asset_longname || order.give_asset;
      const paymentAsset = order.get_asset_longname || order.get_asset;

      const transaction: Transaction = {
        txHash: order.tx_hash,
        type: 'DEX_LISTING',
        asset,
        amount: parseInt(order.give_quantity, 10),
        price: parseInt(order.get_quantity, 10),
        paymentAsset,
        timestamp: blockTimestamp,
        blockIndex: order.block_index,
        notified: false,
        tokenscanUrl: buildTokenScanUrl(order.tx_hash),
        xchainUrl: buildXChainUrl(order.tx_hash),
        createdAt: Math.floor(Date.now() / 1000),
      };

      // Store transaction
      const inserted = await transactionHistory.insert(transaction);
      if (!inserted) {
        logger.debug({ txHash: transaction.txHash }, 'Transaction already exists (race condition)');
        return null;
      }

      logger.debug({ txHash: transaction.txHash, type: transaction.type }, 'DEX order stored');
      return transaction;
    } catch (error) {
      logger.error({ error, txHash: order.tx_hash }, 'Failed to process order');
      return null;
    }
  }

  /**
   * Emit fakeRareTransaction event by directly calling notification service
   */
  private emitTransactionEvent(transaction: Transaction): void {
    try {
      const event: FakeRareTransactionEvent = {
        txHash: transaction.txHash,
        type: transaction.type,
        asset: transaction.asset,
        amount: transaction.amount,
        price: transaction.price,
        paymentAsset: transaction.paymentAsset,
        timestamp: transaction.timestamp,
        blockIndex: transaction.blockIndex,
        tokenscanUrl: transaction.tokenscanUrl,
        xchainUrl: transaction.xchainUrl,
      };

      // Call notification service directly instead of using events
      const notificationService = this.runtime.getService(
        TelegramNotificationService.serviceType
      ) as TelegramNotificationService;
      
      if (notificationService) {
        // Use a private method to handle the event
        (notificationService as any).handleTransactionEvent(event).catch((error: Error) => {
          logger.error({ error, txHash: transaction.txHash }, 'Failed to notify transaction');
        });
      }

      logger.debug({ txHash: transaction.txHash }, 'Transaction event processed');
    } catch (error) {
      logger.error({ error, txHash: transaction.txHash }, 'Failed to emit transaction event');
      // Don't throw - continue monitoring
    }
  }

  /**
   * Get health status for monitoring
   */
  getHealthStatus(): {
    isRunning: boolean;
    currentBlockCursor: number;
    lastPollTime: number;
    lastTransactionTime: number;
    pollIntervalMs: number;
  } {
    return {
      isRunning: this.isRunning,
      currentBlockCursor: this.currentBlockCursor,
      lastPollTime: this.lastPollTime,
      lastTransactionTime: this.lastTransactionTime,
      pollIntervalMs: this.pollIntervalMs,
    };
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    logger.info('TransactionMonitor stopped');
  }

  /**
   * Static start method for ElizaOS service lifecycle
   */
  static async start(runtime: IAgentRuntime): Promise<TransactionMonitor> {
    const service = new TransactionMonitor(runtime);
    await service.start();
    return service;
  }

  /**
   * Static stop method for ElizaOS service lifecycle
   */
  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(TransactionMonitor.serviceType) as TransactionMonitor | null;
    if (service) {
      await service.stop();
    }
  }
}

