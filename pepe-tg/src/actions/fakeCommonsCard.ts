import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { createLogger } from "../utils/actionLogger";
import { type CommonsCardInfo, COMMONS_CARD_INDEX } from "../data/fakeCommonsIndex";

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
 * Get environment variable as number with fallback
 */
function getEnvNumber(name: string, fallback: number): number {
  const val = process.env[name];
  if (!val) return fallback;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Check media size via HEAD request with timeout
 */
async function headInfo(
  url: string,
  timeoutMs: number = 3000,
): Promise<{ contentType: string | null; contentLength: number | null }> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) return { contentType: null, contentLength: null };
    const ct = res.headers.get("content-type");
    const len = res.headers.get("content-length");
    return { contentType: ct, contentLength: len ? parseInt(len, 10) : null };
  } catch {
    return { contentType: null, contentLength: null };
  }
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
}): Promise<void> {
  if (!params.callback) {
    return;
  }

  const isVideo = params.mediaExtension === "mp4";
  const isAnimation = params.mediaExtension === "gif" || params.mediaExtension === "GIF";

  // Check video size before sending
  if (isVideo) {
    try {
      const maxMb = getEnvNumber("MP4_URL_MAX_MB", 50);
      const { contentType, contentLength } = await headInfo(params.mediaUrl, 3000);
      const typeOk = (contentType || "").toLowerCase().includes("video/mp4");
      const sizeOk = contentLength !== null ? contentLength <= maxMb * 1024 * 1024 : false;
      
      if (!typeOk || !sizeOk) {
        await params.callback({
          text: `${params.cardMessage}\n\nFile too large for viewing on TG - click the link to view asset\n🎬 Video: ${params.mediaUrl}`,
          buttons: params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
          plainText: true,
          __fromAction: "fakeCommonsCard",
          suppressBootstrap: true,
        });
        return;
      }
    } catch {
      await params.callback({
        text: `${params.cardMessage}\n\n🎬 Video: ${params.mediaUrl}`,
        buttons: params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
        plainText: true,
        __fromAction: "fakeCommonsCard",
        suppressBootstrap: true,
      });
      return;
    }
  }

  // Check GIF size before sending
  if (isAnimation) {
    try {
      const maxMb = getEnvNumber("GIF_URL_MAX_MB", 40);
      const { contentType, contentLength } = await headInfo(params.mediaUrl, 3000);
      const typeOk = (contentType || "").toLowerCase().includes("image/gif");
      const sizeOk = contentLength !== null ? contentLength <= maxMb * 1024 * 1024 : false;
      
      if (!typeOk || !sizeOk) {
        await params.callback({
          text: `${params.cardMessage}\n\nFile too large for viewing on TG - click the link to view asset\n🎞️ Animation: ${params.mediaUrl}`,
          buttons: params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
          plainText: true,
          __fromAction: "fakeCommonsCard",
          suppressBootstrap: true,
        });
        return;
      }
    } catch {
      await params.callback({
        text: `${params.cardMessage}\n\n🎞️ Animation: ${params.mediaUrl}`,
        buttons: params.buttons && params.buttons.length > 0 ? params.buttons : undefined,
        plainText: true,
        __fromAction: "fakeCommonsCard",
        suppressBootstrap: true,
      });
      return;
    }
  }

  // Send with media attachment
  const attachments = [
    {
      url: params.mediaUrl,
      title: params.assetName,
      source: "fake-commons",
      contentType: isVideo
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
  const match = text.match(/^\/?c(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?/i);

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

/**
 * Display a specific Commons card
 */
async function handleExactCard(
  assetName: string,
  callback?: HandlerCallback,
): Promise<{ success: boolean; data: any }> {
  logger.info("   STEP 2/2: Card lookup");
  const cardInfo = lookupCommonsCard(assetName);
  
  if (!cardInfo) {
    logger.info(`   ❌ Not found: ${assetName}`);
    if (callback) {
      await callback({
        text: `❌ Fake Commons card "${assetName}" not found.\n\nTry /c for a random card.`,
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
        return await handleRandomCard(callback);
      } else {
        logger.info(`   Looking up: "${request.assetName}"`);
        return await handleExactCard(request.assetName!, callback);
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

