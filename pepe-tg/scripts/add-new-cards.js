#!/usr/bin/env node
/**
 * ADD NEW FAKE RARES CARDS
 * 
 * This script performs a complete 2-pass data collection for new Fake Rares cards:
 * 
 * PASS 1: Collect basic structure (asset, series, card) from fakeraredirectory.com
 * PASS 2: Scrape detailed metadata from pepe.wtf (artist, supply, issuance, media)
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
const dataPath = path.join(__dirname, 'src', 'data', 'fake-rares-data.json');

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
// PASS 1: Collect basic card structure from fakeraredirectory.com
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
        
        cardsData.push({ asset, series, card });
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
// PASS 2: Scrape detailed metadata from pepe.wtf
// ============================================================

async function pass2ScrapeCard(page, baseCard) {
  const url = `https://pepe.wtf/asset/${baseCard.asset}`;
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const metadata = await page.evaluate(() => {
      const data = {};
      
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
      
      // Check for image from S3
      const images = Array.from(document.querySelectorAll('img'));
      for (const img of images) {
        const src = img.src || '';
        if (src.includes('amazonaws') && src.includes('/fake-rares/')) {
          const extMatch = src.match(/\.(jpg|jpeg|png|gif)($|\?)/i);
          if (extMatch) {
            data.ext = extMatch[1].toLowerCase();
            if (data.ext === 'jpg') data.ext = 'jpeg';
            return data;
          }
        }
      }
      
      // No media found
      data.ext = null;
      return data;
    });
    
    return metadata;
    
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return {
      artist: null,
      artistSlug: null,
      supply: null,
      issuance: null,
      ext: null
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
  console.log('PASS 1: Collecting basic card structure');
  console.log('='.repeat(60));
  
  for (const seriesNum of seriesToScrape) {
    const seriesCards = await pass1ScrapeSeries(page, seriesNum);
    pass1Results.push(...seriesCards);
  }
  
  console.log(`\n✅ PASS 1 Complete: ${pass1Results.length} cards collected\n`);
  
  // Filter out cards that already exist
  const newCards = pass1Results.filter(newCard => {
    return !existingData.some(existing => 
      existing.asset === newCard.asset && 
      existing.series === newCard.series && 
      existing.card === newCard.card
    );
  });
  
  if (newCards.length === 0) {
    console.log('ℹ️  No new cards found - all cards already in database\n');
    await browser.close();
    return;
  }
  
  console.log(`📌 Found ${newCards.length} NEW cards to add\n`);
  
  // ========== PASS 2 ==========
  console.log('='.repeat(60));
  console.log('PASS 2: Scraping detailed metadata from pepe.wtf');
  console.log('='.repeat(60) + '\n');
  
  for (let i = 0; i < newCards.length; i++) {
    const card = newCards[i];
    
    console.log(`[${i + 1}/${newCards.length}] ${card.asset} - S${card.series} C${card.card}`);
    
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
    
    // Add videoUri if it's an MP4
    if (metadata.videoUri) {
      fullCard.videoUri = metadata.videoUri;
    }
    
    // Track issues
    const issues = [];
    if (!metadata.artist) issues.push('no_artist');
    if (!metadata.supply) issues.push('no_supply');
    if (!metadata.issuance) issues.push('no_issuance');
    if (!metadata.ext) issues.push('no_extension');
    
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
  console.log('💾 Saving new cards to database');
  console.log('='.repeat(60) + '\n');
  
  // Merge with existing data
  const updatedData = [...existingData, ...pass2Results];
  
  // Sort by series then card
  updatedData.sort((a, b) => {
    if (a.series !== b.series) return a.series - b.series;
    return a.card - b.card;
  });
  
  fs.writeFileSync(dataPath, JSON.stringify(updatedData, null, 2), 'utf-8');
  
  console.log(`✅ Added ${pass2Results.length} new cards`);
  console.log(`📦 Total cards in database: ${updatedData.length}`);
  console.log(`💾 Saved to: ${dataPath}\n`);
  
  // Summary
  const withIssues = pass2Results.filter(c => c.issues && c.issues.length > 0);
  if (withIssues.length > 0) {
    console.log(`⚠️  ${withIssues.length} new cards have issues - may need manual review`);
  }
  
  console.log('\n✅ Complete!\n');
})();

