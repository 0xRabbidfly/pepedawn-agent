import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { createLogger } from "../utils/actionLogger";
import { type RarePepeCardInfo, RARE_PEPES_CARD_INDEX } from "../data/rarePepesIndex";
import { checkAndConvertGif } from "../utils/gifConversionHelper";

/**
 * Rare Pepes Card Display Action
 * Responds to /p <ASSET> commands by fetching and displaying card images
 * Also supports /p (no asset) to display a random card from the collection
 * 
 * URL Structure: https://pepewtf.s3.amazonaws.com/collections/rare-pepes/full/{SERIES}/{ASSET}.{ext}
 * Series 1-36 (1774 total cards)
 * 
 * Simplified version: Supports exact card match and random selection
 * (No fuzzy matching, no artist search - keeps it simple)
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_URL = "https://pepewtf.s3.amazonaws.com/collections/rare-pepes/full";

type MediaExtension = "jpg" | "jpeg" | "gif" | "png" | "mp4" | "webp" | "GIF";

// ============================================================================
// LOGGING
// ============================================================================

const logger = createLogger("RarePepesCard");

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get all cards from the Rare Pepes index
 */
function getAllRarePepesCards(): RarePepeCardInfo[] {
  return RARE_PEPES_CARD_INDEX;
}

/**
 * Determine the media URL for a Rare Pepes card
 */
function determineCardUrl(cardInfo: RarePepeCardInfo): { url: string; extension: MediaExtension } {
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
  cardInfo: RarePepeCardInfo | null,
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
  cardInfo: RarePepeCardInfo,
  isRandomCard: boolean,
): string {
  // Card name header
  let message = isRandomCard
    ? `🎲 ${cardInfo.asset} 🐸`
    : `${cardInfo.asset} 🐸`;
  
  // Series and card number
  message += ` Series ${cardInfo.series} - Card ${cardInfo.card}\n`;
  
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
      source: "rare-pepes",
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
    __fromAction: "rarePepesCard",
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
  // Match /p or /p@bot optionally followed by card name
  const match = text.match(/^\/?p(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?/i);

  if (!match || !match[1]) {
    // No asset name provided - random card
    return { assetName: null, isRandomCard: true };
  }

  // Trim whitespace and uppercase for lookup
  const input = match[1].trim().toUpperCase();
  return { assetName: input, isRandomCard: false };
}

/**
 * Lookup a specific Rare Pepes card by name
 */
function lookupRarePepesCard(cardName: string): RarePepeCardInfo | null {
  const allCards = getAllRarePepesCards();
  return allCards.find(c => c.asset === cardName.toUpperCase()) || null;
}

/**
 * Display a specific Rare Pepes card
 */
async function handleExactCard(
  assetName: string,
  callback?: HandlerCallback,
  runtime?: IAgentRuntime,
): Promise<{ success: boolean; data: any }> {
  logger.info("   STEP 2/2: Card lookup");
  const cardInfo = lookupRarePepesCard(assetName);
  
  if (!cardInfo) {
    logger.info(`   ❌ Not found: ${assetName}`);
    if (callback) {
      await callback({
        text: `❌ Rare Pepes card "${assetName}" not found.\n\nTry /p for a random card.`,
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

  logger.info(`   /p complete: ${cardInfo.asset}`);

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
 * Handle random Rare Pepes card display
 */
async function handleRandomCard(
  callback?: HandlerCallback,
  runtime?: IAgentRuntime,
): Promise<{ success: boolean; data: any }> {
  const allCards = getAllRarePepesCards();
  
  if (allCards.length === 0) {
    logger.error("   Cannot select random card: index is empty");
    if (callback) {
      await callback({
        text: "❌ Rare Pepes card index not loaded. Please try again later.",
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

  logger.info(`   /p complete: ${randomCard.asset} (S${randomCard.series} C${randomCard.card})`);

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

export const rarePepesCardAction: Action = {
  name: "SHOW_RARE_PEPES_CARD",
  description: "Display a Rare Pepes card when user requests with /p <ASSET> or a random card with /p",

  similes: ["/p"],

  examples: [], // Empty - action handles via callback

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const raw = message.content.text || "";
    const text = raw.trim();
    
    // Match: "/p", "/p ASSET", "/p@bot ASSET", "@bot /p ASSET" (must be at start)
    const pPattern = /^(?:@[A-Za-z0-9_]+\s+)?\/p(?:@[A-Za-z0-9_]+)?(?:\s+.+)?$/i;
    return pPattern.test(text);
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
      logger.info(`━━━━━ /p ━━━━━ ${displayText}`);
      logger.info("   STEP 1/2: Parsing command");
      
      // Handle random or exact match
      if (request.isRandomCard) {
        return await handleRandomCard(callback, runtime);
      } else {
        logger.info(`   Looking up: "${request.assetName}"`);
        return await handleExactCard(request.assetName!, callback, runtime);
      }
      
    } catch (error) {
      logger.error({ error }, "Error in /p handler");
      
      if (callback) {
        await callback({
          text: "❌ Error displaying Rare Pepes card. Please try again.",
        });
      }
      
      return {
        success: false,
        data: { error: String(error) },
      };
    }
  },
};

