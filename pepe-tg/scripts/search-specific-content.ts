#!/usr/bin/env bun
/**
 * Search for specific content in the database
 * Usage: bun run scripts/search-specific-content.ts
 */

import { PGlite } from '@electric-sql/pglite';
import { join } from 'path';

const DB_PATH = join(process.cwd(), '.eliza', '.elizadb');

async function main() {
  console.log('🔍 Searching for Matt Furie biographical content...\n');
  
  try {
    console.log('⏳ Opening database (may take a moment)...');
    
    // Try with waitForLock option to handle concurrent access
    const db = new PGlite(DB_PATH, {
      waitForLock: false,
      maxWaitingClients: 0  // Don't queue if locked
    });
    
    // Wait for database to be ready
    await db;
    console.log('✅ Database ready\n');
    
    // Search for specific Matt Furie facts from the wiki
    const searches = [
      { term: 'Columbus, Ohio', description: 'Birthplace' },
      { term: 'Ohio Wesleyan University', description: 'University' },
      { term: 'Award of Merit', description: 'High school award' },
      { term: 'Boy\'s Club', description: 'Comic series' },
      { term: 'The Night Riders', description: 'Children\'s book' },
      { term: 'Feels Good Man', description: 'Documentary' },
      { term: 'Fantagraphics', description: 'Publisher' },
    ];
    
    for (const search of searches) {
      const result = await db.query(`
        SELECT 
          type,
          LEFT(content::text, 200) as preview
        FROM memories
        WHERE content::text ILIKE '%${search.term}%'
        LIMIT 3
      `);
      
      if (result.rows.length > 0) {
        console.log(`✅ FOUND "${search.term}" (${search.description}): ${result.rows.length} matches`);
        result.rows.forEach((row: any, i: number) => {
          console.log(`   [${row.type}] ${row.preview.substring(0, 80).replace(/\n/g, ' ')}...`);
        });
      } else {
        console.log(`❌ NOT FOUND: "${search.term}" (${search.description})`);
      }
      console.log('');
    }
    
    // Also check for the full wiki page title
    console.log('\n📖 Checking for "The Creator: Matt Furie" wiki page...');
    const titleResult = await db.query(`
      SELECT 
        type,
        LEFT(content::text, 300) as preview
      FROM memories
      WHERE content::text LIKE '%The Creator%Matt Furie%'
         OR content::text LIKE '%Matt Furie was born%'
      LIMIT 5
    `);
    
    if (titleResult.rows.length > 0) {
      console.log(`✅ Found ${titleResult.rows.length} entries with Matt Furie biography:\n`);
      titleResult.rows.forEach((row: any, i: number) => {
        console.log(`   ${i+1}. [${row.type}]`);
        console.log(`      ${row.preview.substring(0, 150).replace(/\n/g, ' ')}...`);
        console.log('');
      });
    } else {
      console.log('❌ Matt Furie biography page NOT found in database');
      console.log('   This means the wiki page was not embedded\n');
    }
    
    await db.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();

