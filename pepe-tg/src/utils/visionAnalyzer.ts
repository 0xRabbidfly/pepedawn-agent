/**
 * Vision Analysis Utility
 * 
 * Shared functionality for analyzing images using OpenAI Vision API
 * Used by /fv (card analysis) and /ft (fake test) commands
 */

import type { IAgentRuntime } from '@elizaos/core';
import { callVisionModel } from './modelGateway';
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
  runtime: IAgentRuntime,
  imageUrl: string,
  subject: string,
  prompt: string,
  source: string
): Promise<AnalysisResult> {
  const model = process.env.VISUAL_MODEL || 'gpt-4o';
  const textPrompt = `Analyzing: **${subject}**\n\n${prompt}`;
  
  logger.info('Starting vision analysis', { subject, model });
  
  try {
    // Use centralized model gateway for telemetry
    const result = await callVisionModel(runtime, {
      model,
      prompt: textPrompt,
      imageUrl,
      maxTokens: 800,
      temperature: 0.7,
      source,
      detail: 'high',
    });
    
    logger.success('Analysis complete', {
      duration: `${result.duration}ms`,
      cost: `$${result.cost.toFixed(4)}`,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      model: result.model
    });
    
    return {
      analysis: result.text,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      model: result.model,
      cost: result.cost,
      duration: result.duration
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
    logger.error({ errorDetails }, '🔴 OpenAI Error Details');
    
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

