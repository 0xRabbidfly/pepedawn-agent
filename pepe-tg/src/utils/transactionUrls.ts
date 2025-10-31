/**
 * Transaction URL Utilities
 * 
 * Centralized URL building for transaction explorers.
 * Single source of truth for all transaction links.
 */

import type { TransactionType } from '../types/transaction.js';

/**
 * Build TokenScan URL for a transaction        
 */
export function buildTokenScanUrl(txHash: string): string {
  return `https://cp20.tokenscan.io/tx/${txHash}`;
}

/**
 * Build XChain URL for a transaction
 */
export function buildXChainUrl(txHash: string): string {
  return `https://xchain.io/tx/${txHash}`;
}

/**
 * Build Horizon Market asset page URL for listings
 */
export function buildHorizonAssetUrl(
  asset: string,
  paymentAsset: string,
  type: TransactionType
): string {
  const quoteAsset = paymentAsset === 'BTC' ? 'BTC' : paymentAsset;
  const listingType = type === 'DIS_LISTING' ? 'dispenser' : 'swap';
  return `https://horizon.market/assets/${asset}?from=1M&quote_asset=${quoteAsset}&tab=buy&type=${listingType}`;
}

/**
 * Build Horizon Market transaction URL
 */
export function buildHorizonTxUrl(txHash: string): string {
  return `https://horizon.market/explorer/tx/${txHash}`;
}

