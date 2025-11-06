/**
 * Centralized GIF conversion helper
 * Used by both sendCardWithMedia and CardDisplayService
 */

import { convertGifUrlToMp4 } from '../services/videoConversionService';
import { createLogger } from './actionLogger';

const logger = createLogger('GifConversion');

export interface ConversionCheckResult {
  shouldConvert: boolean;
  originalUrl: string;
  convertedUrl?: string;
  convertedExtension?: string;
  originalSizeMb?: number;
  convertedSizeMb?: number;
  compressionRatio?: number;
  fromCache?: boolean;
}

/**
 * Fetch Content-Type and Content-Length via HEAD with a timeout.
 */
async function headInfo(
  url: string,
  timeoutMs: number = 3000,
): Promise<{ contentType: string | null; contentLength: number | null }> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) return { contentType: null, contentLength: null };
    const ct = res.headers.get('content-type');
    const len = res.headers.get('content-length');
    return { contentType: ct, contentLength: len ? parseInt(len, 10) : null };
  } catch {
    return { contentType: null, contentLength: null };
  }
}

function getEnvNumber(name: string, fallback: number): number {
  const val = process.env[name];
  if (!val) return fallback;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Check if GIF should be converted and perform conversion if needed
 * Returns updated URL and extension if conversion was successful
 */
export async function checkAndConvertGif(
  mediaUrl: string,
  mediaExtension: string,
): Promise<ConversionCheckResult> {
  // Only process GIF files
  if (mediaExtension !== 'gif') {
    return {
      shouldConvert: false,
      originalUrl: mediaUrl,
    };
  }

  const maxMb = getEnvNumber('GIF_URL_MAX_MB', 8);
  
  try {
    const { contentType, contentLength } = await headInfo(mediaUrl, 3000);
    
    const typeOk = (contentType || '').toLowerCase().includes('image/gif');
    const isOverLimit = contentLength !== null && contentLength > maxMb * 1024 * 1024;

    // Not over limit or not a GIF - no conversion needed
    if (!typeOk || !isOverLimit) {
      return {
        shouldConvert: false,
        originalUrl: mediaUrl,
      };
    }

    // GIF is over limit - convert to MP4
    const origSizeMb = (contentLength! / 1024 / 1024).toFixed(2);
    logger.info(`GIF over limit (${origSizeMb}MB > ${maxMb}MB), attempting conversion...`);

    const conversionResult = await convertGifUrlToMp4(mediaUrl);

    if (conversionResult.success && conversionResult.outputPath) {
      const convertedSizeMb = (conversionResult.convertedSize! / 1024 / 1024).toFixed(2);
      logger.info(
        `✅ Converted ${origSizeMb}MB → ${convertedSizeMb}MB (${conversionResult.compressionRatio?.toFixed(1)}% reduction)`,
      );

      return {
        shouldConvert: true,
        originalUrl: mediaUrl,
        convertedUrl: `file://${conversionResult.outputPath}`,
        convertedExtension: 'mp4',
        originalSizeMb: parseFloat(origSizeMb),
        convertedSizeMb: parseFloat(convertedSizeMb),
        compressionRatio: conversionResult.compressionRatio,
        fromCache: conversionResult.fromCache,
      };
    } else {
      logger.warning(`⚠️ Conversion failed: ${conversionResult.error}, using original`);
      return {
        shouldConvert: false,
        originalUrl: mediaUrl,
      };
    }
  } catch (error) {
    logger.error(`Error checking/converting GIF: ${error}`);
    return {
      shouldConvert: false,
      originalUrl: mediaUrl,
    };
  }
}

