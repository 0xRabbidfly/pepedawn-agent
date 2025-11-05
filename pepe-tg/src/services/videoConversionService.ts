import { exec } from "child_process";
import { promisify } from "util";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createLogger } from "../utils/actionLogger";

const execAsync = promisify(exec);
const logger = createLogger("VideoConversion");

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONVERSION_CONFIG = {
  // Cache directory for converted files
  CACHE_DIR: process.env.VIDEO_CACHE_DIR || path.join(os.tmpdir(), "video-cache"),
  
  // Maximum cache size in bytes (default: 5GB)
  MAX_CACHE_SIZE: parseInt(process.env.VIDEO_CACHE_MAX_SIZE || "5368709120"),
  
  // Cache TTL in milliseconds (default: 7 days)
  CACHE_TTL_MS: parseInt(process.env.VIDEO_CACHE_TTL_MS || "604800000"),
  
  // ffmpeg conversion settings for optimal compression
  FFMPEG_OPTS: {
    // Video codec (H.264 for best compatibility)
    videoCodec: "libx264",
    
    // Compression preset (faster = less compression, slower = better compression)
    // medium is good balance between speed and size
    preset: process.env.FFMPEG_PRESET || "medium",
    
    // Constant Rate Factor (0-51, lower = better quality, 23 is default, 28 is good for web)
    crf: parseInt(process.env.FFMPEG_CRF || "28"),
    
    // Max dimensions (preserve aspect ratio)
    maxWidth: parseInt(process.env.FFMPEG_MAX_WIDTH || "1280"),
    maxHeight: parseInt(process.env.FFMPEG_MAX_HEIGHT || "1280"),
    
    // Frame rate limit (reduce from potentially 60fps to 24fps for smaller size)
    maxFps: parseInt(process.env.FFMPEG_MAX_FPS || "24"),
    
    // Pixel format for compatibility
    pixelFormat: "yuv420p",
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface ConversionResult {
  success: boolean;
  outputPath?: string;
  outputUrl?: string;
  originalSize?: number;
  convertedSize?: number;
  compressionRatio?: number;
  fromCache?: boolean;
  error?: string;
}

interface CacheEntry {
  filePath: string;
  createdAt: number;
  lastAccessed: number;
  size: number;
  originalUrl: string;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Initialize cache directory
 */
function ensureCacheDir(): void {
  if (!fs.existsSync(CONVERSION_CONFIG.CACHE_DIR)) {
    fs.mkdirSync(CONVERSION_CONFIG.CACHE_DIR, { recursive: true });
    logger.info(`Created cache directory: ${CONVERSION_CONFIG.CACHE_DIR}`);
  }
}

/**
 * Generate cache key from URL
 */
function getCacheKey(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex");
}

/**
 * Get cache file path for a URL
 */
function getCachePath(url: string): string {
  const key = getCacheKey(url);
  return path.join(CONVERSION_CONFIG.CACHE_DIR, `${key}.mp4`);
}

/**
 * Get cache metadata path
 */
function getCacheMetaPath(url: string): string {
  const key = getCacheKey(url);
  return path.join(CONVERSION_CONFIG.CACHE_DIR, `${key}.meta.json`);
}

/**
 * Check if cached conversion exists and is valid
 */
function getCachedConversion(url: string): string | null {
  const cachePath = getCachePath(url);
  const metaPath = getCacheMetaPath(url);

  if (!fs.existsSync(cachePath) || !fs.existsSync(metaPath)) {
    return null;
  }

  try {
    const meta: CacheEntry = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    const now = Date.now();

    // Check if cache is expired
    if (now - meta.createdAt > CONVERSION_CONFIG.CACHE_TTL_MS) {
      logger.info(`Cache expired for ${url.substring(0, 50)}...`);
      // Clean up expired cache
      fs.unlinkSync(cachePath);
      fs.unlinkSync(metaPath);
      return null;
    }

    // Update last accessed time
    meta.lastAccessed = now;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    return cachePath;
  } catch (error) {
    logger.error(`Error reading cache meta: ${error}`);
    return null;
  }
}

/**
 * Save cache metadata
 */
function saveCacheMeta(url: string, cachePath: string, size: number): void {
  const metaPath = getCacheMetaPath(url);
  const meta: CacheEntry = {
    filePath: cachePath,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    size,
    originalUrl: url,
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

/**
 * Clean up old cache entries if cache size exceeds limit
 */
async function cleanupCache(): Promise<void> {
  try {
    const files = fs.readdirSync(CONVERSION_CONFIG.CACHE_DIR);
    const metaFiles = files.filter((f) => f.endsWith(".meta.json"));

    // Load all cache entries
    const entries: CacheEntry[] = [];
    for (const metaFile of metaFiles) {
      try {
        const metaPath = path.join(CONVERSION_CONFIG.CACHE_DIR, metaFile);
        const meta: CacheEntry = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        entries.push(meta);
      } catch {
        // Skip invalid meta files
      }
    }

    // Calculate total cache size
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);

    if (totalSize > CONVERSION_CONFIG.MAX_CACHE_SIZE) {
      logger.info(`Cache size (${(totalSize / 1024 / 1024).toFixed(2)}MB) exceeds limit, cleaning up...`);

      // Sort by last accessed (oldest first)
      entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

      // Delete oldest entries until under limit
      let currentSize = totalSize;
      for (const entry of entries) {
        if (currentSize <= CONVERSION_CONFIG.MAX_CACHE_SIZE * 0.8) {
          break; // Keep some headroom (80% of max)
        }

        try {
          if (fs.existsSync(entry.filePath)) {
            fs.unlinkSync(entry.filePath);
          }
          const metaPath = getCacheMetaPath(entry.originalUrl);
          if (fs.existsSync(metaPath)) {
            fs.unlinkSync(metaPath);
          }
          currentSize -= entry.size;
          logger.info(`Removed cached file: ${path.basename(entry.filePath)}`);
        } catch (error) {
          logger.error(`Error removing cache file: ${error}`);
        }
      }
    }
  } catch (error) {
    logger.error(`Error during cache cleanup: ${error}`);
  }
}

// ============================================================================
// FFMPEG OPERATIONS
// ============================================================================

/**
 * Check if ffmpeg is available
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Download file from URL to temporary location
 */
async function downloadFile(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const tempPath = path.join(os.tmpdir(), `download-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.gif`);
  
  fs.writeFileSync(tempPath, Buffer.from(buffer));
  return tempPath;
}

/**
 * Convert GIF to MP4 using ffmpeg
 */
async function convertGifToMp4(inputPath: string, outputPath: string): Promise<void> {
  const opts = CONVERSION_CONFIG.FFMPEG_OPTS;

  // Build ffmpeg command with optimal settings for size reduction
  const scaleFilter = `scale='min(${opts.maxWidth},iw)':min'(${opts.maxHeight},ih)':force_original_aspect_ratio=decrease,fps=${opts.maxFps}`;
  
  const command = [
    "ffmpeg",
    "-i", `"${inputPath}"`,
    "-c:v", opts.videoCodec,
    "-preset", opts.preset,
    "-crf", opts.crf.toString(),
    "-vf", `"${scaleFilter}"`,
    "-pix_fmt", opts.pixelFormat,
    "-movflags", "+faststart", // Enable streaming
    "-y", // Overwrite output file
    `"${outputPath}"`,
  ].join(" ");

  logger.info(`Running ffmpeg conversion...`);
  logger.info(`Command: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    });
    
    if (stderr && !stderr.includes("frame=")) {
      // ffmpeg outputs progress to stderr, so only log if it's not progress
      logger.info(`ffmpeg stderr: ${stderr.substring(0, 500)}`);
    }
  } catch (error: any) {
    logger.error(`ffmpeg error: ${error.message}`);
    throw new Error(`Conversion failed: ${error.message}`);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Convert GIF URL to MP4
 * Returns converted file path and compression stats
 * Uses cache when available
 */
export async function convertGifUrlToMp4(gifUrl: string): Promise<ConversionResult> {
  const startTime = Date.now();
  
  try {
    // Initialize cache directory
    ensureCacheDir();

    // Check cache first
    const cachedPath = getCachedConversion(gifUrl);
    if (cachedPath && fs.existsSync(cachedPath)) {
      const stats = fs.statSync(cachedPath);
      logger.info(`✅ Cache hit: ${path.basename(cachedPath)} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
      
      return {
        success: true,
        outputPath: cachedPath,
        convertedSize: stats.size,
        fromCache: true,
      };
    }

    logger.info(`🔄 Converting GIF: ${gifUrl.substring(0, 80)}...`);

    // Check ffmpeg availability
    const ffmpegAvailable = await checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      logger.error("ffmpeg not available");
      return {
        success: false,
        error: "ffmpeg not installed",
      };
    }

    // Download GIF
    logger.info("   Downloading GIF...");
    const inputPath = await downloadFile(gifUrl);
    const originalSize = fs.statSync(inputPath).size;
    logger.info(`   Downloaded: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);

    // Convert to MP4
    const outputPath = getCachePath(gifUrl);
    logger.info("   Converting to MP4...");
    await convertGifToMp4(inputPath, outputPath);

    // Get converted file size
    const convertedSize = fs.statSync(outputPath).size;
    const compressionRatio = ((1 - convertedSize / originalSize) * 100);
    
    logger.info(`   ✅ Converted: ${(convertedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio.toFixed(1)}% reduction)`);
    logger.info(`   Time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

    // Save cache metadata
    saveCacheMeta(gifUrl, outputPath, convertedSize);

    // Clean up temporary download
    try {
      fs.unlinkSync(inputPath);
    } catch {
      // Ignore cleanup errors
    }

    // Cleanup old cache entries if needed
    await cleanupCache();

    return {
      success: true,
      outputPath,
      originalSize,
      convertedSize,
      compressionRatio,
      fromCache: false,
    };
  } catch (error: any) {
    logger.error(`Conversion failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  totalFiles: number;
  totalSize: number;
  cacheDir: string;
} {
  try {
    const files = fs.readdirSync(CONVERSION_CONFIG.CACHE_DIR);
    const mp4Files = files.filter((f) => f.endsWith(".mp4"));
    
    let totalSize = 0;
    for (const file of mp4Files) {
      const filePath = path.join(CONVERSION_CONFIG.CACHE_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      } catch {
        // Skip files we can't read
      }
    }

    return {
      totalFiles: mp4Files.length,
      totalSize,
      cacheDir: CONVERSION_CONFIG.CACHE_DIR,
    };
  } catch {
    return {
      totalFiles: 0,
      totalSize: 0,
      cacheDir: CONVERSION_CONFIG.CACHE_DIR,
    };
  }
}

/**
 * Clear all cached conversions
 */
export function clearCache(): void {
  try {
    const files = fs.readdirSync(CONVERSION_CONFIG.CACHE_DIR);
    for (const file of files) {
      const filePath = path.join(CONVERSION_CONFIG.CACHE_DIR, file);
      fs.unlinkSync(filePath);
    }
    logger.info("Cache cleared");
  } catch (error) {
    logger.error(`Error clearing cache: ${error}`);
  }
}

