/**
 * Transaction Event Payload Interfaces
 * 
 * Defines the event payload structure for transaction monitoring events
 * emitted by TransactionMonitor and consumed by TelegramNotificationService.
 */

import type { TransactionType } from '../models/transaction.js';

/**
 * Transaction type enum for events
 */
export enum TransactionTypeEnum {
  SALE = 'SALE',
  LISTING = 'LISTING',
}

/**
 * Event payload for fakeRareTransaction events
 * 
 * Emitted by TransactionMonitor when a new Fake Rare transaction is detected
 * and stored in the database.
 */
export interface FakeRareTransactionEvent {
  /** Transaction hash (64-char hex) */
  txHash: string;
  
  /** Transaction type */
  type: TransactionType;
  
  /** Asset name or longname */
  asset: string;
  
  /** Quantity of asset */
  amount: number;
  
  /** Price in satoshis or smallest unit */
  price: number;
  
  /** Payment asset name (e.g., "XCP", "BTC") */
  paymentAsset: string;
  
  /** Unix timestamp of block confirmation */
  timestamp: number;
  
  /** Counterparty block height */
  blockIndex: number;
  
  /** TokenScan explorer URL */
  tokenscanUrl: string;
  
  /** XChain explorer URL */
  xchainUrl: string;
}

