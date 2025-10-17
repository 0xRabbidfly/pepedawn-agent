/**
 * Full Fake Rares Card Index
 * 
 * Source: API scrape from https://api.pepe.wtf/api/asset?collection=fake-rares
 * Generated: October 16, 2025
 * Total cards: 893
 * 
 * This provides instant lookups for all known Fake Rares cards
 * without requiring HTTP probing.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CardInfo {
  asset: string;
  series: number;
  ext: 'jpeg' | 'png' | 'gif';
}

// Load the full card index from JSON file
function loadFullCardIndex(): CardInfo[] {
  try {
    // Try multiple locations: dist/data, src/data, or root
    const possiblePaths = [
      path.join(__dirname, 'fake-rares-data.json'),  // dist/data/
      path.join(process.cwd(), 'src', 'data', 'fake-rares-data.json'),  // src/data/
      path.join(process.cwd(), 'dist', 'data', 'fake-rares-data.json'),  // dist/data/
    ];
    
    for (const dataPath of possiblePaths) {
      if (fs.existsSync(dataPath)) {
        const data = fs.readFileSync(dataPath, 'utf-8');
        const cards = JSON.parse(data) as CardInfo[];
        console.log(`📦 Loaded ${cards.length} cards from full index (${dataPath})`);
        return cards;
      }
    }
    
    console.warn('⚠️  Full card index not found, falling back to empty array');
    return [];
  } catch (error) {
    console.error('Error loading full card index:', error);
    return [];
  }
}

export const FULL_CARD_INDEX: CardInfo[] = loadFullCardIndex();

// Generate fast lookup map: cardName -> series
export const STATIC_SERIES_MAP: Record<string, number> = Object.fromEntries(
  FULL_CARD_INDEX.map(card => [card.asset, card.series])
);

// Generate card info map for rich metadata
export const CARD_INFO_MAP: Record<string, CardInfo> = Object.fromEntries(
  FULL_CARD_INDEX.map(card => [card.asset, card])
);

/**
 * Get all cards in a specific series
 */
export function getCardsBySeries(seriesNum: number): CardInfo[] {
  return FULL_CARD_INDEX.filter(card => card.series === seriesNum);
}

/**
 * Get card metadata if it exists in the full index
 */
export function getCardInfo(cardName: string): CardInfo | undefined {
  return CARD_INFO_MAP[cardName.toUpperCase()];
}

/**
 * Check if a card exists in the full index
 */
export function isInFullIndex(cardName: string): boolean {
  return cardName.toUpperCase() in CARD_INFO_MAP;
}

/**
 * Statistics about the full index
 */
export const FULL_INDEX_STATS = {
  totalCards: FULL_CARD_INDEX.length,
  cardsBySeries: Object.entries(
    FULL_CARD_INDEX.reduce((acc, card) => {
      acc[card.series] = (acc[card.series] || 0) + 1;
      return acc;
    }, {} as Record<number, number>)
  ).sort(([a], [b]) => Number(a) - Number(b)),
  extensionBreakdown: FULL_CARD_INDEX.reduce((acc, card) => {
    acc[card.ext] = (acc[card.ext] || 0) + 1;
    return acc;
  }, {} as Record<string, number>),
};

