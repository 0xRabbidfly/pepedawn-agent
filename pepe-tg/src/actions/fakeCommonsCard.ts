import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { createLogger } from "../utils/actionLogger";
import { type CommonsCardInfo, COMMONS_CARD_INDEX } from "../data/fakeCommonsIndex";
import { checkAndConvertGif } from "../utils/gifConversionHelper";
import {
  findTopMatches,
  FUZZY_MATCH_THRESHOLDS,
  normalizeForMatching,
} from "../utils/fuzzyMatch";
import { buildSuggestionResponse } from "../utils/cardSuggestions";
import { escapeTelegramMarkdown } from "../utils/telegramMarkdown";

/**
 * Fake Commons Card Display Action
 * Responds to /c <ASSET> commands by fetching and displaying card images
 * Also supports /c (no asset) to display a random card from the collection
 * 
 * URL Structure: https://pepewtf.s3.amazonaws.com/collections/fake-commons/full/{SERIES}/{ASSET}.{ext}
 * Series 1-54 (1813 total cards)
 * 
 * Simplified version: Supports exact card match and random selection
 * (No fuzzy matching, no artist search - keeps it simple)
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_URL = "https://pepewtf.s3.amazonaws.com/collections/fake-commons/full";

type MediaExtension = "jpg" | "jpeg" | "gif" | "png" | "mp4" | "webp" | "GIF";

// ============================================================================
// LOGGING
// ============================================================================

const logger = createLogger("FakeCommonsCard");

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get all cards from the Commons index
 */
function getAllCommonsCards(): CommonsCardInfo[] {
  return COMMONS_CARD_INDEX;
}

/**
 * Determine the media URL for a Commons card
 */
function determineCardUrl(cardInfo: CommonsCardInfo): { url: string; extension: MediaExtension } {
  // Use imageUri if available, otherwise construct from S3 pattern
  if (cardInfo.imageUri) {
    return {
      url: cardInfo.imageUri,
      extension: cardInfo.ext as MediaExtension,
    };
  }
  
  // Fallback: construct URL
  const filename = `${cardInfo.asset}.${cardInfo.ext}`;
  const url = `${BASE_URL}/${cardInfo.series}/${filename}`;
  
  return {
    url,
    extension: cardInfo.ext as MediaExtension,
  };
}

/**
 * Build artist button (matches /f behavior)
 */
function buildArtistButton(
  cardInfo: CommonsCardInfo | null,
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
 * Build the card display message (matches /f format)
 */
function buildCardMessage(
  cardInfo: CommonsCardInfo,
  isRandomCard: boolean,
): string {
  // Card name header
  let message = isRandomCard
    ? `🎲 ${cardInfo.asset} 🐸`
    : `${cardInfo.asset} 🐸`;
  
  // Series and card number
  message += ` S ${cardInfo.series} - C ${cardInfo.card}\n`;
  
  // Add metadata line (artist and/or supply)
  const metadata: string[] = [];
  const artistButtonsEnabled = process.env.FAKE_RARES_ARTIST_BUTTONS === "true";
  
  // Only show artist in text if buttons are disabled
  if (cardInfo.artist && !artistButtonsEnabled) {
    metadata.push(`👨‍🎨 ${cardInfo.artist}`);
  }
  if (cardInfo.supply) {
    metadata.push(`💎 ${cardInfo.supply.toLocaleString()}`);
  }
  
  if (metadata.length > 0) {
    message += metadata.join(" · ") + "\n";
  }
  
  return message;
}


/**
 * Send card with media attachment
 */
async function sendCardWithMedia(params: {
  callback: HandlerCallback | null;
  cardMessage: string;
  mediaUrl: string;
  mediaExtension: MediaExtension;
  assetName: string;
  buttons?: Array<{ text: string; url: string }>;
  runtime?: IAgentRuntime;
}): Promise<void> {
  // Try to use CardDisplayService if runtime is provided
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
        });
        return;
      }
    } catch {
      // Fallback to direct implementation
    }
  }
  
  // Direct implementation (fallback) - uses same caching logic via messageManager
  if (!params.callback) {
    return;
  }

  const isVideo = params.mediaExtension === "mp4";
  const isAnimation = params.mediaExtension === "gif" || params.mediaExtension === "GIF";

  // Check and convert large GIFs to MP4 (reuses same logic as /f)
  let finalUrl = params.mediaUrl;
  let finalExtension = params.mediaExtension;
  
  if (isAnimation) {
    const conversionResult = await checkAndConvertGif(params.mediaUrl, params.mediaExtension);
    if (conversionResult.shouldConvert && conversionResult.convertedUrl) {
      finalUrl = conversionResult.convertedUrl;
      finalExtension = "mp4";
    }
  }

  // Send with media attachment (messageManager handles file_id caching automatically)
  const attachments = [
    {
      url: finalUrl,
      title: params.assetName,
      source: "fake-commons",
      contentType: isVideo || finalExtension === "mp4"
        ? "video/mp4"
        : isAnimation
          ? "image/gif"
          : "image/jpeg",
    },
  ];

  await params.callback({
    text: params.cardMessage,
    attachments,
    buttons: params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
    __fromAction: "fakeCommonsCard",
    suppressBootstrap: true,
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Parse card request from message text
 * Returns asset name and whether it's a random card request
 */
function parseCardRequest(text: string): {
  assetName: string | null;
  isRandomCard: boolean;
} {
  // Match /c or /c@bot optionally followed by card name
  const match = text.match(
    /^(?:@[A-Za-z0-9_]+\s+)?\/?c(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?/i,
  );

  if (!match || !match[1]) {
    // No asset name provided - random card
    return { assetName: null, isRandomCard: true };
  }

  // Trim whitespace and uppercase for lookup
  const input = match[1].trim().toUpperCase();
  return { assetName: input, isRandomCard: false };
}

/**
 * Lookup a specific Commons card by name
 */
function lookupCommonsCard(cardName: string): CommonsCardInfo | null {
  const allCards = getAllCommonsCards();
  return allCards.find(c => c.asset === cardName.toUpperCase()) || null;
}

async function handleCommonsFuzzyMatch(
  assetName: string,
  callback?: HandlerCallback,
  runtime?: IAgentRuntime,
): Promise<{ success: boolean; data: any } | null> {
  const allCards = getAllCommonsCards();
  if (allCards.length === 0) {
    return null;
  }

  const allAssets = allCards.map((card) => card.asset);
  const topMatches = findTopMatches(assetName, allAssets);
  const bestMatch = topMatches.length > 0 ? topMatches[0] : null;

  const normalizedInput = normalizeForMatching(assetName);

  if (
    bestMatch &&
    bestMatch.similarity >= FUZZY_MATCH_THRESHOLDS.HIGH_CONFIDENCE &&
    normalizedInput.length >= 5
  ) {
    const matchedCard = lookupCommonsCard(bestMatch.name);
    if (matchedCard) {
      logger.info(
        `   ✅ Fuzzy match: ${matchedCard.asset} (${(bestMatch.similarity * 100).toFixed(1)}%)`,
      );
      const { url, extension } = determineCardUrl(matchedCard);
      const buttons = buildArtistButton(matchedCard);
      const cardMessage = `😅 Close enough! Showing ${matchedCard.asset}.\n\n${buildCardMessage(matchedCard, false)}`;

      await sendCardWithMedia({
        callback: callback ?? null,
        cardMessage,
        mediaUrl: url,
        mediaExtension: extension,
        assetName: matchedCard.asset,
        buttons,
        runtime,
      });

      return {
        success: true,
        data: {
          suppressBootstrap: true,
          reason: "fuzzy_matched",
          assetName,
          matchedAssetName: matchedCard.asset,
          similarity: bestMatch.similarity,
        },
      };
    }
  }

  if (bestMatch && bestMatch.similarity >= FUZZY_MATCH_THRESHOLDS.MODERATE) {
    const suggestionMatches = topMatches.filter(
      (match) => match.similarity >= FUZZY_MATCH_THRESHOLDS.MODERATE,
    );

    logger.info(
      `   Suggestions: ${suggestionMatches.length} similar Commons cards found`,
    );

    const suggestionResponse = buildSuggestionResponse({
      assetName,
      matches: suggestionMatches,
      collectionLabel: "Fake Commons collection",
      commandPrefix: "/c",
    });

    if (callback) {
      try {
        await callback({
          text: suggestionResponse.primaryText,
          __fromAction: "fakeCommonsCard",
          suppressBootstrap: true,
          buttons: suggestionResponse.buttons,
        });
      } catch (err) {
        logger.warning(
          `   Callback failed for Commons suggestions, attempting fallback`,
          { error: err instanceof Error ? err.message : String(err) },
        );

        try {
          await callback({
            text: suggestionResponse.fallbackText,
            __fromAction: "fakeCommonsCard",
            suppressBootstrap: true,
            buttons: suggestionResponse.buttons,
          });
        } catch (fallbackError) {
          logger.error(
            `   Failed to send Commons fallback suggestions`,
            fallbackError instanceof Error ? fallbackError : String(fallbackError),
          );
        }
      }
    }

    return {
      success: false,
      data: {
        suppressBootstrap: true,
        reason: "card_not_found_with_suggestions",
        assetName,
        suggestions: suggestionMatches.map((m) => m.name),
      },
    };
  }

  return null;
}

/**
 * Display a specific Commons card
 */
async function handleExactCard(
  assetName: string,
  callback?: HandlerCallback,
  runtime?: IAgentRuntime,
): Promise<{ success: boolean; data: any }> {
  logger.info("   STEP 2/2: Card lookup");
  const cardInfo = lookupCommonsCard(assetName);
  
  if (!cardInfo) {
    logger.info(`   ❌ Not found: ${assetName}`);
    const fuzzyResult = await handleCommonsFuzzyMatch(assetName, callback, runtime);
    if (fuzzyResult) {
      return fuzzyResult;
    }

    if (callback) {
      const safeAssetName = escapeTelegramMarkdown(assetName);
      await callback({
        text: `❌ Fake Commons card "${safeAssetName}" not found.\n\nTry /c for a random card.`,
        suppressBootstrap: true,
      });
    }
    return {
      success: false,
      data: {
        suppressBootstrap: true,
        assetName,
        cardFound: false,
      },
    };
  }

  logger.info(`   ✅ Found: ${cardInfo.asset} (series ${cardInfo.series}, ${cardInfo.ext})`);

  // Get media URL
  const { url, extension } = determineCardUrl(cardInfo);
  
  // Build message and button
  const cardMessage = buildCardMessage(cardInfo, false);
  const buttons = buildArtistButton(cardInfo);
  
  // Send card with media
  await sendCardWithMedia({
    callback: callback ?? null,
    cardMessage,
    mediaUrl: url,
    mediaExtension: extension,
    assetName: cardInfo.asset,
    buttons,
    runtime,
  });

  logger.info(`   /c complete: ${cardInfo.asset}`);

  return {
    success: true,
    data: {
      suppressBootstrap: true,
      assetName: cardInfo.asset,
      series: cardInfo.series,
      card: cardInfo.card,
    },
  };
}

/**
 * Handle random Fake Commons card display
 */
async function handleRandomCard(
  callback?: HandlerCallback,
  runtime?: IAgentRuntime,
): Promise<{ success: boolean; data: any }> {
  const allCards = getAllCommonsCards();
  
  if (allCards.length === 0) {
    logger.error("   Cannot select random card: index is empty");
    if (callback) {
      await callback({
        text: "❌ Fake Commons card index not loaded. Please try again later.",
      });
    }
    return { success: false, data: { error: "index_empty" } };
  }

  // Pick random card
  const randomCard = allCards[Math.floor(Math.random() * allCards.length)];
  logger.info(`   Random card selected: ${randomCard.asset} (${allCards.length} total)`);

  // Get media URL
  const { url, extension } = determineCardUrl(randomCard);
  
  // Build message and button
  const cardMessage = buildCardMessage(randomCard, true);
  const buttons = buildArtistButton(randomCard);
  
  // Send card with media
  await sendCardWithMedia({
    callback: callback ?? null,
    cardMessage,
    mediaUrl: url,
    mediaExtension: extension,
    assetName: randomCard.asset,
    buttons,
    runtime,
  });

  logger.info(`   /c complete: ${randomCard.asset} (S${randomCard.series} C${randomCard.card})`);

  return {
    success: true,
    data: {
      suppressBootstrap: true,
      assetName: randomCard.asset,
      series: randomCard.series,
      card: randomCard.card,
    },
  };
}

// ============================================================================
// ACTION EXPORT
// ============================================================================

export const fakeCommonsCardAction: Action = {
  name: "SHOW_FAKE_COMMONS_CARD",
  description: "Display a Fake Commons card when user requests with /c <ASSET> or a random card with /c",

  similes: ["/c"],

  examples: [], // Empty - action handles via callback

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const raw = message.content.text || "";
    const text = raw.trim();
    
    // Match: "/c", "/c ASSET", "/c@bot ASSET", "@bot /c ASSET" (must be at start)
    const cPattern = /^(?:@[A-Za-z0-9_]+\s+)?\/c(?:@[A-Za-z0-9_]+)?(?:\s+.+)?$/i;
    return cPattern.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback,
  ) => {
    const text = (message.content.text || "").trim();
    
    try {
      const request = parseCardRequest(text);
      
      // Log command with cleaner format (matches /f)
      const displayText = request.isRandomCard ? "(random)" : request.assetName || text;
      logger.info(`━━━━━ /c ━━━━━ ${displayText}`);
      logger.info("   STEP 1/2: Parsing command");
      
      // Handle random or exact match
      if (request.isRandomCard) {
        return await handleRandomCard(callback, runtime);
      } else {
        logger.info(`   Looking up: "${request.assetName}"`);
        return await handleExactCard(request.assetName!, callback, runtime);
      }
      
    } catch (error) {
      logger.error({ error }, "Error in /c handler");
      
      if (callback) {
        await callback({
          text: "❌ Error displaying Fake Commons card. Please try again.",
        });
      }
      
      return {
        success: false,
        data: { error: String(error) },
      };
    }
  },
};

