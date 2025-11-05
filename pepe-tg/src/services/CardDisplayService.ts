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

type CollectionType = 'fake-rares' | 'fake-commons' | 'rare-pepes';

interface SendCardParams {
  callback: HandlerCallback | null;
  cardMessage: string;
  mediaUrl: string;
  mediaExtension: MediaExtension;
  assetName: string;
  buttons?: Array<{ text: string; url?: string; callback_data?: string }>;
  fallbackImages?: Array<{ url: string; contentType: string }>;
}

interface SizeCheckResult {
  contentType: string | null;
  contentLength: number | null;
  isStreamable: boolean;
  shouldUseLink: boolean;
}

export class CardDisplayService extends Service {
  static serviceType = 'card-display';
  capabilityDescription = 'Unified card display with media handling for all collections';

  private sizeCheckCache = new Map<string, SizeCheckResult>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(protected runtime: IAgentRuntime) {
    super();
  }

  static async start(runtime: IAgentRuntime): Promise<CardDisplayService> {
    logger.info('Initializing CardDisplayService');
    const service = new CardDisplayService(runtime);
    return service;
  }

  /**
   * Fetch Content-Type and Content-Length via HEAD with a timeout.
   */
  private async headInfo(
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

  private getEnvNumber(name: string, fallback: number): number {
    const val = process.env[name];
    if (!val) return fallback;
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  /**
   * Checks if media is too large for Telegram streaming
   * Caches results to avoid repeated HEAD requests
   */
  async checkMediaSize(
    url: string,
    extension: MediaExtension,
  ): Promise<SizeCheckResult> {
    // Check cache first
    const cached = this.sizeCheckCache.get(url);
    if (cached) {
      return cached;
    }

    const isVideo = extension === 'mp4';
    const isAnimation = extension === 'gif';

    if (!isVideo && !isAnimation) {
      // Images (jpg/png) are always streamable
      const result: SizeCheckResult = {
        contentType: null,
        contentLength: null,
        isStreamable: true,
        shouldUseLink: false,
      };
      this.sizeCheckCache.set(url, result);
      return result;
    }

    try {
      const maxMb = isVideo
        ? this.getEnvNumber('MP4_URL_MAX_MB', 50)
        : this.getEnvNumber('GIF_URL_MAX_MB', 40);

      const { contentType, contentLength } = await this.headInfo(url, 3000);

      const typeOk = isVideo
        ? (contentType || '').toLowerCase().includes('video/mp4')
        : (contentType || '').toLowerCase().includes('image/gif');

      const sizeOk =
        contentLength !== null ? contentLength <= maxMb * 1024 * 1024 : false;

      const result: SizeCheckResult = {
        contentType,
        contentLength,
        isStreamable: typeOk && sizeOk,
        shouldUseLink: !typeOk || !sizeOk,
      };

      // Cache result
      this.sizeCheckCache.set(url, result);

      // Clear cache after timeout
      setTimeout(() => {
        this.sizeCheckCache.delete(url);
      }, this.cacheTimeout);

      return result;
    } catch {
      // On error, assume too large and use link
      const result: SizeCheckResult = {
        contentType: null,
        contentLength: null,
        isStreamable: false,
        shouldUseLink: true,
      };
      this.sizeCheckCache.set(url, result);
      return result;
    }
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

    const isVideo = params.mediaExtension === 'mp4';
    const isAnimation = params.mediaExtension === 'gif';

    // Check size for videos and animations
    if (isVideo || isAnimation) {
      const sizeCheck = await this.checkMediaSize(params.mediaUrl, params.mediaExtension);

      if (sizeCheck.shouldUseLink) {
        const mediaType = isVideo ? '🎬 Video' : '🎞️ Animation';
        await params.callback({
          text: `${params.cardMessage}\n\nFile too large for viewing on TG - click the link to view asset\n${mediaType}: ${params.mediaUrl}`,
          buttons:
            params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
          plainText: true,
          __fromAction: 'cardDisplay',
          suppressBootstrap: true,
        });
        return;
      }
    }

    // Build attachments array
    const attachments: Array<{
      url: string;
      title: string;
      source: string;
      contentType: string;
    }> = [];

    // Primary media first (video/gif/image)
    attachments.push({
      url: params.mediaUrl,
      title: params.assetName,
      source: 'card-display',
      contentType: isVideo
        ? 'video/mp4'
        : isAnimation
          ? 'image/gif'
          : 'image/jpeg',
    });

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
    this.sizeCheckCache.clear();
    logger.info('CardDisplayService stopped');
  }
}

