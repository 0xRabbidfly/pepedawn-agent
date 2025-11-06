/**
 * Card URL Utilities - Shared functions for determining card URLs
 * 
 * These utilities handle the complex logic of determining the best URL
 * for a Fake Rares card, including fallbacks and special cases.
 */

import type { CardInfo } from '../data/fullCardIndex';

// Base URL for Fake Rares card images (using /full/ for higher quality)
const FAKE_RARES_BASE_URL = 'https://pepewtf.s3.amazonaws.com/collections/fake-rares/full';

type MediaExtension = 'jpg' | 'jpeg' | 'gif' | 'png' | 'mp4' | 'webp';

export interface CardUrlResult {
  url: string;
  extension: MediaExtension;
}

/**
 * Constructs the S3 URL for a Fake Rares card
 */
export function getFakeRaresImageUrl(
  assetName: string,
  seriesNumber: number,
  extension: MediaExtension
): string {
  // URL encode the asset name to handle special characters
  const encodedAssetName = encodeURIComponent(assetName.toUpperCase());
  return `${FAKE_RARES_BASE_URL}/${seriesNumber}/${encodedAssetName}.${extension}`;
}

/**
 * Determines the best URL for a card, prioritizing special URIs over constructed URLs
 * 
 * Priority order:
 * 1. videoUri (for MP4 files)
 * 2. imageUri (custom overrides)
 * 3. Constructed S3 URL from series + extension
 */
export function determineCardUrl(cardInfo: CardInfo, assetName: string): CardUrlResult {
  // Check for special URIs (videoUri for mp4, imageUri for others)
  if (cardInfo.ext === 'mp4' && cardInfo.videoUri) {
    return { url: cardInfo.videoUri, extension: 'mp4' };
  }
  
  if (cardInfo.imageUri) {
    return { url: cardInfo.imageUri, extension: cardInfo.ext as MediaExtension };
  }
  
  // Construct URL from series and ext
  return {
    url: getFakeRaresImageUrl(assetName, cardInfo.series, cardInfo.ext as MediaExtension),
    extension: cardInfo.ext as MediaExtension
  };
}

/**
 * Determines the best image URL for visual analysis
 * For MP4 videos, checks memeUri (scraped static version) before failing
 * For images, returns the best available URL
 */
export function determineImageUrlForAnalysis(
  cardInfo: CardInfo,
  assetName: string
): string | null {
  // For MP4 videos, try memeUri first (static image/gif scraped from tokenscan)
  if (cardInfo.ext === 'mp4') {
    if (cardInfo.memeUri) {
      return cardInfo.memeUri;
    }
    // No static version available for this MP4
    return null;
  }
  
  // For non-MP4 cards: Priority is imageUri > constructed S3 URL
  if (cardInfo.imageUri) {
    return cardInfo.imageUri;
  }
  
  // Construct S3 URL
  return getFakeRaresImageUrl(assetName, cardInfo.series, cardInfo.ext as MediaExtension);
}

/**
 * Build a list of fallback image URLs to try if primary fails
 * Useful for cards with multiple format variants
 */
export function buildFallbackImageUrls(
  assetName: string,
  cardInfo: CardInfo | null
): Array<{ url: string; contentType: string }> {
  const results: Array<{ url: string; contentType: string }> = [];
  const upperAsset = assetName.toUpperCase();
  
  if (cardInfo?.imageUri) {
    // Heuristic: guess content type by extension
    const lower = cardInfo.imageUri.toLowerCase();
    const ct = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';
    results.push({ url: cardInfo.imageUri, contentType: ct });
  }
  
  if (typeof cardInfo?.series === 'number') {
    // Try common formats from S3
    results.push({
      url: getFakeRaresImageUrl(upperAsset, cardInfo.series, 'jpg'),
      contentType: 'image/jpeg'
    });
    results.push({
      url: getFakeRaresImageUrl(upperAsset, cardInfo.series, 'png'),
      contentType: 'image/png'
    });
    results.push({
      url: getFakeRaresImageUrl(upperAsset, cardInfo.series, 'webp' as any),
      contentType: 'image/webp'
    });
    
    // If original ext is gif, include S3 gif variant
    if ((cardInfo.ext || '').toLowerCase() === 'gif') {
      results.push({
        url: getFakeRaresImageUrl(upperAsset, cardInfo.series, 'gif' as any),
        contentType: 'image/gif'
      });
    }
  }
  
  return results;
}

