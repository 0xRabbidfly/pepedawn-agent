/**
 * The modules the Telegram plugin loads for itself must not hold state.
 *
 * The plugin reaches into the app's `src/` by dynamic import. tsup follows
 * those specifiers and inlines what it finds into the plugin's own bundle, and
 * the runtime-resolved ones load a second time from disk. Either way the app
 * and the plugin end up with *two module objects* compiled from one file. For
 * a module of pure functions that costs a few kilobytes and nothing else. For
 * a module with `let` at the top of it, the two copies drift, and the drift is
 * invisible until someone reads the output and finds it wrong.
 *
 * It has already happened twice:
 *
 *  - `anniversaryRuntime` — trivia taps arrived in the plugin, the engine ran
 *    in the app, and a read-once/write-whole store lost every tap the moment
 *    the engine next saved. A full day of "Locked in ✅" ended in "Nobody
 *    played". Fixed: `anniversaryStore()` now keeps the one instance on
 *    globalThis, so both copies share it, and the merge-on-write is gone.
 *  - `telegramFileIdCache` — `memoryCache` and `cacheLoaded`, behind a loader
 *    that tries four candidate paths and keeps whichever imports first, so
 *    which copy you get depends on the working directory. Still split; a lost
 *    entry only costs one re-upload.
 *
 * What is left is recorded below rather than fixed here. This test is a ratchet: it
 * derives the shared module list from the plugin source, so a *new* dynamic
 * import into a stateful module fails the build with an explanation, and a
 * known one that gets fixed fails too, so the list can only shrink.
 *
 * Fixing one means giving it a single owner both sides can reach — the
 * ElizaOS runtime is shared where the module is not — and then deleting the
 * workaround that compensated for the split.
 */
import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';

const APP_SRC = join(import.meta.dir, '..', '..');
const PLUGIN_SRC = join(APP_SRC, '..', 'packages', 'plugin-telegram-fakerares', 'src');

/**
 * The split-state modules we already have, and why they are tolerated. Adding
 * to this list is a decision to accept a second copy of someone's state;
 * removing from it is the reward for giving a module one owner.
 */
const KNOWN_SPLIT_STATE: Record<string, string> = {
  'telegramFileIdCache.ts': 'the file_id cache is a disk-backed hint; a lost entry costs one re-upload',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * Every app module the plugin pulls in at runtime. Both spellings count: the
 * static `await import('../../../src/x.js')` that tsup inlines, and the
 * computed `path.join(..., 'x.js')` candidate lists it cannot. Matching on the
 * basename catches either without parsing the call.
 */
function sharedModules(): string[] {
  const appFiles = walk(APP_SRC);
  const byBase = new Map(appFiles.map((f) => [basename(f, '.ts'), f]));
  const found = new Set<string>();
  for (const file of walk(PLUGIN_SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const [, spec] of text.matchAll(/['"`]([^'"`]+\.js)['"`]/g)) {
      const base = basename(spec, '.js');
      // The app has four index.ts and this matches on basename, so a bare
      // 'index.js' anywhere in the plugin would pick one of them at random and
      // audit the wrong file. An entry point is never the shared-module case.
      if (base === 'index') continue;
      const hit = byBase.get(base);
      if (hit) found.add(hit);
    }
  }
  return [...found].sort();
}

/** Mutable bindings at column 0 — module scope, shared by everyone holding the module. */
function moduleScopeState(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => /^(export )?(let|var) \w/.test(l) || /^(export )?const \w+(: [^=]+)? = new (Map|Set|WeakMap|WeakSet)\b/.test(l))
    .map((l) => l.trim().replace(/\s*=.*$/, '').slice(0, 80));
}

describe('modules the Telegram plugin loads for itself', () => {
  it('finds the shared modules from the plugin source, not from a list here', () => {
    const shared = sharedModules().map((f) => basename(f));
    // If this drops to nothing the discovery has broken, and every assertion
    // below would pass by finding nothing to check.
    expect(shared.length).toBeGreaterThanOrEqual(3);
    expect(shared).toContain('anniversaryRuntime.ts');
    expect(shared).toContain('fakeRaresCarousel.ts');
  });

  it('none of them holds module-scope state, beyond the cases already accepted', () => {
    const offenders = sharedModules()
      .map((file) => ({ name: basename(file), state: moduleScopeState(file) }))
      .filter((m) => m.state.length > 0 && !(m.name in KNOWN_SPLIT_STATE));

    expect(
      offenders.map((o) => `${o.name} holds ${o.state.join(', ')}`),
      'A module the plugin loads for itself gained module-scope state. The app and the plugin ' +
        'each get their own copy of it, so the two will drift and nothing will say so. Give the ' +
        'state one owner both sides can reach (the runtime is shared; the module is not), or ' +
        'add it to KNOWN_SPLIT_STATE with the reason it is safe.',
    ).toEqual([]);
  });

  it('every accepted case still needs its exemption', () => {
    const shared = sharedModules();
    const stale = Object.keys(KNOWN_SPLIT_STATE).filter((name) => {
      const file = shared.find((f) => basename(f) === name);
      return !file || moduleScopeState(file).length === 0;
    });

    expect(
      stale,
      'This module no longer holds module-scope state, or is no longer loaded by the plugin. ' +
        'Remove it from KNOWN_SPLIT_STATE — and delete whatever workaround was compensating ' +
        'for the split.',
    ).toEqual([]);
  });
});
