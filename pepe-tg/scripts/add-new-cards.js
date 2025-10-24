#!/usr/bin/env node
/**
 * ADD NEW FAKE RARES CARDS
 * 
 * This script performs a complete 2-pass data collection for new Fake Rares cards:
 * 
 * PASS 1: Extract asset names from fakeraredirectory.com
 *   - Gets: asset name, series, card number (required)
 *   - Gets: media URI (optional fallback for cards not yet on pepe.wtf)
 * 
 * PASS 2: Extract ALL metadata from pepe.wtf (authoritative source)
 *   - Gets: artist, artistSlug, supply, issuance
 *   - Gets: extension, image/video URIs
 *   - Fallback: If card doesn't exist on pepe.wtf (404), use media URI from Pass 1
 * 
 * Usage: node add-new-cards.js [seriesNumbers...]
 * Examples:
 *   node add-new-cards.js 19           # Scrape Series 19 only
 *   node add-new-cards.js 19 20 21     # Scrape Series 19, 20, and 21
 *   node add-new-cards.js              # Scrape all series (0-18 by default)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'src', 'data', 'fake-rares-data.json');

// Parse command line arguments
const args = process.argv.slice(2);
const seriesToScrape = args.length > 0 
  ? args.map(n => parseInt(n)) 
  : Array.from({ length: 19 }, (_, i) => i); // Default: 0-18

console.log('🚀 ADD NEW FAKE RARES CARDS\n');
console.log('='.repeat(60));
console.log(`📋 Series to scrape: ${seriesToScrape.join(', ')}\n`);

// Load existing data
let existingData = [];
if (fs.existsSync(dataPath)) {
  existingData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`📖 Loaded ${existingData.length} existing cards\n`);
}

const pass1Results = [];
const pass2Results = [];

// ============================================================
// PASS 1: Extract asset names + fallback media URIs from fakeraredirectory.com
// ============================================================

async function pass1ScrapeSeries(page, seriesNum) {
  const url = `https://fakeraredirectory.com/series-${seriesNum}/`;
  
  try {
    console.log(`\n📦 PASS 1 - Series ${seriesNum}`);
    console.log(`  Loading: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    
    const cards = await page.evaluate(() => {
      const cardsData = [];
      const figures = Array.from(document.querySelectorAll('figure'));
      
      figures.forEach(fig => {
        const seriesMatch = fig.textContent?.match(/Series\s+(\d+)\s+Card\s+(\d+)/i);
        if (!seriesMatch) return;
        
        const series = parseInt(seriesMatch[1]);
        const card = parseInt(seriesMatch[2]);
        
        const assetLink = fig.querySelector('a[href*="asset/"]') || 
                         fig.querySelector('a[href*="stamp/"]') ||
                         fig.querySelector('a[href*="/s/"]');
        if (!assetLink) return;
        
        const asset = assetLink.textContent?.trim();
        if (!asset) return;
        
        const cardData = { asset, series, card };
        
        // Try to extract media URI from fakeraredirectory (fallback only)
        // Check for video first
        const video = fig.querySelector('video');
        if (video) {
          const source = video.querySelector('source');
          if (source && source.src) {
            cardData.fallbackMediaUri = source.src;
          }
        }
        
        // Check for image if no video found
        if (!cardData.fallbackMediaUri) {
          const img = fig.querySelector('img');
          if (img && img.src) {
            cardData.fallbackMediaUri = img.src;
          }
        }
        
        cardsData.push(cardData);
      });
      
      return cardsData.sort((a, b) => a.card - b.card);
    });
    
    console.log(`  ✓ Found ${cards.length} cards`);
    return cards;
    
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return [];
  }
}

// ============================================================
// PASS 2: Extract ALL metadata from pepe.wtf (authoritative source)
// ============================================================

async function pass2ScrapeCard(page, baseCard) {
  const url = `https://pepe.wtf/asset/${baseCard.asset}`;
  
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Check if page exists
    if (!response || response.status() === 404) {
      console.log(`  ⏳ Card not yet available on pepe.wtf (404)`);
      return {
        artist: null,
        artistSlug: null,
        supply: null,
        issuance: null,
        ext: null,
        notFoundOnPepeWtf: true
      };
    }
    
    if (response.status() !== 200) {
      console.log(`  ⚠️  Unexpected status: ${response.status()}`);
      return {
        artist: null,
        artistSlug: null,
        supply: null,
        issuance: null,
        ext: null,
        httpError: response.status()
      };
    }
    
    await page.waitForTimeout(2000);
    
    // Pass assetName into the browser context
    const metadata = await page.evaluate((assetName) => {
      const data = {};
      
      // Check if page shows "ASSET NOT FOUND"
      const bodyText = document.body?.textContent || '';
      if (bodyText.includes('ASSET NOT FOUND') || bodyText.includes('Asset not found')) {
        data.assetNotFound = true;
        return data;
      }
      
      // Artist
      const artistLink = document.querySelector('a[href*="/artists/"]');
      data.artist = artistLink?.textContent?.trim() || null;
      data.artistSlug = artistLink?.getAttribute('href')?.split('/artists/')[1]?.split('/')[0] || null;
      
      // Supply (handle commas)
      let supply = null;
      const labels = Array.from(document.querySelectorAll('div, span, p'));
      for (const label of labels) {
        if (label.textContent?.trim() === 'Supply') {
          const nextEl = label.nextElementSibling || label.parentElement?.nextElementSibling;
          if (nextEl) {
            const supplyText = nextEl.textContent?.trim()?.replace(/,/g, '');
            const match = supplyText?.match(/(\d+)/);
            if (match) {
              supply = parseInt(match[1]);
              break;
            }
          }
        }
      }
      data.supply = supply;
      
      // Issuance (format: "October 2021")
      let issuance = null;
      for (const label of labels) {
        if (label.textContent?.trim() === 'Issuance') {
          const nextEl = label.nextElementSibling || label.parentElement?.nextElementSibling;
          if (nextEl) {
            const dateText = nextEl.textContent?.trim();
            const match = dateText?.match(/([A-Z][a-z]+)\s+(\d{4})/);
            if (match) {
              issuance = `${match[1]} ${match[2]}`;
              break;
            }
          }
        }
      }
      data.issuance = issuance;
      
      // Check for video (MP4)
      const video = document.querySelector('video');
      if (video) {
        const source = video.querySelector('source');
        if (source) {
          data.ext = 'mp4';
          data.videoUri = source.getAttribute('src');
          return data;
        }
      }
      
      // Check for image
      const images = Array.from(document.querySelectorAll('img'));
      for (const img of images) {
        const src = img.src || '';
        
        // Extract extension
        const extMatch = src.match(/\.(jpg|jpeg|png|gif|webp)($|\?)/i);
        if (!extMatch) continue;
        
        data.ext = extMatch[1].toLowerCase();
        if (data.ext === 'jpg') data.ext = 'jpeg';
        
        // Check if it's on tokenscan.io - ALWAYS save imageUri
        if (src.includes('tokenscan.io')) {
          data.imageUri = src;
          return data;
        }
        
        // Check if it's standard S3 path with correct asset name
        const standardS3Pattern = new RegExp(
          `https://pepewtf\\.s3\\.amazonaws\\.com/collections/fake-rares/full/\\d+/${assetName}\\.`,
          'i'
        );
        
        if (standardS3Pattern.test(src)) {
          // Standard S3 with correct name - don't save imageUri (can construct)
          return data;
        }
        
        // Non-standard path OR misspelled asset name - save imageUri
        if (src.includes('amazonaws') || src.includes('arweave') || src.includes('imgur')) {
          data.imageUri = src;
          return data;
        }
      }
      
      // No media found
      data.ext = null;
      return data;
    }, baseCard.asset);  // Pass asset name as parameter
    
    // Treat "ASSET NOT FOUND" same as 404
    if (metadata.assetNotFound) {
      console.log(`  ⏳ Asset not found on pepe.wtf (page shows "ASSET NOT FOUND")`);
      return {
        artist: null,
        artistSlug: null,
        supply: null,
        issuance: null,
        ext: null,
        notFoundOnPepeWtf: true
      };
    }
    
    return metadata;
    
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return {
      artist: null,
      artistSlug: null,
      supply: null,
      issuance: null,
      ext: null,
      scrapingError: true
    };
  }
}

// ============================================================
// MAIN EXECUTION
// ============================================================

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  
  // ========== PASS 1 ==========
  console.log('\n' + '='.repeat(60));
  console.log('PASS 1: Extracting asset names from fakeraredirectory');
  console.log('='.repeat(60));
  
  for (const seriesNum of seriesToScrape) {
    const seriesCards = await pass1ScrapeSeries(page, seriesNum);
    pass1Results.push(...seriesCards);
  }
  
  console.log(`\n✅ PASS 1 Complete: ${pass1Results.length} cards collected\n`);
  
  // Split cards into two groups:
  // 1. Brand new cards (not in database at all)
  // 2. Existing cards with issues (need re-scraping)
  const newCards = [];
  const cardsToRescrape = [];
  
  for (const card of pass1Results) {
    const existingCard = existingData.find(existing => 
      existing.asset === card.asset && 
      existing.series === card.series && 
      existing.card === card.card
    );
    
    if (!existingCard) {
      // Brand new card
      newCards.push(card);
    } else if (existingCard.issues && existingCard.issues.length > 0) {
      // Existing card with issues - mark for re-scraping
      cardsToRescrape.push(card);
    }
  }
  
  const totalToProcess = newCards.length + cardsToRescrape.length;
  
  if (totalToProcess === 0) {
    console.log('ℹ️  No new cards and no cards with issues to re-scrape\n');
    await browser.close();
    return;
  }
  
  console.log(`📌 Found ${newCards.length} NEW cards to add`);
  if (cardsToRescrape.length > 0) {
    console.log(`🔄 Found ${cardsToRescrape.length} existing cards with issues to re-scrape`);
  }
  console.log();
  
  // ========== PASS 2 ==========
  console.log('='.repeat(60));
  console.log('PASS 2: Extracting metadata from pepe.wtf');
  console.log('='.repeat(60) + '\n');
  
  // Process both new cards and cards to re-scrape
  const allCardsToProcess = [
    ...newCards.map(c => ({ ...c, isNew: true })),
    ...cardsToRescrape.map(c => ({ ...c, isNew: false }))
  ];
  
  for (let i = 0; i < allCardsToProcess.length; i++) {
    const card = allCardsToProcess[i];
    const label = card.isNew ? '🆕 NEW' : '🔄 UPDATE';
    
    console.log(`[${i + 1}/${allCardsToProcess.length}] ${label} ${card.asset} - S${card.series} C${card.card}`);
    
    const metadata = await pass2ScrapeCard(page, card);
    
    const fullCard = {
      asset: card.asset,
      series: card.series,
      card: card.card,
      ext: metadata.ext,
      artist: metadata.artist,
      artistSlug: metadata.artistSlug,
      supply: metadata.supply,
      issuance: metadata.issuance
    };
    
    // Add media URIs from pepe.wtf if available
    if (metadata.videoUri) {
      fullCard.videoUri = metadata.videoUri;
    }
    
    if (metadata.imageUri) {
      fullCard.imageUri = metadata.imageUri;
    }
    
    // Track issues
    const issues = [];
    
    // Determine if we should use fallback (404, error, or page exists but no data)
    const shouldUseFallback = metadata.notFoundOnPepeWtf || 
                              metadata.httpError || 
                              metadata.scrapingError ||
                              !metadata.ext; // Page exists but no media found
    
    // Check for page availability issues first
    if (metadata.notFoundOnPepeWtf) {
      issues.push('not_on_pepe_wtf');
    } else if (metadata.httpError) {
      issues.push(`http_error_${metadata.httpError}`);
    } else if (metadata.scrapingError) {
      issues.push('scraping_error');
    }
    
    // Use fallback media URI if needed
    if (shouldUseFallback && card.fallbackMediaUri) {
      // Determine if it's video or image based on URL
      const isVideo = card.fallbackMediaUri.match(/\.(mp4|webm|mov)($|\?)/i);
      if (isVideo) {
        fullCard.videoUri = card.fallbackMediaUri;
        fullCard.ext = 'mp4';
        console.log(`  📦 Using fallback video from fakeraredirectory`);
      } else {
        fullCard.imageUri = card.fallbackMediaUri;
        // Try to extract extension from URL
        const extMatch = card.fallbackMediaUri.match(/\.(jpg|jpeg|png|gif|webp)($|\?)/i);
        if (extMatch) {
          fullCard.ext = extMatch[1].toLowerCase();
          if (fullCard.ext === 'jpg') fullCard.ext = 'jpeg';
        }
        console.log(`  📦 Using fallback image from fakeraredirectory`);
      }
    }
    
    // Check for missing metadata (all from pepe.wtf)
    if (!metadata.artist) issues.push('no_artist');
    if (!metadata.supply) issues.push('no_supply');
    if (!metadata.issuance) issues.push('no_issuance');
    if (!fullCard.ext) issues.push('no_extension');
    
    if (issues.length > 0) {
      fullCard.issues = issues;
      console.log(`  ⚠️  Issues: ${issues.join(', ')}`);
    } else {
      console.log(`  ✅ Complete`);
    }
    
    pass2Results.push(fullCard);
    
    await page.waitForTimeout(300);
  }
  
  await browser.close();
  
  // ========== SAVE ==========
  console.log('\n' + '='.repeat(60));
  console.log('💾 Saving to database');
  console.log('='.repeat(60) + '\n');
  
  // Remove old versions of cards we're updating
  let updatedData = existingData.filter(existing => {
    return !pass2Results.some(newCard => 
      newCard.asset === existing.asset && 
      newCard.series === existing.series && 
      newCard.card === existing.card
    );
  });
  
  // Add new/updated cards
  updatedData = [...updatedData, ...pass2Results];
  
  // Sort by series then card
  updatedData.sort((a, b) => {
    if (a.series !== b.series) return a.series - b.series;
    return a.card - b.card;
  });
  
  fs.writeFileSync(dataPath, JSON.stringify(updatedData, null, 2), 'utf-8');
  
  console.log(`✅ Added ${newCards.length} new cards`);
  if (cardsToRescrape.length > 0) {
    console.log(`🔄 Updated ${cardsToRescrape.length} cards (resolved issues)`);
  }
  console.log(`📦 Total cards in database: ${updatedData.length}`);
  console.log(`💾 Saved to: ${dataPath}\n`);
  
  // Note: Embeddings need to be generated for new cards
  if (newCards.length > 0) {
    console.log(`\n💡 Run embedding generation for ${newCards.length} new card(s):`);
    console.log(`   bun run scripts/generate-card-embeddings.js "${newCards.map(c => c.asset).join(' ')}"`);
  }
  
  // Summary of remaining issues
  const stillWithIssues = pass2Results.filter(c => c.issues && c.issues.length > 0);
  const resolvedIssues = cardsToRescrape.length - stillWithIssues.filter(c => !c.isNew).length;
  
  if (resolvedIssues > 0) {
    console.log(`✨ Resolved issues for ${resolvedIssues} card(s)!`);
  }
  if (stillWithIssues.length > 0) {
    console.log(`⚠️  ${stillWithIssues.length} card(s) still have issues - may need manual review`);
  }
  
  console.log('\n✅ Complete!\n');
})();

