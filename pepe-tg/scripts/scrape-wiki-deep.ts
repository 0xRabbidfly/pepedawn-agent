#!/usr/bin/env bun
/**
 * Deep Wiki Scraper for wiki.pepe.wtf
 * 
 * Crawls 2nd and 3rd level pages to capture missing content like:
 * - Fake Rares Submission Rules
 * - Fake Commons Submission Rules
 * - Deep sub-pages
 * 
 * Usage: bun run scripts/scrape-wiki-deep.ts
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { JSDOM } from 'jsdom';

const BASE_URL = 'https://wiki.pepe.wtf';
const OUTPUT_DIR = join(process.cwd(), '..', 'backups', 'docs-pepe-wtf-wiki-deep');
const MAX_DEPTH = 3;
const DELAY_MS = 1000; // Be respectful with delays

interface PageMetadata {
  url: string;
  title: string;
  depth: number;
  slug: string;
}

const visited = new Set<string>();
const queue: PageMetadata[] = [];
const scraped: PageMetadata[] = [];

/**
 * Convert URL to safe filename
 */
function urlToFilename(url: string, index: number): string {
  const slug = url
    .replace(BASE_URL, '')
    .replace(/^\//, '')
    .replace(/\//g, '_')
    .replace(/[^a-z0-9_-]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
  
  return `${slug}_${String(index).padStart(3, '0')}.md`;
}

/**
 * Extract text content and convert to markdown
 */
function htmlToMarkdown(html: string, url: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  // Remove scripts, styles, nav, footer
  const elementsToRemove = doc.querySelectorAll('script, style, nav, footer, .navigation, .sidebar');
  elementsToRemove.forEach(el => el.remove());
  
  // Get main content area (adjust selectors based on wiki structure)
  const mainContent = 
    doc.querySelector('main') ||
    doc.querySelector('article') ||
    doc.querySelector('.content') ||
    doc.querySelector('.main') ||
    doc.body;
  
  if (!mainContent) {
    return '# Error\n\nCould not extract content\n';
  }
  
  let markdown = '';
  
  // Process headers
  const headers = mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headers.forEach(header => {
    const level = parseInt(header.tagName[1]);
    const text = header.textContent?.trim() || '';
    markdown += `${'#'.repeat(level)} ${text}\n\n`;
  });
  
  // Process paragraphs and lists
  const paragraphs = mainContent.querySelectorAll('p, li, blockquote');
  paragraphs.forEach(p => {
    const text = p.textContent?.trim() || '';
    if (text && text.length > 0) {
      if (p.tagName === 'LI') {
        markdown += `- ${text}\n`;
      } else {
        markdown += `${text}\n\n`;
      }
    }
  });
  
  // Process tables (if any)
  const tables = mainContent.querySelectorAll('table');
  tables.forEach(table => {
    const rows = table.querySelectorAll('tr');
    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('th, td');
      const cellTexts = Array.from(cells).map(cell => cell.textContent?.trim() || '');
      markdown += `| ${cellTexts.join(' | ')} |\n`;
      if (rowIndex === 0) {
        markdown += `| ${cellTexts.map(() => '---').join(' | ')} |\n`;
      }
    });
    markdown += '\n';
  });
  
  // Add source URL at bottom (matching existing format)
  markdown += `\n---\n*Source: ${url}*\n`;
  
  return markdown;
}

/**
 * Extract all internal links from page
 */
function extractLinks(html: string, baseUrl: string): string[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const links = doc.querySelectorAll('a[href]');
  
  const urls: string[] = [];
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    
    // Convert relative to absolute
    let fullUrl = href;
    if (href.startsWith('/')) {
      fullUrl = BASE_URL + href;
    } else if (!href.startsWith('http')) {
      fullUrl = new URL(href, baseUrl).href;
    }
    
    // Only include wiki.pepe.wtf links
    if (fullUrl.startsWith(BASE_URL) && !fullUrl.includes('#')) {
      urls.push(fullUrl);
    }
  });
  
  return [...new Set(urls)]; // Dedupe
}

/**
 * Fetch and parse a single page
 */
async function scrapePage(metadata: PageMetadata): Promise<void> {
  const { url, depth } = metadata;
  
  if (visited.has(url)) {
    return;
  }
  
  console.log(`${'  '.repeat(depth)}🔍 Scraping [depth ${depth}]: ${url}`);
  visited.add(url);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  ❌ Failed to fetch ${url}: ${response.status}`);
      return;
    }
    
    const html = await response.text();
    const markdown = htmlToMarkdown(html, url);
    
    // Save to file
    const filename = urlToFilename(url, scraped.length + 1);
    const filepath = join(OUTPUT_DIR, filename);
    await writeFile(filepath, markdown, 'utf-8');
    
    scraped.push(metadata);
    console.log(`  ✅ Saved: ${filename} (${markdown.length} chars)`);
    
    // Extract links and add to queue if we haven't reached max depth
    if (depth < MAX_DEPTH) {
      const links = extractLinks(html, url);
      console.log(`  📎 Found ${links.length} links`);
      
      for (const link of links) {
        if (!visited.has(link)) {
          const linkSlug = link.replace(BASE_URL, '').replace(/^\//, '');
          queue.push({
            url: link,
            title: linkSlug,
            depth: depth + 1,
            slug: linkSlug
          });
        }
      }
    }
    
    // Respectful delay
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    
  } catch (error) {
    console.error(`  ❌ Error scraping ${url}:`, error);
  }
}

/**
 * Main scraper function
 */
async function main() {
  console.log('🌐 Wiki Deep Scraper Starting...');
  console.log(`📁 Output directory: ${OUTPUT_DIR}\n`);
  
  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });
  
  // Start with Book of Kek page (known to have deep structure)
  const seedUrls = [
    `${BASE_URL}/book-of-kek`,
    `${BASE_URL}/chapter-2-the-rare-pepe-project`,
    `${BASE_URL}/chapter-2-the-rare-pepe-project/fake-rares-commons`,
  ];
  
  for (const url of seedUrls) {
    queue.push({
      url,
      title: url.replace(BASE_URL, ''),
      depth: 1,
      slug: url.replace(BASE_URL, '').replace(/^\//, '')
    });
  }
  
  // BFS crawl
  while (queue.length > 0) {
    const page = queue.shift()!;
    await scrapePage(page);
  }
  
  console.log('\n✅ Scraping complete!');
  console.log(`📊 Scraped ${scraped.length} pages`);
  console.log(`📁 Saved to: ${OUTPUT_DIR}`);
  
  // Print summary by depth
  const byDepth: Record<number, number> = {};
  scraped.forEach(p => {
    byDepth[p.depth] = (byDepth[p.depth] || 0) + 1;
  });
  
  console.log('\n📊 Pages by depth:');
  Object.entries(byDepth).forEach(([depth, count]) => {
    console.log(`  Depth ${depth}: ${count} pages`);
  });
}

main().catch(console.error);

