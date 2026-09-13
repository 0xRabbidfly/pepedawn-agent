/**
 * Telegram File ID Cache
 * Stores bot-specific file_ids in a separate cache file (NOT in fake-rares-data.json)
 * This avoids polluting shared data with environment-specific file_ids
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAnyCardInfo } from '../data/allCardsIndex';
import { createLogger } from './actionLogger';

const logger = createLogger('TelegramFileIdCache');

// Cache file location (with other data files)
const CACHE_FILE = process.env.TELEGRAM_CACHE_FILE || path.join(process.cwd(), 'src', 'data', 'telegram-file-ids.json');

// Written once the broken GIF uploads have been dropped, so that happens only once
const GIF_VIDEOS_DROPPED_MARKER = `${CACHE_FILE.replace(/\.json$/, '')}.gif-videos-dropped`;

// In-memory cache for fast lookups
let memoryCache: Record<string, string> = {};
let cacheLoaded = false;

export type FileIdKind = 'photo' | 'video' | 'document' | 'animation';

// The first byte of a decoded file_id is Telegram's file type
const FILE_ID_KINDS: Record<number, FileIdKind> = {
  2: 'photo',
  4: 'video',
  5: 'document',
  10: 'animation',
};

/**
 * What a file_id actually is, read from the id itself: "AgAC…" is a photo,
 * "BAAC…" a video, "BQAC…" a document, "CgAC…" an animation.
 */
export function fileIdKind(fileId: string | null | undefined): FileIdKind | null {
  if (!fileId) return null;
  return FILE_ID_KINDS[Buffer.from(fileId.slice(0, 4), 'base64url')[0]] ?? null;
}

/**
 * Removes every video file_id held by a GIF card, in place, and returns the
 * assets it removed.
 *
 * GIFs were uploaded without a filename, so telegraf named them "animation.mp4"
 * and Telegram stored the GIF bytes as a zero-second video that will not play.
 * Those ids were then sent as documents, which the official channel refuses, and
 * the fallback re-uploaded the same broken way. A video id on a GIF card is
 * almost always one of those. The genuine ones (GIFs over GIF_URL_MAX_MB, which
 * are converted to MP4 first) simply convert again on their next request.
 */
export function dropGifVideoIds(
  cache: Record<string, string>,
  extOf: (asset: string) => string | null | undefined,
): string[] {
  const dropped: string[] = [];
  for (const [asset, fileId] of Object.entries(cache)) {
    if (fileIdKind(fileId) === 'video' && (extOf(asset) || '').toLowerCase() === 'gif') {
      delete cache[asset];
      dropped.push(asset);
    }
  }
  return dropped;
}

function writeCache(): void {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache, null, 2) + '\n');
}

function dropBrokenGifUploadsOnce(): void {
  try {
    if (fs.existsSync(GIF_VIDEOS_DROPPED_MARKER)) return;
    const dropped = dropGifVideoIds(memoryCache, (asset) => getAnyCardInfo(asset)?.ext);
    if (dropped.length > 0) {
      writeCache();
      logger.info(`🧹 Dropped ${dropped.length} GIF cards cached as unplayable videos; each re-uploads on its next request`);
    }
    fs.writeFileSync(GIF_VIDEOS_DROPPED_MARKER, `${new Date().toISOString()} dropped ${dropped.length}\n`);
  } catch (error) {
    logger.error(`Error dropping broken GIF uploads: ${error}`);
  }
}

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
      dropBrokenGifUploadsOnce();
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

    // Write back to disk
    writeCache();
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
