/**
 * Fake Visual Command - Memetic Visual Analysis
 * 
 * /fv CARDNAME - Analyzes a Fake Rares card
 * /fv [attach image] - Analyzes any uploaded image
 * 
 * Uses GPT-4o vision to extract text, analyze visuals, and provide memetic commentary
 * Cost: ~$0.005 per analysis
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
import { generateEmbeddingFromUrl, interpretSimilarity } from '../utils/visualEmbeddings';
import { findMostSimilarCard } from '../utils/embeddingsDb';
import OpenAI from 'openai';

// ============================================================================
// CONSTANTS
// ============================================================================

const logger = createLogger('FakeVisual');

// High-detail vision uses ~765 tokens for image encoding
const IMAGE_ENCODING_TOKENS = 765;

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

const GENERIC_IMAGE_PROMPT = `You are analyzing an image for memetic and visual content.

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
 * Analyzes an image using vision API
 * Includes OCR text extraction and memetic analysis
 * 
 * Uses custom VISUAL_MODEL env var to bypass runtime's model selection
 * This allows visual analysis to use a specific model (e.g., gpt-4o, gpt-5)
 */
async function analyzeWithVision(
  imageUrl: string,
  subject: string,
  prompt: string
): Promise<AnalysisResult> {
  // Use custom env var VISUAL_MODEL (same pattern as LORE_STORY_MODEL)
  const model = process.env.VISUAL_MODEL || 'gpt-4o';
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  const startTime = Date.now();
  const textPrompt = `Analyzing: **${subject}**\n\n${prompt}`;
  const estimatedTokensIn = estimateTokens(textPrompt) + IMAGE_ENCODING_TOKENS;
  
  logger.info('Starting vision analysis', { subject, model });
  
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
    // Extract detailed error information
    const errorDetails = {
      message: error.message,
      code: error.code,
      status: error.status,
      type: error.type,
      imageType: imageUrl?.startsWith('data:') ? 'base64' : 'url',
      // OpenAI SDK v4+ error structure
      openaiError: error.error?.message || error.error,
      // Raw response data
      responseData: error.response?.data,
      responseStatus: error.response?.status,
      responseBody: error.response?.body,
    };
    
    // Log comprehensive error details for debugging
    logger.error('Vision API error - FULL DETAILS:', error);
    console.error('🔴 OpenAI Error Details:', JSON.stringify(errorDetails, null, 2));
    
    // Provide helpful error messages
    if (error.code === 'insufficient_quota') {
      throw new Error('OpenAI API quota exceeded. Please check your billing settings.');
    } else if (error.code === 'invalid_api_key') {
      throw new Error('Invalid OpenAI API key. Please check your configuration.');
    } else if (error.message?.includes('rate_limit')) {
      throw new Error('Rate limit reached. Please wait a moment and try again.');
    } else if (error.status === 400 || error.response?.status === 400) {
      // 400 errors - extract the actual OpenAI error message
      const openaiMsg = error.error?.message || error.response?.data?.error?.message || error.message;
      throw new Error(`OpenAI 400 error: ${openaiMsg}`);
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
  result: AnalysisResult,
  imageUrl: string
): string {
  return `🐸 **MEMETIC ANALYSIS: ${cardName}**

${result.analysis}`;
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
    // Match /fv command (with or without card name, attachment checked in handler)
    return /^(?:@[A-Za-z0-9_]+\s+)?\/fv(?:\s|$)/i.test(text);
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
      const hasAttachment = message.content.attachments && message.content.attachments.length > 0;
      
      // Branch 1: User uploaded an image
      if (hasAttachment) {
        logger.step(1, 'Analyze uploaded image');
        const attachment = message.content.attachments?.[0];
        
        if (!attachment) {
          logger.error('Attachment missing despite hasAttachment check');
          await callback?.({ text: '❌ Could not access the uploaded image. Please try again.' });
          return { success: false, text: 'No attachment found' };
        }
        
        logger.info('Attachment detected', {
          source: attachment.source,
          url: attachment.url,
          contentType: attachment.contentType
        });
        
        if (!attachment.url) {
          logger.error('No URL in attachment', undefined, { attachmentSource: attachment.source });
          await callback?.({ text: '❌ Could not access the uploaded image. Please try again.' });
          return { success: false, text: 'No image URL' };
        }
        
        // Block animations (GIF/MP4) immediately - ask user to clip a frame
        const isAnimation = attachment.source === 'Animation' || 
                           attachment.source === 'Document' ||
                           attachment.url.includes('.mp4') || 
                           attachment.url.includes('.mov') || 
                           attachment.url.includes('/animations/');
        
        if (isAnimation) {
          logger.info('Animation detected - blocking and asking user to clip a frame');
          await callback?.({
            text: '❌ **Sorry brother Fake, but we cannot analyze animations.**\n\n💡 **To analyze:**\n1. Clip the starter frame\n2. Upload or just paste into TG with `/fv` caption'
          });
          return { success: false, text: 'Animation blocked' };
        }
        
        const imageUrlToUse = attachment.url;
        
        // STEP 2: Validate image URL is accessible
        logger.step(2, 'Validate image');
        try {
          // Quick HEAD request to verify the image is accessible
          const headResponse = await fetch(imageUrlToUse, { method: 'HEAD' });
          if (!headResponse.ok) {
            throw new Error(`Image not accessible: ${headResponse.statusText}`);
          }
        } catch (validateError: any) {
          logger.error('Failed to access image', validateError);
          await callback?.({ text: '❌ Could not access the uploaded image. Please try again.' });
          return { success: false, text: 'Image validation failed' };
        }
        
        // STEP 3: Check for existing card similarity (BEFORE LLM call to save costs!)
        logger.step(3, 'Check embedding similarity');
        let similarCard: { asset: string; imageUrl: string; similarity: number } | null = null;
        let matchType: 'exact' | 'high' | 'low' = 'low';
        
        if (imageUrlToUse && process.env.REPLICATE_API_TOKEN) {
          try {
            // Generate embedding using static image URL
            const userEmbedding = await generateEmbeddingFromUrl(imageUrlToUse);
            
            // Find most similar card in database
            similarCard = await findMostSimilarCard(userEmbedding);
          
            if (similarCard) {
              matchType = interpretSimilarity(similarCard.similarity);
              
              // EXACT MATCH: User uploaded an existing Fake Rare!
              if (matchType === 'exact') {
                logger.success('Exact match detected - no LLM call needed!');
                const responseText = `🐸 **HA! NICE TRY!**\n\nThat's **${similarCard.asset}** - already a certified FAKE RARE!\n\n🎯 **10/10** because it's already legendary.\n\nTry uploading your own original art instead! 😏`;
                await callback?.({ text: responseText });
                
                return {
                  success: true,
                  text: 'Exact match detected',
                  data: {
                    matchType: 'exact',
                    matchedCard: similarCard.asset,
                    similarity: similarCard.similarity
                  }
                };
              }
              
              // HIGH MATCH: User modified an existing card or sent a clipped frame
              if (matchType === 'high') {
                logger.success('High similarity detected - no LLM call needed!');
                const responseText = `🐸 **SNEAKY! ALMOST GOT ME!**\n\nLooks like you tried to modify **${similarCard.asset}**! The vibes are too similar, or you sent a clipping of a true FAKE RARE.\n\nNice try, but I can spot a derivative when I see one! 😏\n\nWant a real analysis? Upload something more original! 🎨`;
                await callback?.({ text: responseText });
                
                return {
                  success: true,
                  text: 'High similarity detected',
                  data: {
                    matchType: 'high',
                    matchedCard: similarCard.asset,
                    similarity: similarCard.similarity
                  }
                };
              }
            }
          } catch (embeddingError: any) {
            // If embedding check fails, log but continue to LLM analysis
            logger.warning('Embedding similarity check failed, proceeding to LLM', {
              error: embeddingError.message
            });
          }
        }
        
        // STEP 4: Perform visual analysis (LOW similarity or embedding check skipped/failed)
        logger.step(4, 'Perform vision analysis');
        
        try {
          // Use static image URL
          const result = await analyzeWithVision(imageUrlToUse, 'User Image', GENERIC_IMAGE_PROMPT);
          
          // STEP 5: Format and send results (include closest card if available)
          logger.step(5, 'Send results');
          let responseText = `🐸 **MEMETIC ANALYSIS**\n\n${result.analysis}`;
          
          // Add closest matching card info (if low similarity)
          if (similarCard && matchType === 'low') {
            responseText += `\n\n💡 **CLOSEST MATCH IN COLLECTION:**\nYour image has some vibes similar to **${similarCard.asset}**\nCheck it out: \`/f ${similarCard.asset}\``;
          }
          
          await callback?.({ text: responseText });
          
          logger.separator();
          logger.success('Handler completed successfully');
          
          return {
            success: true,
            text: 'Visual analysis complete',
            data: {
              analysis: result.analysis,
              cost: result.cost,
              tokensIn: result.tokensIn,
              tokensOut: result.tokensOut,
              duration: result.duration
            }
          };
        } catch (error: any) {
          logger.error('Failed to analyze uploaded image', error);
          
          const errorMsg = error.message || String(error) || 'Unknown error';
          await callback?.({ 
            text: `❌ Failed to analyze image: ${errorMsg}\n\nPlease try uploading a different image format (JPG, PNG, GIF, or WEBP).` 
          });
          return { success: false, text: errorMsg };
        }
      }
      
      // Branch 2: Analyze a Fake Rares card
      logger.step(1, 'Parse command');
      const { cardName, error } = parseCommand(text);
      
      if (error || !cardName) {
        logger.warning('No card name and no attachment');
        await callback?.({ 
          text: '❌ **Usage:**\n\n**Option 1:** `/fv CARDNAME` - Analyze a Fake Rares card\n**Option 2:** `/fv` + attach image - Analyze any image\n\n**Examples:**\n• `/fv FREEDOMKEK`\n• `/fv` then attach your meme' 
        });
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
        logger.warning('Cannot analyze card - no static version available', { cardName, ext: cardInfo.ext });
        await callback?.({
          text: `⚠️ **${cardName}** (${cardInfo.ext.toUpperCase()}) does not have a static image version for analysis.\n\n💡 **Alternative:** Use \`/f ${cardName}\` to view the card.`
        });
        return { success: false, text: 'No static image version available for analysis' };
      }
      
      logger.info('Image URL determined', { url: imageUrl });
      
      // STEP 4: Perform visual analysis
      logger.step(4, 'Perform vision analysis');
      const result = await analyzeWithVision(imageUrl, `card: ${cardName}`, CARD_ANALYSIS_PROMPT);
      
      // STEP 5: Format and send results
      logger.step(5, 'Send results');
      const responseText = formatAnalysisMessage(cardName, cardInfo, result, imageUrl);
      
      // Send text only (no attachment) so Telegram displays full-width text
      await callback?.({ text: responseText });
      
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
