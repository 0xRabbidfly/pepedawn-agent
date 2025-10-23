/**
 * LLM-LORE Configuration
 * Centralized constants for retrieval, clustering, and generation
 * 
 * OPTIMIZATIONS:
 * - Reduced max tokens for summary (500 -> 350) to save ~30% on LLM costs
 * - Reduced max tokens for story (300 -> 250) to save ~15% on LLM costs
 * - Reduced retrieval limit (24 -> 20) to reduce embedding calls
 * - Added LLM timeout configurations
 */

export const LORE_CONFIG = {
  // Retrieval
  RETRIEVAL_LIMIT: parseInt(process.env.RETRIEVAL_LIMIT || '20', 10), // Reduced from 24
  MIN_HITS: parseInt(process.env.MIN_HITS || '8', 10),
  MATCH_THRESHOLD: 0.25,
  
  // Clustering & Diversity
  CLUSTER_TARGET_MIN: 4,
  CLUSTER_TARGET_MAX: 6,
  TOP_K_FOR_CLUSTERING: 18, // Reduced from 20
  
  // Story Generation - OPTIMIZED token limits
  STORY_LENGTH_WORDS: process.env.STORY_LENGTH_WORDS || '100-150', // Reduced from 120-180
  TEMPERATURE: parseFloat(process.env.TEMPERATURE || '0.7'),
  TOP_P: parseFloat(process.env.TOP_P || '0.9'),
  MAX_TOKENS_SUMMARY: parseInt(process.env.MAX_TOKENS_SUMMARY || '350', 10), // Reduced from 500
  MAX_TOKENS_STORY: parseInt(process.env.MAX_TOKENS_STORY || '250', 10), // Reduced from 300
  
  // Message Limits
  TELEGRAM_MAX_LENGTH: 4096,
  FALLBACK_MAX_LENGTH: 700,
  
  // Timeouts - OPTIMIZED
  SEARCH_TIMEOUT_MS: 5000,
  LLM_TIMEOUT_SUMMARY_MS: 10000, // 10s per summary
  LLM_TIMEOUT_STORY_MS: 12000, // 12s for story
  LLM_TIMEOUT_ASSESSMENT_MS: 8000, // 8s for assessments
  
  // LRU Cache
  LRU_WINDOW_SIZE: 50,
  LRU_EXPIRY_MS: 30 * 60 * 1000, // 30 minutes
} as const;

