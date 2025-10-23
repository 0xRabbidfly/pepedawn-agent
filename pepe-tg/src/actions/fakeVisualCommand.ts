/**
 * Fake Visual Command - Memetic Visual Analysis
 * 
 * /fv CARDNAME - Analyzes a Fake Rares card using GPT-4o vision to:
 * - Extract and read all text on the card (OCR)
 * - Analyze visual composition and artistic style
 * - Identify memetic references and cultural context
 * - Provide "vibe check" and rarity assessment
 * 
 * Cost: ~$0.005 per analysis (GPT-4o vision)
 */

import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State
} from '@elizaos/core';
import { getCardInfo } from '../utils/cardIndexRefresher';
import { determineImageUrlForAnalysis } from '../utils/cardUrlUtils';
import { logTokenUsage, estimateTokens, calculateCost } from '../utils/tokenLogger';
import { createLogger } from '../utils/actionLogger';
import OpenAI from 'openai';

// ============================================================================
// CONSTANTS
// ============================================================================

const logger = createLogger('FakeVisual');

// High-detail vision uses ~765 tokens for image encoding
const IMAGE_ENCODING_TOKENS = 765;

const MEME_ANALYSIS_PROMPT = `You are analyzing a Fake Rares NFT card for memetic and visual content.

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
// VISION ANALYSIS
// ============================================================================

interface AnalysisResult {
  analysis: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  cost: number;
  duration: number;
}

/**
 * Analyzes a card image using vision API
 * Includes OCR text extraction and memetic analysis
 * 
 * Uses custom VISUAL_MODEL env var to bypass runtime's model selection
 * This allows visual analysis to use a specific model (e.g., gpt-4o, gpt-5)
 */
async function analyzeCardWithVision(
  imageUrl: string,
  cardName: string
): Promise<AnalysisResult> {
  // Use custom env var VISUAL_MODEL (same pattern as LORE_STORY_MODEL)
  const model = process.env.VISUAL_MODEL || 'gpt-4o';
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  const startTime = Date.now();
  const textPrompt = `Analyzing card: **${cardName}**\n\n${MEME_ANALYSIS_PROMPT}`;
  const estimatedTokensIn = estimateTokens(textPrompt) + IMAGE_ENCODING_TOKENS;
  
  logger.info('Starting vision analysis', { cardName, model });
  logger.debug('Image URL', { url: imageUrl });
  
  try {
    // Newer models (o1, o3, gpt-5) use different parameters
    const isReasoningModel = model.startsWith('o1') || model.startsWith('o3') || model.startsWith('gpt-5');
    
    const requestParams: any = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: textPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high' // High detail for better OCR and analysis
              }
            }
          ]
        }
      ],
    };
    
    // Configure parameters based on model type
    if (isReasoningModel) {
      // Reasoning models use max_completion_tokens and reasoning_effort
      // They don't support temperature, top_p, or logprobs
      requestParams.max_completion_tokens = 1600; // Double the regular tokens for reasoning
      requestParams.reasoning_effort = 'low'; // Use low reasoning for visual analysis
      logger.info('Using reasoning model configuration', { model });
    } else {
      // Regular models use max_tokens and temperature
      requestParams.max_tokens = 800; // Sufficient for detailed analysis
      requestParams.temperature = 0.7; // Balance creativity and consistency
    }
    
    const response = await openai.chat.completions.create(requestParams);
    
    const analysis = response.choices[0]?.message?.content || '';
    
    if (!analysis) {
      throw new Error('Empty response from vision model');
    }
    
    const tokensIn = response.usage?.prompt_tokens || estimatedTokensIn;
    const tokensOut = response.usage?.completion_tokens || estimateTokens(analysis);
    
    // Calculate cost using shared function (routes through token cost calculator)
    const cost = calculateCost(model, tokensIn, tokensOut);
    const duration = Date.now() - startTime;
    
    logger.success('Analysis complete', {
      duration: `${duration}ms`,
      cost: `$${cost.toFixed(4)}`,
      tokensIn,
      tokensOut,
      model
    });
    
    // Log token usage for cost tracking (routes through tokenLogger)
    logTokenUsage({
      timestamp: new Date().toISOString(),
      model,
      tokensIn,
      tokensOut,
      cost,
      source: 'Visual Meme calls',
    });
    
    return {
      analysis,
      tokensIn,
      tokensOut,
      model,
      cost,
      duration
    };
    
  } catch (error: any) {
    logger.error('Vision API error', error);
    
    // Provide helpful error messages
    if (error.code === 'insufficient_quota') {
      throw new Error('OpenAI API quota exceeded. Please check your billing settings.');
    } else if (error.code === 'invalid_api_key') {
      throw new Error('Invalid OpenAI API key. Please check your configuration.');
    } else if (error.message?.includes('rate_limit')) {
      throw new Error('Rate limit reached. Please wait a moment and try again.');
    }
    
    throw new Error(`Vision analysis failed: ${error.message || 'Unknown error'}`);
  }
}

// ============================================================================
// MESSAGE FORMATTING
// ============================================================================

/**
 * Formats the analysis result into a user-friendly message
 */
function formatAnalysisMessage(
  cardName: string,
  cardInfo: any,
  result: AnalysisResult
): string {
  return `🐸 **MEMETIC ANALYSIS: ${cardName}**

${result.analysis}`;
}

/**
 * Determines content type from file extension
 */
function getContentType(extension: string): string {
  const ext = extension.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

/**
 * Formats error message for user
 */
function formatErrorMessage(cardName: string, errorMessage: string): string {
  return `❌ **Analysis failed for ${cardName}**

${errorMessage}

💡 **Troubleshooting:**
• Make sure your OpenAI API key is configured
• Check if you have API credits remaining
• Try again in a few moments

Need help? Use \`/help\` for more information.`;
}

// ============================================================================
// COMMAND VALIDATION & PARSING
// ============================================================================

/**
 * Parses the /fv command to extract card name
 */
function parseCommand(text: string): { cardName: string | null; error: string | null } {
  const match = text.match(/^(?:@[A-Za-z0-9_]+\s+)?\/fv\s+(.+)/i);
  
  if (!match || !match[1]) {
    return {
      cardName: null,
      error: '❌ **Usage:** `/fv CARDNAME`\n\n**Example:** `/fv FREEDOMKEK`\n\nAnalyzes the card\'s visual and memetic content using AI vision.'
    };
  }
  
  return { cardName: match[1].trim().toUpperCase(), error: null };
}

// ============================================================================
// ACTION DEFINITION
// ============================================================================

export const fakeVisualCommand: Action = {
  name: 'FAKE_VISUAL_ANALYSIS',
  similes: ['ANALYZE_CARD_VISUAL', 'FV', 'MEME_ANALYSIS'],
  description: 'Analyzes a Fake Rares card in memetic terms using vision AI (reads text + visual analysis)',
  examples: [], // Action handles everything via callback

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').trim();
    // Match /fv followed by a card name (with optional bot mention)
    return /^(?:@[A-Za-z0-9_]+\s+)?\/fv\s+\S+/i.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    logger.separator();
    logger.info('Handler started', {
      user: message.entityId,
      text: message.content.text
    });
    
    try {
      const text = (message.content.text || '').trim();
      
      // STEP 1: Parse command
      logger.step(1, 'Parse command');
      const { cardName, error } = parseCommand(text);
      
      if (error || !cardName) {
        logger.warning('Invalid command format');
        await callback?.({ text: error || 'Invalid command' });
        return { success: false, text: 'Invalid command format' };
      }
      
      logger.info('Card name extracted', { cardName });
      
      // STEP 2: Look up card in index
      logger.step(2, 'Look up card in index');
      const cardInfo = getCardInfo(cardName);
      
      if (!cardInfo) {
        logger.warning('Card not found in index', { cardName });
        await callback?.({
          text: `❌ Card **"${cardName}"** not found in the index.\n\n💡 **Tip:** Use \`/f ${cardName}\` to check if the card exists.`
        });
        return { success: false, text: `Card ${cardName} not found` };
      }
      
      logger.success('Card found', {
        series: cardInfo.series,
        artist: cardInfo.artist || 'unknown',
        ext: cardInfo.ext
      });
      
      // STEP 3: Determine image URL for analysis
      logger.step(3, 'Determine image URL');
      const imageUrl = determineImageUrlForAnalysis(cardInfo, cardName);
      
      if (!imageUrl) {
        logger.warning('Cannot analyze video card', { cardName, ext: cardInfo.ext });
        await callback?.({
          text: `⚠️ **${cardName}** is a video (MP4) card.\n\nVision analysis currently only supports static images (JPG, PNG, GIF, WEBP).\n\n💡 **Alternative:** Use \`/f ${cardName}\` to view the card.`
        });
        return { success: false, text: 'Video cards not supported for visual analysis' };
      }
      
      logger.info('Image URL determined', { url: imageUrl });
      
      // STEP 4: Perform visual analysis
      logger.step(4, 'Perform vision analysis');
      const result = await analyzeCardWithVision(imageUrl, cardName);
      
      // STEP 5: Format and send results with card image
      logger.step(5, 'Send results');
      const responseText = formatAnalysisMessage(cardName, cardInfo, result);
      
      // Include the card image as a thumbnail attachment
      const contentType = getContentType(cardInfo.ext);
      await callback?.({ 
        text: responseText,
        attachments: [
          {
            url: imageUrl,
            title: cardName,
            source: 'fake-rares-visual',
            contentType
          }
        ]
      });
      
      logger.separator();
      logger.success('Handler completed successfully', { cardName });
      
      return {
        success: true,
        text: 'Visual analysis complete',
        data: {
          cardName,
          analysis: result.analysis,
          cost: result.cost,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          duration: result.duration
        }
      };
      
    } catch (error: any) {
      logger.separator();
      logger.error('Handler error', error);
      
      const errorMessage = error.message || 'Unknown error occurred';
      await callback?.({ text: formatErrorMessage('UNKNOWN', errorMessage) });
      
      return {
        success: false,
        text: `Error: ${errorMessage}`,
      };
    }
  },
};
