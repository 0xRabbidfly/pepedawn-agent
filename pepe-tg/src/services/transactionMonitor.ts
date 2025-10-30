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
      this.currentBlockCursor = await tokenScanClient.getCurrentBlockHeight();
      
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

      // Poll dispenses (sales) and dispensers (listings) in parallel
      const [dispenses, dispensers] = await Promise.all([
        tokenScanClient.pollDispenses(this.currentBlockCursor),
        tokenScanClient.pollDispensers(this.currentBlockCursor),
      ]);

      let processedCount = 0;
      let salesFound = 0;
      let listingsFound = 0;
      let latestBlockIndex = this.currentBlockCursor;

      // Process dispenses (sales)
      for (const dispense of dispenses) {
        if (this.shouldProcessTransaction(dispense, tokenScanClient)) {
          const transaction = await this.processDispense(dispense, transactionHistory);
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
          const transaction = await this.processDispenser(dispenser, transactionHistory);
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

      // Update cursor to latest block + 1
      if (latestBlockIndex > this.currentBlockCursor) {
        this.currentBlockCursor = latestBlockIndex + 1;
      }

      // Single consolidated log line
      logger.info(`📊 Counterparty Market Poll [🧪 TEST MODE - ALL ASSETS]: block ${this.currentBlockCursor} - ${salesFound} sales, ${listingsFound} listings`);
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

    // 🧪 TEMPORARILY DISABLED: Check if asset is in Fake Rare collection
    // const asset = dispense.asset_longname || dispense.asset;
    // return tokenScanClient.isFakeRareAsset(dispense.asset, dispense.asset_longname);
    return true; // 🧪 TEST MODE: Accept all valid transactions
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

    // 🧪 TEMPORARILY DISABLED: Check if asset is in Fake Rare collection
    // return tokenScanClient.isFakeRareAsset(dispenser.asset, dispenser.asset_longname);
    return true; // 🧪 TEST MODE: Accept all open dispensers
  }

  /**
   * Process a dispense (sale) transaction
   */
  private async processDispense(
    dispense: DispenseResponse['data'][0],
    transactionHistory: TransactionHistory
  ): Promise<Transaction | null> {
    try {
      // Deduplication check
      if (await transactionHistory.exists(dispense.tx_hash)) {
        return null;
      }

      // Map dispense to Transaction
      const transaction: Transaction = {
        txHash: dispense.tx_hash,
        type: 'SALE',
        asset: dispense.asset_longname || dispense.asset,
        amount: parseInt(dispense.dispense_quantity, 10),
        price: 0, // Dispenses don't include price directly - need to look up dispenser
        paymentAsset: 'XCP', // Default assumption - may need to look up from dispenser
        timestamp: dispense.timestamp,
        blockIndex: dispense.block_index,
        notified: false,
        tokenscanUrl: `https://tokenscan.io/transaction/${dispense.tx_hash}`,
        xchainUrl: `https://xchain.io/tx/${dispense.tx_hash}`,
        createdAt: Math.floor(Date.now() / 1000),
      };

      // Look up dispenser to get price
      try {
        const tokenScanClient = this.runtime.getService(TokenScanClient.serviceType) as TokenScanClient;
        const dispensers = await tokenScanClient.pollDispensers();
        const matchingDispenser = dispensers.find(
          (d) => d.tx_hash === dispense.dispenser_tx_hash
        );
        
        if (matchingDispenser) {
          transaction.price = parseInt(matchingDispenser.satoshirate, 10);
          transaction.paymentAsset = 'BTC'; // Dispensers typically use BTC
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
    transactionHistory: TransactionHistory
  ): Promise<Transaction | null> {
    try {
      // Deduplication check
      if (await transactionHistory.exists(dispenser.tx_hash)) {
        return null;
      }

      // Map dispenser to Transaction
      const transaction: Transaction = {
        txHash: dispenser.tx_hash,
        type: 'LISTING',
        asset: dispenser.asset_longname || dispenser.asset,
        amount: parseInt(dispenser.give_quantity, 10),
        price: parseInt(dispenser.satoshirate, 10),
        paymentAsset: 'BTC', // Dispensers use BTC
        timestamp: dispenser.timestamp,
        blockIndex: dispenser.block_index,
        notified: false,
        tokenscanUrl: `https://tokenscan.io/transaction/${dispenser.tx_hash}`,
        xchainUrl: `https://xchain.io/tx/${dispenser.tx_hash}`,
        createdAt: Math.floor(Date.now() / 1000),
      };

      // Store transaction
      const inserted = await transactionHistory.insert(transaction);
      if (!inserted) {
        logger.debug({ txHash: transaction.txHash }, 'Transaction already exists (race condition)');
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

