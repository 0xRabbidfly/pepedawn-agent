import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';

/**
 * What `bun run build` is required to produce.
 *
 * This test used to assert a vite frontend build running before a tsup build,
 * and both of those steps are gone: the build is `build.ts` (Bun.build plus a
 * copy step), and it emits no frontend at all. It failed on every run for that
 * reason alone.
 *
 * The assertions that matter are about the copy step. In production the card
 * indexes are read from `dist/data` — `fullCardIndex.ts` looks there first —
 * so a build that bundles cleanly but forgets to copy them starts a bot that
 * knows no cards. Same for the PGlite WASM, without which the database will
 * not open.
 */
describe('Build output', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const distDir = path.join(rootDir, 'dist');

  // build.ts cleans dist itself, so a stale directory cannot mask a miss.
  // bun's beforeAll takes no timeout argument, so the build runs in the first
  // test, which can have one; the rest read what it left behind.
  it(
    'bundles the entry point',
    async () => {
      await $`cd ${rootDir} && bun run build`.quiet();
      expect(fs.existsSync(path.join(distDir, 'index.js'))).toBe(true);
    },
    120000
  );

  it('copies the card indexes production reads from dist/data', () => {
    for (const file of [
      'fake-rares-data.json',
      'fake-commons-data.json',
      'rare-pepes-data.json',
    ]) {
      const copied = path.join(distDir, 'data', file);
      expect(fs.existsSync(copied)).toBe(true);
      expect(JSON.parse(fs.readFileSync(copied, 'utf8')).length).toBeGreaterThan(0);
    }
  });

  it('ships the PGlite WASM next to the bundle', () => {
    expect(fs.existsSync(path.join(distDir, 'pglite.wasm'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'pglite.data'))).toBe(true);
  });

  it('generates type declarations', () => {
    // These silently failed to emit for months: tsconfig.build.json listed
    // three entry files, one of which no longer existed, so tsc bailed with
    // TS6307 on the first import outside that list and the build only warned.
    expect(fs.existsSync(path.join(distDir, 'index.d.ts'))).toBe(true);
  });
});
