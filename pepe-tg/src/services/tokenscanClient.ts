/**
 * TokenScanClient Service
 * 
 * HTTP client for TokenScan API integration.
 * Handles polling dispenses (sales) and dispensers (listings) from Counterparty protocol.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type { IAgentRuntime } from '@elizaos/core';
import { Service, logger } from '@elizaos/core';
import { FULL_CARD_INDEX } from '../data/fullCardIndex.js';

/**
 * TokenScan API response types
 */
export interface DispenseResponse {
  data: Array<{
    tx_hash: string;
    source: string;
    destination: string;
    asset: string;
    asset_longname: string;
    dispense_quantity: string;
    dispenser_tx_hash: string;
    block_index: number;
    tx_index: number;
    timestamp: number;
    status: string;
  }>;
  total: number;
}

export interface DispenserResponse {
  data: Array<{
    tx_hash: string;
    tx_index: number;
    block_index: number;
    source: string;
    asset: string;
    asset_longname: string;
    give_quantity: string;
    escrow_quantity: string;
    satoshirate: string;
    status: string;
    give_remaining: string;
    origin: string;
    oracle_address: string | null;
    timestamp: number;
  }>;
  total: number;
}

export interface BlockResponse {
  block_index: number;
  block_hash: string;
  block_time: number;
  previous_block_hash: string;
  difficulty: number;
}

export interface NetworkResponse {
  network_info: {
    mainnet: {
      block_height: number;
      tx_index: number;
      unconfirmed: {
        btc: number;
        xcp: number;
        xdp: number;
      };
    };
    testnet: {
      block_height: number;
      tx_index: number;
      unconfirmed: {
        btc: number;
        xcp: number;
        xdp: number;
      };
    };
  };
}

export class TokenScanClient extends Service {
  static serviceType = 'tokenScanClient';
  capabilityDescription = 'HTTP client for TokenScan API integration';

  private client: AxiosInstance;
  private apiUrl: string;
  private fakeRareAssets: Set<string> = new Set();
  private fakeRareAssetLongnames: Set<string> = new Set();

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    
    // Get API URL from settings or use default
    // Using Counterparty Classic network for Fake Rare cards
    this.apiUrl = (runtime.getSetting('TOKENSCAN_API_URL') as string) || 'https://classic.tokenscan.io';
    
    // Load Fake Rare assets from FULL_CARD_INDEX (already in memory)
    for (const card of FULL_CARD_INDEX) {
      this.fakeRareAssets.add(card.asset);
      // Note: FULL_CARD_INDEX doesn't have longnames, only asset names
    }
    
    logger.info(
      { assetCount: this.fakeRareAssets.size },
      'Loaded Fake Rare assets from FULL_CARD_INDEX'
    );
    
    // Initialize HTTP client with timeout and retry configuration
    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000, // 30 seconds
      headers: {
        'Accept': 'application/json',
      },
    });
    
    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 429) {
          // Rate limit exceeded
          const retryAfter = error.response.headers['retry-after'] 
            ? parseInt(error.response.headers['retry-after'], 10) 
            : 60;
          logger.warn({ retryAfter }, 'Rate limit exceeded, will retry after delay');
          await this.sleep(retryAfter * 1000);
          return this.client.request(error.config!);
        }
        
        // Exponential backoff for other errors
        if (error.config && this.shouldRetry(error)) {
          const retryCount = (error.config as any).__retryCount || 0;
          if (retryCount < 3) {
            (error.config as any).__retryCount = retryCount + 1;
            const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            logger.warn({ delay, retryCount }, 'Retrying request with exponential backoff');
            await this.sleep(delay);
            return this.client.request(error.config);
          }
        }
        
        throw error;
      }
    );
  }

  /**
   * Check if an asset is in the Fake Rare collection
   */
  isFakeRareAsset(asset: string, longname?: string): boolean {
    return this.fakeRareAssets.has(asset) || (longname ? this.fakeRareAssetLongnames.has(longname) : false);
  }

  /**
   * Poll dispenses (sales) from TokenScan API
   */
  async pollDispenses(blockIndex?: number): Promise<DispenseResponse['data']> {
    try {
      // TokenScan API uses path parameters, not query parameters
      const endpoint = blockIndex !== undefined 
        ? `/api/dispenses/${blockIndex}`
        : '/api/dispenses';
      
      const response = await this.client.get<DispenseResponse>(endpoint);
      return response.data.data || [];
    } catch (error) {
      logger.error({ error, blockIndex }, 'Failed to poll dispenses from TokenScan API');
      throw error;
    }
  }

  /**
   * Poll dispensers (listings) from TokenScan API
   */
  async pollDispensers(blockIndex?: number): Promise<DispenserResponse['data']> {
    try {
      // TokenScan API uses path parameters, not query parameters
      const endpoint = blockIndex !== undefined 
        ? `/api/dispensers/${blockIndex}`
        : '/api/dispensers';
      
      const response = await this.client.get<DispenserResponse>(endpoint);
      return response.data.data || [];
    } catch (error) {
      logger.error({ error, blockIndex }, 'Failed to poll dispensers from TokenScan API');
      throw error;
    }
  }

  /**
   * Get block information by block index
   */
  async getBlock(blockIndex: number): Promise<BlockResponse> {
    try {
      const response = await this.client.get<BlockResponse>(`/api/block/${blockIndex}`);
      return response.data;
    } catch (error) {
      logger.error({ error, blockIndex }, 'Failed to get block from TokenScan API');
      throw error;
    }
  }

  /**
   * Get current block height (latest block index)
   */
  async getCurrentBlockHeight(): Promise<number> {
    try {
      const response = await this.client.get<NetworkResponse>('/api/network');
      return response.data.network_info.mainnet.block_height;
    } catch (error) {
      logger.error({ error }, 'Failed to get current block height');
      throw error;
    }
  }

  /**
   * Helper: Determine if error should be retried
   */
  private shouldRetry(error: AxiosError): boolean {
    if (!error.response) {
      // Network error, retry
      return true;
    }
    
    // Retry on 5xx errors
    const status = error.response.status;
    return status >= 500 && status < 600;
  }

  /**
   * Helper: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Instance stop method
   */
  async stop(): Promise<void> {
    // Cleanup if needed
    logger.info('TokenScanClient instance stopped');
  }

  /**
   * Static start method for ElizaOS service lifecycle
   */
  static async start(runtime: IAgentRuntime): Promise<TokenScanClient> {
    // Assets are loaded in constructor from FULL_CARD_INDEX
    const service = new TokenScanClient(runtime);
    return service;
  }

  /**
   * Static stop method for ElizaOS service lifecycle
   */
  static async stop(_runtime: IAgentRuntime): Promise<void> {
    // Cleanup if needed
    logger.info('TokenScanClient stopped');
  }
}

