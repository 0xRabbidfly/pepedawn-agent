#!/usr/bin/env bun
/**
 * Count knowledge entries by source type
 * Usage: bun run scripts/count-knowledge.ts
 */

import { PGlite } from '@electric-sql/pglite';
import { join } from 'path';

const DB_PATH = join(process.cwd(), '.eliza', '.elizadb');

async function main() {
  console.log('🔍 Querying PGlite knowledge database...\n');
  console.log(`Database: ${DB_PATH}\n`);
  
  try {
    const db = new PGlite(DB_PATH);
    
    // First, list all tables to see what exists
    console.log('🔍 Checking available tables...\n');
    const tablesResult = await db.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    
    console.log('Available tables:');
    tablesResult.rows.forEach((row: any) => {
      console.log(`   - ${row.tablename}`);
    });
    console.log('');
    
    // Check if knowledge table exists
    const hasKnowledge = tablesResult.rows.some((row: any) => row.tablename === 'knowledge');
    
    if (!hasKnowledge) {
      console.log('⚠️  Knowledge table does not exist - checking "memories" table instead...\n');
    }
    
    const TABLE_NAME = hasKnowledge ? 'knowledge' : 'memories';
    
    // Get total count
    const totalResult = await db.query(`SELECT COUNT(*) as count FROM ${TABLE_NAME}`);
    const total = totalResult.rows[0]?.count || 0;
    console.log(`📊 Total ${TABLE_NAME} entries: ${total}\n`);
    
    // Check content structure (type can vary)
    const sampleResult = await db.query(`
      SELECT 
        type,
        content::text as content_text,
        LEFT(content::text, 100) as preview
      FROM ${TABLE_NAME}
      LIMIT 3
    `);
    
    console.log('Sample entries structure:');
    sampleResult.rows.forEach((row: any, i: number) => {
      console.log(`   ${i+1}. Type: ${row.type}`);
      console.log(`      Preview: ${row.preview}...\n`);
    });
    
    // Count by type
    const typeResult = await db.query(`
      SELECT 
        type,
        COUNT(*) as count
      FROM ${TABLE_NAME}
      GROUP BY type
      ORDER BY count DESC
    `);
    
    console.log('📈 Breakdown by type:');
    typeResult.rows.forEach((row: any) => {
      console.log(`   ${row.type || 'null'}: ${row.count}`);
    });
    
    // Analyze documents (wiki pages)
    console.log('\n📚 Analyzing wiki documents (type="documents")...');
    const docsCountResult = await db.query(`
      SELECT COUNT(*) as count
      FROM ${TABLE_NAME}
      WHERE type = 'documents'
    `);
    const docsCount = docsCountResult.rows[0]?.count || 0;
    console.log(`   Total document fragments: ${docsCount}`);
    
    // Get sample documents to see what they look like
    const docSamplesResult = await db.query(`
      SELECT 
        LEFT(content::text, 120) as preview
      FROM ${TABLE_NAME}
      WHERE type = 'documents'
      LIMIT 15
    `);
    
    console.log(`\n   Sample document entries:\n`);
    docSamplesResult.rows.forEach((row: any, i: number) => {
      const text = row.preview.replace(/\n/g, ' ').substring(0, 100);
      console.log(`   ${i+1}. ${text}...`);
    });
    
    // Search for actual wiki pages (look for markdown headers, Book of Kek text, etc.)
    console.log('\n📖 Searching for pepe.wtf wiki content in knowledge entries...');
    const wikiContentResult = await db.query(`
      SELECT 
        type,
        LEFT(content::text, 150) as preview
      FROM ${TABLE_NAME}
      WHERE type = 'knowledge'
        AND (
          content::text LIKE '%# The Book of Kek%'
          OR content::text LIKE '%wiki.pepe.wtf%'
          OR content::text LIKE '%Matt Furie%'
          OR content::text LIKE '%Rare Pepe Directory%'
          OR content::text LIKE '%FREEDOMKEK is%'
        )
      LIMIT 20
    `);
    
    console.log(`   Found ${wikiContentResult.rows.length} wiki-like knowledge entries:\n`);
    wikiContentResult.rows.forEach((row: any, i: number) => {
      const text = row.preview.replace(/\\n/g, ' ').substring(0, 100);
      console.log(`   ${i+1}. ${text}...`);
    });
    
    // Check for user memories (with our marker)
    console.log('\n💭 User memories with [MEMORY:...] marker:');
    const memoriesResult = await db.query(`
      SELECT 
        type,
        LEFT(content::text, 120) as text_preview
      FROM ${TABLE_NAME}
      WHERE content::text LIKE '%[MEMORY:%'
      ORDER BY "createdAt" DESC
      LIMIT 5
    `);
    
    if (memoriesResult.rows.length > 0) {
      console.log(`   Found ${memoriesResult.rows.length} user memories:\n`);
      memoriesResult.rows.forEach((mem: any, i: number) => {
        console.log(`   ${i+1}. ${mem.text_preview}...`);
      });
    } else {
      console.log('   No user memories found yet');
    }
    
    await db.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('\nNote: Make sure the bot has run at least once to create the database');
    process.exit(1);
  }
}

main();

