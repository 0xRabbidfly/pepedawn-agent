/**
 * Full Card Index - EXAMPLE ARCHITECTURE
 * 
 * This shows how to structure the data if you get the complete card index
 * from pepe.wtf or another source
 * 
 * Benefits:
 * - Instant lookups for all 950 cards
 * - Rich metadata (series, card number, etc.)
 * - Still supports dynamic growth for new cards
 * - Enables advanced features (browse by series, card recommendations, etc.)
 */

export interface CardInfo {
  name: string;              // 'FREEDOMKEK'
  series: number;            // 0
  cardNumber: number;        // 1-50 (position in series)
  imageUrl?: string;         // Optional: direct S3 URL if known
  extension?: 'jpg' | 'jpeg' | 'gif';
  artist?: string;           // Optional: artist name
  releaseDate?: string;      // Optional: when it was released
}

/**
 * Full card index - would contain all 950 cards
 * This is a SEED dataset - can be generated from pepe.wtf
 */
export const FULL_CARD_INDEX: CardInfo[] = [
  // Series 0 - Genesis Series (50 cards)
  { 
    name: 'FREEDOMKEK', 
    series: 0, 
    cardNumber: 1,
    extension: 'jpeg',
    artist: 'Rare Scrilla',
    releaseDate: '2021-08-01'
  },
  { 
    name: 'KARPEPELES', 
    series: 0, 
    cardNumber: 2,
    extension: 'jpeg'
  },
  // ... Add remaining 48 series 0 cards
  
  // Series 1 (50 cards)
  { 
    name: 'FAKEASF', 
    series: 1, 
    cardNumber: 1 
  },
  // ... Add remaining 49 series 1 cards
  
  // Series 2-18 (900 more cards)
  // ... Would continue for all series
];

/**
 * Fast lookup: Card name → Series number
 * Generated from FULL_CARD_INDEX
 */
export const STATIC_CARD_SERIES_MAP: Record<string, number> = 
  Object.fromEntries(
    FULL_CARD_INDEX.map(card => [card.name, card.series])
  );

/**
 * Advanced lookup: Card name → Full info
 */
export const CARD_INFO_MAP: Record<string, CardInfo> =
  Object.fromEntries(
    FULL_CARD_INDEX.map(card => [card.name, card])
  );

/**
 * Get cards by series
 */
export function getCardsBySeries(seriesNum: number): CardInfo[] {
  return FULL_CARD_INDEX.filter(card => card.series === seriesNum);
}

/**
 * Get card info with all metadata
 */
export function getCardInfo(cardName: string): CardInfo | undefined {
  return CARD_INFO_MAP[cardName.toUpperCase()];
}

/**
 * Search cards by pattern
 */
export function searchCards(query: string): CardInfo[] {
  const upper = query.toUpperCase();
  return FULL_CARD_INDEX.filter(card => 
    card.name.includes(upper) ||
    card.artist?.toUpperCase().includes(upper)
  );
}

/**
 * Get series statistics
 */
export function getSeriesStats() {
  const stats: Record<number, number> = {};
  
  for (const card of FULL_CARD_INDEX) {
    stats[card.series] = (stats[card.series] || 0) + 1;
  }
  
  return stats;
}

/**
 * Validate series is complete (should have 50 cards)
 */
export function isSeriesComplete(seriesNum: number): boolean {
  const count = getCardsBySeries(seriesNum).length;
  return count === 50;
}

