/**
 * Model Gateway - Centralized SDK call wrapper
 * 
 * Wraps direct OpenAI SDK calls with telemetry and error handling.
 * Used by storyComposer and visionAnalyzer to track premium model usage.
 * 
 * Benefits:
 * - Centralized telemetry (logs to TelemetryService)
 * - Consistent error handling
 * - Support for reasoning models (o1, o3, gpt-5)
 * - Token estimation and cost calculation
 */

import OpenAI from 'openai';
import type { IAgentRuntime } from '@elizaos/core';
import type { TelemetryService } from '../services/TelemetryService';

export interface ModelCallOptions {
  model: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  source: string;  // For telemetry (e.g., "Lore calls", "Visual Meme calls")
}

export interface VisionCallOptions extends ModelCallOptions {
  imageUrl: string;
  detail?: 'low' | 'high';
}

export interface ModelCallResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  cost: number;
  duration: number;
}

// High-detail vision encoding estimate
const IMAGE_ENCODING_TOKENS = 765;

/**
 * Estimate token count from text
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Call OpenAI text completion with telemetry
 */
export async function callTextModel(
  runtime: IAgentRuntime,
  options: ModelCallOptions
): Promise<ModelCallResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const startTime = Date.now();
  
  const isReasoningModel = 
    options.model.startsWith('o1') || 
    options.model.startsWith('o3') || 
    options.model.startsWith('gpt-5');
  
  const requestParams: any = {
    model: options.model,
    messages: [{ role: 'user', content: options.prompt }],
  };
  
  // Configure based on model type
  if (isReasoningModel) {
    // Reasoning models need 2x tokens since they use internal reasoning
    requestParams.max_completion_tokens = options.maxTokens ? options.maxTokens * 2 : 600;
    requestParams.reasoning_effort = 'minimal';
  } else {
    requestParams.max_tokens = options.maxTokens || 300;
    if (options.temperature !== undefined) {
      requestParams.temperature = options.temperature;
    }
  }
  
  try {
    console.log(`[ModelGateway] Calling ${options.model} with prompt length: ${options.prompt.length}`);
    const response = await openai.chat.completions.create(requestParams);
    const text = response.choices[0]?.message?.content || '';
    
    // Check for empty response
    if (!text || text.trim().length === 0) {
      console.error(`[ModelGateway] Empty response from ${options.model}`);
      throw new Error(`Empty response from model ${options.model}`);
    }
    
    console.log(`[ModelGateway] Response received: ${text.length} chars`);
    
    const tokensIn = response.usage?.prompt_tokens || estimateTokens(options.prompt);
    const tokensOut = response.usage?.completion_tokens || estimateTokens(text);
    const duration = Date.now() - startTime;
    
    // Get telemetry service and log
    const telemetry = runtime.getService('telemetry') as TelemetryService;
    const cost = telemetry ? telemetry.calculateCost(options.model, tokensIn, tokensOut) : 0;
    
    if (telemetry) {
      await telemetry.logModelUsage({
        timestamp: new Date().toISOString(),
        model: options.model,
        tokensIn,
        tokensOut,
        cost,
        source: options.source,
        duration,
      });
    }
    
    return {
      text,
      tokensIn,
      tokensOut,
      model: options.model,
      cost,
      duration,
    };
  } catch (error: any) {
    console.error(`[ModelGateway] ${options.model} call failed:`, error.message);
    console.error(`[ModelGateway] Full error:`, error);
    throw error;
  }
}

/**
 * Call OpenAI Vision with telemetry
 */
export async function callVisionModel(
  runtime: IAgentRuntime,
  options: VisionCallOptions
): Promise<ModelCallResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const startTime = Date.now();
  
  const isReasoningModel = 
    options.model.startsWith('o1') || 
    options.model.startsWith('o3') || 
    options.model.startsWith('gpt-5');
  
  const requestParams: any = {
    model: options.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: options.prompt },
          {
            type: 'image_url',
            image_url: {
              url: options.imageUrl,
              detail: options.detail || 'high',
            }
          }
        ]
      }
    ],
  };
  
  // Configure based on model type
  if (isReasoningModel) {
    requestParams.max_completion_tokens = options.maxTokens || 1600;
    requestParams.reasoning_effort = 'low';
  } else {
    requestParams.max_tokens = options.maxTokens || 800;
    if (options.temperature !== undefined) {
      requestParams.temperature = options.temperature;
    }
  }
  
  try {
    let response = await openai.chat.completions.create(requestParams);
    let text = response.choices[0]?.message?.content || '';
    
    // Retry once if empty (common with animated GIFs)
    if (!text) {
      console.warn('[ModelGateway] Empty response, retrying...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      response = await openai.chat.completions.create(requestParams);
      text = response.choices[0]?.message?.content || '';
      
      if (!text) {
        throw new Error('Empty response from vision model (after retry)');
      }
    }
    
    const tokensIn = response.usage?.prompt_tokens || (estimateTokens(options.prompt) + IMAGE_ENCODING_TOKENS);
    const tokensOut = response.usage?.completion_tokens || estimateTokens(text);
    const duration = Date.now() - startTime;
    
    // Get telemetry service and log
    const telemetry = runtime.getService('telemetry') as TelemetryService;
    const cost = telemetry ? telemetry.calculateCost(options.model, tokensIn, tokensOut) : 0;
    
    if (telemetry) {
      await telemetry.logModelUsage({
        timestamp: new Date().toISOString(),
        model: options.model,
        tokensIn,
        tokensOut,
        cost,
        source: options.source,
        duration,
      });
    }
    
    return {
      text,
      tokensIn,
      tokensOut,
      model: options.model,
      cost,
      duration,
    };
  } catch (error: any) {
    console.error(`[ModelGateway] ${options.model} vision call failed:`, error.message);
    throw error;
  }
}

