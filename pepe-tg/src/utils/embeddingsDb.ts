/**
 * Visual Embeddings Database (JSON Storage)
 * 
 * Stores OpenAI CLIP embeddings for all Fake Rares cards to detect:
 * 1. Exact matches (user uploads existing card)
 * 2. High similarity (user uploads modified version)
 * 3. Low similarity (original user content)
 * 
 * Storage: src/data/card-embeddings.json (simple, fast, reliable)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Path relative to THIS file (works everywhere)
// src/utils/embeddingsDb.ts → src/data/card-embeddings.json
// dist/utils/embeddingsDb.js → dist/data/card-embeddings.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EMBEDDINGS_FILE = join(__dirname, '..', 'data', 'card-embeddings.json');

interface EmbeddingEntry {
  embedding: number[];
  imageUrl: string;
  createdAt: string;
}

type EmbeddingsDatabase = Record<string, EmbeddingEntry>;

let embeddingsCache: EmbeddingsDatabase | null = null;

/**
 * Load embeddings from JSON file
 */
function loadEmbeddings(): EmbeddingsDatabase {
  if (embeddingsCache) {
    console.log(`📦 [EmbeddingsDB] Using cached embeddings (${Object.keys(embeddingsCache).length} cards)`);
    return embeddingsCache;
  }
  
  console.log(`🔍 [EmbeddingsDB] Loading from: ${EMBEDDINGS_FILE}`);
  console.log(`🔍 [EmbeddingsDB] File exists: ${existsSync(EMBEDDINGS_FILE)}`);
  
  if (!existsSync(EMBEDDINGS_FILE)) {
    console.warn(`⚠️  [EmbeddingsDB] File not found! Creating empty database.`);
    // Create empty file if doesn't exist
    writeFileSync(EMBEDDINGS_FILE, JSON.stringify({}, null, 2));
    embeddingsCache = {};
    return embeddingsCache;
  }
  
  const data = readFileSync(EMBEDDINGS_FILE, 'utf-8');
  embeddingsCache = JSON.parse(data);
  console.log(`✅ [EmbeddingsDB] Loaded ${Object.keys(embeddingsCache).length} card embeddings`);
  return embeddingsCache;
}

/**
 * Save embeddings to JSON file
 */
function saveEmbeddings(embeddings: EmbeddingsDatabase): void {
  writeFileSync(EMBEDDINGS_FILE, JSON.stringify(embeddings, null, 2));
  embeddingsCache = embeddings;
}

/**
 * Initialize embeddings database (creates file if needed)
 */
export async function initEmbeddingsDb(): Promise<void> {
  loadEmbeddings();
  const count = Object.keys(embeddingsCache!).length;
  console.log(`✅ Embeddings database initialized (${count} cards)`);
}

/**
 * Get database instance (no-op for JSON, kept for API compatibility)
 */
export async function getEmbeddingsDb(): Promise<void> {
  // No-op for JSON storage
}

/**
 * Store or update card embedding
 */
export async function upsertCardEmbedding(
  asset: string,
  embedding: number[],
  imageUrl: string
): Promise<void> {
  const embeddings = loadEmbeddings();
  
  embeddings[asset] = {
    embedding,
    imageUrl,
    createdAt: new Date().toISOString()
  };
  
  saveEmbeddings(embeddings);
}

/**
 * Get card embedding by asset name
 */
export async function getCardEmbedding(asset: string): Promise<{
  asset: string;
  embedding: number[];
  imageUrl: string;
} | null> {
  const embeddings = loadEmbeddings();
  const entry = embeddings[asset];
  
  if (!entry) return null;
  
  return {
    asset,
    embedding: entry.embedding,
    imageUrl: entry.imageUrl
  };
}

/**
 * Calculate cosine similarity between two embeddings
 * Returns value between -1 and 1 (1 = identical, 0 = unrelated, -1 = opposite)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find most similar card to given embedding
 * Returns top match with similarity score
 * 
 * For 890 cards: ~5-10ms lookup time (fast enough for user uploads)
 */
export async function findMostSimilarCard(
  embedding: number[]
): Promise<{
  asset: string;
  imageUrl: string;
  similarity: number;
} | null> {
  const embeddings = loadEmbeddings();
  const assets = Object.keys(embeddings);
  
  console.log(`🔍 [EmbeddingsDB] Searching ${assets.length} cards for similarity...`);
  
  if (assets.length === 0) {
    console.warn(`⚠️  [EmbeddingsDB] No embeddings in database! Cannot find similar cards.`);
    return null;
  }
  
  let bestMatch: { asset: string; imageUrl: string; similarity: number } | null = null;
  
  for (const asset of assets) {
    const entry = embeddings[asset];
    const similarity = cosineSimilarity(embedding, entry.embedding);
    
    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = {
        asset,
        imageUrl: entry.imageUrl,
        similarity
      };
    }
  }
  
  if (bestMatch) {
    console.log(`✅ [EmbeddingsDB] Most similar: ${bestMatch.asset} (${(bestMatch.similarity * 100).toFixed(1)}% match)`);
  } else {
    console.log(`ℹ️  [EmbeddingsDB] No similar cards found`);
  }
  
  return bestMatch;
}

/**
 * Get count of cards with embeddings
 */
export async function getEmbeddingsCount(): Promise<number> {
  const embeddings = loadEmbeddings();
  return Object.keys(embeddings).length;
}

/**
 * Close database connection (no-op for JSON)
 */
export async function closeEmbeddingsDb(): Promise<void> {
  // No-op for JSON storage
}
