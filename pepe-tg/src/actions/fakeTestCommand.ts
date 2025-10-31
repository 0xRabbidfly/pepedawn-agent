/**
 * Fake Test Command - Image Appeal Scoring
 *
 * /ft [attach image] - Analyzes uploaded image for Fake Rares appeal
 *
 * Uses GPT-4o vision to score images based on Fake Rares criteria
 * Cost: ~$0.005 per analysis
 */

import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { createLogger } from "../utils/actionLogger";
import {
  generateEmbeddingFromUrl,
  interpretSimilarity,
} from "../utils/visualEmbeddings";
import { findMostSimilarCard } from "../utils/embeddingsDb";
import { analyzeWithVision } from "../utils/visionAnalyzer";

// ============================================================================
// CONSTANTS
// ============================================================================

const logger = createLogger("FakeTest");

const FAKE_TEST_PROMPT = `You are analyzing an image for memetic and visual content.

Provide a comprehensive analysis in this format:

📝 **TEXT:**
[Extract and transcribe ALL visible text. No more than 2 sentences. IMPORTANT: If there is NO visible text, skip this entire section including the title.]

🎨 **VISUAL BREAKDOWN:**
[Describe the composition, color palette, artistic style, and visual elements in 2-3 sentences. Be specific and descriptive.]

🧬 **MEMETIC DNA:**
[Identify ACTUAL meme references, cultural elements, symbols, and recognizable formats/templates. Use bullet points. DO NOT speculate on what things "could symbolize" - only note what is explicitly present.]

🎯 **FAKE APPEAL:**
[Score out of 10 based on STRICT Fake Rare ethos. Weight these SPECIFIC elements: 1) PEPE culture (Fake Rare cards, Rare Pepe, danks, Pepe characters) - highest weight, 2) Text content (memetic, Pepe-related) - high weight, 3) Color palette (GREEN tones prominent) - medium weight, 4) Name/title (fake, rare, pepe references) - medium weight. DO NOT give credit for: vague "crypto vibes", "meme energy", random animals (bears, dogs, cats), generic art styles, or "could symbolize" interpretations. If the image has NONE of the 4 specific elements above (no Pepe, no green, no memetic text, no Pepe name), score 1-2/10. Be harsh and specific in your reasoning.]

Keep your tone casual and insightful. Be funny but accurate.`;

// ============================================================================
// ACTION DEFINITION
// ============================================================================

export const fakeTestCommand: Action = {
  name: "FAKE_TEST_ANALYSIS",
  similes: ["ANALYZE_IMAGE_APPEAL", "FT", "FAKE_APPEAL_SCORE"],
  description: "Analyzes uploaded images for Fake Rares appeal score",
  examples: [], // Action handles everything via callback

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || "").trim();
    // Match /ft command (must have attachment, checked in handler), handles @botname
    return /^(?:@[A-Za-z0-9_]+\s+)?\/ft(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback,
  ) => {
    try {
      const hasAttachment =
        message.content.attachments && message.content.attachments.length > 0;

      logger.info(`\n━━━━━ /ft ━━━━━ ${hasAttachment ? '1 attachment' : 'no attachment'}`);

      // Require image attachment
      if (!hasAttachment) {
        logger.info("/ft: No attachment found");
        await callback?.({
          text: "❌ **Usage:** `/ft` + attach image\n\nAnalyzes any uploaded image for Fake Rares appeal.\n\n**Example:** Type `/ft` in the caption when uploading your meme.",
        });
        return { success: false, text: "No attachment" };
      }

      const attachment = message.content.attachments?.[0];

      if (!attachment) {
        logger.info("/ft: Attachment missing despite check");
        await callback?.({
          text: "❌ Could not access the uploaded image. Please try again.",
        });
        return { success: false, text: "No attachment found" };
      }

      logger.info(`/ft: STEP 1/3 - Validating ${attachment.source} attachment`);

      if (!attachment.url) {
        logger.info("/ft: No URL in attachment");
        await callback?.({
          text: "❌ Could not access the uploaded image. Please try again.",
        });
        return { success: false, text: "No image URL" };
      }

      // Block animations (GIF/MP4) immediately
      const isAnimation =
        attachment.source === "Animation" ||
        attachment.source === "Document" ||
        attachment.url.includes(".mp4") ||
        attachment.url.includes(".mov") ||
        attachment.url.includes("/animations/");

      if (isAnimation) {
        logger.info("/ft: Animation detected - blocking");
        await callback?.({
          text: "❌ **Sorry brother Fake, but we cannot analyze animations.**\n\n💡 **To analyze:**\n1. Clip the starter frame\n2. Upload or just paste into TG with `/ft` caption",
        });
        return { success: false, text: "Animation blocked" };
      }

      const imageUrlToUse = attachment.url;

      // STEP 2: Validate image URL is accessible
      try {
        const headResponse = await fetch(imageUrlToUse, { method: "HEAD" });
        if (!headResponse.ok) {
          throw new Error(`Image not accessible: ${headResponse.statusText}`);
        }
      } catch (validateError: any) {
        logger.info("/ft: Failed to access image");
        await callback?.({
          text: "❌ Could not access the uploaded image. Please try again.",
        });
        return { success: false, text: "Image validation failed" };
      }

      // STEP 2: Check for existing card similarity (BEFORE LLM call to save costs!)
      logger.info("/ft: STEP 2/3 - Checking for duplicates via embeddings");
      let similarCard: {
        asset: string;
        imageUrl: string;
        similarity: number;
      } | null = null;
      let matchType: "exact" | "high" | "low" = "low";

      if (imageUrlToUse && process.env.REPLICATE_API_TOKEN) {
        try {
          // Generate embedding using static image URL
          const userEmbedding = await generateEmbeddingFromUrl(imageUrlToUse);

          // Find most similar card in database
          similarCard = await findMostSimilarCard(userEmbedding);

          if (similarCard) {
            matchType = interpretSimilarity(similarCard.similarity);

            // EXACT MATCH: User uploaded an existing Fake Rare!
            if (matchType === "exact") {
              logger.info(`/ft: Exact match - ${similarCard.asset} (no LLM needed)`);
              const responseText = `🐸 **HA! NICE TRY!**\n\nThat's **${similarCard.asset}** - already a certified FAKE RARE!\n\n🎯 **10/10** because it's already legendary.\n\nTry uploading your own original art instead! 😏`;
              await callback?.({ text: responseText });

              return {
                success: true,
                text: "Exact match detected",
                data: {
                  matchType: "exact",
                  matchedCard: similarCard.asset,
                  similarity: similarCard.similarity,
                },
              };
            }

            // HIGH MATCH: User modified an existing card or sent a clipped frame
            if (matchType === "high") {
              logger.info(`/ft: High similarity - ${similarCard.asset} (${(similarCard.similarity * 100).toFixed(1)}%, no LLM)`);
              const responseText = `🐸 **SNEAKY! ALMOST GOT ME!**\n\nLooks like you tried to modify **${similarCard.asset}**! The vibes are too similar, or you sent a clipping of a true FAKE RARE.\n\nNice try, but I can spot a derivative when I see one! 😏\n\nWant a real analysis? Upload something more original! 🎨`;
              await callback?.({ text: responseText });

              return {
                success: true,
                text: "High similarity detected",
                data: {
                  matchType: "high",
                  matchedCard: similarCard.asset,
                  similarity: similarCard.similarity,
                },
              };
            }
          }
        } catch (embeddingError: any) {
          // If embedding check fails, log but continue to LLM analysis
          logger.info("/ft: Embedding check failed, proceeding to LLM");
        }
      }

      // STEP 3: Perform visual analysis (LOW similarity or embedding check skipped/failed)

      try {
        const result = await analyzeWithVision(
          runtime,
          imageUrlToUse,
          "User Image",
          FAKE_TEST_PROMPT,
          "Fake Test calls",
        );

        // STEP 5: Format and send results (include closest card if available)
        logger.step(5, "Send results");
        let responseText = `🐸 **FAKE TEST RESULTS**\n\n${result.analysis}`;

        // Add closest matching card info (if low similarity)
        if (similarCard && matchType === "low") {
          responseText += `\n\n💡 **CLOSEST MATCH IN COLLECTION:**\nYour image has some vibes similar to **${similarCard.asset}**\nCheck it out: \`/f ${similarCard.asset}\``;
        }

        await callback?.({ text: responseText });

        logger.info(`/ft complete: Analysis sent (${result.tokensIn} → ${result.tokensOut} tokens, $${result.cost.toFixed(4)}, ${result.duration}ms)`);

        return {
          success: true,
          text: "Fake test analysis complete",
          data: {
            analysis: result.analysis,
            cost: result.cost,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            duration: result.duration,
          },
        };
      } catch (error: any) {
        logger.error("Failed to analyze uploaded image", error);

        const errorMsg = error.message || String(error) || "Unknown error";
        await callback?.({
          text: `❌ Failed to analyze image: ${errorMsg}\n\nPlease try uploading a different image format (JPG, PNG, GIF, or WEBP).`,
        });
        return { success: false, text: errorMsg };
      }
    } catch (error: any) {
      logger.separator();
      logger.error("Handler error", error);

      const errorMessage = error.message || "Unknown error occurred";
      await callback?.({
        text: `❌ **Analysis failed**\n\n${errorMessage}\n\n@rabbidfly - hey dev, something broke! 😅`,
      });

      return {
        success: false,
        text: `Error: ${errorMessage}`,
      };
    }
  },
};
