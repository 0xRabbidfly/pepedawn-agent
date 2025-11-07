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
  capabilityDescription = 'Posts transaction notifications to Telegram channel(s)';

  private channelIds: string[] = [];
  private saleStickerId: string | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    
    // Get channel ID(s) from settings - supports comma-separated list
    const channelIdSetting = runtime.getSetting('TELEGRAM_CHANNEL_ID') as string | undefined;
    if (channelIdSetting) {
      this.channelIds = channelIdSetting
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);
    }
    
    // Get optional sticker ID for sale notifications
    const stickerSetting = runtime.getSetting('TELEGRAM_SALE_STICKER_ID') as string | undefined;
    this.saleStickerId = stickerSetting || null;
    
    if (this.channelIds.length === 0) {
      logger.warn('TELEGRAM_CHANNEL_ID not configured - notifications will be skipped');
    } else {
      logger.info(`TelegramNotificationService initialized with ${this.channelIds.length} channel(s)${this.saleStickerId ? ' + sale sticker' : ''}`);
    }
  }

  /**
   * Handle fakeRareTransaction event (called directly by TransactionMonitor)
   */
  async handleTransactionEvent(event: FakeRareTransactionEvent): Promise<void> {
    try {
      if (this.channelIds.length === 0) {
        logger.debug({ txHash: event.txHash }, 'Skipping notification - no channel IDs configured');
        return;
      }

      // Format notification message
      const message = this.formatNotification(event);

      // Send to all configured Telegram channels in parallel
      let sentCount = 0;
      await Promise.all(
        this.channelIds.map(async (channelId) => {
          try {
            // Send text message
            await this.sendTelegramMessage(channelId, message);
            
            // Send sticker for sales (dispenser or DEX, if configured)
            if ((event.type === 'DIS_SALE' || event.type === 'DEX_SALE') && this.saleStickerId) {
              await this.sendTelegramSticker(channelId, this.saleStickerId);
            }
            
            sentCount++;
          } catch (error) {
            logger.warn(`❌ TG notification failed: ${event.txHash} to channel ${channelId}`);
          }
        })
      );

      // Mark as notified in database
      const transactionHistory = this.runtime.getService(TransactionHistory.serviceType) as TransactionHistory;
      if (transactionHistory) {
        transactionHistory.markNotified(event.txHash);
      }

      if (sentCount > 0) {
        logger.info(`✅ TG notification sent: ${event.asset} (${event.type}) to ${sentCount} channel(s)`);
      }
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
    if (event.type === 'DIS_SALE' || event.type === 'DEX_SALE') {
      return this.formatSaleNotification(event);
    } else {
      return this.formatListingNotification(event);
    }
  }

  /**
   * Format sale notification (dispenser or DEX)
   * Format: "{icon} SOLD: {asset} x{amount} | Paid: {price} {paymentAsset}\n{timestamp} | Block {block} | 🔗 [TokenScan]({url}) {typeIcon}"
   */
  private formatSaleNotification(event: FakeRareTransactionEvent): string {
    const amount = event.amount.toLocaleString();
    const price = this.formatPrice(event.price, event.paymentAsset);
    const timestamp = this.formatTimestamp(event.timestamp);
    const icon = event.type === 'DIS_SALE' ? '💰' : '⚡';
    const typeIcon = event.type === 'DIS_SALE' ? '🎰' : '📊';

    return (
      `${icon} SOLD: ${event.asset} x${amount} | Paid: ${price} ${event.paymentAsset}\n` +
      `${timestamp} | Block ${event.blockIndex.toLocaleString()} | 🔗 [TokenScan](${event.tokenscanUrl}) ${typeIcon}`
    );
  }

  /**
   * Format listing notification (dispenser or DEX)
   * Format: "{icon} LISTING: {asset} | Qty: {amount} | Price: {price} {paymentAsset}\n{timestamp} | Block {block} | 🔗 [Horizon]({url}) {typeIcon}"
   */
  private formatListingNotification(event: FakeRareTransactionEvent): string {
    const amount = event.amount.toLocaleString();
    const price = this.formatPrice(event.price, event.paymentAsset);
    const timestamp = this.formatTimestamp(event.timestamp);
    const icon = event.type === 'DIS_LISTING' ? '📋' : '🔄';
    const typeIcon = event.type === 'DIS_LISTING' ? '🎰' : '📊';
    
    // Horizon Market asset page with appropriate type filter
    const quoteAsset = event.paymentAsset === 'BTC' ? 'BTC' : event.paymentAsset;
    const listingType = event.type === 'DIS_LISTING' ? 'dispenser' : 'swap';
    const horizonUrl = `https://horizon.market/assets/${event.asset}?from=1M&quote_asset=${quoteAsset}&tab=buy&type=${listingType}`;

    return (
      `${icon} LISTING: ${event.asset} | Qty: ${amount} | Price: ${price} ${event.paymentAsset}\n` +
      `${timestamp} | Block ${event.blockIndex.toLocaleString()} | 🔗 [Horizon](${horizonUrl}) ${typeIcon}`
    );
  }

  /**
   * Format price from satoshis/smallest unit to decimal
   */
  private formatPrice(priceSatoshis: number, paymentAsset: string): string {
    if (priceSatoshis === 0) {
      return '0';
    }
    // For BTC, convert satoshis to BTC (divide by 100000000)
    if (paymentAsset === 'BTC') {
      const btc = priceSatoshis / 100000000;
      // Remove trailing zeros
      return btc.toString().replace(/\.?0+$/, '');
    }

    // For XCP and other assets, assume same decimal places as BTC
    // In practice, XCP might use different decimals, but TokenScan API uses satoshis
    const amount = priceSatoshis / 100000000;
    return amount === 0 ? '0' : amount.toString().replace(/\.?0+$/, '');
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
   * Send message to Telegram channel using Bot API directly
   */
  private async sendTelegramMessage(chatId: string, text: string): Promise<void> {
    try {
      const botToken = this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string | undefined;
      
      if (!botToken) {
        throw new Error('TELEGRAM_BOT_TOKEN not configured');
      }

      // Use Telegram Bot API directly
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true, // Suppress link previews
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Telegram API error: ${response.status} - ${error}`);
      }

      logger.debug({ chatId }, 'Message sent successfully');
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
   * Send sticker to Telegram channel using native Bot API
   * Note: ElizaOS runtime.sendMessage doesn't support stickers yet, so we use direct API
   */
  private async sendTelegramSticker(chatId: string, stickerId: string): Promise<void> {
    try {
      const botToken = this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string | undefined;
      
      if (!botToken) {
        logger.warn('TELEGRAM_BOT_TOKEN not available - cannot send sticker');
        return;
      }

      // Use Telegram Bot API directly
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendSticker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          sticker: stickerId,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Telegram API error: ${response.status} - ${error}`);
      }

      logger.debug({ chatId, stickerId }, 'Sticker sent successfully');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          chatId,
          stickerId,
        },
        'Failed to send sticker'
      );
      // Don't throw - stickers are optional
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

