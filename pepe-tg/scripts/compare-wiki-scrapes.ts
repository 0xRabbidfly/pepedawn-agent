#!/usr/bin/env bun
/**
 * Compare old and new wiki scrapes
 * 
 * Shows:
 * - New pages found
 * - Pages that exist in both (size changes)
 * - Missing pages
 * 
 * Usage: bun run scripts/compare-wiki-scrapes.ts
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';

const OLD_DIR = join(process.cwd(), '..', 'backups', 'docs-pepe-wtf-wiki');
const NEW_DIR = join(process.cwd(), '..', 'backups', 'docs-pepe-wtf-wiki-deep');

interface FileInfo {
  name: string;
  path: string;
  size: number;
  contentPreview: string;
}

async function getFiles(dir: string): Promise<Map<string, FileInfo>> {
  const files = new Map<string, FileInfo>();
  
  try {
    const entries = await readdir(dir);
    
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      
      const path = join(dir, entry);
      const stats = await stat(path);
      const content = await readFile(path, 'utf-8');
      
      // Extract title from first line
      const lines = content.split('\n');
      const title = lines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || entry;
      
      // Get content preview (first 150 chars after title)
      const textStart = content.indexOf('\n\n') + 2;
      const preview = content.substring(textStart, textStart + 150).trim();
      
      files.set(entry, {
        name: entry,
        path,
        size: stats.size,
        contentPreview: preview
      });
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

function extractTopics(files: Map<string, FileInfo>): Set<string> {
  const topics = new Set<string>();
  
  files.forEach((file, name) => {
    // Extract base topic from filename (remove _NNN.md suffix)
    const base = name.replace(/_\d{3}\.md$/, '');
    topics.add(base);
  });
  
  return topics;
}

async function main() {
  console.log('🔍 Comparing Wiki Scrapes\n');
  console.log(`📁 Old scrape: ${OLD_DIR}`);
  console.log(`📁 New scrape: ${NEW_DIR}\n`);
  
  const oldFiles = await getFiles(OLD_DIR);
  const newFiles = await getFiles(NEW_DIR);
  
  console.log(`📊 Old scrape: ${oldFiles.size} files`);
  console.log(`📊 New scrape: ${newFiles.size} files\n`);
  
  // Extract topics
  const oldTopics = extractTopics(oldFiles);
  const newTopics = extractTopics(newFiles);
  
  // Find new topics
  const newOnlyTopics = new Set([...newTopics].filter(t => !oldTopics.has(t)));
  const oldOnlyTopics = new Set([...oldTopics].filter(t => !newTopics.has(t)));
  const commonTopics = new Set([...oldTopics].filter(t => newTopics.has(t)));
  
  // New content found
  if (newOnlyTopics.size > 0) {
    console.log(`\n🆕 NEW TOPICS FOUND (${newOnlyTopics.size}):`);
    console.log('=' .repeat(60));
    
    const sorted = [...newOnlyTopics].sort();
    sorted.forEach(topic => {
      const matchingFiles = [...newFiles.keys()].filter(f => f.startsWith(topic));
      console.log(`\n📄 ${topic}`);
      console.log(`   Files: ${matchingFiles.length}`);
      
      matchingFiles.slice(0, 2).forEach(file => {
        const info = newFiles.get(file)!;
        console.log(`   - ${file} (${info.size} bytes)`);
        console.log(`     "${info.contentPreview.substring(0, 80)}..."`);
      });
    });
  }
  
  // Missing from new scrape
  if (oldOnlyTopics.size > 0) {
    console.log(`\n⚠️  TOPICS MISSING FROM NEW SCRAPE (${oldOnlyTopics.size}):`);
    console.log('=' .repeat(60));
    
    const sorted = [...oldOnlyTopics].sort().slice(0, 20);
    sorted.forEach(topic => {
      console.log(`  - ${topic}`);
    });
    
    if (oldOnlyTopics.size > 20) {
      console.log(`  ... and ${oldOnlyTopics.size - 20} more`);
    }
  }
  
  // Common topics (size changes)
  if (commonTopics.size > 0) {
    console.log(`\n📊 COMMON TOPICS (${commonTopics.size}):`);
    console.log('=' .repeat(60));
    
    const withChanges: Array<{topic: string, oldSize: number, newSize: number}> = [];
    
    commonTopics.forEach(topic => {
      const oldFiles = [...oldFiles.keys()].filter(f => f.startsWith(topic));
      const newFiles_arr = [...newFiles.keys()].filter(f => f.startsWith(topic));
      
      const oldSize = oldFiles.reduce((sum, f) => sum + oldFiles.get(f)!.size, 0);
      const newSize = newFiles_arr.reduce((sum, f) => sum + newFiles.get(f)!.size, 0);
      
      if (Math.abs(oldSize - newSize) > 100) {
        withChanges.push({ topic, oldSize, newSize });
      }
    });
    
    if (withChanges.length > 0) {
      console.log(`\nTopics with significant size changes (>100 bytes):`);
      withChanges
        .sort((a, b) => Math.abs(b.newSize - b.oldSize) - Math.abs(a.newSize - a.oldSize))
        .slice(0, 10)
        .forEach(({ topic, oldSize, newSize }) => {
          const diff = newSize - oldSize;
          const sign = diff > 0 ? '+' : '';
          console.log(`  ${topic}: ${oldSize} → ${newSize} (${sign}${diff} bytes)`);
        });
    } else {
      console.log('  No significant size changes detected');
    }
  }
  
  // Search for specific missing content
  console.log(`\n🔍 SEARCHING FOR SPECIFIC MISSING CONTENT:`);
  console.log('=' .repeat(60));
  
  const searchTerms = [
    'Fake Rares Submission Rules',
    'Fake Commons Submission Rules',
    'Fake Rare Artists',
    'submission fee',
    'FAKEASF',
  ];
  
  for (const term of searchTerms) {
    let foundInOld = false;
    let foundInNew = false;
    
    for (const [name, info] of oldFiles) {
      const content = await readFile(info.path, 'utf-8');
      if (content.toLowerCase().includes(term.toLowerCase())) {
        foundInOld = true;
        break;
      }
    }
    
    for (const [name, info] of newFiles) {
      const content = await readFile(info.path, 'utf-8');
      if (content.toLowerCase().includes(term.toLowerCase())) {
        foundInNew = true;
        break;
      }
    }
    
    const oldStatus = foundInOld ? '✅' : '❌';
    const newStatus = foundInNew ? '✅' : '❌';
    const emoji = (!foundInOld && foundInNew) ? ' 🆕 NEW!' : '';
    
    console.log(`  "${term}": Old ${oldStatus} | New ${newStatus}${emoji}`);
  }
  
  console.log('\n✅ Comparison complete!\n');
}

main().catch(console.error);

