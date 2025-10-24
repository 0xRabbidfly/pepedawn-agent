/**
 * Visual Embeddings Generator
 * 
 * Uses Replicate API for CLIP embeddings (andreasjansson/clip-features)
 * for visual similarity matching.
 * 
 * CLIP embeddings are perfect for:
 * - Detecting exact matches (high similarity ~0.95+)
 * - Detecting modified versions (medium similarity ~0.85-0.95)
 * - Distinguishing unique content (low similarity <0.85)
 * 
 * Cost: ~$0.0002 per image (~500 images per $1)
 */

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
// Uses CLIP for feature extraction (embeddings)
// Model: krthr/clip-embeddings (clip-vit-large-patch14 - 768-D)
// Switched from andreasjansson/clip-features due to bug returning identical embeddings
const CLIP_MODEL_OWNER = 'krthr';
const CLIP_MODEL_NAME = 'clip-embeddings';

/**
 * Check if Replicate API is configured
 */
export async function checkEmbeddingService(): Promise<boolean> {
  return !!REPLICATE_API_TOKEN;
}

/**
 * Generate visual embedding from image URL using Replicate API
 * Returns 768-dimensional vector representing image content
 * 
 * @param imageUrl - URL to image (http, https, or data URL)
 * @returns 768-dimensional embedding array
 */
export async function generateVisualEmbedding(imageUrl: string): Promise<number[]> {
  if (!REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN not set in environment');
  }

  try {
    console.log(`  📤 Calling Replicate CLIP API...`);
    
    // First, get the latest version
    const versionsResponse = await fetch(
      `https://api.replicate.com/v1/models/${CLIP_MODEL_OWNER}/${CLIP_MODEL_NAME}/versions`,
      {
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        },
      }
    );
    
    if (!versionsResponse.ok) {
      throw new Error(`Failed to get model versions: ${versionsResponse.status}`);
    }
    
    const versions = await versionsResponse.json();
    const latestVersion = versions.results[0]?.id;
    
    if (!latestVersion) {
      throw new Error('No versions found for model');
    }
    
    console.log(`  🔍 Using version: ${latestVersion.substring(0, 12)}...`);
    
    // Create prediction (async)
    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: latestVersion,
        input: {
          image: imageUrl
        }
      })
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Replicate API error: ${createResponse.status} - ${errorText}`);
    }
    
    const prediction = await createResponse.json();
    const predictionId = prediction.id;
    
    console.log(`  ⏳ Waiting for prediction...`);
    
    // Poll for completion (max 30 attempts = 30 seconds)
    let result = prediction;
    for (let i = 0; i < 30; i++) {
      if (result.status === 'succeeded' || result.status === 'failed' || result.status === 'canceled') {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        },
      });
      
      if (!pollResponse.ok) {
        throw new Error(`Poll failed: ${pollResponse.status}`);
      }
      
      result = await pollResponse.json();
    }
    
    if (result.status === 'failed') {
      throw new Error(`Replicate failed: ${result.error}`);
    }
    
    if (result.status !== 'succeeded') {
      throw new Error(`Prediction timed out or was canceled: ${result.status}`);
    }
    
    // Extract embedding from output
    // krthr/clip-embeddings returns: { "embedding": [768 floats] }
    // (different from andreasjansson which wrapped in array)
    const embedding = result.output?.embedding || result.output?.[0]?.embedding;
    
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error(`Invalid embedding format: ${JSON.stringify(result.output).substring(0, 200)}`);
    }
    
    console.log(`  📊 Embedding dimensions: ${embedding.length}`);
    console.log(`  ✅ Embedding generated (${embedding.length}-D vector)`);
    return embedding;
    
  } catch (error: any) {
    console.error('❌ Failed to generate visual embedding:', error.message);
    throw new Error(`Embedding generation failed: ${error.message}`);
  }
}

/**
 * Generate embedding from HTTP URL (for user uploads)
 * Uses the URL directly without conversion
 */
export async function generateEmbeddingFromUrl(url: string): Promise<number[]> {
  return generateVisualEmbedding(url);
}

/**
 * Generate embedding from base64 data URL
 * NOTE: This doesn't work with Replicate - use generateEmbeddingFromUrl instead
 * @deprecated Use generateEmbeddingFromUrl with Telegram's attachment.url
 */
export async function generateEmbeddingFromBase64(dataUrl: string): Promise<number[]> {
  // Data URLs don't work with Replicate - this will fail
  throw new Error('Data URLs not supported by Replicate. Use generateEmbeddingFromUrl instead.');
}

/**
 * Interpret similarity score
 * Returns human-readable match type
 */
export function interpretSimilarity(score: number): 'exact' | 'high' | 'low' {
  if (score >= 0.95) return 'exact';  // Near-identical
  if (score >= 0.85) return 'high';   // Modified version (90% threshold)
  return 'low';                        // Different image
}
