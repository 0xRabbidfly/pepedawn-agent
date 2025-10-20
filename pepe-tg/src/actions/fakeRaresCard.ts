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
  MODERATE: 0.5,          // 50-74% similarity: Show suggestions
  TOP_SUGGESTIONS: 3,     // Number of suggestions to show for moderate matches
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
 * Format URL for Telegram MarkdownV2
 * WORKAROUND: Plugin's escapeUrl() doesn't escape underscores, causing them to be stripped
 * Solution: Percent-encode underscores as %5F (RFC 3986 compliant)
 * This preserves functionality while ensuring Telegram shows the preview
 */
function formatTelegramUrl(url: string): string {
  // Replace underscores with %5F - ugly but works and shows preview
  return url.replace(/_/g, '%5F');
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
  if (params.isRandomCard) {
    message += `🎲 ${params.assetName} 🐸`;
  } else {
    message += `${params.assetName} 🐸`;
  }
  
  // Add series and card number - SAME FOR ALL FLOWS
  if (params.cardInfo) {
    message += ` Series ${params.cardInfo.series} - Card ${params.cardInfo.card}\n`;
    
    // Add metadata line (artist and/or supply)
    const metadata: string[] = [];
    if (params.cardInfo.artist) {
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
}): Promise<void> {
  if (!params.callback) {
    return;
  }
  
  // Determine media type from extension
  const isVideo = params.mediaExtension === 'mp4';
  const isAnimation = params.mediaExtension === 'gif';
  
  await params.callback({
    text: params.cardMessage,
    attachments: [{
      url: formatTelegramUrl(params.mediaUrl), // Fix underscore issues for Arweave URLs
      title: params.assetName,
      source: 'fake-rares',
      contentType: isVideo ? 'video/mp4' : isAnimation ? 'image/gif' : 'image/jpeg',
    }],
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
  return `${FAKE_RARES_BASE_URL}/${seriesNumber}/${assetName.toUpperCase()}.${extension}`;
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
 */
function parseCardRequest(text: string): { assetName: string | null; isRandomCard: boolean } {
  const match = text.match(/^\/?f(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]+))?/i);
  
  if (!match || !match[1]) {
    // No asset name provided - random card
    return { assetName: null, isRandomCard: true };
  }
  
  return { assetName: match[1].toUpperCase(), isRandomCard: false };
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
  
  // Send card with media attachment
  await sendCardWithMedia({
    callback: params.callback,
    cardMessage,
    mediaUrl: params.urlResult.url,
    mediaExtension: params.urlResult.extension,
    assetName: params.assetName,
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
 * Handles card not found - performs fuzzy matching and shows suggestions
 */
async function handleCardNotFound(params: {
  assetName: string;
  callback?: HandlerCallback;
}): Promise<{ success: boolean; data: any }> {
  logger.warning(`Card ${params.assetName} not found anywhere`);
  logger.info('Attempting fuzzy match...');
  
  // Perform fuzzy matching
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
        callback: params.callback,
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
    // Accept: "/f", "/f ASSET", "/f@bot ASSET", and leading mentions like "@bot /f ASSET"
    const fPattern = /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+[A-Za-z0-9_-]+)?$/i;
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
        logger.info('Extracted asset', { assetName });
      }
      
      // STEP 2-3: Lookup card URL
      const { cardInfo, urlResult } = await lookupCardUrl(assetName);
      
      // STEP 4-5: Handle result
      if (urlResult) {
        return await handleCardFound({
          assetName,
          cardInfo,
          urlResult,
          isRandomCard: request.isRandomCard,
          callback,
        });
      } else {
        return await handleCardNotFound({
                assetName,
          callback,
        });
      }
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

