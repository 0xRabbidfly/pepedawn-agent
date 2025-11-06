import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { createLogger } from "../utils/actionLogger";
import { type CardInfo } from "../data/fullCardIndex";
import {
  getCardInfo,
  getAllCards,
  findCardsByArtistExact,
  findCardsByArtistFuzzy,
  buildCardDisplayMessage,
  determineCardUrl,
  buildFallbackImageUrls,
  sendCardWithMedia,
  FUZZY_MATCH_THRESHOLDS,
} from "./fakeRaresCard";
import { getCardsBySeries, FULL_CARD_INDEX } from "../data/fullCardIndex";
import { SERIES_INFO } from "../data/cardSeriesMap";

/**
 * Fake Rares Carousel Action
 * Responds to /f c <ARTIST> or /f c <SERIES> commands by displaying cards in an interactive carousel
 * 
 * Features:
 * - Browse cards by artist name OR series number (auto-detected range)
 * - Displays all cards in order (by card# for series, alphabetically for artist)
 * - Interactive prev/next buttons with circular navigation
 * - Supports exact and fuzzy artist name matching
 */

// ============================================================================
// LOGGING
// ============================================================================

const logger = createLogger("FakeCarousel");

// ============================================================================
// CAROUSEL BUTTON BUILDING
// ============================================================================

/**
 * Builds carousel navigation buttons (prev/next)
 * callback_data format: fc:action:type:identifier:currentIndex:totalCards
 * - type: 'a' for artist, 's' for series
 * - identifier: artist name (encoded) or series number
 */
export function buildCarouselButtons(
  identifier: string,
  type: 'a' | 's',
  currentIndex: number,
  totalCards: number,
): Array<{ text: string; callback_data: string }> {
  const encoded = type === 's' ? identifier : encodeURIComponent(identifier);
  
  return [
    {
      text: "⬅️ Prev",
      callback_data: `fc:prev:${type}:${encoded}:${currentIndex}:${totalCards}`,
    },
    {
      text: `${currentIndex + 1}/${totalCards}`,
      callback_data: `fc:noop:${type}:${encoded}:${currentIndex}:${totalCards}`,
    },
    {
      text: "➡️ Next",
      callback_data: `fc:next:${type}:${encoded}:${currentIndex}:${totalCards}`,
    },
  ];
}

// ============================================================================
// CAROUSEL DISPLAY
// ============================================================================

/**
 * Displays a carousel of cards (by artist or series)
 * Shows the first card with prev/next navigation buttons
 */
async function displayArtistCarousel(params: {
  artistName?: string;
  seriesNum?: number;
  cards: CardInfo[];
  similarity?: number;
  query: string;
  callback?: HandlerCallback;
}): Promise<{ success: true; data: any }> {
  // Determine carousel type and label
  const isSeries = params.seriesNum !== undefined;
  const carouselType = isSeries ? 's' : 'a';
  const identifier = isSeries ? String(params.seriesNum) : params.artistName!;
  const label = isSeries ? `Series ${params.seriesNum}` : params.artistName!;
  
  // Sort cards: by card number for series, alphabetically for artist
  const sortedCards = [...params.cards].sort((a, b) => {
    if (isSeries) {
      // Series: sort by card number (1, 2, 3... 50)
      return a.card - b.card;
    } else {
      // Artist: sort alphabetically by asset name
      return a.asset.localeCompare(b.asset);
    }
  });

  // Start with first card
  const currentCard = sortedCards[0];
  const currentIndex = 0;

  const matchedUrlResult = determineCardUrl(currentCard, currentCard.asset);

  // Build message with context
  const isTypoCorrected =
    params.similarity !== undefined &&
    params.similarity < FUZZY_MATCH_THRESHOLDS.HIGH_CONFIDENCE;
  let carouselMessage = "";

  if (isTypoCorrected) {
    carouselMessage = `😅 Ha, spelling not your thing? No worries - got you fam.\n\n`;
  }

  carouselMessage += `🎠 Carousel: ${label} (${params.cards.length} card${params.cards.length > 1 ? "s" : ""} total)\n\n`;

  const cardMessage = buildCardDisplayMessage({
    assetName: currentCard.asset,
    cardInfo: currentCard,
    mediaUrl: matchedUrlResult.url,
    isRandomCard: false,
  });

  const fullMessage = carouselMessage + cardMessage;

  // Build carousel navigation buttons
  const buttons = buildCarouselButtons(
    identifier,
    carouselType,
    currentIndex,
    sortedCards.length
  );
  const fallbackImages = buildFallbackImageUrls(currentCard.asset, currentCard);

  await sendCardWithMedia({
    callback: (params.callback ?? null) as
      | ((response: any) => Promise<any>)
      | null,
    cardMessage: fullMessage,
    mediaUrl: matchedUrlResult.url,
    mediaExtension: matchedUrlResult.extension,
    assetName: currentCard.asset,
    buttons,
    fallbackImages,
  });

  logger.info(`   /f c complete: ${currentCard.asset} (carousel: ${label})`);

  return {
    success: true,
    data: {
      suppressBootstrap: true,
      reason: isSeries ? "series_carousel" : "artist_carousel",
      query: params.query,
      matchedArtist: params.artistName,
      seriesNum: params.seriesNum,
      selectedCard: currentCard.asset,
      carouselIndex: currentIndex,
      totalCards: sortedCards.length,
      similarity: params.similarity,
    },
  };
}

// ============================================================================
// CAROUSEL NAVIGATION HANDLER
// ============================================================================

/**
 * Handles carousel navigation (prev/next) for artist or series card browsing
 * 
 * **Note**: This function is exported for use by the Telegram plugin's callback handler.
 * It is not meant to be called directly as an action.
 * 
 * @param callbackData Format: "fc:action:type:identifier:currentIndex:totalCards"
 * @returns Card display data for the new index, or null if invalid
 * @internal Called by Telegram callback_query handler
 */
export async function handleCarouselNavigation(callbackData: string): Promise<{
  artistName: string;
  card: CardInfo;
  cardMessage: string;
  mediaUrl: string;
  mediaExtension: string;
  buttons: Array<{ text: string; callback_data: string }>;
  newIndex: number;
  totalCards: number;
} | null> {
  try {
    // Parse callback data: fc:action:type:identifier:currentIndex:totalCards
    const parts = callbackData.split(":");
    if (parts.length !== 6 || parts[0] !== "fc") {
      logger.error(`Invalid carousel callback data: ${callbackData}`);
      return null;
    }

    const [, action, type, identifier, currentIndexStr, totalCardsStr] = parts;
    const currentIndex = parseInt(currentIndexStr, 10);
    const totalCards = parseInt(totalCardsStr, 10);

    // Handle noop (user clicked on counter)
    if (action === "noop") {
      return null;
    }

    // Validate indices
    if (isNaN(currentIndex) || isNaN(totalCards)) {
      logger.error(`Invalid indices in callback: ${callbackData}`);
      return null;
    }

    // Determine if this is series or artist carousel
    const isSeries = type === 's';
    const label = isSeries ? `Series ${identifier}` : decodeURIComponent(identifier);

    logger.info(`   Carousel nav: ${action} for ${label} (current: ${currentIndex}/${totalCards})`);

    // Get cards based on type
    let sortedCards: CardInfo[];
    if (isSeries) {
      const seriesNum = parseInt(identifier, 10);
      if (isNaN(seriesNum)) {
        logger.error(`Invalid series number: ${identifier}`);
        return null;
      }
      const seriesCards = getCardsBySeries(seriesNum);
      if (seriesCards.length === 0) {
        logger.error(`No cards found for series: ${seriesNum}`);
        return null;
      }
      // Series: sort by card number (1, 2, 3... 50)
      sortedCards = [...seriesCards].sort((a, b) => a.card - b.card);
    } else {
      const artistName = decodeURIComponent(identifier);
      const exactArtistMatch = findCardsByArtistExact(artistName);
      if (!exactArtistMatch) {
        logger.error(`Artist not found for carousel: ${artistName}`);
        return null;
      }
      // Artist: sort alphabetically by asset name
      sortedCards = [...exactArtistMatch.cards].sort((a, b) => a.asset.localeCompare(b.asset));
    }

    // Calculate new index with circular wrapping
    let newIndex = currentIndex;
    if (action === "next") {
      newIndex = (currentIndex + 1) % sortedCards.length;
    } else if (action === "prev") {
      newIndex = (currentIndex - 1 + sortedCards.length) % sortedCards.length;
    } else {
      logger.error(`Unknown carousel action: ${action}`);
      return null;
    }

    logger.info(`   New index: ${newIndex} (${sortedCards[newIndex].asset})`);

    // Get the card at new index
    const card = sortedCards[newIndex];
    const urlResult = determineCardUrl(card, card.asset);

    // Build card message
    const carouselMessage = `🎠 Carousel: ${label} (${sortedCards.length} card${sortedCards.length > 1 ? "s" : ""} total)\n\n`;
    const cardMessage = buildCardDisplayMessage({
      assetName: card.asset,
      cardInfo: card,
      mediaUrl: urlResult.url,
      isRandomCard: false,
    });
    const fullMessage = carouselMessage + cardMessage;

    // Build new buttons with updated index
    const buttons = buildCarouselButtons(identifier, type as 'a' | 's', newIndex, sortedCards.length);

    return {
      artistName: label, // Return label for compatibility
      card,
      cardMessage: fullMessage,
      mediaUrl: urlResult.url,
      mediaExtension: urlResult.extension,
      buttons,
      newIndex,
      totalCards: sortedCards.length,
    };
  } catch (error) {
    logger.error(`Error handling carousel navigation: ${error}`);
    return null;
  }
}

// ============================================================================
// MAIN ACTION EXPORT
// ============================================================================

export const fakeRaresCarouselAction: Action = {
  name: "FAKE_RARES_CAROUSEL",
  description:
    "Browse artist's cards or series in interactive carousel with /f c <ARTIST> or /f c <SERIES>",

  similes: ["/f c"],

  examples: [],

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const raw = message.content.text || "";
    const text = raw.trim();
    // Match: /f c <ARTIST|SERIES>, /f@bot c <ARTIST|SERIES>, @bot /f c <ARTIST|SERIES>
    const carouselPattern =
      /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?\s+c\s+.+$/i;
    return carouselPattern.test(text);
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
      // Parse input from: /f c <artist|series>
      const match = text.match(/\/f(?:@[A-Za-z0-9_]+)?\s+c\s+(.+)$/i);
      
      if (!match || !match[1]) {
        logger.error("   Invalid carousel command format");
        if (callback) {
          await callback({
            text: "❌ Invalid format. Use: /f c <ARTIST> or /f c <SERIES>",
            __fromAction: "fakeRaresCarousel",
            suppressBootstrap: true,
          });
        }
        return { success: false, text: "Invalid format" };
      }

      const input = match[1].trim();
      
      logger.info(`━━━━━ /f c ━━━━━ ${input}`);
      
      // Check if input is a valid series number (auto-detected range)
      const maybeSeriesNum = parseInt(input, 10);
      if (!isNaN(maybeSeriesNum) && maybeSeriesNum >= 0 && maybeSeriesNum <= SERIES_INFO.TOTAL_SERIES - 1) {
        logger.info("   Looking up series");
        const seriesCards = getCardsBySeries(maybeSeriesNum);
        
        if (seriesCards.length > 0) {
          logger.info(`   ✅ Series ${maybeSeriesNum} match: ${seriesCards.length} cards`);
          return await displayArtistCarousel({
            seriesNum: maybeSeriesNum,
            cards: seriesCards,
            query: input,
            callback,
          });
        } else {
          logger.info(`   ❌ Series ${maybeSeriesNum} has no cards`);
          if (callback) {
            await callback({
              text: `❌ Series ${maybeSeriesNum} has no cards.`,
              __fromAction: "fakeRaresCarousel",
              suppressBootstrap: true,
            });
          }
          return {
            success: false,
            data: {
              suppressBootstrap: true,
              reason: "empty_series",
              query: input,
            },
          };
        }
      }
      
      // Not a valid series number, try artist lookup
      logger.info("   Looking up artist");

      // Try exact artist match first
      const exactArtistMatch = findCardsByArtistExact(input);
      
      if (exactArtistMatch) {
        logger.info(`   ✅ Artist match: ${exactArtistMatch.matchedArtist} (${exactArtistMatch.cards.length} cards)`);
        return await displayArtistCarousel({
          artistName: exactArtistMatch.matchedArtist,
          cards: exactArtistMatch.cards,
          query: input,
          callback,
        });
      }
      
      // Try fuzzy artist match
      const artistFuzzyMatch = findCardsByArtistFuzzy(input);
      
      if (artistFuzzyMatch) {
        logger.info(`   ✅ Artist fuzzy match: ${artistFuzzyMatch.matchedArtist}`);
        return await displayArtistCarousel({
          artistName: artistFuzzyMatch.matchedArtist,
          cards: artistFuzzyMatch.cards,
          similarity: artistFuzzyMatch.similarity,
          query: input,
          callback,
        });
      }
      
      // Neither series nor artist found
      logger.info(`   ❌ Artist not found: "${input}"`);
      if (callback) {
        await callback({
          text: `❌ Could not find artist "${input}". Try /f ${input} to see if it's a card name instead.`,
          __fromAction: "fakeRaresCarousel",
          suppressBootstrap: true,
        });
      }
      
      return {
        success: false,
        data: {
          suppressBootstrap: true,
          reason: "artist_not_found_carousel",
          query: input,
        },
      };
    } catch (error) {
      logger.error(
        `   ❌ Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      if (callback) {
        await callback({
          text: `❌ Error while loading carousel. Please try again later.`,
          __fromAction: "fakeRaresCarousel",
          suppressBootstrap: true,
        });
      }
      return {
        success: false,
        data: {
          suppressBootstrap: true,
          reason: "exception",
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },
};

