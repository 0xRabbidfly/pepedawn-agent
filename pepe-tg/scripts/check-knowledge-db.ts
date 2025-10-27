/**
 * Quick script to query knowledge database and count entries by source
 * Usage: bun run scripts/check-knowledge-db.ts
 */

import { createAgentRuntime } from '@elizaos/core';
import { character } from '../src/pepedawn';

async function checkKnowledgeDB() {
  console.log('🔍 Checking knowledge database...\n');
  
  try {
    // Create runtime (minimal setup, no bot connection)
    const runtime = await createAgentRuntime({
      ...character,
      serverUrl: 'http://localhost:3000',
      databaseAdapter: undefined as any, // Will use default
    });
    
    // Query all knowledge entries
    const allKnowledge = await (runtime as any).searchMemories({
      tableName: 'knowledge',
      roomId: undefined, // Global
      query: '', // Empty query = get all
      count: 10000, // Large number to get all
      match_threshold: 0, // Include everything
    });
    
    console.log(`📊 Total knowledge entries: ${allKnowledge?.length || 0}\n`);
    
    if (allKnowledge && allKnowledge.length > 0) {
      // Count by source type
      const sourceTypes: Record<string, number> = {};
      const wikiPages: Set<string> = new Set();
      
      for (const entry of allKnowledge) {
        const text = entry.content?.text || entry.text || '';
        
        // Detect source type
        let sourceType = 'unknown';
        
        // Check for memory marker
        if (text.startsWith('[MEMORY:')) {
          sourceType = 'memory';
        } else if (entry.metadata?.source === 'telegram' || text.includes('"from_id":')) {
          sourceType = 'telegram';
        } else {
          sourceType = 'wiki';
          // Extract wiki page name from content
          const lines = text.split('\n');
          if (lines[0]) {
            wikiPages.add(lines[0].substring(0, 50));
          }
        }
        
        sourceTypes[sourceType] = (sourceTypes[sourceType] || 0) + 1;
      }
      
      console.log('📈 Breakdown by source:');
      console.log(`   Wiki entries: ${sourceTypes.wiki || 0}`);
      console.log(`   Telegram entries: ${sourceTypes.telegram || 0}`);
      console.log(`   Memory entries: ${sourceTypes.memory || 0}`);
      console.log(`   Unknown: ${sourceTypes.unknown || 0}\n`);
      
      if (wikiPages.size > 0) {
        console.log(`📚 Unique wiki pages detected: ${wikiPages.size}`);
        console.log('\nSample wiki pages:');
        Array.from(wikiPages).slice(0, 10).forEach(page => {
          console.log(`   - ${page}...`);
        });
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error querying database:', error);
    process.exit(1);
  }
}

checkKnowledgeDB();

