/**
 * Full Fake Commons Card Index
 * 
 * Source: API scrape from https://api.pepe.wtf/api/asset?collection=fake-commons
 * Generated: November 2, 2025
 * Total cards: 1813
 * 
 * This provides instant lookups for all known Fake Commons cards
 * without requiring HTTP probing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@elizaos/core';

export interface CommonsCardInfo {
  asset: string;
  series: number;
  card: number;  // Card number within series (1-50+)
  ext: 'jpeg' | 'png' | 'gif' | 'mp4' | 'jpg' | 'webp' | 'GIF';
  artist: string;
  artistSlug: string;
  supply: number;
  issuance: string;  // Release date (e.g., "September 2021") - to be filled
  imageUri?: string;  // Direct image URL from S3
  videoUri?: string;  // Direct video URL (for mp4 files)
  issues?: string[];  // Optional: Data quality issues
}

// Load the full card index from JSON file
function loadCommonsCardIndex(): CommonsCardInfo[] {
  try {
    // Try multiple locations: dist/data, src/data
    const possiblePaths = [
      path.join(__dirname, 'fake-commons-data.json'),  // dist/data/
      path.join(process.cwd(), 'src', 'data', 'fake-commons-data.json'),  // src/data/
      path.join(process.cwd(), 'dist', 'data', 'fake-commons-data.json'),  // dist/data/
    ];
    
    for (const dataPath of possiblePaths) {
      if (fs.existsSync(dataPath)) {
        const data = fs.readFileSync(dataPath, 'utf-8');
        const cards = JSON.parse(data) as CommonsCardInfo[];
        logger.info(`📦 Loaded ${cards.length} Fake Commons cards from index (${dataPath})`);
        return cards;
      }
    }
    
    logger.warn('⚠️  Fake Commons card index not found, falling back to empty array');
    return [];
  } catch (error) {
    logger.error({ error }, 'Error loading Fake Commons card index');
    return [];
  }
}

export const COMMONS_CARD_INDEX: CommonsCardInfo[] = loadCommonsCardIndex();

// Generate fast lookup map: cardName -> series
export const COMMONS_SERIES_MAP: Record<string, number> = Object.fromEntries(
  COMMONS_CARD_INDEX.map(card => [card.asset, card.series])
);

// Generate card info map for rich metadata
export const COMMONS_CARD_INFO_MAP: Record<string, CommonsCardInfo> = Object.fromEntries(
  COMMONS_CARD_INDEX.map(card => [card.asset, card])
);

/**
 * Get all cards in a specific series
 */
export function getCommonsCardsBySeries(seriesNum: number): CommonsCardInfo[] {
  return COMMONS_CARD_INDEX.filter(card => card.series === seriesNum);
}

/**
 * Get card metadata if it exists in the full index
 */
export function getCommonsCardInfo(cardName: string): CommonsCardInfo | undefined {
  return COMMONS_CARD_INFO_MAP[cardName.toUpperCase()];
}

/**
 * Check if a card exists in the full index
 */
export function isInCommonsIndex(cardName: string): boolean {
  return cardName.toUpperCase() in COMMONS_CARD_INFO_MAP;
}

/**
 * Get cards by artist
 */
export function getCommonsCardsByArtist(artistName: string): CommonsCardInfo[] {
  return COMMONS_CARD_INDEX.filter(card => 
    card.artist?.toLowerCase() === artistName.toLowerCase()
  );
}

/**
 * Get cards with specific issues
 */
export function getCommonsCardsWithIssues(issueType?: string): CommonsCardInfo[] {
  if (issueType) {
    return COMMONS_CARD_INDEX.filter(card => 
      card.issues?.includes(issueType)
    );
  }
  return COMMONS_CARD_INDEX.filter(card => card.issues && card.issues.length > 0);
}

/**
 * Get all unique artists
 */
export function getAllCommonsArtists(): string[] {
  const artists = new Set<string>();
  COMMONS_CARD_INDEX.forEach(card => {
    if (card.artist) artists.add(card.artist);
  });
  return Array.from(artists).sort();
}

/**
 * Statistics about the full index
 */
export const COMMONS_INDEX_STATS = {
  totalCards: COMMONS_CARD_INDEX.length,
  cardsBySeries: Object.entries(
    COMMONS_CARD_INDEX.reduce((acc, card) => {
      acc[card.series] = (acc[card.series] || 0) + 1;
      return acc;
    }, {} as Record<number, number>)
  ).sort(([a], [b]) => Number(a) - Number(b)),
  extensionBreakdown: COMMONS_CARD_INDEX.reduce((acc, card) => {
    acc[card.ext] = (acc[card.ext] || 0) + 1;
    return acc;
  }, {} as Record<string, number>),
  artistBreakdown: COMMONS_CARD_INDEX.reduce((acc, card) => {
    if (card.artist) {
      acc[card.artist] = (acc[card.artist] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>),
  cardsWithArtist: COMMONS_CARD_INDEX.filter(c => c.artist).length,
  cardsWithSupply: COMMONS_CARD_INDEX.filter(c => c.supply).length,
  cardsWithIssues: COMMONS_CARD_INDEX.filter(c => c.issues && c.issues.length > 0).length,
  uniqueArtists: new Set(COMMONS_CARD_INDEX.map(c => c.artist).filter(Boolean)).size,
};
