#!/usr/bin/env bun
/**
 * Self-contained build script for ElizaOS projects
 */

import { existsSync } from 'node:fs';
import { rm, mkdir, copyFile } from 'node:fs/promises';
import { $ } from 'bun';
import path from 'node:path';

async function cleanBuild(outdir = 'dist') {
  if (existsSync(outdir)) {
    await rm(outdir, { recursive: true, force: true });
    console.log(`✓ Cleaned ${outdir} directory`);
  }
}

async function build() {
  const start = performance.now();
  console.log('🚀 Building project...');

  try {
    // Clean previous build
    await cleanBuild('dist');

    // Build the Telegram plugin first if it exists (required by main project)
    const pluginPath = 'packages/plugin-telegram-fakerares';
    if (existsSync(pluginPath)) {
      console.log('📦 Building Telegram plugin...');
      try {
        await $`cd ${pluginPath} && npm run build`.quiet();
        console.log('✓ Telegram plugin built');
        
        // Update the copy in node_modules
        console.log('📦 Updating plugin in node_modules...');
        await $`npm install`.quiet();
        console.log('✓ Plugin updated in node_modules');
      } catch (error) {
        console.error('✗ Failed to build Telegram plugin:', error);
        return false;
      }
    } else {
      console.log('ℹ️  Telegram plugin not found, skipping plugin build');
    }

    // Run JavaScript build and TypeScript declarations in parallel
    console.log('Starting build tasks...');

    const [buildResult, tscResult] = await Promise.all([
      // Task 1: Build with Bun
      (async () => {
        console.log('📦 Bundling with Bun...');
        const result = await Bun.build({
          entrypoints: ['./src/index.ts'],
          outdir: './dist',
          target: 'node',
          format: 'esm',
          sourcemap: true,
          minify: false,
          external: [
            'dotenv',
            'fs',
            'path',
            'https',
            'node:*',
            '@elizaos/core',
            '@elizaos/plugin-bootstrap',
            '@elizaos/plugin-sql',
            '@elizaos/plugin-telegram', // Keep external to load our forked plugin from node_modules
            '@elizaos/cli',
            'zod',
            'axios',
            '@electric-sql/pglite', // Keep external so it can find WASM files from node_modules
          ],
          naming: {
            entry: '[dir]/[name].[ext]',
          },
        });

        if (!result.success) {
          console.error('✗ Build failed:', result.logs);
          return { success: false, outputs: [] };
        }

        const totalSize = result.outputs.reduce((sum, output) => sum + output.size, 0);
        const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
        console.log(`✓ Built ${result.outputs.length} file(s) - ${sizeMB}MB`);

        return result;
      })(),

      // Task 2: Generate TypeScript declarations
      (async () => {
        console.log('📝 Generating TypeScript declarations...');
        try {
          await $`tsc --emitDeclarationOnly --incremental --project ./tsconfig.build.json`.quiet();
          console.log('✓ TypeScript declarations generated');
          return { success: true };
        } catch (error) {
          console.warn('⚠ Failed to generate TypeScript declarations');
          console.warn('  This is usually due to test files or type errors.');
          return { success: false };
        }
      })(),
    ]);

    // Task 3: Copy data files and PGLite WASM files (after build completes)
    console.log('📋 Copying data files...');
    try {
      await mkdir('dist/data', { recursive: true });
      await copyFile('src/data/fake-rares-data.json', 'dist/data/fake-rares-data.json');
      console.log('✓ Copied fake-rares-data.json to dist/data/');
      
      await copyFile('src/data/fake-commons-data.json', 'dist/data/fake-commons-data.json');
      console.log('✓ Copied fake-commons-data.json to dist/data/');
      
      await copyFile('src/data/rare-pepes-data.json', 'dist/data/rare-pepes-data.json');
      console.log('✓ Copied rare-pepes-data.json to dist/data/');
      
      // Copy embeddings if exists
      if (existsSync('src/data/card-embeddings.json')) {
        await copyFile('src/data/card-embeddings.json', 'dist/data/card-embeddings.json');
        console.log('✓ Copied card-embeddings.json to dist/data/');
      }
    } catch (error) {
      console.warn('⚠ Failed to copy data files:', error);
    }
    
    // Copy PGLite WASM files (required for PGLite to work when running from dist/)
    try {
      console.log('📦 Copying PGLite WASM files...');
      const pgliteDist = path.join(process.cwd(), 'node_modules/@electric-sql/pglite/dist');
      const wasmSource = path.join(pgliteDist, 'pglite.wasm');
      const dataSource = path.join(pgliteDist, 'pglite.data');
      const wasmDest = path.join(process.cwd(), 'dist/pglite.wasm');
      const dataDest = path.join(process.cwd(), 'dist/pglite.data');
      
      // Ensure dist directory exists
      if (!existsSync('dist')) {
        await mkdir('dist', { recursive: true });
      }
      
      if (existsSync(wasmSource)) {
        await copyFile(wasmSource, wasmDest);
        console.log('✓ Copied pglite.wasm to dist/');
      } else {
        console.warn(`⚠ pglite.wasm not found at ${wasmSource}`);
      }
      
      if (existsSync(dataSource)) {
        await copyFile(dataSource, dataDest);
        console.log('✓ Copied pglite.data to dist/');
      } else {
        console.warn(`⚠ pglite.data not found at ${dataSource}`);
      }
    } catch (error) {
      console.error('✗ Failed to copy PGLite WASM files:', error);
      // Don't fail the build - files can be copied manually if needed
    }

    if (!buildResult.success) {
      return false;
    }

    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    console.log(`✅ Build complete! (${elapsed}s)`);
    return true;
  } catch (error) {
    console.error('Build error:', error);
    return false;
  }
}

// Execute the build
build()
  .then((success) => {
    if (!success) {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Build script error:', error);
    process.exit(1);
  });
