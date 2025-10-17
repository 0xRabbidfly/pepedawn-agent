/**
 * Fake Rares Card Series Map
 * 
 * Source: API scrape from https://api.pepe.wtf/api/asset?collection=fake-rares
 * Scraped: October 16, 2025
 * Total cards: 893 (series 0-18)
 * 
 * Strategy:
 * - Full index loaded from fullCardIndex.ts (893 cards with accurate series + metadata)
 * - Runtime cache for new discoveries (series 19+)
 * - Persists new discoveries to .eliza/card-series-cache.json
 * 
 * Result: All 893 cards have instant lookups with rich metadata!
 */

import { STATIC_SERIES_MAP, CARD_INFO_MAP, getCardInfo } from './fullCardIndex';
import { loadCardCache } from '../utils/cardCache';

// Load runtime cache from disk (for new cards discovered at runtime)
const RUNTIME_CACHE = loadCardCache();

// Merge: Full index (893 cards) + runtime discoveries (series 19+ or new cards)
export const CARD_SERIES_MAP = {
  ...STATIC_SERIES_MAP,  // 893 cards from full index
  ...RUNTIME_CACHE,      // Runtime discoveries override if needed
};

/**
 * Get series number for a card
 * Checks runtime cache first (for overrides), then full index
 */
export function getCardSeries(cardName: string): number | undefined {
  const upper = cardName.toUpperCase();
  
  // Check runtime cache first (for new discoveries or overrides)
  if (RUNTIME_CACHE[upper] !== undefined) {
    return RUNTIME_CACHE[upper];
  }
  
  // Then check full index
  const cardInfo = getCardInfo(upper);
  if (cardInfo) {
    return cardInfo.series;
  }
  
  return undefined;
}

/**
 * Get card extension from full index
 * Returns the known extension to avoid trying all 4 extensions
 */
export function getCardExtension(cardName: string): string | undefined {
  const cardInfo = getCardInfo(cardName);
  return cardInfo?.ext;
}

/**
 * Get full card info (enhanced metadata)
 */
export function getFullCardInfo(cardName: string) {
  return getCardInfo(cardName);
}

/**
 * Check if a card exists in the pre-populated map
 */
export function isKnownCard(cardName: string): boolean {
  return cardName.toUpperCase() in CARD_SERIES_MAP;
}

/**
 * Add a card to the map (runtime discovery)
 * Saves to both memory and disk for persistence
 * Only caches if it's a NEW card (not in full index)
 */
export function addCardToMap(cardName: string, series: number): void {
  const upper = cardName.toUpperCase();
  
  // Check if this card is already in the full index
  const inFullIndex = getCardInfo(upper) !== undefined;
  
  if (inFullIndex) {
    // Card is already in full index - no need to cache
    CARD_SERIES_MAP[upper] = series;
    console.log(`ℹ️  ${upper} already in full index (series ${series})`);
  } else {
    // NEW CARD discovered! (likely series 19+)
    console.log(`🆕 NEW CARD DISCOVERED: ${upper} in series ${series}`);
    
    RUNTIME_CACHE[upper] = series;
    CARD_SERIES_MAP[upper] = series;
    
    // Persist to disk
    import('../utils/cardCache').then(({ saveCardCache }) => {
      saveCardCache(RUNTIME_CACHE);
    });
  }
}

/**
 * Get all cards in a specific series
 */
export function getCardsInSeries(seriesNum: number): string[] {
  return Object.entries(CARD_SERIES_MAP)
    .filter(([_, series]) => series === seriesNum)
    .map(([name, _]) => name);
}

/**
 * Series information
 */
export const SERIES_INFO = {
  TOTAL_SERIES: 19,  // 0-18
  CARDS_PER_SERIES: 50,
  EXPECTED_TOTAL_CARDS: 921,  // Series 0: 21, Series 1-18: 50 each
  CURRENT_INDEXED_CARDS: Object.keys(STATIC_SERIES_MAP).length,  // 893 from full index
  CURRENT_CACHED_CARDS: Object.keys(RUNTIME_CACHE).length,  // Runtime discoveries
  CURRENT_MAPPED_CARDS: Object.keys(CARD_SERIES_MAP).length,  // Total available
};

/**
 * Check if we need to search for a card
 * Returns true if card is not in map and should be searched
 */
export function shouldSearchForCard(cardName: string): boolean {
  return !isKnownCard(cardName);
}

