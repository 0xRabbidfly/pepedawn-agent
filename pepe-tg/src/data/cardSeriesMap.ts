/**
 * Fake Rares Card Series Map
 * 
 * Source: https://pepe.wtf/collection/Fake-Rares
 * Each series has exactly 50 cards
 * Series range: 0-18 (19 series total = ~950 cards)
 * 
 * Strategy:
 * - Pre-populated with known cards for instant lookup
 * - Falls back to search for unknown cards
 * - Auto-populates as new cards are discovered
 * - Persists discoveries to .eliza/card-series-cache.json
 * 
 * Cache survives bot restarts!
 */

import { loadCardCache } from '../utils/cardCache';

// Load runtime cache from disk (survives restarts!)
const RUNTIME_CACHE = loadCardCache();

// Static seed data from chat history
const STATIC_SEED_MAP: Record<string, number> = {
  // High-confidence cards from community chat history
  // Series numbers will be auto-discovered on first /f command use
  // Then manually updated here for permanent caching
  
  // Most mentioned cards (from /f commands):
  'PURPLEPEPE': 0,      // Mentioned 16 times
  'LETSGOBRANDN': 0,    // Mentioned 15 times
  'FREEDOMKEK': 0,      // Mentioned 13 times (confirmed series 0)
  'LANDWOLFPEPE': 0,    // Mentioned 12 times
  'XASSETHOLDIN': 0,    // Mentioned 12 times
  'ROCKPEPESCSR': 0,    // Mentioned 11 times
  'FAKEASF': 0,         // Mentioned 10 times
  'FAKAMOTO': 0,        // Mentioned 10 times
  'PEPSIPEPE': 0,       // Mentioned 9 times
  'BADMANFRAUD': 0,     // Mentioned 9 times
  'SEETHRUPEPHD': 0,    // Mentioned 9 times
  'GOLDORANGE': 0,      // Mentioned 8 times
  'KREMLINPEPE': 0,     // Mentioned 8 times
  'WHATAFAKE': 0,       // Mentioned 8 times
  'THEYLIVEPEPE': 0,    // Mentioned 7 times
  'BRRRRRRRRRRR': 0,    // Mentioned 6 times
  'FLOONEYBIN': 0,      // Mentioned 6 times
  'SMARTFAKE': 0,       // Mentioned 6 times
  'CYCLEPEPE': 0,       // Mentioned 6 times
  'POINTBREAKCD': 0,    // Mentioned 6 times
  'PEPESCHIELE': 0,     // Mentioned 6 times
  'PEPETWODOPE': 0,     // Mentioned 6 times
  'FAKEBEEPLE': 0,      // Mentioned 5 times
  'PEPSIPINUP': 0,      // Mentioned 5 times
  'RAREPEPEPD': 0,      // Mentioned 5 times
  'PEPEHISTORY': 0,     // Mentioned 5 times
  'FAKEGRAM': 0,        // Mentioned 5 times
  'MAYFAKEFIELD': 0,    // Mentioned 5 times
  'DOLFIN': 0,          // Mentioned 5 times
  'LIFEISPEPE': 0,      // Mentioned 5 times
  'FAKELAWS': 0,        // Mentioned 5 times
  'PEPEVBANK': 0,       // Mentioned 5 times
  'BLOOMER': 0,         // Mentioned 4 times
  'SQUIGGLEPEPE': 0,    // Mentioned 4 times
  'BALLOONPEPE': 0,     // Mentioned 4 times
  'PEPEMANTLE': 0,      // Mentioned 4 times
  'WAGMIPEPE': 0,       // Mentioned 4 times
  'WUPEPE': 0,          // Mentioned 4 times
  'LORDFAKA': 0,        // Mentioned 4 times
  'KEKOBRA': 0,         // Mentioned 4 times
  'PEPECAPACITY': 0,    // Mentioned 4 times
  'RAREDJPEPE': 0,      // Mentioned 4 times
  'WETHEPEPE': 0,       // Mentioned 4 times
  'ENTERTAINED': 0,     // Mentioned 3 times
  'SMOLDERCHAD': 0,     // Mentioned 3 times
  'LAMAPEPE': 0,        // Mentioned 3 times
  'FAKEGODDESS': 0,     // Mentioned 3 times
  'FAKENOPOULOS': 0,    // Mentioned 3 times
  'THEHOLYGRAIL': 0,    // Mentioned 3 times
  'CRACKEDDLXHD': 0,    // Mentioned 3 times
  
  // Legacy entries:
  'KARPEPELES': 0,
  
  // NOTE: Series numbers above are placeholders (0)
  // Bot will auto-discover actual series on first lookup
  // Discoveries are saved to .eliza/card-series-cache.json
};

// Merge static seed with runtime discoveries
export const CARD_SERIES_MAP = {
  ...STATIC_SEED_MAP,
  ...RUNTIME_CACHE,  // Runtime discoveries override static seeds
};

/**
 * Get series number for a card
 * Checks both static map and runtime cache
 */
export function getCardSeries(cardName: string): number | undefined {
  const upper = cardName.toUpperCase();
  return RUNTIME_CACHE[upper] ?? STATIC_SEED_MAP[upper];
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
 */
export function addCardToMap(cardName: string, series: number): void {
  const upper = cardName.toUpperCase();
  RUNTIME_CACHE[upper] = series;
  
  // Also add to the merged map
  CARD_SERIES_MAP[upper] = series;
  
  // Persist to disk - import here to avoid circular dependency
  import('../utils/cardCache').then(({ saveCardCache }) => {
    saveCardCache(RUNTIME_CACHE);
  });
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
  EXPECTED_TOTAL_CARDS: 19 * 50,  // 950 cards
  CURRENT_MAPPED_CARDS: Object.keys(CARD_SERIES_MAP).length,
};

/**
 * Check if we need to search for a card
 * Returns true if card is not in map and should be searched
 */
export function shouldSearchForCard(cardName: string): boolean {
  return !isKnownCard(cardName);
}

