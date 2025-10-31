/**
 * Fake Visual Command - Memetic Visual Analysis
 *
 * /fv CARDNAME - Analyzes a Fake Rares card
 *
 * Uses GPT-4o vision to extract text, analyze visuals, and provide memetic commentary
 * Cost: ~$0.005 per analysis
 */

import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { getCardInfo } from "../utils/cardIndexRefresher";
import { determineImageUrlForAnalysis } from "../utils/cardUrlUtils";
import { createLogger } from "../utils/actionLogger";
import { analyzeWithVision } from "../utils/visionAnalyzer";

// ============================================================================
// CONSTANTS
// ============================================================================

const logger = createLogger("FakeVisual");

const CARD_ANALYSIS_PROMPT = `You are analyzing a Fake Rares NFT card for memetic and visual content.

Provide a comprehensive analysis in this format:

📝 **TEXT ON CARD:**
[Extract and transcribe ALL visible text on the card - card name, messages, artist signatures, any other text. Do not include the card series or supply details. No more than 2 sentences. IMPORTANT: If there is NO visible text on the card, skip this entire section including the title.]

🎨 **VISUAL BREAKDOWN:**
[Describe the composition, color palette, artistic style, and visual elements in 2-3 sentences. Be specific and descriptive.]

🧬 **MEMETIC DNA:**
[Identify meme references, crypto/NFT culture elements, Pepe lore, and cultural symbols. Use bullet points.]

🎯 **RARITY FEELS:**
[First sentence: What's the emotional/cultural energy of this card? Use crypto-native language like "degen energy", "hopium", "based", "dark", "gm vibes", etc.]
[Second sentence: Based purely on visual presentation, how rare does this FEEL? Not asking about actual supply/rarity stats, just the visual impression.]

Keep your tone casual, crypto-native, and insightful. Be funny but accurate. Use emojis naturally.`;

// ============================================================================
// MESSAGE FORMATTING
// ============================================================================

/**
 * Formats the analysis result into a user-friendly message
 */
function formatAnalysisMessage(cardName: string, analysis: string): string {
  return `🐸 **MEMETIC ANALYSIS: ${cardName}**

${analysis}`;
}

/**
 * Formats error message for user
 */
function formatErrorMessage(cardName: string, errorMessage: string): string {
  return `❌ **Analysis failed for ${cardName}**

${errorMessage}

@rabbidfly - hey dev, something broke! 😅`;
}

// ============================================================================
// COMMAND VALIDATION & PARSING
// ============================================================================

/**
 * Parses the /fv command to extract card name
 */
function parseCommand(text: string): {
  cardName: string | null;
  error: string | null;
} {
  const match = text.match(/^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:@[A-Za-z0-9_]+)?\s+(.+)/i);

  if (!match || !match[1]) {
    return {
      cardName: null,
      error:
        "❌ **Usage:** `/fv CARDNAME`\n\n**Example:** `/fv FREEDOMKEK`\n\nAnalyzes a Fake Rares card's visual and memetic content using AI vision.\n\n💡 **Tip:** Use `/ft` + attach image to test your own art for Fake appeal!",
    };
  }

  return { cardName: match[1].trim().toUpperCase(), error: null };
}

// ============================================================================
// ACTION DEFINITION
// ============================================================================

export const fakeVisualCommand: Action = {
  name: "FAKE_VISUAL_ANALYSIS",
  similes: ["ANALYZE_CARD_VISUAL", "FV", "MEME_ANALYSIS"],
  description:
    "Analyzes a Fake Rares card in memetic terms using vision AI (reads text + visual analysis)",
  examples: [], // Action handles everything via callback

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || "").trim();
    const hasAttachment =
      message.content.attachments && message.content.attachments.length > 0;
    // Match /fv command with card name (no attachments), handles @botname before or after /fv
    return /^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:@[A-Za-z0-9_]+)?\s+.+/i.test(text) && !hasAttachment;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback,
  ) => {
    try {
      const text = (message.content.text || "").trim();
      logger.info(`\n━━━━━ /fv ━━━━━ ${text}`);

      // Parse command
      const { cardName, error } = parseCommand(text);

      if (error || !cardName) {
        logger.info(`/fv: No card name provided`);
        const errorMessage = error ?? "Invalid command format";
        await callback?.({ text: errorMessage });
        return { success: false, text: "Invalid command format" };
      }

      logger.info(`/fv: Card name "${cardName}" - looking up in index`);
      const cardInfo = getCardInfo(cardName);

      if (!cardInfo) {
        logger.info(`/fv: Card "${cardName}" not found in index`);
        await callback?.({
          text: `❌ Card **"${cardName}"** not found in the index.\n\n💡 **Tip:** Use \`/f ${cardName}\` to check if the card exists.`,
        });
        return { success: false, text: `Card ${cardName} not found` };
      }

      logger.info(`/fv: Card found - series ${cardInfo.series}, ${cardInfo.ext}`);

      // Determine image URL for analysis
      const imageUrl = determineImageUrlForAnalysis(cardInfo, cardName);

      if (!imageUrl) {
        logger.info(`/fv: No static image available for ${cardName} (${cardInfo.ext})`);
        await callback?.({
          text: `⚠️ **${cardName}** (${cardInfo.ext.toUpperCase()}) does not have a static image version for analysis.\n\n💡 **Alternative:** Use \`/f ${cardName}\` to view the card.`,
        });
        return {
          success: false,
          text: "No static image version available for analysis",
        };
      }

      logger.info(`/fv: Analyzing ${cardName} with vision API`);
      const result = await analyzeWithVision(
        runtime,
        imageUrl,
        `card: ${cardName}`,
        CARD_ANALYSIS_PROMPT,
        "Visual Meme calls",
      );

      // Format and send results
      const responseText = formatAnalysisMessage(cardName, result.analysis);
      await callback?.({ text: responseText });

      logger.info(`/fv complete: ${cardName} analyzed (${result.tokensIn + result.tokensOut} tokens, ${result.duration}ms)`);

      return {
        success: true,
        text: "Visual analysis complete",
        data: {
          cardName,
          analysis: result.analysis,
          cost: result.cost,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          duration: result.duration,
        },
      };
    } catch (error: any) {
      logger.separator();
      logger.error("Handler error", error);

      // Extract card name from error context if available
      let errorCardName = "UNKNOWN";
      try {
        const text = (message.content.text || "").trim();
        const { cardName } = parseCommand(text);
        if (cardName) errorCardName = cardName;
      } catch {}

      const errorMessage = error.message || "Unknown error occurred";
      await callback?.({
        text: formatErrorMessage(errorCardName, errorMessage),
      });

      return {
        success: false,
        text: `Error: ${errorMessage}`,
      };
    }
  },
};
