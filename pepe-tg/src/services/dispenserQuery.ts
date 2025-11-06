/**
 * DispenserQueryService
 * 
 * Real-time dispenser query service that fetches current dispenser state
 * directly from Counterparty API v2 without database storage.
 * 
 * Endpoint: GET /assets/{asset}/dispensers
 * Returns: All dispensers for a specific asset (filtered client-side for active only)
 */

import type { IAgentRuntime } from '@elizaos/core';
import { Service, logger } from '@elizaos/core';
import { TokenScanClient } from './tokenscanClient.js';

/**
 * Dispenser listing data structure
 */
export interface DispenserListing {
  /** Dispenser owner address */
  source: string;
  
  /** Total amount locked in escrow */
  escrowQuantity: number;
  
  /** Original quantity offered */
  giveQuantity: number;
  
  /** Current quantity still available */
  giveRemaining: number;
  
  /** Price per unit in satoshis */
  pricePerUnit: number;
  
  /** Transaction hash */
  txHash: string;
  
  /** Block index when dispenser was created */
  blockIndex: number;
}

/**
 * Counterparty API v2 dispenser response format
 */
interface DispenserApiResponse {
  result: Array<{
    source: string;
    escrow_quantity: number;
    give_quantity: number;
    give_remaining: number;
    satoshirate: number;
    status: number; // 0 = open, 10 = closed
    tx_hash: string;
    block_index: number;
  }>;
  next_cursor?: number;
  result_count: number;
}

export class DispenserQueryService extends Service {
  static serviceType = 'dispenserQuery';
  capabilityDescription = 'Real-time dispenser query service for Fake Rare assets';

  /**
   * Fetch active dispensers for a specific asset
   * 
   * @param asset - Asset name (e.g., "FAKEASF")
   * @param limit - Maximum number of dispensers to return (default: 10)
   * @returns Array of active dispensers sorted by price (cheapest first)
   */
  async getActiveDispensersForAsset(
    asset: string,
    limit: number = 10
  ): Promise<DispenserListing[]> {
    try {
      // Get TokenScanClient for API access
      const tokenScanClient = this.runtime.getService(
        TokenScanClient.serviceType
      ) as TokenScanClient;

      if (!tokenScanClient) {
        throw new Error('TokenScanClient service not available');
      }

      // Access private client via bracket notation (TypeScript workaround)
      const client = (tokenScanClient as any).client;

      // Call Counterparty API v2: GET /assets/{asset}/dispensers
      const response = await client.get(
        `/assets/${asset}/dispensers`
      );

      logger.debug(
        { asset, totalResults: response.data.result_count },
        'Fetched dispensers from API'
      );

      // Type check response data
      const apiData = response.data as DispenserApiResponse;

      // Filter: only open dispensers with inventory remaining
      const activeDispensers = apiData.result
        .filter((d: DispenserApiResponse['result'][0]) => d.status === 0 && d.give_remaining > 0)
        .map((d: DispenserApiResponse['result'][0]): DispenserListing => ({
          source: d.source,
          escrowQuantity: d.escrow_quantity,
          giveQuantity: d.give_quantity,
          giveRemaining: d.give_remaining,
          pricePerUnit: d.satoshirate,
          txHash: d.tx_hash,
          blockIndex: d.block_index,
        }))
        // Sort by price (cheapest first)
        .sort((a: DispenserListing, b: DispenserListing) => a.pricePerUnit - b.pricePerUnit)
        // Limit results
        .slice(0, limit);

      logger.info(
        { asset, active: activeDispensers.length, total: response.data.result_count },
        'Filtered active dispensers'
      );

      return activeDispensers;
    } catch (error) {
      logger.error({ error, asset }, 'Failed to fetch dispensers from API');
      throw error;
    }
  }

  /**
   * Instance stop method
   */
  async stop(): Promise<void> {
    logger.info('DispenserQueryService stopped');
  }

  /**
   * Static start method for ElizaOS service lifecycle
   */
  static async start(runtime: IAgentRuntime): Promise<DispenserQueryService> {
    const service = new DispenserQueryService(runtime);
    logger.info('DispenserQueryService started');
    return service;
  }

  /**
   * Static stop method for ElizaOS service lifecycle
   */
  static async stop(_runtime: IAgentRuntime): Promise<void> {
    logger.info('DispenserQueryService stopped');
  }
}

