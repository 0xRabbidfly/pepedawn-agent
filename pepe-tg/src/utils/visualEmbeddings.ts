/**
 * Visual Embeddings Generator
 * 
 * Calls Python CLIP embedding microservice for generating embeddings
 * for visual similarity matching.
 * 
 * CLIP embeddings are perfect for:
 * - Detecting exact matches (high similarity ~0.95+)
 * - Detecting modified versions (medium similarity ~0.75-0.95)
 * - Distinguishing unique content (low similarity <0.75)
 * 
 * Service must be running: cd embedding-service && python main.py
 */

const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8001';

/**
 * Check if embedding service is healthy and ready
 */
export async function checkEmbeddingService(): Promise<boolean> {
  try {
    const response = await fetch(`${EMBEDDING_SERVICE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) return false;
    
    const data = await response.json();
    return data.status === 'healthy' && data.model_loaded === true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate visual embedding from image URL
 * Returns 512-dimensional vector representing image content
 * 
 * For GIFs: Only processes the first frame
 * 
 * @param imageUrl - URL to image (can be http, https, or data URL)
 * @returns 512-dimensional embedding array
 */
export async function generateVisualEmbedding(imageUrl: string): Promise<number[]> {
  try {
    // Fetch image bytes
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch image: ${imageRes.status} ${imageRes.statusText}`);
    }
    const imageBytes = await imageRes.arrayBuffer();
    
    // For GIFs: Extract first frame only to reduce file size (some GIFs are 10MB+)
    let finalBytes = imageBytes;
    let contentType = 'image/jpeg';
    
    if (imageUrl.toLowerCase().endsWith('.gif')) {
      // Use sharp to extract first frame and convert to JPEG
      const sharp = (await import('sharp')).default;
      const buffer = Buffer.from(imageBytes);
      const firstFrameJpeg = await sharp(buffer, { animated: false })
        .jpeg({ quality: 90 })
        .toBuffer();
      
      finalBytes = firstFrameJpeg.buffer;
      contentType = 'image/jpeg';
    } else {
      if (imageUrl.toLowerCase().endsWith('.png')) contentType = 'image/png';
      else if (imageUrl.toLowerCase().endsWith('.webp')) contentType = 'image/webp';
    }
    
    const blob = new Blob([finalBytes], { type: contentType });
    
    // Send to Python embedding service
    const formData = new FormData();
    formData.append('file', blob, 'image.jpg');
    
    const response = await fetch(`${EMBEDDING_SERVICE_URL}/embed/image`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(60000)  // 60s timeout (some large images take longer)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding service error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    // Validate response
    if (!result.embedding || !Array.isArray(result.embedding) || result.embedding.length !== 512) {
      throw new Error(`Invalid embedding response: expected 512-D array, got ${result.embedding?.length}`);
    }
    
    return result.embedding;
    
  } catch (error: any) {
    console.error('❌ Failed to generate visual embedding:', error.message);
    
    // Provide helpful error message if service is down
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      throw new Error('Embedding service not running. Start it with: cd embedding-service && python main.py');
    }
    
    throw new Error(`Embedding generation failed: ${error.message}`);
  }
}

/**
 * Generate embedding from base64 data URL
 * Convenience wrapper for base64 images
 */
export async function generateEmbeddingFromBase64(dataUrl: string): Promise<number[]> {
  try {
    // Extract base64 data from data URL
    const base64Data = dataUrl.split(',')[1];
    const mimeType = dataUrl.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
    
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Create blob
    const blob = new Blob([buffer], { type: mimeType });
    
    // Send to service
    const formData = new FormData();
    formData.append('file', blob, 'image.jpg');
    
    const response = await fetch(`${EMBEDDING_SERVICE_URL}/embed/image`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(60000)  // 60s timeout
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding service error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    if (!result.embedding || !Array.isArray(result.embedding) || result.embedding.length !== 512) {
      throw new Error(`Invalid embedding response: expected 512-D array, got ${result.embedding?.length}`);
    }
    
    return result.embedding;
    
  } catch (error: any) {
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      throw new Error('Embedding service not running. Start it with: cd embedding-service && python main.py');
    }
    
    throw new Error(`Embedding generation failed: ${error.message}`);
  }
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
