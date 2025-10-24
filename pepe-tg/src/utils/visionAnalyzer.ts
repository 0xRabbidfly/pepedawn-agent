/**
 * Vision Analysis Utility
 * 
 * Shared functionality for analyzing images using OpenAI Vision API
 * Used by /fv (card analysis) and /ft (fake test) commands
 */

import OpenAI from 'openai';
import { logTokenUsage, estimateTokens, calculateCost } from './tokenLogger';
import { createLogger } from './actionLogger';

const logger = createLogger('VisionAnalyzer');

// High-detail vision uses ~765 tokens for image encoding
const IMAGE_ENCODING_TOKENS = 765;

export interface AnalysisResult {
  analysis: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  cost: number;
  duration: number;
}

/**
 * Analyzes an image using OpenAI Vision API
 * 
 * @param imageUrl - URL of the image to analyze
 * @param subject - Subject description for logging (e.g., "card: FREEDOMKEK", "User Image")
 * @param prompt - System prompt for the analysis
 * @param source - Source label for token tracking (e.g., "Visual Meme calls", "Fake Test calls")
 * @returns Analysis result with tokens, cost, and duration
 */
export async function analyzeWithVision(
  imageUrl: string,
  subject: string,
  prompt: string,
  source: string
): Promise<AnalysisResult> {
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
      requestParams.max_completion_tokens = 1600;
      requestParams.reasoning_effort = 'low';
      logger.info('Using reasoning model configuration', { model });
    } else {
      requestParams.max_tokens = 800;
      requestParams.temperature = 0.7;
    }
    
    let response = await openai.chat.completions.create(requestParams);
    let analysis = response.choices[0]?.message?.content || '';
    
    // Retry once if empty (common with animated GIFs - OpenAI picks bad frame)
    if (!analysis) {
      logger.warning('Empty response from vision model, retrying once...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      response = await openai.chat.completions.create(requestParams);
      analysis = response.choices[0]?.message?.content || '';
      
      if (!analysis) {
        throw new Error('Empty response from vision model (after retry)');
      }
    }
    
    const tokensIn = response.usage?.prompt_tokens || estimatedTokensIn;
    const tokensOut = response.usage?.completion_tokens || estimateTokens(analysis);
    
    const cost = calculateCost(model, tokensIn, tokensOut);
    const duration = Date.now() - startTime;
    
    logger.success('Analysis complete', {
      duration: `${duration}ms`,
      cost: `$${cost.toFixed(4)}`,
      tokensIn,
      tokensOut,
      model
    });
    
    // Log token usage for cost tracking
    logTokenUsage({
      timestamp: new Date().toISOString(),
      model,
      tokensIn,
      tokensOut,
      cost,
      source,
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
      openaiError: error.error?.message || error.error,
      responseData: error.response?.data,
      responseStatus: error.response?.status,
      responseBody: error.response?.body,
    };
    
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
      const openaiMsg = error.error?.message || error.response?.data?.error?.message || error.message;
      throw new Error(`OpenAI 400 error: ${openaiMsg}`);
    }
    
    throw new Error(`Vision analysis failed: ${error.message || 'Unknown error'}`);
  }
}

