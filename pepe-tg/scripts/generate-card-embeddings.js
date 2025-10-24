/**
 * Generate Visual Embeddings for All Cards
 * 
 * Processes all cards in fake-rares-data.json and generates CLIP embeddings
 * for visual similarity matching in /fv command.
 * 
 * Usage:
 *   bun run scripts/generate-card-embeddings.js              # Process all cards
 *   bun run scripts/generate-card-embeddings.js CARDNAME     # Process specific card
 *   bun run scripts/generate-card-embeddings.js "" 100       # Process first 100 cards
 * 
 * For MP4 cards: Uses memeUri (scraped static image) instead of video
 * If embedding fails: Adds issue to fake-rares-data.json for manual fix
 */

import { generateVisualEmbedding } from '../src/utils/visualEmbeddings.ts';
import { initEmbeddingsDb, upsertCardEmbedding, getEmbeddingsCount } from '../src/utils/embeddingsDb.ts';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_FILE = join(process.cwd(), 'src', 'data', 'fake-rares-data.json');

// Determine image URL for embedding generation
function getImageUrlForEmbedding(card) {
  // For MP4s, use memeUri (scraped static image) if available
  if (card.ext === 'mp4') {
    if (card.memeUri) {
      return card.memeUri;
    }
    // No static version available
    return null;
  }
  
  // For static images: imageUri or constructed S3 URL
  if (card.imageUri) {
    return card.imageUri;
  }
  
  // Construct S3 URL using the correct format
  const encodedAssetName = encodeURIComponent(card.asset.toUpperCase());
  return `https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/${card.series}/${encodedAssetName}.${card.ext}`;
}

async function processCard(card, cardsData) {
  const imageUrl = getImageUrlForEmbedding(card);
  
  if (!imageUrl) {
    console.log(`⚠️  [${card.asset}] No image URL available (MP4 without memeUri)`);
    
    // Add issue to card data
    if (!card.issues) {
      card.issues = [];
    }
    if (!card.issues.some(i => i.type === 'missing_embedding_source')) {
      card.issues.push({
        type: 'missing_embedding_source',
        message: 'MP4 card without memeUri - cannot generate embedding',
        addedAt: new Date().toISOString()
      });
    }
    
    return { success: false, reason: 'no_image_url' };
  }
  
  try {
    console.log(`🔄 [${card.asset}] Generating embedding from: ${imageUrl.substring(0, 60)}...`);
    
    const embedding = await generateVisualEmbedding(imageUrl);
    
    await upsertCardEmbedding(card.asset, embedding, imageUrl);
    
    console.log(`✅ [${card.asset}] Embedding stored (${embedding.length} dimensions)`);
    
    // Remove any existing embedding issues
    if (card.issues) {
      card.issues = card.issues.filter(i => 
        i.type !== 'missing_embedding_source' && i.type !== 'embedding_generation_failed'
      );
      if (card.issues.length === 0) {
        delete card.issues;
      }
    }
    
    return { success: true };
    
  } catch (error) {
    console.error(`❌ [${card.asset}] Embedding generation failed:`, error.message);
    
    // Add issue to card data
    if (!card.issues) {
      card.issues = [];
    }
    if (!card.issues.some(i => i.type === 'embedding_generation_failed')) {
      card.issues.push({
        type: 'embedding_generation_failed',
        message: error.message,
        addedAt: new Date().toISOString()
      });
    }
    
    return { success: false, reason: 'generation_failed', error: error.message };
  }
}

async function main() {
  const specificCard = process.argv[2]?.toUpperCase();
  const limitArg = process.argv[3];
  const limit = limitArg ? parseInt(limitArg, 10) : null;
  
  console.log('🚀 Starting card embedding generation...\n');
  
  // Initialize database
  await initEmbeddingsDb();
  
  // Load card data
  const cardsData = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  
  // Filter to specific card if provided
  let cardsToProcess = specificCard
    ? cardsData.filter(c => c.asset === specificCard)
    : cardsData;
  
  // Apply limit if provided
  if (limit && !specificCard) {
    console.log(`📏 Limiting to first ${limit} cards\n`);
    cardsToProcess = cardsToProcess.slice(0, limit);
  }
  
  if (specificCard && cardsToProcess.length === 0) {
    console.error(`❌ Card "${specificCard}" not found in database`);
    process.exit(1);
  }
  
  console.log(`📊 Processing ${cardsToProcess.length} card(s)${limit ? ` (batch of ${limit})` : ''}...\n`);
  
  const results = {
    success: 0,
    noImageUrl: 0,
    failed: 0
  };
  
  // Process cards sequentially (to avoid overwhelming the system)
  for (const card of cardsToProcess) {
    const result = await processCard(card, cardsData);
    
    if (result.success) {
      results.success++;
    } else if (result.reason === 'no_image_url') {
      results.noImageUrl++;
    } else {
      results.failed++;
    }
    
    // Small delay to avoid rate limiting / overload
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Save updated card data (with issues)
  writeFileSync(DATA_FILE, JSON.stringify(cardsData, null, 2));
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully generated: ${results.success}`);
  console.log(`⚠️  No image URL (MP4 without memeUri): ${results.noImageUrl}`);
  console.log(`❌ Failed to generate: ${results.failed}`);
  
  const totalInDb = await getEmbeddingsCount();
  console.log(`\n📦 Total embeddings in database: ${totalInDb}`);
  
  if (results.noImageUrl > 0 || results.failed > 0) {
    console.log('\n⚠️  Some cards have issues. Check fake-rares-data.json for "issues" field.');
    console.log('   Run script again with specific card name to retry:');
    console.log('   bun run scripts/generate-card-embeddings.js CARDNAME');
  }
  
  console.log('\n✅ Done!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

