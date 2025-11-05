#!/usr/bin/env bun
/**
 * Test script for video conversion service
 * Usage: bun run scripts/test-video-conversion.ts [gif-url]
 */

import {
  checkFfmpegAvailable,
  convertGifUrlToMp4,
  getCacheStats,
  clearCache,
} from "../src/services/videoConversionService";

async function main() {
  console.log("🧪 Video Conversion Service Test\n");

  // Step 1: Check ffmpeg availability
  console.log("1. Checking ffmpeg installation...");
  const ffmpegAvailable = await checkFfmpegAvailable();
  if (ffmpegAvailable) {
    console.log("   ✅ ffmpeg is installed and available\n");
  } else {
    console.log("   ❌ ffmpeg is NOT installed");
    console.log("   Install with: sudo apt install ffmpeg (Ubuntu/Debian)");
    console.log("   or: brew install ffmpeg (macOS)\n");
    process.exit(1);
  }

  // Step 2: Check cache
  console.log("2. Cache statistics:");
  const stats = getCacheStats();
  console.log(`   Directory: ${stats.cacheDir}`);
  console.log(`   Files: ${stats.totalFiles}`);
  console.log(
    `   Size: ${(stats.totalSize / 1024 / 1024).toFixed(2)}MB\n`,
  );

  // Step 3: Test conversion (if URL provided)
  const testUrl = process.argv[2];
  if (testUrl) {
    console.log("3. Testing conversion...");
    console.log(`   URL: ${testUrl}\n`);

    const result = await convertGifUrlToMp4(testUrl);

    if (result.success) {
      console.log("   ✅ Conversion successful!");
      console.log(`   Output: ${result.outputPath}`);
      if (result.fromCache) {
        console.log("   Source: Cache (instant)");
      } else {
        console.log(`   Original size: ${(result.originalSize! / 1024 / 1024).toFixed(2)}MB`);
        console.log(
          `   Converted size: ${(result.convertedSize! / 1024 / 1024).toFixed(2)}MB`,
        );
        console.log(
          `   Compression: ${result.compressionRatio?.toFixed(1)}% reduction`,
        );
      }
    } else {
      console.log("   ❌ Conversion failed");
      console.log(`   Error: ${result.error}`);
      process.exit(1);
    }
  } else {
    console.log("3. No test URL provided (skip conversion test)");
    console.log("   Usage: bun run scripts/test-video-conversion.ts <gif-url>");
  }

  console.log("\n✅ All tests passed!");
}

main().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});

