/**
 * TransactionHistory Service
 * 
 * Manages PGLite database operations for Fake Rare transaction history.
 * Provides storage, querying, and deduplication for market transactions.
 * 
 * Uses PGLite (PostgreSQL-compatible embedded database) via @electric-sql/pglite.
 */

import { PGlite } from '@electric-sql/pglite';
import type { IAgentRuntime } from '@elizaos/core';
import { Service, logger } from '@elizaos/core';
import type { Transaction, TransactionQuery } from '../models/transaction.js';
import path from 'path';
import fs from 'fs';

export class TransactionHistory extends Service {
  static serviceType = 'transactionHistory';
  capabilityDescription = 'Manages transaction history database for Fake Rare market transactions';

  private db: PGlite | null = null;
  private dbPath: string;
  private purgeInterval: NodeJS.Timeout | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    
    // Get database path from settings or use default
    // IMPORTANT: Uses separate database path (data/transactions/) - does NOT touch .eliza/.elizadb
    // which is reserved for ElizaOS core framework database
    const dbPathSetting = runtime.getSetting('DATABASE_PATH') as string | undefined;
    const relativePath = dbPathSetting || path.join(process.cwd(), 'data', 'transactions');
    
    // Convert to absolute path to avoid issues when running from dist/
    this.dbPath = path.isAbsolute(relativePath) ? relativePath : path.resolve(process.cwd(), relativePath);
    
    // Ensure data directory exists
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true });
    }
  }

  /**
   * Initialize database connection and create schema
   */
  async initialize(): Promise<void> {
    try {
      // PGLite initialization - pass absolute path directly
      // The path must be absolute to work correctly when running from dist/
      this.db = new PGlite(this.dbPath);
      await this.db.waitReady;
      
      // Create transactions table (PostgreSQL syntax)
      // Drop and recreate to ensure correct schema (temporary for migration)
      await this.db.exec(`
        DROP TABLE IF EXISTS transactions CASCADE;
        CREATE TABLE transactions (
          tx_hash TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('DIS_SALE', 'DIS_LISTING', 'DEX_SALE', 'DEX_LISTING')),
          asset TEXT NOT NULL,
          amount BIGINT NOT NULL CHECK(amount > 0),
          price BIGINT NOT NULL CHECK(price >= 0),
          payment_asset TEXT NOT NULL,
          timestamp BIGINT NOT NULL,
          block_index BIGINT NOT NULL CHECK(block_index > 0),
          notified INTEGER NOT NULL DEFAULT 0 CHECK(notified IN (0, 1)),
          tokenscan_url TEXT NOT NULL,
          xchain_url TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `);
      
      // Create indexes for query optimization
      await this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_timestamp ON transactions(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_type_timestamp ON transactions(type, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_notified ON transactions(notified) WHERE notified = 0;
      `);
      
      // Create metadata table for migrations
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      
      // Initialize schema version if not exists
      const versionResult = await this.db.query(
        'SELECT value FROM metadata WHERE key = $1',
        ['schema_version']
      );
      
      const currentVersion = versionResult.rows.length > 0 ? parseInt(versionResult.rows[0].value as string, 10) : 0;
      
      if (currentVersion === 0) {
        await this.db.exec(
          "INSERT INTO metadata (key, value) VALUES ('schema_version', '1') ON CONFLICT (key) DO UPDATE SET value = '1'"
        );
      }
      
      // Migration: Update type constraint for v2 (DIS_SALE, DIS_LISTING, DEX_SALE, DEX_LISTING)
      if (currentVersion < 2) {
        logger.info('Running migration v1 → v2: Updating transaction type constraint...');
        
        // Drop old constraint and add new one
        await this.db.exec(`
          ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
          ALTER TABLE transactions ADD CONSTRAINT transactions_type_check 
            CHECK(type IN ('DIS_SALE', 'DIS_LISTING', 'DEX_SALE', 'DEX_LISTING'));
        `);
        
        // Update existing rows if any (SALE → DIS_SALE, LISTING → DIS_LISTING)
        await this.db.exec(`
          UPDATE transactions SET type = 'DIS_SALE' WHERE type = 'SALE';
          UPDATE transactions SET type = 'DIS_LISTING' WHERE type = 'LISTING';
        `);
        
        // Update schema version
        await this.db.exec(
          "UPDATE metadata SET value = '2' WHERE key = 'schema_version'"
        );
        
        logger.info('Migration v1 → v2 complete');
      }
      
      // Run initial purge on startup
      await this.purgeOld();
      
      // Schedule auto-purge every 24 hours
      this.scheduleAutoPurge();
      
      // Log current row count for debugging
      const countResult = await this.db.query('SELECT COUNT(*) as count FROM transactions');
      const rowCount = countResult.rows[0]?.count || 0;
      
      logger.info({ dbPath: this.dbPath, rowCount }, 'TransactionHistory database initialized');
    } catch (error) {
      logger.error({ error, dbPath: this.dbPath }, 'Failed to initialize TransactionHistory database');
      throw error;
    }
  }

  /**
   * Schedule auto-purge to run every 24 hours
   */
  private scheduleAutoPurge(): void {
    const twentyFourHours = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    // Clear existing interval if any
    if (this.purgeInterval) {
      clearInterval(this.purgeInterval);
    }
    
    // Schedule periodic purge
    this.purgeInterval = setInterval(async () => {
      try {
        const deleted = await this.purgeOld();
        logger.info({ deleted }, 'Scheduled auto-purge completed');
      } catch (error) {
        logger.error({ error }, 'Scheduled auto-purge failed');
      }
    }, twentyFourHours);
    
    logger.info('Auto-purge scheduled (runs every 24 hours)');
  }

  /**
   * Insert a new transaction (with deduplication via ON CONFLICT DO NOTHING)
   */
  async insert(transaction: Transaction): Promise<boolean> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const result = await this.db.query(
        `INSERT INTO transactions (
          tx_hash, type, asset, amount, price, payment_asset,
          timestamp, block_index, notified, tokenscan_url, xchain_url, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (tx_hash) DO NOTHING`,
        [
          transaction.txHash,
          transaction.type,
          transaction.asset,
          transaction.amount,
          transaction.price,
          transaction.paymentAsset,
          transaction.timestamp,
          transaction.blockIndex,
          transaction.notified ? 1 : 0,
          transaction.tokenscanUrl,
          transaction.xchainUrl,
          transaction.createdAt
        ]
      );

      // PGlite returns affectedRows, not rowCount
      return (result.affectedRows || result.rowCount || 0) > 0;
    } catch (error) {
      logger.error({ error, txHash: transaction.txHash }, 'Failed to insert transaction');
      throw error;
    }
  }

  /**
   * Check if a transaction exists by hash
   */
  async exists(txHash: string): Promise<boolean> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const result = await this.db.query(
        'SELECT 1 FROM transactions WHERE tx_hash = $1 LIMIT 1',
        [txHash]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error({ error, txHash }, 'Failed to check transaction existence');
      throw error;
    }
  }

  /**
   * Mark a transaction as notified
   */
  async markNotified(txHash: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      await this.db.query(
        'UPDATE transactions SET notified = 1 WHERE tx_hash = $1',
        [txHash]
      );
    } catch (error) {
      logger.error({ error, txHash }, 'Failed to mark transaction as notified');
      throw error;
    }
  }

  /**
   * Query sales transactions (dispenser + DEX, ordered by timestamp DESC, then reversed for display)
   */
  async querySales(limit: number): Promise<Transaction[]> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const result = await this.db.query(
        `SELECT * FROM transactions
        WHERE type IN ('DIS_SALE', 'DEX_SALE')
        ORDER BY timestamp DESC
        LIMIT $1`,
        [limit]
      );
      
      const rows = result.rows as any[];
      return rows.map(this.mapRowToTransaction).reverse(); // Reverse to show oldest first
    } catch (error) {
      logger.error({ error }, 'Failed to query sales');
      throw error;
    }
  }

  /**
   * Query listings transactions (dispenser + DEX, ordered by timestamp DESC, then reversed for display)
   */
  async queryListings(limit: number): Promise<Transaction[]> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const result = await this.db.query(
        `SELECT * FROM transactions
        WHERE type IN ('DIS_LISTING', 'DEX_LISTING')
        ORDER BY timestamp DESC
        LIMIT $1`,
        [limit]
      );
      
      const rows = result.rows as any[];
      return rows.map(this.mapRowToTransaction).reverse(); // Reverse to show oldest first
    } catch (error) {
      logger.error({ error }, 'Failed to query listings');
      throw error;
    }
  }

  /**
   * Query both sales and listings (combined)
   */
  async queryCombined(limit: number): Promise<{ sales: Transaction[]; listings: Transaction[] }> {
    const [sales, listings] = await Promise.all([
      this.querySales(limit),
      this.queryListings(limit),
    ]);
    
    return { sales, listings };
  }

  /**
   * Get total count of sales in last 30 days
   */
  async getTotalSales(): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
      const result = await this.db.query(
        `SELECT COUNT(*) as count FROM transactions
        WHERE type IN ('DIS_SALE', 'DEX_SALE') AND timestamp >= $1`,
        [thirtyDaysAgo]
      );
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch (error) {
      logger.error({ error }, 'Failed to get total sales count');
      throw error;
    }
  }

  /**
   * Get total count of listings in last 30 days
   */
  async getTotalListings(): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
      const result = await this.db.query(
        `SELECT COUNT(*) as count FROM transactions
        WHERE type IN ('DIS_LISTING', 'DEX_LISTING') AND timestamp >= $1`,
        [thirtyDaysAgo]
      );
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch (error) {
      logger.error({ error }, 'Failed to get total listings count');
      throw error;
    }
  }

  /**
   * Purge transactions older than 30 days
   */
  async purgeOld(): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
      const result = await this.db.query(
        'DELETE FROM transactions WHERE timestamp < $1',
        [thirtyDaysAgo]
      );
      const deleted = result.rowCount || 0;
      logger.info({ deleted }, 'Purged old transactions');
      return deleted;
    } catch (error) {
      logger.error({ error }, 'Failed to purge old transactions');
      throw error;
    }
  }

  /**
   * Map database row to Transaction object
   */
  private mapRowToTransaction(row: any): Transaction {
    return {
      txHash: row.tx_hash,
      type: row.type,
      asset: row.asset,
      amount: parseInt(row.amount, 10),
      price: parseInt(row.price, 10),
      paymentAsset: row.payment_asset,
      timestamp: parseInt(row.timestamp, 10),
      blockIndex: parseInt(row.block_index, 10),
      notified: row.notified === 1,
      tokenscanUrl: row.tokenscan_url,
      xchainUrl: row.xchain_url,
      createdAt: parseInt(row.created_at, 10),
    };
  }

  /**
   * Get database statistics for health monitoring
   */
  async getStats(): Promise<{ totalTransactions: number; sales: number; listings: number; oldestTransaction: number | null }> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const totalResult = await this.db.query('SELECT COUNT(*) as count FROM transactions');
      const total = parseInt(totalResult.rows[0]?.count || '0', 10);

      const salesResult = await this.db.query("SELECT COUNT(*) as count FROM transactions WHERE type IN ('DIS_SALE', 'DEX_SALE')");
      const sales = parseInt(salesResult.rows[0]?.count || '0', 10);

      const listingsResult = await this.db.query("SELECT COUNT(*) as count FROM transactions WHERE type IN ('DIS_LISTING', 'DEX_LISTING')");
      const listings = parseInt(listingsResult.rows[0]?.count || '0', 10);

      const oldestResult = await this.db.query('SELECT MIN(timestamp) as oldest FROM transactions');
      const oldest = oldestResult.rows[0]?.oldest ? parseInt(oldestResult.rows[0].oldest, 10) : null;

      return {
        totalTransactions: total,
        sales,
        listings,
        oldestTransaction: oldest,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get database statistics');
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async stop(): Promise<void> {
    // Clear auto-purge interval
    if (this.purgeInterval) {
      clearInterval(this.purgeInterval);
      this.purgeInterval = null;
    }
    
    if (this.db) {
      await this.db.close();
      this.db = null;
      logger.info('TransactionHistory database closed');
    }
  }

  /**
   * Static start method for ElizaOS service lifecycle
   */
  static async start(runtime: IAgentRuntime): Promise<TransactionHistory> {
    const service = new TransactionHistory(runtime);
    await service.initialize();
    return service;
  }

  /**
   * Static stop method for ElizaOS service lifecycle
   */
  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(TransactionHistory.serviceType) as TransactionHistory;
    if (service) {
      await service.stop();
    }
  }
}
