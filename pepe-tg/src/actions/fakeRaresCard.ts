import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  ModelType,
} from "@elizaos/core";
import { createLogger } from "../utils/actionLogger";
import {
  getCardSeries,
  addCardToMap,
  isKnownCard,
  SERIES_INFO,
  getCardExtension,
} from "../data/cardSeriesMap";
import { type CardInfo, FULL_CARD_INDEX } from "../data/fullCardIndex";
import {
  getCardInfo as getRefreshableCardInfo,
  getFullCardIndex as getRefreshableCardIndex,
} from "../utils/cardIndexRefresher";
import { checkAndConvertGif } from "../utils/gifConversionHelper";

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
const FAKE_RARES_BASE_URL =
  "https://pepewtf.s3.amazonaws.com/collections/fake-rares/full";

// Fuzzy matching thresholds and configuration
export const FUZZY_MATCH_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.75, // ≥75% similarity: Auto-show the matched card
  MODERATE: 0.55, // 55-74% similarity: Show suggestions
  ARTIST_FUZZY: 0.65, // 65% similarity: Minimum for artist fuzzy matching
  TOP_SUGGESTIONS: 3, // Number of suggestions to show for moderate matches
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type MediaExtension = "jpg" | "jpeg" | "gif" | "png" | "mp4" | "webp";

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

const logger = createLogger("FakeCard");

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get card info - uses refreshable index if available, falls back to static
 */
export function getCardInfo(cardName: string): CardInfo | null {
  // Try refreshable index first (may have newer data)
  const refreshableCard = getRefreshableCardInfo(cardName);
  if (refreshableCard) return refreshableCard;

  // Fallback to static index
  const staticCard = FULL_CARD_INDEX.find(
    (c) => c.asset === cardName.toUpperCase(),
  );
  return staticCard || null;
}

/**
 * Get all cards - uses refreshable index if available, falls back to static
 */
export function getAllCards(): CardInfo[] {
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
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1, // substitution
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
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

/**
 * Find top N matching card names from all available cards
 */
function findTopMatches(
  inputName: string,
  allAssets: string[],
  topN: number = FUZZY_MATCH_THRESHOLDS.TOP_SUGGESTIONS,
): FuzzyMatch[] {
  if (allAssets.length === 0) return [];

  const matches: FuzzyMatch[] = allAssets.map((asset) => ({
    name: asset,
    similarity: calculateSimilarity(inputName, asset),
  }));

  // Sort by similarity (descending) and take top N
  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, topN);
}

/**
 * Find cards by exact artist name match (case-insensitive)
 * Returns array of matching cards and the matched artist name
 */
export function findCardsByArtistExact(inputArtist: string): {
  cards: CardInfo[];
  matchedArtist: string;
} | null {
  const allCards = getAllCards();
  if (allCards.length === 0) return null;

  // Case-insensitive exact match
  const inputLower = inputArtist.toLowerCase().trim();

  const artistCards = allCards.filter(
    (card) => card.artist && card.artist.toLowerCase() === inputLower,
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
export function findCardsByArtistFuzzy(inputArtist: string): {
  cards: CardInfo[];
  matchedArtist: string;
  similarity: number;
} | null {
  const allCards = getAllCards();
  if (allCards.length === 0) return null;

  // Get unique artist names from all cards
  const artistNames = new Set<string>();
  allCards.forEach((card) => {
    if (card.artist) {
      artistNames.add(card.artist);
    }
  });

  const uniqueArtists = Array.from(artistNames);
  if (uniqueArtists.length === 0) return null;

  // Find best matching artist using fuzzy matching
  const artistMatches = uniqueArtists.map((artist) => ({
    name: artist,
    similarity: calculateSimilarity(inputArtist, artist),
  }));

  // Sort by similarity and get best match
  const bestMatch = artistMatches.sort(
    (a, b) => b.similarity - a.similarity,
  )[0];

  // Only accept moderate or better matches (higher threshold for artist matching)
  if (bestMatch.similarity < FUZZY_MATCH_THRESHOLDS.ARTIST_FUZZY) {
    return null;
  }

  // Get all cards by this artist
  const artistCards = allCards.filter((card) => card.artist === bestMatch.name);

  if (artistCards.length === 0) return null;

  return {
    cards: artistCards,
    matchedArtist: bestMatch.name,
    similarity: bestMatch.similarity,
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
  return url.replace(/_/g, "%5F");
}

/**
 * Fetch Content-Length via HEAD with a timeout. Returns null if unknown.
 */
async function headContentLength(
  url: string,
  timeoutMs: number = 3000,
): Promise<number | null> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    return len ? parseInt(len, 10) : null;
  } catch {
    return null;
  }
}


// ============================================================================
// MESSAGE BUILDING
// ============================================================================

/**
 * Builds the card display message with metadata and media URL
 * Consolidates message formatting logic used in multiple places
 */
export function buildCardDisplayMessage(params: CardDisplayParams): string {
  let message = "";

  // Add typo correction header if applicable
  if (params.isTypoCorrection) {
    message += "😅 Ha, spelling not your thing? No worries - got you fam.\n\n";
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
    const artistButtonsEnabled =
      process.env.FAKE_RARES_ARTIST_BUTTONS === "true";
    if (params.cardInfo.artist && !artistButtonsEnabled) {
      metadata.push(`👨‍🎨 ${params.cardInfo.artist}`);
    }
    if (params.cardInfo.supply) {
      metadata.push(`💎 ${params.cardInfo.supply.toLocaleString()}`);
    }

    if (metadata.length > 0) {
      message += metadata.join(" • ");
    }

    message += "\n\n";

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
export function buildArtistButton(
  cardInfo: CardInfo | null,
): Array<{ text: string; url: string }> {
  // Feature toggle: set FAKE_RARES_ARTIST_BUTTONS=true to enable globally
  const isEnabled = process.env.FAKE_RARES_ARTIST_BUTTONS === "true";
  if (!isEnabled) {
    return [];
  }
  if (!cardInfo?.artist || !cardInfo?.artistSlug) {
    return [];
  }

  return [
    {
      text: `👨‍🎨 ${cardInfo.artist}`,
      url: `https://pepe.wtf/artists/${cardInfo.artistSlug}`,
    },
  ];
}

/**
 * Sends card message with media attachment (unified callback handler)
 * Handles all card display flows with consistent formatting
 * 
 * Delegates to CardDisplayService if runtime is provided, otherwise uses direct implementation
 */
export async function sendCardWithMedia(params: {
  callback: ((response: any) => Promise<any>) | null;
  cardMessage: string;
  mediaUrl: string;
  mediaExtension: MediaExtension;
  assetName: string;
  cardInfo?: CardInfo | null; // Card info for fallback URL generation
  buttons?: Array<{ text: string; url?: string; callback_data?: string }>;
  fallbackImages?: Array<{ url: string; contentType: string }>;
  runtime?: IAgentRuntime; // Optional runtime for service access
}): Promise<void> {
  // Try to use service if runtime is provided
  if (params.runtime) {
    try {
      const service = params.runtime.getService('card-display');
      if (service && typeof service.sendCard === 'function') {
        await service.sendCard({
          callback: params.callback,
          cardMessage: params.cardMessage,
          mediaUrl: params.mediaUrl,
          mediaExtension: params.mediaExtension,
          assetName: params.assetName,
          buttons: params.buttons,
          fallbackImages: params.fallbackImages,
          cardInfo: params.cardInfo, // For memeUri fallback
        });
        return;
      }
    } catch {
      // Fallback to direct implementation
    }
  }
  
  // Direct implementation (fallback)
  if (!params.callback) {
    return;
  }

  let isVideo = params.mediaExtension === "mp4";
  let isAnimation = params.mediaExtension === "gif";

  // ========================================================================
  // GIF CONVERSION LOGIC (Centralized)
  // ========================================================================
  const conversionCheck = await checkAndConvertGif(params.mediaUrl, params.mediaExtension);
  if (conversionCheck.shouldConvert && conversionCheck.convertedUrl) {
    params.mediaUrl = conversionCheck.convertedUrl;
    params.mediaExtension = conversionCheck.convertedExtension as MediaExtension;
    isVideo = true;
    isAnimation = false;
  }

  // Re-evaluate media type after potential conversion
  const finalIsVideo = isVideo;
  const finalIsAnimation = isAnimation;

  // Size checks removed - file_id caching handles all sizes
  // Oversized files will fail gracefully and use memeUri fallback

  // GIF size checks removed - file_id caching handles all sizes

  const attachments: Array<{
    url: string;
    title: string;
    source: string;
    contentType: string;
  }> = [];

  attachments.push({
    url: params.mediaUrl,
    title: params.assetName,
    source: "fake-rares",
    contentType: finalIsVideo
      ? "video/mp4"
      : finalIsAnimation
        ? "image/gif"
        : "image/jpeg",
  });

  if (finalIsVideo && params.fallbackImages && params.fallbackImages.length > 0) {
    for (const fb of params.fallbackImages) {
      attachments.push({
        url: fb.url,
        title: params.assetName,
        source: "fake-rares-fallback",
        contentType: fb.contentType,
      });
    }
  }

  await params.callback({
    text: params.cardMessage,
    attachments,
    buttons:
      params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
    __fromAction: "fakeRaresCard",
    suppressBootstrap: true,
  });
}

/**
 * Constructs the image URL for a Fake Rares card
 */
function getFakeRaresImageUrl(
  assetName: string,
  seriesNumber: number,
  extension: MediaExtension,
): string {
  // URL encode the asset name to handle special characters like dots and underscores
  const encodedAssetName = encodeURIComponent(assetName.toUpperCase());
  return `${FAKE_RARES_BASE_URL}/${seriesNumber}/${encodedAssetName}.${extension}`;
}

/**
 * Known bad domains that should be skipped in favor of fallbacks
 */
const BAD_DOMAINS = [
  'reasoningwithshapes.com',
  'www.reasoningwithshapes.com',
];

/**
 * Check if a URL is from a known bad domain
 */
function isDeadDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BAD_DOMAINS.some(bad => hostname.includes(bad));
  } catch {
    return false;
  }
}

/**
 * Determines the card URL from CardInfo, prioritizing special URIs over constructed URLs
 * Skips known dead custom URIs and falls back to memeUri or S3
 */
export function determineCardUrl(
  cardInfo: CardInfo,
  assetName: string,
): CardUrlResult {
  // Check for special URIs (videoUri for mp4, imageUri for others)
  if (cardInfo.ext === "mp4" && cardInfo.videoUri) {
    // Skip dead domains and fallback to memeUri
    if (isDeadDomain(cardInfo.videoUri)) {
      logger.info(`   Skipping dead videoUri, using memeUri fallback`);
      if (cardInfo.memeUri) {
        const memeExt = cardInfo.memeUri.toLowerCase().endsWith('.gif') ? 'gif' : 'jpeg';
        return { 
          url: cardInfo.memeUri, 
          extension: memeExt as MediaExtension 
        };
      }
      // No memeUri, fall through to S3
    } else {
    return { url: cardInfo.videoUri, extension: "mp4" };
    }
  }

  if (cardInfo.imageUri && !isDeadDomain(cardInfo.imageUri)) {
    return {
      url: cardInfo.imageUri,
      extension: cardInfo.ext as MediaExtension,
    };
  }

  // Construct URL from series and ext
  return {
    url: getFakeRaresImageUrl(
      assetName,
      cardInfo.series,
      cardInfo.ext as MediaExtension,
    ),
    extension: cardInfo.ext as MediaExtension,
  };
}

/**
 * Build a list of fallback image URLs to try if video fails on Telegram.
 * Prefers cardInfo.imageUri, then S3 JPG and PNG variants.
 */
export function buildFallbackImageUrls(
  assetName: string,
  cardInfo: CardInfo | null,
): Array<{ url: string; contentType: string }> {
  const results: Array<{ url: string; contentType: string }> = [];
  const upperAsset = assetName.toUpperCase();
  if (cardInfo?.imageUri) {
    // Heuristic: guess content type by extension
    const lower = cardInfo.imageUri.toLowerCase();
    const ct = lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    results.push({ url: cardInfo.imageUri, contentType: ct });
  }
  if (typeof cardInfo?.series === "number") {
    // Try common formats from S3
    results.push({
      url: getFakeRaresImageUrl(upperAsset, cardInfo.series, "jpg"),
      contentType: "image/jpeg",
    });
    results.push({
      url: getFakeRaresImageUrl(upperAsset, cardInfo.series, "png"),
      contentType: "image/png",
    });
    results.push({
      url: getFakeRaresImageUrl(upperAsset, cardInfo.series, "webp" as any),
      contentType: "image/webp",
    });
    // If original ext is gif, include S3 gif variant explicitly
    if ((cardInfo.ext || "").toLowerCase() === "gif") {
      results.push({
        url: getFakeRaresImageUrl(upperAsset, cardInfo.series, "gif" as any),
        contentType: "image/gif",
      });
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
    const url = getFakeRaresImageUrl(
      upperAsset,
      cardInfo.series,
      cardInfo.ext as MediaExtension,
    );
    // Debug: INSTANT lookup from index
    return { url, extension: cardInfo.ext as MediaExtension };
  }

  // Try known mapping from runtime cache (fast path with probing)
  const knownSeries = getCardSeries(upperAsset);
  if (knownSeries !== undefined) {
    // Debug: Fast path - known series
    // Try all extensions for the known series
    const extensions: MediaExtension[] = ["jpg", "jpeg", "gif", "png"];
    for (const ext of extensions) {
      const testUrl = getFakeRaresImageUrl(upperAsset, knownSeries, ext);
      try {
        const response = await fetch(testUrl, { method: "HEAD" });
        if (response.ok) {
          // Debug: Found in known series
          return { url: testUrl, extension: ext };
        }
      } catch (e) {
        // Try next extension
      }
    }
  }

  // Unknown card - search through all series (slow path)
  // Debug: Searching all series (slow path)

  const extensions: MediaExtension[] = ["jpg", "jpeg", "gif", "png"];
  for (let series = 0; series < SERIES_INFO.TOTAL_SERIES; series++) {
    // Try all extensions
    for (const ext of extensions) {
      const testUrl = getFakeRaresImageUrl(upperAsset, series, ext);
      try {
        const response = await fetch(testUrl, { method: "HEAD" });
        if (response.ok) {
          // Cache this for future use
          addCardToMap(upperAsset, series);
          // Debug: Found and cached
          return { url: testUrl, extension: ext };
        }
      } catch (e) {
        // Continue searching
      }
    }
  }

  // Debug: Not found in any series
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
function parseCardRequest(text: string): {
  assetName: string | null;
  isRandomCard: boolean;
} {
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
  const cardInfoResult = getCardInfo(assetName);
  const cardInfo: CardInfo | null = cardInfoResult || null;
  let urlResult: CardUrlResult | null = null;

  if (cardInfo) {
    urlResult = determineCardUrl(cardInfo, assetName);
  } else {
    urlResult = null;
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
  runtime?: IAgentRuntime;
}): Promise<{ success: true; data: any }> {
  const cardMessage = buildCardDisplayMessage({
    assetName: params.assetName,
    cardInfo: params.cardInfo,
    mediaUrl: params.urlResult.url,
    isRandomCard: params.isRandomCard,
  });

  const buttons = buildArtistButton(params.cardInfo);
  const displayAssetName = params.cardInfo?.asset || params.assetName;
  const fallbackImages = buildFallbackImageUrls(
    displayAssetName,
    params.cardInfo,
  );

  // Send card with media attachment
  await sendCardWithMedia({
    callback: (params.callback ?? null) as
      | ((response: any) => Promise<any>)
      | null,
    cardMessage,
    mediaUrl: params.urlResult.url,
    mediaExtension: params.urlResult.extension,
    assetName: displayAssetName,
    cardInfo: params.cardInfo,
    buttons,
    fallbackImages,
    runtime: params.runtime,
  }).catch((err) => logger.error(`   Error sending callback: ${err}`));

  logger.info(`   /f complete: ${params.assetName} displayed`);

  return {
    success: true,
    data: {
      suppressBootstrap: true,
      reason: "handled_by_fakeRaresCard",
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
  runtime?: IAgentRuntime;
}): Promise<{ success: true; data: any }> {
  // Pick random card by this artist
  const randomCard =
    params.cards[Math.floor(Math.random() * params.cards.length)];

  const matchedUrlResult = determineCardUrl(randomCard, randomCard.asset);

  // Build message with artist context
  const isTypoCorrected =
    params.similarity !== undefined &&
    params.similarity < FUZZY_MATCH_THRESHOLDS.HIGH_CONFIDENCE;
  let artistMessage = "";

  if (isTypoCorrected) {
    artistMessage = `😅 Ha, spelling not your thing? No worries - got you fam.\n\n`;
  }

  artistMessage += `👨‍🎨 Random card by ${params.artistName} (${params.cards.length} card${params.cards.length > 1 ? "s" : ""} total)\n\n`;

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
    callback: (params.callback ?? null) as
      | ((response: any) => Promise<any>)
      | null,
    cardMessage: fullMessage,
    mediaUrl: matchedUrlResult.url,
    mediaExtension: matchedUrlResult.extension,
    assetName: randomCard.asset,
    cardInfo: randomCard,
    buttons,
    fallbackImages,
    runtime: params.runtime,
  });

  logger.info(`   /f complete: ${randomCard.asset} (artist: ${params.artistName})`);

  return {
    success: true,
    data: {
      suppressBootstrap: true,
      reason:
        params.similarity !== undefined
          ? "artist_fuzzy_matched"
          : "artist_exact_matched",
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
  runtime?: IAgentRuntime;
}): Promise<{ success: boolean; data: any }> {
  // Perform fuzzy matching on card names
  const allAssets = getAllCards().map((c) => c.asset);
  const topMatches = findTopMatches(params.assetName, allAssets);
  const bestMatch = topMatches.length > 0 ? topMatches[0] : null;

  // High confidence match - auto-show the card
  if (
    bestMatch &&
    bestMatch.similarity >= FUZZY_MATCH_THRESHOLDS.HIGH_CONFIDENCE
  ) {
    logger.info(`   Fuzzy match: ${bestMatch.name} (${(bestMatch.similarity * 100).toFixed(1)}%)`);

    const matchedCard = getCardInfo(bestMatch.name);
    if (matchedCard) {
      const matchedUrlResult = determineCardUrl(matchedCard, bestMatch.name);

      const matchedCardText = buildCardDisplayMessage({
        assetName: bestMatch.name,
        cardInfo: matchedCard,
        mediaUrl: matchedUrlResult.url,
        isTypoCorrection: true,
      });

      await sendCardWithMedia({
        callback: (params.callback ?? null) as
          | ((response: any) => Promise<any>)
          | null,
        cardMessage: matchedCardText,
        mediaUrl: matchedUrlResult.url,
        mediaExtension: matchedUrlResult.extension,
        assetName: bestMatch.name,
        cardInfo: matchedCard,
        runtime: params.runtime,
      });

      logger.info(`   /f complete: ${bestMatch.name} (fuzzy matched)`);

      return {
        success: true,
        data: {
          suppressBootstrap: true,
          reason: "fuzzy_matched",
          assetName: params.assetName,
          matchedAssetName: bestMatch.name,
          similarity: bestMatch.similarity,
        },
      };
    }
  }

  // Moderate match - show suggestions
  if (bestMatch && bestMatch.similarity >= FUZZY_MATCH_THRESHOLDS.MODERATE) {
    const suggestions = topMatches
      .filter((m) => m.similarity >= FUZZY_MATCH_THRESHOLDS.MODERATE)
      .map((m) => `• ${m.name}`)
      .join("\n");

    logger.info(`   Suggestions: ${topMatches.length} similar cards found`);

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
        __fromAction: "fakeRaresCard",
        suppressBootstrap: true,
      });
    }

    return {
      success: false,
      data: {
        suppressBootstrap: true,
        reason: "card_not_found_with_suggestions",
        assetName: params.assetName,
        suggestions: topMatches.map((m) => m.name),
      },
    };
  }

  // No good card name match - try fuzzy artist search
  const artistFuzzyMatch = findCardsByArtistFuzzy(params.assetName);

  if (artistFuzzyMatch) {
    logger.info(`   Artist fuzzy match: ${artistFuzzyMatch.matchedArtist}`);
        return await displayArtistCard({
          artistName: artistFuzzyMatch.matchedArtist,
          cards: artistFuzzyMatch.cards,
          similarity: artistFuzzyMatch.similarity,
          query: params.assetName,
          callback: params.callback,
          runtime: params.runtime,
        });
  }

  // No match found
  logger.info(`   ❌ No matches found for "${params.assetName}"`);

  if (params.callback) {
    await params.callback({
      text: `❌ Could not find "${params.assetName}" in the Fake Rares collection. Double-check the asset name or browse on pepe.wtf.`,
      __fromAction: "fakeRaresCard",
      suppressBootstrap: true,
    });
  }

  return {
    success: false,
    data: {
      suppressBootstrap: true,
      reason: "card_not_found",
      assetName: params.assetName,
      cardFound: false,
    },
  };
}

// ============================================================================
// MAIN ACTION EXPORT
// ============================================================================

export const fakeRaresCardAction: Action = {
  name: "SHOW_FAKE_RARE_CARD",
  description:
    "Display a Fake Rares card image when user requests with /f <ASSET> or a random card with /f",

  similes: ["/f"],

  examples: [], // Empty examples - action handles everything via callback

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const raw = message.content.text || "";
    const text = raw.trim();
    // Accept: "/f", "/f ASSET", "/f ARTIST NAME" (with spaces), "/f@bot ASSET", and leading mentions like "@bot /f ASSET"
    // Exclude carousel mode (/f c <artist>) - handled by fakeRaresCarouselAction
    const fPattern =
      /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+.+)?$/i;
    const carouselPattern =
      /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?\s+c\s+.+$/i;
    return fPattern.test(text) && !carouselPattern.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback,
  ) => {
    const text = (message.content.text || "").trim();
    
    let assetName = "UNKNOWN"; // Declare outside try block for error handling

    try {
      const request = parseCardRequest(text);
      
      // Log command with cleaner format
      const displayText = request.isRandomCard ? "(random)" : request.assetName || text;
      logger.info(`━━━━━ /f ━━━━━ ${displayText}`);
      logger.info("   STEP 1/3: Parsing command");

      // Handle random card request
      if (request.isRandomCard) {
        const allCards = getAllCards();
        if (allCards.length === 0) {
          logger.error("   Cannot select random card: index is empty");
          if (callback) {
            await callback({
              text: "❌ Card index not loaded. Please try again later.",
            });
          }
          return { success: false, text: "Card index not available" };
        }

        const randomCard =
          allCards[Math.floor(Math.random() * allCards.length)];
        assetName = randomCard.asset;
        logger.info(`   Random card selected: ${assetName} (${allCards.length} total)`);
      } else {
        assetName = request.assetName!;
        logger.info(`   Looking up: "${assetName}"`);
      }

      // STEP 2: Try exact card match
      logger.info("   STEP 2/3: Card lookup");
      const { cardInfo, urlResult } = await lookupCardUrl(assetName);

      if (urlResult) {
        logger.info(`   ✅ Found: ${assetName} (series ${cardInfo?.series}, ${cardInfo?.ext})`);
        return await handleCardFound({
          assetName,
          cardInfo,
          urlResult,
          isRandomCard: request.isRandomCard,
          callback,
          runtime,
        });
      }

      // STEP 3: Try exact artist match
      logger.info("   STEP 3/3: Trying artist/fuzzy match");
      const exactArtistMatch = findCardsByArtistExact(assetName);

      if (exactArtistMatch) {
        logger.info(`   ✅ Artist match: ${exactArtistMatch.matchedArtist} (${exactArtistMatch.cards.length} cards)`);
        return await displayArtistCard({
          artistName: exactArtistMatch.matchedArtist,
          cards: exactArtistMatch.cards,
          query: assetName,
          callback,
          runtime,
        });
      }

      // Try fuzzy matches (card then artist)
      return await handleCardNotFound({
        assetName,
        callback,
        runtime,
      });
    } catch (error) {
      logger.error(
        `   ❌ Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Error occurred - respond via callback and suppress bootstrap
      if (callback) {
        await callback({
          text: `❌ Error while fetching ${assetName}. Please try again later.`,
          __fromAction: "fakeRaresCard",
          suppressBootstrap: true,
        });
      }
      return {
        success: false,
        data: {
          suppressBootstrap: true,
          reason: "exception",
          error: error instanceof Error ? error.message : String(error),
          assetName,
        },
      };
    }
  },
};
