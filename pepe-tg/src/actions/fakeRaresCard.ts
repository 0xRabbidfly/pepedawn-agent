import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State, ModelType } from '@elizaos/core';
import { getCardSeries, addCardToMap, isKnownCard, SERIES_INFO, getCardExtension } from '../data/cardSeriesMap';
import { type CardInfo, FULL_CARD_INDEX } from '../data/fullCardIndex';
import { getCardInfo as getRefreshableCardInfo, getFullCardIndex as getRefreshableCardIndex } from '../utils/cardIndexRefresher';

/**
 * Fake Rares Card Display Action
 * Responds to /f <ASSET> commands by fetching and displaying card images
 * Also supports /f (no asset) to display a random card from the collection
 * 
 * URL Structure: https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/{SERIES}/{ASSET}.{jpg|gif|mp4|png}
 * Series 0-18 (19 series total, 50 cards each = ~950 total cards)
 * 
 * Performance optimization:
 * - Known cards: ~200ms (direct lookup, 1-3 HTTP requests)
 * - Unknown cards: ~2-10s (search series 0-18, auto-cache result)
 * - Random cards: instant (picks from full card index)
 * 
 * Note: Using /full/ for higher quality media (Telegram handles compression automatically)
 */

// ============================================================================
// CONSTANTS
// ============================================================================

// Base URL for Fake Rares card images (using /full/ for higher quality)
const FAKE_RARES_BASE_URL = 'https://pepewtf.s3.amazonaws.com/collections/fake-rares/full';

// Fuzzy matching thresholds and configuration
const FUZZY_MATCH_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.75,  // ≥75% similarity: Auto-show the matched card
  MODERATE: 0.55,          // 55-74% similarity: Show suggestions
  ARTIST_FUZZY: 0.65,      // 65% similarity: Minimum for artist fuzzy matching
  TOP_SUGGESTIONS: 3,      // Number of suggestions to show for moderate matches
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type MediaExtension = 'jpg' | 'jpeg' | 'gif' | 'png' | 'mp4' | 'webp';

interface CardUrlResult {
  url: string;
  extension: MediaExtension;
}

interface FuzzyMatch {
  name: string;
  similarity: number;
}

interface CardDisplayParams {
  assetName: string;
  cardInfo: CardInfo | null;
  mediaUrl: string;
  isRandomCard?: boolean;
  isTypoCorrection?: boolean;
  includeMediaUrl?: boolean; // If true, append URL to message (for debugging/fallback)
}

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Structured logger for card actions
 * Provides consistent, searchable log format with context
 */
const logger = {
  debug: (message: string, context?: Record<string, any>) => {
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`🔍 [DEBUG] ${message}${ctx}`);
  },
  
  info: (message: string, context?: Record<string, any>) => {
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`ℹ️  [INFO] ${message}${ctx}`);
  },
  
  success: (message: string, context?: Record<string, any>) => {
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`✅ [SUCCESS] ${message}${ctx}`);
  },
  
  warning: (message: string, context?: Record<string, any>) => {
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`⚠️  [WARNING] ${message}${ctx}`);
  },
  
  error: (message: string, error?: Error | string, context?: Record<string, any>) => {
    const errorMsg = error instanceof Error ? error.message : error;
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console.error(`❌ [ERROR] ${message}${errorMsg ? ` - ${errorMsg}` : ''}${ctx}`);
  },
  
  step: (stepNumber: number, description: string) => {
    console.log(`\n🔧 STEP ${stepNumber}: ${description}`);
  },
  
  separator: () => {
    console.log(`${'='.repeat(60)}`);
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get card info - uses refreshable index if available, falls back to static
 */
function getCardInfo(cardName: string): CardInfo | null {
  // Try refreshable index first (may have newer data)
  const refreshableCard = getRefreshableCardInfo(cardName);
  if (refreshableCard) return refreshableCard;
  
  // Fallback to static index
  const staticCard = FULL_CARD_INDEX.find(c => c.asset === cardName.toUpperCase());
  return staticCard || null;
}

/**
 * Get all cards - uses refreshable index if available, falls back to static
 */
function getAllCards(): CardInfo[] {
  const refreshableIndex = getRefreshableCardIndex();
  return refreshableIndex.length > 0 ? refreshableIndex : FULL_CARD_INDEX;
}

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of edits (insertions, deletions, substitutions) needed
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two strings (0-1 range)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toUpperCase(), str2.toUpperCase());
  const maxLen = Math.max(str1.length, str2.length);
  return maxLen === 0 ? 1 : 1 - (distance / maxLen);
}

/**
 * Find top N matching card names from all available cards
 */
function findTopMatches(inputName: string, allAssets: string[], topN: number = FUZZY_MATCH_THRESHOLDS.TOP_SUGGESTIONS): FuzzyMatch[] {
  if (allAssets.length === 0) return [];

  const matches: FuzzyMatch[] = allAssets.map(asset => ({
    name: asset,
    similarity: calculateSimilarity(inputName, asset)
  }));

  // Sort by similarity (descending) and take top N
  return matches
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);
}

/**
 * Find cards by exact artist name match (case-insensitive)
 * Returns array of matching cards and the matched artist name
 */
function findCardsByArtistExact(inputArtist: string): {
  cards: CardInfo[];
  matchedArtist: string;
} | null {
  const allCards = getAllCards();
  if (allCards.length === 0) return null;

  // Case-insensitive exact match
  const inputLower = inputArtist.toLowerCase().trim();
  
  const artistCards = allCards.filter(card => 
    card.artist && card.artist.toLowerCase() === inputLower
  );

  if (artistCards.length === 0) return null;

  return {
    cards: artistCards,
    matchedArtist: artistCards[0].artist!, // Use the properly cased artist name from data
  };
}

/**
 * Find cards by artist name with fuzzy matching support
 * Returns array of matching cards and the matched artist name
 */
function findCardsByArtistFuzzy(inputArtist: string): {
  cards: CardInfo[];
  matchedArtist: string;
  similarity: number;
} | null {
  const allCards = getAllCards();
  if (allCards.length === 0) return null;

  // Get unique artist names from all cards
  const artistNames = new Set<string>();
  allCards.forEach(card => {
    if (card.artist) {
      artistNames.add(card.artist);
    }
  });

  const uniqueArtists = Array.from(artistNames);
  if (uniqueArtists.length === 0) return null;

  // Find best matching artist using fuzzy matching
  const artistMatches = uniqueArtists.map(artist => ({
    name: artist,
    similarity: calculateSimilarity(inputArtist, artist)
  }));

  // Sort by similarity and get best match
  const bestMatch = artistMatches.sort((a, b) => b.similarity - a.similarity)[0];

  // Only accept moderate or better matches (higher threshold for artist matching)
  if (bestMatch.similarity < FUZZY_MATCH_THRESHOLDS.ARTIST_FUZZY) {
    return null;
  }

  // Get all cards by this artist
  const artistCards = allCards.filter(card => card.artist === bestMatch.name);

  if (artistCards.length === 0) return null;

  return {
    cards: artistCards,
    matchedArtist: bestMatch.name,
    similarity: bestMatch.similarity
  };
}

/**
 * Format URL for Telegram MarkdownV2
 * WORKAROUND: Plugin's escapeUrl() doesn't escape underscores, causing them to be stripped
 * Solution: Percent-encode underscores as %5F (RFC 3986 compliant)
 * This preserves functionality while ensuring Telegram shows the preview
 */
function formatTelegramUrl(url: string): string {
  // Replace underscores with %5F - ugly but works and shows preview
  return url.replace(/_/g, '%5F');
}

/**
 * Fetch Content-Length via HEAD with a timeout. Returns null if unknown.
 */
async function headContentLength(url: string, timeoutMs: number = 3000): Promise<number | null> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    const len = res.headers.get('content-length');
    return len ? parseInt(len, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Fetch Content-Type and Content-Length via HEAD with a timeout.
 */
async function headInfo(url: string, timeoutMs: number = 3000): Promise<{ contentType: string | null; contentLength: number | null }>{
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

// ============================================================================
// MESSAGE BUILDING
// ============================================================================

/**
 * Builds the card display message with metadata and media URL
 * Consolidates message formatting logic used in multiple places
 */
function buildCardDisplayMessage(params: CardDisplayParams): string {
  let message = '';
  
  // Add typo correction header if applicable
  if (params.isTypoCorrection) {
    message += '😅 Ha, spelling not your thing? No worries - got you fam.\n\n';
  }
  
  // Add card name header - UNIFIED FORMAT FOR ALL FLOWS
  // Use the properly capitalized name from cardInfo if available, otherwise fall back to user input
  const displayName = params.cardInfo?.asset || params.assetName;
  if (params.isRandomCard) {
    message += `🎲 ${displayName} 🐸`;
  } else {
    message += `${displayName} 🐸`;
  }
  
  // Add series and card number - SAME FOR ALL FLOWS
  if (params.cardInfo) {
    message += ` Series ${params.cardInfo.series} - Card ${params.cardInfo.card}\n`;
    
    // Add metadata line (artist and/or supply)
    const metadata: string[] = [];
    const artistButtonsEnabled = process.env.FAKE_RARES_ARTIST_BUTTONS === 'true';
    if (params.cardInfo.artist && !artistButtonsEnabled) {
      metadata.push(`👨‍🎨 ${params.cardInfo.artist}`);
    }
    if (params.cardInfo.supply) {
      metadata.push(`💎 ${params.cardInfo.supply.toLocaleString()}`);
    }
    
    if (metadata.length > 0) {
      message += metadata.join(' • ');
    }
    
    message += '\n\n';
    
    // Add issuance date if available
    if (params.cardInfo.issuance) {
      if (params.cardInfo.supply) {
        // Already added supply above, so add issuance separately
        message = message.slice(0, -2); // Remove last \n\n
        message += ` • 📅 ${params.cardInfo.issuance}\n\n`;
      } else {
        message += `📅 ${params.cardInfo.issuance}\n\n`;
      }
    }
  } else {
    message += ` Series ? - Card ?\n`;
  }
  
  // URL not included in message text - handled via attachments in callback
  
  return message;
}

/**
 * Builds artist button if artist info is available
 */
function buildArtistButton(cardInfo: CardInfo | null): Array<{ text: string; url: string }> {
  // Feature toggle: set FAKE_RARES_ARTIST_BUTTONS=true to enable globally
  const isEnabled = process.env.FAKE_RARES_ARTIST_BUTTONS === 'true';
  if (!isEnabled) {
    return [];
  }
  if (!cardInfo?.artist || !cardInfo?.artistSlug) {
    return [];
  }
  
  return [{
    text: `👨‍🎨 ${cardInfo.artist}`,
    url: `https://pepe.wtf/artists/${cardInfo.artistSlug}`
  }];
}

/**
 * Sends card message with media attachment (unified callback handler)
 * Handles all card display flows with consistent formatting
 */
async function sendCardWithMedia(params: {
  callback: ((response: any) => Promise<any>) | null;
  cardMessage: string;
  mediaUrl: string;
  mediaExtension: MediaExtension;
  assetName: string;
  buttons?: Array<{ text: string; url: string }>;
  fallbackImages?: Array<{ url: string; contentType: string }>;
}): Promise<void> {
  if (!params.callback) {
    return;
  }
  
  // Determine media type from extension
  const isVideo = params.mediaExtension === 'mp4';
  const isAnimation = params.mediaExtension === 'gif';

  // Smart hybrid: Only send inline MP4 if HEAD indicates video/mp4 and size ≤ MP4_URL_MAX_MB (default 50MB). Otherwise send link.
  if (isVideo) {
    try {
      const maxMb = getEnvNumber('MP4_URL_MAX_MB', 50);
      const { contentType, contentLength } = await headInfo(params.mediaUrl, 3000);
      const typeOk = (contentType || '').toLowerCase().includes('video/mp4');
      const sizeOk = contentLength !== null ? contentLength <= maxMb * 1024 * 1024 : false;
      if (!typeOk || !sizeOk) {
        await params.callback({
          text: `${params.cardMessage}\n\nFile too large for viewing on TG - click the link to view asset\n🎬 Video: ${params.mediaUrl}`,
          buttons: params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
          plainText: true,
          __fromAction: 'fakeRaresCard',
          suppressBootstrap: true,
        });
        logger.debug('MP4 sent as link due to preflight', { assetName: params.assetName, contentType, contentLength, maxMb });
        return;
      }
      // Eligible: proceed with attachments below
    } catch {
      // If preflight failed entirely, send link to avoid timeouts
      await params.callback({
        text: `${params.cardMessage}\n\nFile too large for viewing on TG - click the link to view asset\n🎬 Video: ${params.mediaUrl}`,
        buttons: params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
        plainText: true,
        __fromAction: 'fakeRaresCard',
        suppressBootstrap: true,
      });
      logger.debug('MP4 preflight failed; sent link', { assetName: params.assetName });
      return;
    }
  }

  // Smart hybrid: Only send inline GIF if HEAD indicates image/gif and size ≤ GIF_URL_MAX_MB (default 40MB). Otherwise send link.
  if (isAnimation) {
    try {
      const maxMb = getEnvNumber('GIF_URL_MAX_MB', 40);
      const { contentType, contentLength } = await headInfo(params.mediaUrl, 3000);
      const typeOk = (contentType || '').toLowerCase().includes('image/gif');
      const sizeOk = contentLength !== null ? contentLength <= maxMb * 1024 * 1024 : false;
      if (!typeOk || !sizeOk) {
        await params.callback({
          text: `${params.cardMessage}\n\nFile too large for viewing on TG - click the link to view asset\n🎞️ Animation: ${params.mediaUrl}`,
          buttons: params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
          plainText: true,
          __fromAction: 'fakeRaresCard',
          suppressBootstrap: true,
        });
        logger.debug('GIF sent as link due to preflight', { assetName: params.assetName, contentType, contentLength, maxMb });
        return;
      }
      // Eligible: proceed with attachments below
    } catch {
      // If preflight failed entirely, send link to avoid timeouts
      await params.callback({
        text: `${params.cardMessage}\n\nFile too large for viewing on TG - click the link to view asset\n🎞️ Animation: ${params.mediaUrl}`,
        buttons: params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
        plainText: true,
        __fromAction: 'fakeRaresCard',
        suppressBootstrap: true,
      });
      logger.debug('GIF preflight failed; sent link', { assetName: params.assetName });
      return;
    }
  }
  
  const attachments: Array<{ url: string; title: string; source: string; contentType: string }> = [];
  
  // Primary media first (video/gif/image)
  attachments.push({
    url: params.mediaUrl,
    title: params.assetName,
    source: 'fake-rares',
    contentType: isVideo ? 'video/mp4' : isAnimation ? 'image/gif' : 'image/jpeg',
  });
  
  // Add optional fallback images to improve preview success on Telegram
  if (params.fallbackImages && params.fallbackImages.length > 0) {
    for (const fb of params.fallbackImages) {
      attachments.push({
        url: fb.url,
        title: params.assetName,
        source: 'fake-rares-fallback',
        contentType: fb.contentType,
      });
    }
  }
  
  await params.callback({
    text: params.cardMessage,
    attachments,
    // Pass artist button through so the Telegram bridge can render inline keyboard
    buttons: params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
    __fromAction: 'fakeRaresCard',
    suppressBootstrap: true,
  });
  
  logger.debug('Card sent with media attachment', {
    mediaType: isVideo ? 'video' : isAnimation ? 'gif' : 'image',
    assetName: params.assetName,
  });
}

/**
 * Constructs the image URL for a Fake Rares card
 */
function getFakeRaresImageUrl(assetName: string, seriesNumber: number, extension: MediaExtension): string {
  // URL encode the asset name to handle special characters like dots and underscores
  const encodedAssetName = encodeURIComponent(assetName.toUpperCase());
  return `${FAKE_RARES_BASE_URL}/${seriesNumber}/${encodedAssetName}.${extension}`;
}

/**
 * Determines the card URL from CardInfo, prioritizing special URIs over constructed URLs
 */
function determineCardUrl(cardInfo: CardInfo, assetName: string): CardUrlResult {
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
 * Build a list of fallback image URLs to try if video fails on Telegram.
 * Prefers cardInfo.imageUri, then S3 JPG and PNG variants.
 */
function buildFallbackImageUrls(assetName: string, cardInfo: CardInfo | null): Array<{ url: string; contentType: string }> {
  const results: Array<{ url: string; contentType: string }> = [];
  const upperAsset = assetName.toUpperCase();
  if (cardInfo?.imageUri) {
    // Heuristic: guess content type by extension
    const lower = cardInfo.imageUri.toLowerCase();
    const ct = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    results.push({ url: cardInfo.imageUri, contentType: ct });
  }
  if (typeof cardInfo?.series === 'number') {
    // Try common formats from S3
    results.push({ url: getFakeRaresImageUrl(upperAsset, cardInfo.series, 'jpg'), contentType: 'image/jpeg' });
    results.push({ url: getFakeRaresImageUrl(upperAsset, cardInfo.series, 'png'), contentType: 'image/png' });
    results.push({ url: getFakeRaresImageUrl(upperAsset, cardInfo.series, 'webp' as any), contentType: 'image/webp' });
    // If original ext is gif, include S3 gif variant explicitly
    if ((cardInfo.ext || '').toLowerCase() === 'gif') {
      results.push({ url: getFakeRaresImageUrl(upperAsset, cardInfo.series, 'gif' as any), contentType: 'image/gif' });
    }
  }
  return results;
}

// ============================================================================
// CARD LOOKUP FUNCTIONS
// ============================================================================

/**
 * Attempts to find the card image by trying different series numbers (0-18)
 * Uses full card index for instant lookups when available
 */
async function findCardImage(assetName: string): Promise<CardUrlResult | null> {
  const upperAsset = assetName.toUpperCase();
  const t0 = Date.now();
  
  // Check full card index first (SUPER FAST - no HTTP requests!)
  const cardInfo = getCardInfo(upperAsset);
  if (cardInfo) {
    const url = getFakeRaresImageUrl(upperAsset, cardInfo.series, cardInfo.ext as MediaExtension);
    console.log(`⚡ INSTANT: ${upperAsset} series=${cardInfo.series} ext=.${cardInfo.ext} (${Date.now() - t0}ms)`);
    return { url, extension: cardInfo.ext as MediaExtension };
  }
  
  // Try known mapping from runtime cache (fast path with probing)
  const knownSeries = getCardSeries(upperAsset);
  if (knownSeries !== undefined) {
    console.log(`🧭 Fast path: ${upperAsset} series=${knownSeries} (trying extensions...)`);
    // Try all extensions for the known series
    const extensions: MediaExtension[] = ['jpg', 'jpeg', 'gif', 'png'];
    for (const ext of extensions) {
      const testUrl = getFakeRaresImageUrl(upperAsset, knownSeries, ext);
      try {
        const response = await fetch(testUrl, { method: 'HEAD' });
        if (response.ok) {
          console.log(`✅ Found ${upperAsset} in series ${knownSeries} (${ext}) in ${Date.now() - t0}ms`);
          return { url: testUrl, extension: ext };
        }
      } catch (e) {
        // Try next extension
      }
    }
  }
  
  // Unknown card - search through all series (slow path)
  console.log(`🔍 ${upperAsset} not in index or cache, searching series 0-${SERIES_INFO.TOTAL_SERIES - 1}...`);
  
  const extensions: MediaExtension[] = ['jpg', 'jpeg', 'gif', 'png'];
  for (let series = 0; series < SERIES_INFO.TOTAL_SERIES; series++) {
    // Try all extensions
    for (const ext of extensions) {
      const testUrl = getFakeRaresImageUrl(upperAsset, series, ext);
      try {
        const response = await fetch(testUrl, { method: 'HEAD' });
        if (response.ok) {
          // Cache this for future use
          addCardToMap(upperAsset, series);
          console.log(`✅ Found ${upperAsset} in series ${series} (${ext}) in ${Date.now() - t0}ms - added to cache`);
          return { url: testUrl, extension: ext };
        }
      } catch (e) {
        // Continue searching
      }
    }
  }
  
  console.log(`❌ ${upperAsset} not found in any series 0-${SERIES_INFO.TOTAL_SERIES - 1} after ${Date.now() - t0}ms`);
  return null;
}

// ============================================================================
// HANDLER HELPER FUNCTIONS
// ============================================================================

/**
 * Parses the card request from message text
 * Returns asset name and whether it's a random card request
 * Now supports multi-word names like "Fake Annie" for artist searches
 */
function parseCardRequest(text: string): { assetName: string | null; isRandomCard: boolean } {
  // Updated regex to capture everything after /f, including spaces
  const match = text.match(/^\/?f(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?/i);
  
  if (!match || !match[1]) {
    // No asset name provided - random card
    return { assetName: null, isRandomCard: true };
  }
  
  // Trim whitespace and return - keep original case for artist matching
  const input = match[1].trim();
  return { assetName: input, isRandomCard: false };
}

/**
 * Looks up card metadata and determines the URL
 * Returns card info and URL result if found
 */
async function lookupCardUrl(assetName: string): Promise<{
  cardInfo: CardInfo | null;
  urlResult: CardUrlResult | null;
}> {
  logger.step(2, 'Lookup card metadata');
  const cardInfoResult = getCardInfo(assetName);
  const cardInfo: CardInfo | null = cardInfoResult || null;
  let urlResult: CardUrlResult | null = null;
  
  if (cardInfo) {
    logger.info('Found in fullCardIndex', {
      series: cardInfo.series,
      card: cardInfo.card,
      artist: cardInfo.artist || 'unknown',
      supply: cardInfo.supply || 'unknown',
      ext: cardInfo.ext
    });
    
    logger.step(3, 'Determine image/video URL');
    urlResult = determineCardUrl(cardInfo, assetName);
    
    if (cardInfo.ext === 'mp4' && cardInfo.videoUri) {
      logger.debug('Using videoUri');
    } else if (cardInfo.imageUri) {
      logger.debug('Using imageUri');
    } else {
      logger.debug('Constructed from series/ext');
    }
  } else {
    logger.warning('Not in fullCardIndex, trying HTTP probing fallback');
    logger.step(3, 'Fallback - HTTP probing');
    urlResult = await findCardImage(assetName);
    
    if (urlResult) {
      logger.success('Probing found card');
    } else {
      logger.warning('Probing failed - card not found anywhere');
    }
  }
  
  return { cardInfo, urlResult };
}

/**
 * Handles successful card lookup - sends card to user
 */
async function handleCardFound(params: {
  assetName: string;
  cardInfo: CardInfo | null;
  urlResult: CardUrlResult;
  isRandomCard: boolean;
  callback?: HandlerCallback;
}): Promise<{ success: true; data: any }> {
  logger.step(4, 'Compose message with metadata');
  
  const cardMessage = buildCardDisplayMessage({
    assetName: params.assetName,
    cardInfo: params.cardInfo,
    mediaUrl: params.urlResult.url,
    isRandomCard: params.isRandomCard,
  });
  
  logger.step(5, 'Send message with media preview and artist button');
  const buttons = buildArtistButton(params.cardInfo);
  // Use the properly capitalized name from cardInfo for display and file purposes
  const displayAssetName = params.cardInfo?.asset || params.assetName;
  const fallbackImages = buildFallbackImageUrls(displayAssetName, params.cardInfo);
  
  // Send card with media attachment
  await sendCardWithMedia({
    callback: (params.callback ?? null) as ((response: any) => Promise<any>) | null,
    cardMessage,
    mediaUrl: params.urlResult.url,
    mediaExtension: params.urlResult.extension,
    assetName: displayAssetName,
    buttons,
    fallbackImages,
  }).catch((err) => logger.error('Error sending callback', err));
  
  logger.success(`${params.assetName} card will be displayed`);
  logger.separator();
  
  return {
    success: true,
    data: {
      suppressBootstrap: true,
      reason: 'handled_by_fakeRaresCard',
      assetName: params.assetName,
      isRandomCard: params.isRandomCard,
    },
  };
}

/**
 * Displays a random card from an artist's collection
 * Used for both exact and fuzzy artist matches
 */
async function displayArtistCard(params: {
  artistName: string;
  cards: CardInfo[];
  similarity?: number;
  query: string;
  callback?: HandlerCallback;
}): Promise<{ success: true; data: any }> {
  // Pick random card by this artist
  const randomCard = params.cards[Math.floor(Math.random() * params.cards.length)];
  logger.success('Artist match - displaying random card', {
    artist: params.artistName,
    similarity: params.similarity ? `${(params.similarity * 100).toFixed(1)}%` : 'exact',
    cardCount: params.cards.length,
    selectedCard: randomCard.asset
  });
  
  const matchedUrlResult = determineCardUrl(randomCard, randomCard.asset);
  
  // Build message with artist context
  const isTypoCorrected = params.similarity !== undefined && params.similarity < FUZZY_MATCH_THRESHOLDS.HIGH_CONFIDENCE;
  let artistMessage = '';
  
  if (isTypoCorrected) {
    artistMessage = `😅 Ha, spelling not your thing? No worries - got you fam.\n\n`;
  }
  
  artistMessage += `👨‍🎨 Random card by ${params.artistName} (${params.cards.length} card${params.cards.length > 1 ? 's' : ''} total)\n\n`;
  
  const cardMessage = buildCardDisplayMessage({
    assetName: randomCard.asset,
    cardInfo: randomCard,
    mediaUrl: matchedUrlResult.url,
    isRandomCard: false,
  });
  
  // Prepend artist context to card message
  const fullMessage = artistMessage + cardMessage;
  
  // Send card with media attachment
  const buttons = buildArtistButton(randomCard);
  const fallbackImages = buildFallbackImageUrls(randomCard.asset, randomCard);
  
  await sendCardWithMedia({
    callback: (params.callback ?? null) as ((response: any) => Promise<any>) | null,
    cardMessage: fullMessage,
    mediaUrl: matchedUrlResult.url,
    mediaExtension: matchedUrlResult.extension,
    assetName: randomCard.asset,
    buttons,
    fallbackImages,
  });
  
  logger.success(`Artist-matched card ${randomCard.asset} displayed for query "${params.query}"`);
  logger.separator();
  
  return {
    success: true,
    data: {
      suppressBootstrap: true,
      reason: params.similarity !== undefined ? 'artist_fuzzy_matched' : 'artist_exact_matched',
      query: params.query,
      matchedArtist: params.artistName,
      selectedCard: randomCard.asset,
      similarity: params.similarity,
    },
  };
}

/**
 * Handles card not found - performs fuzzy matching and shows suggestions
 * This is called after exact card and exact artist matches have already failed
 * Priority: Card fuzzy match (high confidence auto-show) -> Card fuzzy match (suggestions) -> Artist fuzzy match
 */
async function handleCardNotFound(params: {
  assetName: string;
  callback?: HandlerCallback;
}): Promise<{ success: boolean; data: any }> {
  logger.warning(`Exact matches failed for "${params.assetName}"`);
  logger.info('STEP 4a: Attempting fuzzy card match...');
  
  // Perform fuzzy matching on card names
  const allAssets = getAllCards().map(c => c.asset);
  const topMatches = findTopMatches(params.assetName, allAssets);
  const bestMatch = topMatches.length > 0 ? topMatches[0] : null;
  
  // High confidence match - auto-show the card
  if (bestMatch && bestMatch.similarity >= FUZZY_MATCH_THRESHOLDS.HIGH_CONFIDENCE) {
    logger.success('Fuzzy match found', {
      match: bestMatch.name,
      similarity: `${(bestMatch.similarity * 100).toFixed(1)}%`
    });
    
    const matchedCard = getCardInfo(bestMatch.name);
    if (matchedCard) {
      const matchedUrlResult = determineCardUrl(matchedCard, bestMatch.name);
      
      const matchedCardText = buildCardDisplayMessage({
        assetName: bestMatch.name,
        cardInfo: matchedCard,
        mediaUrl: matchedUrlResult.url,
        isTypoCorrection: true,
      });
      
      // Send typo-corrected card with media attachment
      await sendCardWithMedia({
        callback: (params.callback ?? null) as ((response: any) => Promise<any>) | null,
        cardMessage: matchedCardText,
        mediaUrl: matchedUrlResult.url,
        mediaExtension: matchedUrlResult.extension,
        assetName: bestMatch.name,
      });
      
      logger.success(`Fuzzy-matched card ${bestMatch.name} displayed for typo "${params.assetName}"`);
      logger.separator();
      
      return {
        success: true,
        data: {
          suppressBootstrap: true,
          reason: 'fuzzy_matched',
          assetName: params.assetName,
          matchedAssetName: bestMatch.name,
          similarity: bestMatch.similarity,
        },
      };
    }
  }
  
  // Moderate match - show suggestions
  if (bestMatch && bestMatch.similarity >= FUZZY_MATCH_THRESHOLDS.MODERATE) {
    logger.info('Moderate fuzzy match', {
      match: bestMatch.name,
      similarity: `${(bestMatch.similarity * 100).toFixed(1)}%`
    });
    
    const suggestions = topMatches
      .filter(m => m.similarity >= FUZZY_MATCH_THRESHOLDS.MODERATE)
      .map(m => `• ${m.name}`)
      .join('\n');
    
    logger.debug('Suggestions', { count: topMatches.length });
    logger.separator();
    
    let errorText = `❌ Could not find "${params.assetName}" in the Fake Rares collection.\n\n`;
    if (suggestions) {
      errorText += `🤔 Did you mean:\n${suggestions}\n\n`;
      errorText += `Try /f <CARD_NAME> with one of the above.`;
    } else {
      errorText += `Double-check the asset name or browse on pepe.wtf.`;
    }
    
    if (params.callback) {
      await params.callback({
        text: errorText,
        __fromAction: 'fakeRaresCard',
        suppressBootstrap: true,
      });
    }
    
    return {
      success: false,
      data: {
        suppressBootstrap: true,
        reason: 'card_not_found_with_suggestions',
        assetName: params.assetName,
        suggestions: topMatches.map(m => m.name),
      },
    };
  }
  
  // No good card name match - try fuzzy artist search
  logger.info('STEP 4b: No good card fuzzy match, trying fuzzy artist search...');
  const artistFuzzyMatch = findCardsByArtistFuzzy(params.assetName);
  
  if (artistFuzzyMatch) {
    return await displayArtistCard({
      artistName: artistFuzzyMatch.matchedArtist,
      cards: artistFuzzyMatch.cards,
      similarity: artistFuzzyMatch.similarity,
      query: params.assetName,
      callback: params.callback,
    });
  }
  
  // Low match - just show error
  const similarityPercent = bestMatch ? (bestMatch.similarity * 100).toFixed(1) : '0.0';
  const thresholdPercent = (FUZZY_MATCH_THRESHOLDS.MODERATE * 100).toFixed(0);
  logger.warning('No good fuzzy match found', {
    best: bestMatch?.name || 'none',
    similarity: `${similarityPercent}%`,
    threshold: `${thresholdPercent}%`
  });
  logger.separator();
  
  if (params.callback) {
    await params.callback({
      text: `❌ Could not find "${params.assetName}" in the Fake Rares collection. Double-check the asset name or browse on pepe.wtf.`,
      __fromAction: 'fakeRaresCard',
      suppressBootstrap: true,
    });
  }
  
  return {
    success: false,
    data: {
      suppressBootstrap: true,
      reason: 'card_not_found',
      assetName: params.assetName,
      cardFound: false,
    },
  };
}

// ============================================================================
// MAIN ACTION EXPORT
// ============================================================================

export const fakeRaresCardAction: Action = {
  name: 'SHOW_FAKE_RARE_CARD',
  description: 'Display a Fake Rares card image when user requests with /f <ASSET> or a random card with /f',
  
  similes: ['/f'],
  
  examples: [],  // Empty examples - action handles everything via callback
  
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const raw = message.content.text || '';
    const text = raw.trim();
    // Accept: "/f", "/f ASSET", "/f ARTIST NAME" (with spaces), "/f@bot ASSET", and leading mentions like "@bot /f ASSET"
    const fPattern = /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+.+)?$/i;
    const matches = fPattern.test(text);
    logger.debug('Command validation', { text, matches });
    return matches;
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    // Initialize handler
    logger.separator();
    logger.info('HANDLER STARTED', {
      message: message.content.text,
      user: message.entityId
    });
    logger.separator();
    
    let assetName = 'UNKNOWN'; // Declare outside try block for error handling
    
    try {
      const text = (message.content.text || '').trim();
      
      // STEP 1: Parse the command
      logger.step(1, 'Parse command');
      const request = parseCardRequest(text);
      
      // Handle random card request
      if (request.isRandomCard) {
        const allCards = getAllCards();
        if (allCards.length === 0) {
          logger.error('Cannot select random card: index is empty');
          if (callback) {
            await callback({
              text: '❌ Card index not loaded. Please try again later.',
            });
          }
          return { success: false, text: 'Card index not available' };
        }
        
        const randomCard = allCards[Math.floor(Math.random() * allCards.length)];
        assetName = randomCard.asset;
        logger.info('Random card selected', {
          assetName,
          totalCards: allCards.length
        });
      } else {
        assetName = request.assetName!;
        logger.info('Extracted asset/artist', { input: assetName });
      }
      
      // STEP 2: Try exact card match
      logger.step(2, 'Try exact card match');
      const { cardInfo, urlResult } = await lookupCardUrl(assetName);
      
      if (urlResult) {
        logger.success('Exact card match found');
        return await handleCardFound({
          assetName,
          cardInfo,
          urlResult,
          isRandomCard: request.isRandomCard,
          callback,
        });
      }
      
      // STEP 3: Try exact artist match
      logger.step(3, 'Try exact artist match');
      const exactArtistMatch = findCardsByArtistExact(assetName);
      
      if (exactArtistMatch) {
        logger.success('Exact artist match found', { artist: exactArtistMatch.matchedArtist });
        return await displayArtistCard({
          artistName: exactArtistMatch.matchedArtist,
          cards: exactArtistMatch.cards,
          query: assetName,
          callback,
        });
      }
      
      // STEP 4-5: Try fuzzy matches (card then artist)
      logger.step(4, 'Try fuzzy matches');
      return await handleCardNotFound({
        assetName,
        callback,
      });
    } catch (error) {
      logger.separator();
      logger.error('EXCEPTION in /f handler', error instanceof Error ? error : String(error), {
        assetName
      });
      logger.separator();
      
      // Error occurred - respond via callback and suppress bootstrap
      if (callback) {
        await callback({
          text: `❌ Error while fetching ${assetName}. Please try again later.`,
          __fromAction: 'fakeRaresCard',
          suppressBootstrap: true,
        });
      }
      return {
        success: false,
        data: {
          suppressBootstrap: true,
          reason: 'exception',
          error: error instanceof Error ? error.message : String(error),
          assetName,
        },
      };
    }
  },
};

