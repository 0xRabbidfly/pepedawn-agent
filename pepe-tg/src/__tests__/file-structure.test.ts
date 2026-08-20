import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '@elizaos/core';

// Helper function to check if a file exists
function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

// Helper function to check if a directory exists
function directoryExists(dirPath: string): boolean {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

describe('Project Structure Validation', () => {
  const rootDir = path.resolve(__dirname, '../..');

  describe('Directory Structure', () => {
    it('should have the expected directory structure', () => {
      expect(directoryExists(path.join(rootDir, 'src'))).toBe(true);
      expect(directoryExists(path.join(rootDir, 'src', '__tests__'))).toBe(true);
    });

    it('should have a build script that produces dist', () => {
      // Asserting that dist/ exists made this test depend on someone having
      // built first, and on build-order.test.ts not having cleaned up. What is
      // actually invariant is that the build entry point exists and is wired
      // up; build-order.test.ts runs it and checks the output.
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
      );
      expect(packageJson.scripts.build).toContain('build.ts');
      expect(fileExists(path.join(rootDir, 'build.ts'))).toBe(true);
    });
  });

  describe('Source Files', () => {
    it('should contain the required source files', () => {
      expect(fileExists(path.join(rootDir, 'src', 'index.ts'))).toBe(true);
      expect(fileExists(path.join(rootDir, 'src', 'plugin.ts'))).toBe(true);
    });

    it('should have properly structured main files', () => {
      // Check index.ts contains character definition
      const indexContent = fs.readFileSync(path.join(rootDir, 'src', 'index.ts'), 'utf8');
      expect(indexContent).toContain('character');
      expect(indexContent).toContain('plugin');

      // Check plugin.ts contains plugin definition
      const pluginContent = fs.readFileSync(path.join(rootDir, 'src', 'plugin.ts'), 'utf8');
      expect(pluginContent).toContain('export default');
      expect(pluginContent).toContain('actions');
    });
  });

  describe('Configuration Files', () => {
    it('should have the required configuration files', () => {
      expect(fileExists(path.join(rootDir, 'package.json'))).toBe(true);
      expect(fileExists(path.join(rootDir, 'tsconfig.json'))).toBe(true);
      expect(fileExists(path.join(rootDir, 'tsconfig.build.json'))).toBe(true);
      // This project builds with build.ts and vite, never tsup.
      expect(fileExists(path.join(rootDir, 'build.ts'))).toBe(true);
      expect(fileExists(path.join(rootDir, 'vite.config.ts'))).toBe(true);
      expect(fileExists(path.join(rootDir, 'bunfig.toml'))).toBe(true);
    });

    it('should have the correct package.json configuration', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

      // Check package name exists and is valid
      expect(packageJson.name).toBeTruthy();
      expect(typeof packageJson.name).toBe('string');

      // Check scripts
      expect(packageJson.scripts).toHaveProperty('build');
      expect(packageJson.scripts).toHaveProperty('test');
      expect(packageJson.scripts).toHaveProperty('test:coverage');

      // Check dependencies
      expect(packageJson.dependencies).toHaveProperty('@elizaos/core');

      // Check dev dependencies - adjusted for actual dev dependencies
      expect(packageJson.devDependencies).toBeTruthy();
      // bun test is built-in, no external test framework dependency needed
      expect(packageJson.devDependencies).toHaveProperty('typescript');
    });

    it('should have proper TypeScript configuration', () => {
      const tsConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'tsconfig.json'), 'utf8'));

      // Check essential compiler options
      expect(tsConfig).toHaveProperty('compilerOptions');
      expect(tsConfig.compilerOptions).toHaveProperty('target');
      expect(tsConfig.compilerOptions).toHaveProperty('module');

      // Check paths inclusion
      expect(tsConfig).toHaveProperty('include');
    });
  });

  describe('Build Output', () => {
    it('should check for expected build output structure', () => {
      // Instead of checking specific files, check that the dist directory exists
      // and contains at least some files
      if (directoryExists(path.join(rootDir, 'dist'))) {
        const files = fs.readdirSync(path.join(rootDir, 'dist'));
        expect(files.length).toBeGreaterThan(0);

        // Check for common output patterns rather than specific files
        const hasJsFiles = files.some((file) => file.endsWith('.js'));
        expect(hasJsFiles).toBe(true);
      } else {
        // Skip test if dist directory doesn't exist yet
        logger.warn('Dist directory not found, skipping build output tests');
      }
    });

    it('should verify the build process can be executed', () => {
      // Check that the build script exists in package.json
      const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
      expect(packageJson.scripts).toHaveProperty('build');

      // build.ts is a script, not a config module: it has no default export
      // and no `entry:` key. What it must do is bundle the real entry point
      // and copy the card data production reads from dist/data.
      const buildScript = fs.readFileSync(path.join(rootDir, 'build.ts'), 'utf8');
      expect(buildScript).toContain('./src/index.ts');
      expect(buildScript).toContain('dist/data');
    });
  });

  describe('Documentation', () => {
    it('should have README files', () => {
      expect(fileExists(path.join(rootDir, 'README.md'))).toBe(true);
    });

    it('should have appropriate documentation content', () => {
      const readmeContent = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
      expect(readmeContent).toContain('PEPEDAWN');

      // Testing key sections exist without requiring specific keywords
      expect(readmeContent).toContain('Development');
      expect(readmeContent).toContain('Testing');
    });
  });
});
