/**
 * TokenScanClient Service
 * 
 * HTTP client for Counterparty API v2 integration.
 * Handles polling dispenses (sales) and dispensers (listings) from Counterparty protocol.
 * Uses event-based endpoints for efficient block-based queries.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type { IAgentRuntime } from '@elizaos/core';
import { Service, logger } from '@elizaos/core';
import { FULL_CARD_INDEX } from '../data/fullCardIndex.js';

/**
 * Counterparty API v2 Event Response (wrapper for all event types)
 */
interface EventResponse<T> {
  result: Array<{
    event_index: number;
    event: string;
    params: T;
    tx_hash: string;
  }>;
  next_cursor: string | null;
  result_count: number;
}

/**
 * Dispense Event Parameters (DISPENSE event)
 */
interface DispenseParams {
  tx_hash: string;
  tx_index: number;
  block_index: number;
  source: string;
  destination: string;
  asset: string;
  dispense_quantity: number;
  dispenser_tx_hash: string;
}

/**
 * Dispenser Event Parameters (OPEN_DISPENSER event)
 */
interface DispenserParams {
  tx_hash: string;
  tx_index: number;
  block_index: number;
  source: string;
  asset: string;
  give_quantity: number;
  escrow_quantity: number;
  satoshirate: number;
  status: number;
  give_remaining: number;
  oracle_address: string | null;
  origin: string;
}

/**
 * Order Event Parameters (OPEN_ORDER event)
 */
interface OrderParams {
  tx_hash: string;
  tx_index: number;
  block_index: number;
  source: string;
  give_asset: string;
  give_quantity: number;
  give_remaining: number;
  get_asset: string;
  get_quantity: number;
  get_remaining: number;
  expiration: number;
  expire_index: number;
  fee_required: number;
  fee_provided: number;
  status: string;
}

/**
 * Order Match Event Parameters (ORDER_MATCH event)
 */
interface OrderMatchParams {
  id: string;
  tx0_index: number;
  tx0_hash: string;
  tx0_address: string;
  tx0_block_index: number;
  tx0_expiration: number;
  tx1_index: number;
  tx1_hash: string;
  tx1_address: string;
  tx1_block_index: number;
  tx1_expiration: number;
  block_index: number;
  forward_asset: string;
  forward_quantity: number;
  backward_asset: string;
  backward_quantity: number;
  match_expire_index: number;
  fee_paid: number;
  status: string;
}

/**
 * Response type for dispenses
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

export interface OrderResponse {
  data: Array<{
    tx_hash: string;
    tx_index: number;
    block_index: number;
    source: string;
    give_asset: string;
    give_asset_longname: string;
    give_quantity: string;
    give_remaining: string;
    get_asset: string;
    get_asset_longname: string;
    get_quantity: string;
    get_remaining: string;
    expiration: number;
    expire_index: number;
    fee_required: string;
    fee_provided: string;
    status: string;
    timestamp: number;
  }>;
  total: number;
}

export interface OrderMatchResponse {
  data: Array<{
    id: string;
    tx0_index: number;
    tx0_hash: string;
    tx0_address: string;
    tx1_index: number;
    tx1_hash: string;
    tx1_address: string;
    forward_asset: string;
    forward_asset_longname: string;
    forward_quantity: string;
    backward_asset: string;
    backward_asset_longname: string;
    backward_quantity: string;
    tx0_block_index: number;
    tx1_block_index: number;
    block_index: number;
    tx0_expiration: number;
    tx1_expiration: number;
    match_expire_index: number;
    fee_paid: string;
    status: string;
    timestamp: number;
  }>;
  total: number;
}

interface TransactionDetailResponse {
  tx_hash: string;
  block_index: number;
  block_time: number;
  source: string;
  destination: string | null;
  btc_amount?: number;
  xcp_amount?: number;
  fee?: number;
  data?: string | null;
  supported: boolean;
  transaction_type: string;
  confirmed: boolean;
  valid: number;
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
  capabilityDescription = 'HTTP client for Counterparty API v2 integration';

  private client: AxiosInstance;
  private apiUrl: string;
  private fakeRareAssets: Set<string> = new Set();
  private fakeRareAssetLongnames: Set<string> = new Set();

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    
    // Get API URL from settings or use default Counterparty API v2
    this.apiUrl = (runtime.getSetting('COUNTERPARTY_API_URL') as string) || 'https://api.counterparty.io:4000/v2';
    
    // Load Fake Rare assets from FULL_CARD_INDEX (already in memory)
    for (const card of FULL_CARD_INDEX) {
      this.fakeRareAssets.add(card.asset);
      // Note: FULL_CARD_INDEX doesn't have longnames, only asset names
    }
    
    logger.info(`Loaded ${this.fakeRareAssets.size} Fake Rare assets from FULL_CARD_INDEX`);
    
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
   * Poll dispenses (sales) from Counterparty API v2
   */
  async pollDispenses(blockIndex?: number): Promise<DispenseResponse['data']> {
    try {
      if (blockIndex === undefined) {
        // Return empty if no block index provided (we always poll with block index)
        return [];
      }

      const endpoint = `/blocks/${blockIndex}/events/DISPENSE`;
      const response = await this.client.get<EventResponse<DispenseParams>>(endpoint);
      
      // Transform API v2 event format to our internal format
      const dispenses = response.data.result.map(event => ({
        tx_hash: event.params.tx_hash,
        source: event.params.source,
        destination: event.params.destination,
        asset: event.params.asset,
        asset_longname: '', // v2 doesn't return longname in event
        dispense_quantity: event.params.dispense_quantity.toString(),
        dispenser_tx_hash: event.params.dispenser_tx_hash,
        block_index: event.params.block_index,
        tx_index: event.params.tx_index,
        timestamp: 0, // Will be populated from block info if needed
        status: 'valid', // DISPENSE events are always valid
      }));
      
      return dispenses;
    } catch (error) {
      logger.error({ error, blockIndex }, 'Failed to poll dispenses from Counterparty API v2');
      throw error;
    }
  }

  /**
   * Fetch detailed transaction data for a given hash
   */
  async getTransaction(txHash: string): Promise<TransactionDetailResponse | null> {
    try {
      const endpoint = `/transactions/${txHash}`;
      const response = await this.client.get<{ result: TransactionDetailResponse }>(endpoint);
      return response.data.result ?? null;
    } catch (error) {
      logger.warn({ error, txHash }, 'Failed to fetch transaction details from Counterparty API v2');
      return null;
    }
  }

  /**
   * Poll dispensers (listings) from Counterparty API v2
   */
  async pollDispensers(blockIndex?: number): Promise<DispenserResponse['data']> {
    try {
      if (blockIndex === undefined) {
        return [];
      }

      const endpoint = `/blocks/${blockIndex}/events/OPEN_DISPENSER`;
      const response = await this.client.get<EventResponse<DispenserParams>>(endpoint);
      
      // Transform API v2 event format to our internal format
      const dispensers = response.data.result.map(event => ({
        tx_hash: event.params.tx_hash,
        tx_index: event.params.tx_index,
        block_index: event.params.block_index,
        source: event.params.source,
        asset: event.params.asset,
        asset_longname: '', // v2 doesn't return longname
        give_quantity: event.params.give_quantity.toString(),
        escrow_quantity: event.params.escrow_quantity.toString(),
        satoshirate: event.params.satoshirate.toString(),
        status: event.params.status === 0 ? 'open' : 'closed',
        give_remaining: event.params.give_remaining.toString(),
        origin: event.params.origin,
        oracle_address: event.params.oracle_address,
        timestamp: 0, // Will be populated from block info if needed
      }));
      
      return dispensers;
    } catch (error) {
      logger.error({ error, blockIndex }, 'Failed to poll dispensers from Counterparty API v2');
      throw error;
    }
  }

  /**
   * Poll DEX orders (listings) from Counterparty API v2
   */
  async pollOrders(blockIndex?: number): Promise<OrderResponse['data']> {
    try {
      if (blockIndex === undefined) {
        return [];
      }

      const endpoint = `/blocks/${blockIndex}/events/OPEN_ORDER`;
      const response = await this.client.get<EventResponse<OrderParams>>(endpoint);
      
      // Transform API v2 event format to our internal format
      const orders = response.data.result.map(event => ({
        tx_hash: event.params.tx_hash,
        tx_index: event.params.tx_index,
        block_index: event.params.block_index,
        source: event.params.source,
        give_asset: event.params.give_asset,
        give_asset_longname: '', // v2 doesn't return longname
        give_quantity: event.params.give_quantity.toString(),
        give_remaining: event.params.give_remaining.toString(),
        get_asset: event.params.get_asset,
        get_asset_longname: '', // v2 doesn't return longname
        get_quantity: event.params.get_quantity.toString(),
        get_remaining: event.params.get_remaining.toString(),
        expiration: event.params.expiration,
        expire_index: event.params.expire_index,
        fee_required: event.params.fee_required.toString(),
        fee_provided: event.params.fee_provided.toString(),
        status: event.params.status,
        timestamp: 0,
      }));
      
      return orders;
    } catch (error) {
      logger.error({ error, blockIndex }, 'Failed to poll orders from Counterparty API v2');
      throw error;
    }
  }

  /**
   * Poll DEX order matches (atomic swap sales) from Counterparty API v2
   */
  async pollOrderMatches(blockIndex?: number): Promise<OrderMatchResponse['data']> {
    try {
      if (blockIndex === undefined) {
        return [];
      }

      const endpoint = `/blocks/${blockIndex}/events/ORDER_MATCH`;
      const response = await this.client.get<EventResponse<OrderMatchParams>>(endpoint);
      
      // Transform API v2 event format to our internal format
      const matches = response.data.result.map(event => ({
        id: event.params.id,
        tx0_index: event.params.tx0_index,
        tx0_hash: event.params.tx0_hash,
        tx0_address: event.params.tx0_address,
        tx1_index: event.params.tx1_index,
        tx1_hash: event.params.tx1_hash,
        tx1_address: event.params.tx1_address,
        forward_asset: event.params.forward_asset,
        forward_asset_longname: '', // v2 doesn't return longname
        forward_quantity: event.params.forward_quantity.toString(),
        backward_asset: event.params.backward_asset,
        backward_asset_longname: '', // v2 doesn't return longname
        backward_quantity: event.params.backward_quantity.toString(),
        tx0_block_index: event.params.tx0_block_index,
        tx1_block_index: event.params.tx1_block_index,
        block_index: event.params.block_index,
        tx0_expiration: event.params.tx0_expiration,
        tx1_expiration: event.params.tx1_expiration,
        match_expire_index: event.params.match_expire_index,
        fee_paid: event.params.fee_paid.toString(),
        status: event.params.status,
        timestamp: 0,
      }));
      
      return matches;
    } catch (error) {
      logger.error({ error, blockIndex }, 'Failed to poll order matches from Counterparty API v2');
      throw error;
    }
  }

  /**
   * Get block information by block index from Counterparty API v2
   */
  async getBlock(blockIndex: number): Promise<BlockResponse> {
    try {
      const response = await this.client.get<{
        result: {
          block_index: number;
          block_hash: string;
          block_time: number;
          previous_block_hash: string;
          difficulty: number;
        };
      }>(`/blocks/${blockIndex}`);
      
      return {
        block_index: response.data.result.block_index,
        block_hash: response.data.result.block_hash,
        block_time: response.data.result.block_time,
        previous_block_hash: response.data.result.previous_block_hash,
        difficulty: response.data.result.difficulty,
      };
    } catch (error) {
      logger.error({ error, blockIndex }, 'Failed to get block from Counterparty API v2');
      throw error;
    }
  }

  /**
   * Get current block height (latest block index) from Counterparty API v2
   */
  async getCurrentBlockHeight(): Promise<number> {
    try {
      const response = await this.client.get<{
        result: {
          counterparty_height: number;
          backend_height: number;
        };
      }>('/');
      return response.data.result.counterparty_height;
    } catch (error) {
      logger.error({ error }, 'Failed to get current block height from Counterparty API v2');
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

