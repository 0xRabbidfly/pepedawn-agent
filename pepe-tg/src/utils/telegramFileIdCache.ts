/**
 * Telegram File ID Cache
 * Stores bot-specific file_ids in a separate cache file (NOT in fake-rares-data.json)
 * This avoids polluting shared data with environment-specific file_ids
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from './actionLogger';

const logger = createLogger('TelegramFileIdCache');

// Separate cache file (gitignored, environment-specific)
const CACHE_DIR = process.env.TELEGRAM_CACHE_DIR || path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'telegram-file-ids.json');

// In-memory cache for fast lookups
let memoryCache: Record<string, string> = {};
let cacheLoaded = false;

/**
 * Load cache from disk into memory
 */
function loadCache(): void {
  if (cacheLoaded) return;
  
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf-8');
      memoryCache = JSON.parse(data);
      logger.info(`📦 Loaded ${Object.keys(memoryCache).length} cached file_ids`);
    } else {
      memoryCache = {};
    }
    cacheLoaded = true;
  } catch (error) {
    logger.error(`Error loading file_id cache: ${error}`);
    memoryCache = {};
    cacheLoaded = true;
  }
}

/**
 * Get file_id for a card asset (instant in-memory lookup)
 */
export function getTelegramFileId(assetName: string, cardInfo?: any): string | null {
  loadCache();
  return memoryCache[assetName.toUpperCase()] || null;
}

/**
 * Save file_id for a card asset
 */
export function saveTelegramFileId(assetName: string, fileId: string): void {
  try {
    loadCache();
    
    memoryCache[assetName.toUpperCase()] = fileId;
    
    // Ensure cache directory exists
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    
    // Write back to disk
    fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache, null, 2) + '\n');
    logger.info(`✅ Cached Telegram file_id for ${assetName}`);
  } catch (error) {
    logger.error(`Error saving file_id for ${assetName}: ${error}`);
  }
}

/**
 * Extract file_id from Telegram message response
 */
export function extractFileId(message: any): string | null {
  if (!message) return null;
  
  // Try different message types
  if (message.animation) return message.animation.file_id;
  if (message.video) return message.video.file_id;
  if (message.photo && message.photo.length > 0) return message.photo[message.photo.length - 1].file_id;
  if (message.document) return message.document.file_id;
  
  return null;
}

