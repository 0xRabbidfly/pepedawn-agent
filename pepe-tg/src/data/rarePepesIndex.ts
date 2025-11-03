/**
 * Full Rare Pepes Card Index
 * 
 * Source: API scrape from https://api.pepe.wtf/api/asset?collection=rare-pepes
 * Generated: November 3, 2025
 * Total cards: 1774
 * Series: 1-36
 * 
 * This provides instant lookups for all known Rare Pepes cards
 * without requiring HTTP probing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@elizaos/core';

export interface RarePepeCardInfo {
  asset: string;
  series: number;
  card: number;  // Card number within series (1-50+)
  ext: 'jpeg' | 'png' | 'gif' | 'mp4' | 'jpg' | 'webp' | 'GIF';
  artist: string;
  artistSlug: string;
  supply: number;
  issuance: string;  // Release date (e.g., "September 2016")
  imageUri?: string;  // Direct image URL from S3
  videoUri?: string;  // Direct video URL (for mp4 files)
  issues?: string[];  // Optional: Data quality issues
}

// Load the full card index from JSON file
function loadRarePepesCardIndex(): RarePepeCardInfo[] {
  try {
    // Try multiple locations: dist/data, src/data
    const possiblePaths = [
      path.join(__dirname, 'rare-pepes-data.json'),  // dist/data/
      path.join(process.cwd(), 'src', 'data', 'rare-pepes-data.json'),  // src/data/
      path.join(process.cwd(), 'dist', 'data', 'rare-pepes-data.json'),  // dist/data/
    ];
    
    for (const dataPath of possiblePaths) {
      if (fs.existsSync(dataPath)) {
        const data = fs.readFileSync(dataPath, 'utf-8');
        const cards = JSON.parse(data) as RarePepeCardInfo[];
        logger.info(`📦 Loaded ${cards.length} Rare Pepes cards from index (${dataPath})`);
        return cards;
      }
    }
    
    logger.warn('⚠️  Rare Pepes card index not found, falling back to empty array');
    return [];
  } catch (error) {
    logger.error({ error }, 'Error loading Rare Pepes card index');
    return [];
  }
}

export const RARE_PEPES_CARD_INDEX: RarePepeCardInfo[] = loadRarePepesCardIndex();

// Generate fast lookup map: cardName -> series
export const RARE_PEPES_SERIES_MAP: Record<string, number> = Object.fromEntries(
  RARE_PEPES_CARD_INDEX.map(card => [card.asset, card.series])
);

// Generate card info map for rich metadata
export const RARE_PEPES_CARD_INFO_MAP: Record<string, RarePepeCardInfo> = Object.fromEntries(
  RARE_PEPES_CARD_INDEX.map(card => [card.asset, card])
);

/**
 * Get all cards in a specific series
 */
export function getRarePepesCardsBySeries(seriesNum: number): RarePepeCardInfo[] {
  return RARE_PEPES_CARD_INDEX.filter(card => card.series === seriesNum);
}

/**
 * Get card metadata if it exists in the full index
 */
export function getRarePepeCardInfo(cardName: string): RarePepeCardInfo | undefined {
  return RARE_PEPES_CARD_INFO_MAP[cardName.toUpperCase()];
}

/**
 * Check if a card exists in the full index
 */
export function isInRarePepesIndex(cardName: string): boolean {
  return cardName.toUpperCase() in RARE_PEPES_CARD_INFO_MAP;
}

/**
 * Get cards by artist
 */
export function getRarePepesCardsByArtist(artistName: string): RarePepeCardInfo[] {
  return RARE_PEPES_CARD_INDEX.filter(card => 
    card.artist?.toLowerCase() === artistName.toLowerCase()
  );
}

/**
 * Get cards with specific issues
 */
export function getRarePepesCardsWithIssues(issueType?: string): RarePepeCardInfo[] {
  if (issueType) {
    return RARE_PEPES_CARD_INDEX.filter(card => 
      card.issues?.includes(issueType)
    );
  }
  return RARE_PEPES_CARD_INDEX.filter(card => card.issues && card.issues.length > 0);
}

/**
 * Get all unique artists
 */
export function getAllRarePepesArtists(): string[] {
  const artists = new Set<string>();
  RARE_PEPES_CARD_INDEX.forEach(card => {
    if (card.artist) artists.add(card.artist);
  });
  return Array.from(artists).sort();
}

/**
 * Statistics about the full index
 */
export const RARE_PEPES_INDEX_STATS = {
  totalCards: RARE_PEPES_CARD_INDEX.length,
  cardsBySeries: Object.entries(
    RARE_PEPES_CARD_INDEX.reduce((acc, card) => {
      acc[card.series] = (acc[card.series] || 0) + 1;
      return acc;
    }, {} as Record<number, number>)
  ).sort(([a], [b]) => Number(a) - Number(b)),
  extensionBreakdown: RARE_PEPES_CARD_INDEX.reduce((acc, card) => {
    acc[card.ext] = (acc[card.ext] || 0) + 1;
    return acc;
  }, {} as Record<string, number>),
  artistBreakdown: RARE_PEPES_CARD_INDEX.reduce((acc, card) => {
    if (card.artist) {
      acc[card.artist] = (acc[card.artist] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>),
  cardsWithArtist: RARE_PEPES_CARD_INDEX.filter(c => c.artist).length,
  cardsWithSupply: RARE_PEPES_CARD_INDEX.filter(c => c.supply).length,
  cardsWithIssues: RARE_PEPES_CARD_INDEX.filter(c => c.issues && c.issues.length > 0).length,
  uniqueArtists: new Set(RARE_PEPES_CARD_INDEX.map(c => c.artist).filter(Boolean)).size,
};

