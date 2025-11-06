/**
 * CardDisplayService
 * 
 * Centralized service for displaying cards across all collections (Fake Rares, Fake Commons, Rare Pepes).
 * Handles media size checking, attachment building, fallback URLs, and carousel navigation.
 * 
 * Eliminates duplication across fakeRaresCard, fakeCommonsCard, and rarePepesCard actions.
 */

import type { IAgentRuntime } from '@elizaos/core';
import { Service, logger } from '@elizaos/core';
import type { HandlerCallback } from '@elizaos/core';
import type { CardInfo } from '../data/fullCardIndex';
import {
  determineCardUrl,
  buildCardDisplayMessage,
  type MediaExtension,
} from '../actions/fakeRaresCard';
import { checkAndConvertGif } from '../utils/gifConversionHelper';

type CollectionType = 'fake-rares' | 'fake-commons' | 'rare-pepes';

interface SendCardParams {
  callback: HandlerCallback | null;
  cardMessage: string;
  mediaUrl: string;
  mediaExtension: MediaExtension;
  assetName: string;
  buttons?: Array<{ text: string; url?: string; callback_data?: string }>;
  fallbackImages?: Array<{ url: string; contentType: string }>;
  cardInfo?: CardInfo | null; // For memeUri fallback when primary media fails
}

export class CardDisplayService extends Service {
  static serviceType = 'card-display';
  capabilityDescription = 'Unified card display with media handling for all collections';

  constructor(protected runtime: IAgentRuntime) {
    super();
  }

  static async start(runtime: IAgentRuntime): Promise<CardDisplayService> {
    logger.info('Initializing CardDisplayService');
    const service = new CardDisplayService(runtime);
    return service;
  }

  /**
   * Build a list of fallback image URLs to try if video fails on Telegram.
   * Prefers cardInfo.imageUri, then S3 JPG and PNG variants.
   */
  buildFallbackImageUrls(
    assetName: string,
    cardInfo: CardInfo | null,
    collection: CollectionType,
  ): Array<{ url: string; contentType: string }> {
    const results: Array<{ url: string; contentType: string }> = [];
    const upperAsset = assetName.toUpperCase();

    if (cardInfo?.imageUri) {
      const lower = cardInfo.imageUri.toLowerCase();
      const ct = lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';
      results.push({ url: cardInfo.imageUri, contentType: ct });
    }

    // Build S3 URLs based on collection
    if (typeof cardInfo?.series === 'number') {
      const baseUrl = this.getBaseUrl(collection);
      const series = cardInfo.series;

      results.push({
        url: `${baseUrl}/${series}/${upperAsset}.jpg`,
        contentType: 'image/jpeg',
      });
      results.push({
        url: `${baseUrl}/${series}/${upperAsset}.png`,
        contentType: 'image/png',
      });
      results.push({
        url: `${baseUrl}/${series}/${upperAsset}.webp`,
        contentType: 'image/webp',
      });

      // If original ext is gif, include S3 gif variant explicitly
      if ((cardInfo.ext || '').toLowerCase() === 'gif') {
        results.push({
          url: `${baseUrl}/${series}/${upperAsset}.gif`,
          contentType: 'image/gif',
        });
      }
    }

    return results;
  }

  private getBaseUrl(collection: CollectionType): string {
    switch (collection) {
      case 'fake-rares':
        return 'https://pepewtf.s3.amazonaws.com/collections/fake-rares/full';
      case 'fake-commons':
        return 'https://pepewtf.s3.amazonaws.com/collections/fake-commons/full';
      case 'rare-pepes':
        return 'https://pepewtf.s3.amazonaws.com/collections/rare-pepes/full';
      default:
        return 'https://pepewtf.s3.amazonaws.com/collections/fake-rares/full';
    }
  }

  /**
   * Unified card sending with media attachment
   * Handles all card display flows with consistent formatting
   */
  async sendCard(params: SendCardParams): Promise<void> {
    if (!params.callback) {
      return;
    }

    let mediaUrl = params.mediaUrl;
    let mediaExtension = params.mediaExtension;
    let isVideo = params.mediaExtension === 'mp4';
    let isAnimation = params.mediaExtension === 'gif';

    // ========================================================================
    // CHECK CACHE FIRST - Skip expensive conversion if we have a cached file_id
    // ========================================================================
    const { getTelegramFileId } = await import('../utils/telegramFileIdCache.js');
    const cachedFileId = getTelegramFileId(params.assetName);
    
    // ========================================================================
    // GIF CONVERSION LOGIC (Centralized) - Only if no cache hit
    // ========================================================================
    if (!cachedFileId) {
      const conversionCheck = await checkAndConvertGif(mediaUrl, mediaExtension);
      if (conversionCheck.shouldConvert && conversionCheck.convertedUrl) {
        mediaUrl = conversionCheck.convertedUrl;
        mediaExtension = conversionCheck.convertedExtension as MediaExtension;
        isVideo = true;
        isAnimation = false;
      }
    }

    // Build attachments array (size checks removed - file_id caching handles all sizes)
    const attachments: Array<{
      url: string;
      title: string;
      source: string;
      contentType: string;
    }> = [];

    // Primary media first (video/gif/image) - use updated URL after potential conversion
    attachments.push({
      url: mediaUrl,
      title: params.assetName,
      source: 'card-display',
      contentType: isVideo
        ? 'video/mp4'
        : isAnimation
          ? 'image/gif'
          : 'image/jpeg',
    });

    // Add memeUri as fallback for videos and GIFs (handles oversized MP4s and dead primary URLs)
    if ((isVideo || isAnimation) && params.cardInfo?.memeUri) {
      attachments.push({
        url: params.cardInfo.memeUri,
        title: params.assetName,
        source: 'card-display-memeuri-fallback',
        contentType: 'image/gif',
      });
    }

    // Add optional fallback images to improve preview success on Telegram
    // Only use fallbacks for videos (GIFs and images work directly with primary URL)
    if (isVideo && params.fallbackImages && params.fallbackImages.length > 0) {
      for (const fb of params.fallbackImages) {
        attachments.push({
          url: fb.url,
          title: params.assetName,
          source: 'card-display-fallback',
          contentType: fb.contentType,
        });
      }
    }

    await params.callback({
      text: params.cardMessage,
      attachments,
      buttons:
        params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
      __fromAction: 'cardDisplay',
      suppressBootstrap: true,
    });
  }

  /**
   * Cleanup on service stop
   */
  async stop(): Promise<void> {
    logger.info('CardDisplayService stopped');
  }
}

