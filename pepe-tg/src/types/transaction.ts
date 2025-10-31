/**
 * Transaction TypeScript Interfaces
 * 
 * Defines the data structures for Fake Rare market transactions
 * (sales and listings) as stored in the database and used throughout the system.
 */

export type TransactionType = 'DIS_SALE' | 'DIS_LISTING' | 'DEX_SALE' | 'DEX_LISTING';

/**
 * Core transaction entity representing a single Fake Rare market transaction
 */
export interface Transaction {
  /** Primary key: Counterparty transaction hash (64-char hex) */
  txHash: string;
  
  /** 
   * Transaction type:
   * - DIS_SALE: Dispenser sale (vending machine purchase)
   * - DIS_LISTING: Dispenser listing (vending machine setup)
   * - DEX_SALE: DEX order match (atomic swap sale)
   * - DEX_LISTING: DEX order (atomic swap listing)
   */
  type: TransactionType;
  
  /** Asset name or longname from Counterparty */
  asset: string;
  
  /** Quantity of asset in transaction (positive integer) */
  amount: number;
  
  /** Price in satoshis or smallest unit (non-negative integer) */
  price: number;
  
  /** Payment asset name (e.g., "XCP", "BTC") */
  paymentAsset: string;
  
  /** Unix timestamp of block confirmation */
  timestamp: number;
  
  /** Counterparty block height */
  blockIndex: number;
  
  /** Whether Telegram notification was sent */
  notified: boolean;
  
  /** Link to TokenScan explorer */
  tokenscanUrl: string;
  
  /** Link to XChain explorer */
  xchainUrl: string;
  
  /** Record creation time (database insert timestamp) */
  createdAt: number;
}

/**
 * Query parameters for transaction history queries
 */
export interface TransactionQuery {
  /** Optional transaction type filter (null = both types) */
  type?: TransactionType | null;
  
  /** Maximum results per type (1-20) */
  limit: number;
}

/**
 * Query result containing transactions and metadata
 */
export interface TransactionQueryResult {
  /** Array of transactions matching the query */
  transactions: Transaction[];
  
  /** Total count of sales in 30-day window */
  totalSales: number;
  
  /** Total count of listings in 30-day window */
  totalListings: number;
}

