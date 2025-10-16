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
 * 
 * To update: Manually scrape pepe.wtf or run scripts/scrape_card_series.py
 */

export const CARD_SERIES_MAP: Record<string, number> = {
  // Series 0 - Genesis Series (50 cards)
  'KARPEPELES': 0,
  'FREEDOMKEK': 0,  // Confirmed genesis card
  
  // TODO: Add more cards from pepe.wtf
  // Each series has exactly 50 cards
  // You can populate this by:
  // 1. Manually visiting https://pepe.wtf/collection/Fake-Rares
  // 2. Running the scraper: python scripts/scrape_card_series.py
  // 3. Letting the bot auto-discover (slower but automatic)
};

/**
 * Get series number for a card
 * Returns undefined if card not found in map
 */
export function getCardSeries(cardName: string): number | undefined {
  return CARD_SERIES_MAP[cardName.toUpperCase()];
}

/**
 * Check if a card exists in the pre-populated map
 */
export function isKnownCard(cardName: string): boolean {
  return cardName.toUpperCase() in CARD_SERIES_MAP;
}

/**
 * Add a card to the map (runtime discovery)
 */
export function addCardToMap(cardName: string, series: number): void {
  CARD_SERIES_MAP[cardName.toUpperCase()] = series;
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

