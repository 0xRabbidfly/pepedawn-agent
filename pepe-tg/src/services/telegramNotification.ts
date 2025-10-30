/**
 * TelegramNotificationService
 * 
 * Listens for fakeRareTransaction events and posts formatted notifications
 * to a configured Telegram channel. Handles formatting, price/timestamp conversion,
 * and error handling per FR-021 (log-and-skip on failures).
 */

import type { IAgentRuntime } from '@elizaos/core';
import { Service, logger } from '@elizaos/core';
import type { FakeRareTransactionEvent } from '../events/transactionEvents.js';
import { TransactionHistory } from './transactionHistory.js';

export class TelegramNotificationService extends Service {
  static serviceType = 'telegramNotification';
  capabilityDescription = 'Posts transaction notifications to Telegram channel';

  private channelId: string | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    
    // Get channel ID from settings
    const channelIdSetting = runtime.getSetting('TELEGRAM_CHANNEL_ID') as string | undefined;
    this.channelId = channelIdSetting || null;
    
    if (!this.channelId) {
      logger.warn('TELEGRAM_CHANNEL_ID not configured - notifications will be skipped');
    }

    logger.info('TelegramNotificationService initialized');
  }

  /**
   * Handle fakeRareTransaction event (called directly by TransactionMonitor)
   */
  async handleTransactionEvent(event: FakeRareTransactionEvent): Promise<void> {
    try {
      if (!this.channelId) {
        logger.debug({ txHash: event.txHash }, 'Skipping notification - channel ID not configured');
        return;
      }

      // Format notification message
      const message = this.formatNotification(event);

      // Send to Telegram channel
      await this.sendTelegramMessage(this.channelId, message);

      // Mark as notified in database
      const transactionHistory = this.runtime.getService(TransactionHistory.serviceType) as TransactionHistory;
      if (transactionHistory) {
        transactionHistory.markNotified(event.txHash);
      }

      logger.info(
        { txHash: event.txHash, type: event.type },
        'Transaction notification sent successfully'
      );
    } catch (error) {
      // Log error and continue processing (per FR-021, FR-022)
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          txHash: event.txHash,
          timestamp: new Date().toISOString(),
        },
        'Failed to send transaction notification'
      );
      // Don't rethrow - continue processing
    }
  }

  /**
   * Format notification message based on transaction type
   */
  private formatNotification(event: FakeRareTransactionEvent): string {
    if (event.type === 'SALE') {
      return this.formatSaleNotification(event);
    } else {
      return this.formatListingNotification(event);
    }
  }

  /**
   * Format sale notification
   * Format: "SOLD: {asset} x{amount} | Paid: {price} {paymentAsset} | {timestamp}\n🔗 [TokenScan]({url}) | [XChain]({url})"
   */
  private formatSaleNotification(event: FakeRareTransactionEvent): string {
    const amount = event.amount.toLocaleString();
    const price = this.formatPrice(event.price, event.paymentAsset);
    const timestamp = this.formatTimestamp(event.timestamp);

    return (
      `SOLD: ${event.asset} x${amount} | Paid: ${price} ${event.paymentAsset} | ${timestamp}\n` +
      `🔗 [TokenScan](${event.tokenscanUrl}) | [XChain](${event.xchainUrl})`
    );
  }

  /**
   * Format listing notification
   * Format: "LISTING: {asset} | Qty: {amount} | Price: {price} {paymentAsset} | {timestamp}\n🔗 [TokenScan]({url}) | [XChain]({url})"
   */
  private formatListingNotification(event: FakeRareTransactionEvent): string {
    const amount = event.amount.toLocaleString();
    const price = this.formatPrice(event.price, event.paymentAsset);
    const timestamp = this.formatTimestamp(event.timestamp);

    return (
      `LISTING: ${event.asset} | Qty: ${amount} | Price: ${price} ${event.paymentAsset} | ${timestamp}\n` +
      `🔗 [TokenScan](${event.tokenscanUrl}) | [XChain](${event.xchainUrl})`
    );
  }

  /**
   * Format price from satoshis/smallest unit to decimal
   */
  private formatPrice(priceSatoshis: number, paymentAsset: string): string {
    // For BTC, convert satoshis to BTC (divide by 100000000)
    if (paymentAsset === 'BTC') {
      const btc = priceSatoshis / 100000000;
      // Remove trailing zeros
      return btc.toString().replace(/\.?0+$/, '');
    }

    // For XCP and other assets, assume same decimal places as BTC
    // In practice, XCP might use different decimals, but TokenScan API uses satoshis
    const amount = priceSatoshis / 100000000;
    return amount.toString().replace(/\.?0+$/, '');
  }

  /**
   * Format Unix timestamp to "MMM DD HH:mm" UTC format
   */
  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const month = months[date.getUTCMonth()];
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');

    return `${month} ${day} ${hours}:${minutes}`;
  }

  /**
   * Send message to Telegram channel
   */
  private async sendTelegramMessage(chatId: string, text: string): Promise<void> {
    try {
      // Access Telegram client from runtime
      // ElizaOS runtime should have telegram property when plugin-telegram is loaded
      const telegram = (this.runtime as any).telegram;
      
      if (!telegram) {
        throw new Error('Telegram client not available - ensure @elizaos/plugin-telegram is loaded');
      }

      // Use telegram.sendMessage method
      // API format: sendMessage(chatId, text, options)
      await telegram.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          chatId,
        },
        'Telegram API error'
      );
      throw error;
    }
  }

  /**
   * Instance stop method
   */
  async stop(): Promise<void> {
    // Cleanup if needed
    logger.info('TelegramNotificationService instance stopped');
  }

  /**
   * Static start method for ElizaOS service lifecycle
   */
  static async start(runtime: IAgentRuntime): Promise<TelegramNotificationService> {
    const service = new TelegramNotificationService(runtime);
    return service;
  }

  /**
   * Static stop method for ElizaOS service lifecycle
   */
  static async stop(_runtime: IAgentRuntime): Promise<void> {
    logger.info('TelegramNotificationService stopped');
  }
}

