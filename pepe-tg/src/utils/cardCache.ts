/**
 * Card Cache Utilities
 * Persists discovered card series to disk for survival across restarts
 */

import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), '.eliza', 'card-series-cache.json');

/**
 * Load cached card series from disk
 * Returns empty object if file doesn't exist
 */
export function loadCardCache(): Record<string, number> {
  try {
    // Ensure .eliza directory exists
    const cacheDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf-8');
      const cache = JSON.parse(data);
      console.log(`📦 Loaded ${Object.keys(cache).length} cached card series from disk`);
      return cache;
    }
  } catch (error) {
    console.error('Error loading card cache:', error);
  }
  
  return {};
}

/**
 * Save discovered card series to disk
 */
export function saveCardCache(cache: Record<string, number>): void {
  try {
    // Ensure directory exists
    const cacheDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    console.log(`💾 Saved ${Object.keys(cache).length} card series to disk`);
  } catch (error) {
    console.error('Error saving card cache:', error);
  }
}

/**
 * Add a card to cache and persist to disk
 */
export function addAndSaveCard(cardName: string, series: number, cache: Record<string, number>): void {
  cache[cardName.toUpperCase()] = series;
  saveCardCache(cache);
}

