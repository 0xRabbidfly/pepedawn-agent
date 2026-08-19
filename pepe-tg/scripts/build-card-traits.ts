#!/usr/bin/env bun
/**
 * Build a compact visual-trait index from the /fv embedding dump.
 *
 * The dump is ~175MB because it carries a vector per block. The traits
 * themselves — colours, styles, subjects — live in metadata.keywords and are
 * tiny, so we extract just those. This lets questions like "which fake rare has
 * the most red" be answered from what the vision pass actually saw, rather than
 * from whatever text happens to embed near the word "red".
 *
 * Usage: bun scripts/build-card-traits.ts [input.json] [output.json]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = join(import.meta.dir, '..', 'tmp', 'fv-embeddings');
const input =
  process.argv[2] ??
  (existsSync(dir)
    ? join(dir, readdirSync(dir).filter((f) => f.endsWith('.json')).sort().pop()!)
    : '');
const output = process.argv[3] ?? join(import.meta.dir, '..', 'src', 'data', 'card-visual-traits.json');

if (!input || !existsSync(input)) {
  console.error(`No /fv embedding dump found. Pass one explicitly.`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(input, 'utf8'));
const items: any[] = Array.isArray(raw) ? raw : Object.values(raw);

const byAsset = new Map<string, Set<string>>();
for (const item of items) {
  const md = item?.metadata ?? {};
  const asset = String(md.asset ?? '').toUpperCase();
  if (!asset) continue;
  const set = byAsset.get(asset) ?? new Set<string>();
  for (const kw of md.keywords ?? []) {
    const k = String(kw).toLowerCase().trim();
    if (k) set.add(k);
  }
  byAsset.set(asset, set);
}

const out: Record<string, string[]> = {};
for (const [asset, set] of byAsset) out[asset] = [...set].sort();

writeFileSync(output, JSON.stringify(out), 'utf8');
const sizes = Object.values(out).map((v) => v.length);
console.log(
  `Wrote ${Object.keys(out).length} cards to ${output}\n` +
    `  keywords per card: min ${Math.min(...sizes)}, max ${Math.max(...sizes)}, ` +
    `mean ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}`
);
