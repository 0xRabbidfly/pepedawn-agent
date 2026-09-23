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
import { logger } from '@elizaos/core';

export interface CardInfo {
  asset: string;
  series: number;
  card: number;  // Card number within series (1-50)
  ext: 'jpeg' | 'png' | 'gif' | 'mp4' | 'jpg' | 'webp';
  artist: string | null;
  artistSlug: string | null;
  supply: number | null;
  issuance?: string | null;  // Release date (e.g., "September 2021")
  videoUri?: string | null;  // Direct video URL (for mp4 files, often on Arweave)
  imageUri?: string | null;  // Direct image URL (alternative to constructed URL)
  memeUri?: string | null;   // Meme/preview URL (usually GIF on tokenscan.io)
  issues?: string[];  // Optional: Data quality issues like 'no_artist', 'no_supply', etc.
  collection?: 'fake-rares' | 'fake-commons';  // Collection identifier for mixed searches
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
        logger.info(`📦 Loaded ${cards.length} cards from full index (${dataPath})`);
        return cards;
      }
    }
    
    logger.warn('⚠️  Full card index not found, falling back to empty array');
    return [];
  } catch (error) {
    logger.error({ error }, 'Error loading full card index');
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
 * Get cards by artist
 */
export function getCardsByArtist(artistName: string): CardInfo[] {
  return FULL_CARD_INDEX.filter(card => 
    card.artist?.toLowerCase() === artistName.toLowerCase()
  );
}

/**
 * Get cards with specific issues
 */
export function getCardsWithIssues(issueType?: string): CardInfo[] {
  if (issueType) {
    return FULL_CARD_INDEX.filter(card => 
      card.issues?.includes(issueType)
    );
  }
  return FULL_CARD_INDEX.filter(card => card.issues !== null);
}

/**
 * Get all unique artists
 */
export function getAllArtists(): string[] {
  const artists = new Set<string>();
  FULL_CARD_INDEX.forEach(card => {
    if (card.artist) artists.add(card.artist);
  });
  return Array.from(artists).sort();
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
  artistBreakdown: FULL_CARD_INDEX.reduce((acc, card) => {
    if (card.artist) {
      acc[card.artist] = (acc[card.artist] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>),
  cardsWithArtist: FULL_CARD_INDEX.filter(c => c.artist).length,
  cardsWithSupply: FULL_CARD_INDEX.filter(c => c.supply).length,
  cardsWithIssues: FULL_CARD_INDEX.filter(c => c.issues).length,
  uniqueArtists: new Set(FULL_CARD_INDEX.map(c => c.artist).filter(Boolean)).size,
};

