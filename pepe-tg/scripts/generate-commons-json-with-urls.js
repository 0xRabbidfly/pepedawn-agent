#!/usr/bin/env node
/**
 * Generate Fake Commons JSON with S3 URLs (no downloads)
 * Matches the structure of fake-rares-data.json
 */

import https from 'https';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_JSON = path.join(__dirname, '../src/data/fake-commons-data.json');

// Fetch from API
async function fetchAPI() {
  return new Promise((resolve, reject) => {
    https.get('https://api.pepe.wtf/api/asset?collection=fake-commons', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Test if URL is accessible
async function testUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

async function main() {
  console.log('🔍 Fetching API data...\n');
  const apiData = await fetchAPI();
  
  console.log(`✅ Fetched ${apiData.length} assets from API\n`);
  
  // Test a few URLs first
  console.log('🧪 Testing S3 URL reliability...\n');
  const testSamples = apiData.slice(0, 5);
  
  for (const asset of testSamples) {
    const url = `https://pepewtf.s3.amazonaws.com/collections/fake-commons/full/${asset.serie}/${asset.image}`;
    const works = await testUrl(url);
    console.log(`  ${works ? '✅' : '❌'} S${asset.serie} ${asset.name}: ${works ? 'OK' : 'FAILED'}`);
  }
  
  // Convert to our format with URLs
  const output = [];
  
  for (const asset of apiData) {
    const ext = path.extname(asset.image).substring(1); // remove leading dot
    const assetName = asset.name;
    const imageUrl = `https://pepewtf.s3.amazonaws.com/collections/fake-commons/full/${asset.serie}/${asset.image}`;
    
    const entry = {
      asset: assetName,
      series: asset.serie,
      card: asset.card,
      ext: ext,
      artist: asset.artist?.name || '',
      artistSlug: asset.artist?.slug || '',
      supply: asset.supply || 0,
      issuance: '' // Placeholder to fill in later
    };
    
    // Add imageUri field (matches fake-rares-data.json structure)
    // For MP4s, we'd add videoUri, but the API shows image field has extensions like .gif/.jpg
    // If it's an animation format, store as imageUri
    if (ext === 'mp4') {
      entry.videoUri = imageUrl;
    } else {
      entry.imageUri = imageUrl;
    }
    
    output.push(entry);
  }
  
  // Save JSON
  const outputDir = path.dirname(OUTPUT_JSON);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(output, null, 2));
  
  console.log(`\n✅ Generated ${output.length} assets in ${OUTPUT_JSON}`);
  console.log(`\n📊 Summary:`);
  console.log(`   Total assets: ${output.length}`);
  console.log(`   Series range: ${Math.min(...output.map(a => a.series))} - ${Math.max(...output.map(a => a.series))}`);
  console.log(`   Extensions: ${[...new Set(output.map(a => a.ext))].join(', ')}`);
  
  // Show sample
  console.log(`\n📄 Sample entry:`);
  console.log(JSON.stringify(output[0], null, 2));
}

main().catch(console.error);

