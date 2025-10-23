#!/usr/bin/env node

/**
 * Add Meme URIs for MP4 Cards (Playwright Version)
 * 
 * Uses Playwright to scrape tokenscan.io for static image/gif versions of MP4 cards
 * Adds "memeUri" field to fake-rares-data.json for use with /fv visual analysis
 * 
 * Strategy:
 * 1. Filter cards where ext === "mp4"
 * 2. Visit https://tokenscan.io/asset/ASSETNAME with Playwright
 * 3. Wait for JavaScript to load media
 * 4. Extract from Images section (large) - PRIORITY
 * 5. Fallback to GIF if no static image
 * 6. Add memeUri to card data
 * 
 * Usage:
 *   node scripts/add-meme-uris-playwright.js           # Process all MP4 cards
 *   node scripts/add-meme-uris-playwright.js --dry-run # Preview without saving
 *   node scripts/add-meme-uris-playwright.js --limit 5 # Test with first 5 cards
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'src/data/fake-rares-data.json');
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1]) || null;

// Stats tracking
const stats = {
  totalMP4s: 0,
  foundPng: 0,
  foundJpg: 0,
  foundJpeg: 0,
  foundGif: 0,
  notFound: 0,
  alreadyHasMemeUri: 0,
  errors: 0
};

const notFoundAssets = [];

/**
 * Extract media URI from tokenscan page using Playwright
 */
async function fetchMemeUri(page, assetName) {
  const url = `https://tokenscan.io/asset/${assetName}`;
  
  try {
    console.log(`  Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    
    // Wait a bit for dynamic content to load
    await page.waitForTimeout(1500);
    
    // Extract all media from page
    const media = await page.evaluate(() => {
      const results = {
        largeImage: null,
        digitalImage: null,
        gif: null
      };
      
      // Helper to check if URL is valid (not icon, logo, or thumb)
      const isValidMedia = (url) => {
        if (!url) return false;
        const lower = url.toLowerCase();
        // Reject icons, logos, thumbs, XCP, etc.
        if (lower.includes('/icon/') || lower.includes('logo') || 
            lower.includes('thumb') || lower.includes('xcp.')) {
          return false;
        }
        // Must be arweave, tokenscan/img/cards, or similar legitimate sources
        return lower.includes('arweave.net') || 
               lower.includes('tokenscan.io/img/cards') ||
               lower.includes('tokenscan.io/content') ||
               lower.includes('ipfs.io') ||
               lower.includes('s10.gifyu.com');
      };
      
      // Strategy 1: Check Images table for "large" row
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const label = cells[0].textContent.trim();
            const link = cells[1].querySelector('a');
            
            if (link && link.href) {
              const href = link.href;
              if (!isValidMedia(href)) continue;
              
              const match = href.match(/\.(png|jpg|jpeg|gif)$/i);
              if (match) {
                const type = match[1].toLowerCase();
                
                if (label === 'large' && type !== 'gif' && !results.largeImage) {
                  results.largeImage = { url: href, type };
                }
              }
            }
          }
        }
      }
      
      // Strategy 2: Check all img tags on page (Digital Image section, etc.)
      const allImgs = document.querySelectorAll('img');
      for (const img of allImgs) {
        if (!img.src || !isValidMedia(img.src)) continue;
        
        const match = img.src.match(/\.(png|jpg|jpeg|gif)$/i);
        if (match) {
          const type = match[1].toLowerCase();
          
          // Prefer static images over gifs
          if (type !== 'gif' && !results.digitalImage) {
            results.digitalImage = { url: img.src, type };
          } else if (type === 'gif' && !results.gif) {
            results.gif = { url: img.src, type: 'gif' };
          }
        }
      }
      
      // Strategy 3: Check all links to images
      const allLinks = document.querySelectorAll('a[href]');
      for (const link of allLinks) {
        if (!link.href || !isValidMedia(link.href)) continue;
        
        const match = link.href.match(/\.(png|jpg|jpeg|gif)$/i);
        if (match) {
          const type = match[1].toLowerCase();
          
          if (type !== 'gif' && !results.digitalImage) {
            results.digitalImage = { url: link.href, type };
          } else if (type === 'gif' && !results.gif) {
            results.gif = { url: link.href, type: 'gif' };
          }
        }
      }
      
      return results;
    });
    
    // PRIORITY 1: Large static image from Images table (best quality)
    if (media.largeImage) {
      console.log(`  ✅ Found ${media.largeImage.type.toUpperCase()} (Images table - large): ${media.largeImage.url}`);
      return { uri: media.largeImage.url, type: media.largeImage.type };
    }
    
    // PRIORITY 2: Any static image (jpg/png/jpeg) from Digital Image or Images section
    if (media.digitalImage) {
      console.log(`  ✅ Found ${media.digitalImage.type.toUpperCase()} (static image): ${media.digitalImage.url}`);
      return { uri: media.digitalImage.url, type: media.digitalImage.type };
    }
    
    // PRIORITY 3: GIF as fallback
    if (media.gif) {
      console.log(`  ✅ Found GIF (animated fallback): ${media.gif.url}`);
      return { uri: media.gif.url, type: 'gif' };
    }
    
    console.log(`  ❌ No static media found`);
    return null;
    
  } catch (error) {
    console.log(`  ⚠️  Error: ${error.message}`);
    stats.errors++;
    return null;
  }
}

/**
 * Add delay between requests
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Scraping Tokenscan for MP4 Card Meme URIs (Playwright)\n');
  console.log(`📄 Data file: ${DATA_FILE}`);
  console.log(`🏃 Mode: ${DRY_RUN ? 'DRY RUN (no changes saved)' : 'LIVE (will update file)'}`);
  if (LIMIT) console.log(`🔢 Limit: Processing first ${LIMIT} cards only`);
  console.log('');
  
  // Load data
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`📦 Loaded ${data.length} cards total\n`);
  
  // Filter MP4 cards
  let mp4Cards = data.filter(card => card.ext === 'mp4');
  stats.totalMP4s = mp4Cards.length;
  
  if (LIMIT) {
    mp4Cards = mp4Cards.slice(0, LIMIT);
    console.log(`🎬 Processing ${mp4Cards.length} of ${stats.totalMP4s} MP4 cards (limited)\n`);
  } else {
    console.log(`🎬 Found ${mp4Cards.length} MP4 cards to process\n`);
  }
  
  console.log('━'.repeat(60));
  
  // Launch browser
  console.log('\n🌐 Launching browser...\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  // Process each MP4 card
  for (let i = 0; i < mp4Cards.length; i++) {
    const card = mp4Cards[i];
    const progress = `[${i + 1}/${mp4Cards.length}]`;
    
    console.log(`\n${progress} ${card.asset} (Series ${card.series})`);
    
    // Skip if already has memeUri
    if (card.memeUri) {
      console.log(`  ⏭️  Already has memeUri: ${card.memeUri}`);
      stats.alreadyHasMemeUri++;
      continue;
    }
    
    // Fetch from tokenscan
    const result = await fetchMemeUri(page, card.asset);
    
    if (result) {
      // Update card in main data array
      const cardIndex = data.findIndex(c => c.asset === card.asset);
      if (cardIndex !== -1) {
        data[cardIndex].memeUri = result.uri;
        
        // Track stats
        if (result.type === 'gif') stats.foundGif++;
        else if (result.type === 'jpeg') stats.foundJpeg++;
        else if (result.type === 'jpg') stats.foundJpg++;
        else if (result.type === 'png') stats.foundPng++;
      }
    } else {
      stats.notFound++;
      notFoundAssets.push(card.asset);
    }
    
    // Delay between requests
    if (i < mp4Cards.length - 1) {
      await delay(500); // 500ms delay
    }
  }
  
  // Close browser
  await browser.close();
  
  console.log('\n' + '━'.repeat(60));
  console.log('\n📊 SCRAPING RESULTS\n');
  console.log(`Total MP4 cards:        ${stats.totalMP4s}${LIMIT ? ` (processed ${mp4Cards.length})` : ''}`);
  console.log(`Already had memeUri:    ${stats.alreadyHasMemeUri}`);
  console.log(`Found PNG:              ${stats.foundPng}`);
  console.log(`Found JPG:              ${stats.foundJpg}`);
  console.log(`Found JPEG:             ${stats.foundJpeg}`);
  console.log(`Found GIF:              ${stats.foundGif}`);
  console.log(`Not found:              ${stats.notFound}`);
  console.log(`Errors:                 ${stats.errors}`);
  
  const totalFound = stats.foundPng + stats.foundJpg + stats.foundJpeg + stats.foundGif;
  console.log(`\n✅ Total new memeUris:  ${totalFound}`);
  
  if (notFoundAssets.length > 0 && notFoundAssets.length <= 20) {
    console.log(`\n❌ Assets without static media (${notFoundAssets.length}):`);
    notFoundAssets.forEach(asset => console.log(`   - ${asset}`));
  } else if (notFoundAssets.length > 20) {
    console.log(`\n❌ ${notFoundAssets.length} assets without static media (showing first 20):`);
    notFoundAssets.slice(0, 20).forEach(asset => console.log(`   - ${asset}`));
    console.log(`   ... and ${notFoundAssets.length - 20} more`);
  }
  
  // Save updated data
  if (!DRY_RUN && totalFound > 0) {
    console.log(`\n💾 Saving updated data to ${DATA_FILE}...`);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log('✅ File saved successfully!');
  } else if (DRY_RUN) {
    console.log(`\n⏭️  DRY RUN - No changes saved`);
    console.log(`   Run without --dry-run to save changes`);
  } else {
    console.log(`\n⏭️  No new memeUris found - nothing to save`);
  }
  
  console.log('\n✨ Done!\n');
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

