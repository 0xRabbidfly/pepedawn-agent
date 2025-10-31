/**
 * LLM-LORE Configuration
 * Centralized constants for retrieval, clustering, and generation
 */

export const LORE_CONFIG = {
  // Retrieval
  RETRIEVAL_LIMIT: parseInt(process.env.RETRIEVAL_LIMIT || '24', 10),
  MIN_HITS: parseInt(process.env.MIN_HITS || '8', 10),
  MATCH_THRESHOLD: 0.25,
  
  // Clustering & Diversity
  CLUSTER_TARGET_MIN: 2,  // Reduced from 4 for better story coherence
  CLUSTER_TARGET_MAX: 3,  // Reduced from 6 for better story coherence
  TOP_K_FOR_CLUSTERING: 20,
  
  // Story Generation
  STORY_LENGTH_WORDS: process.env.STORY_LENGTH_WORDS || 'under 120',
  TEMPERATURE: parseFloat(process.env.TEMPERATURE || '0.7'),
  TOP_P: parseFloat(process.env.TOP_P || '0.9'),
  MAX_TOKENS_SUMMARY: parseInt(process.env.MAX_TOKENS_SUMMARY || '500', 10),
  MAX_TOKENS_STORY: parseInt(process.env.MAX_TOKENS_STORY || '200', 10),
  
  // Message Limits
  TELEGRAM_MAX_LENGTH: 4096,
  FALLBACK_MAX_LENGTH: 700,
  
  // Timeouts
  SEARCH_TIMEOUT_MS: 5000,
  
  // LRU Cache
  LRU_WINDOW_SIZE: 50,
  LRU_EXPIRY_MS: 30 * 60 * 1000, // 30 minutes
} as const;

