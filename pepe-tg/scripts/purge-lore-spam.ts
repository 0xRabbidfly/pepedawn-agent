/**
 * Remove user-submitted memories from the knowledge base.
 *
 * Written for the 2026-08-19 /fr abuse: 21 false submissions, stored with no
 * attribution and no removal path. Matches on the [MEMORY:...] marker that
 * MemoryStorageService stamps on every user contribution, so it can target
 * user-written entries without touching wiki, card or Telegram fragments.
 *
 *   bun scripts/purge-lore-spam.ts --list
 *   bun scripts/purge-lore-spam.ts --since 2026-08-19T17:00:00Z --dry-run
 *   bun scripts/purge-lore-spam.ts --since 2026-08-19T17:00:00Z --confirm
 *
 * Defaults to a dry run. Nothing is deleted without --confirm.
 *
 * NOTE: the bot holds an exclusive lock on PGlite. Stop it first with
 * ./scripts/kill-bot.sh (never pkill - see CLAUDE.md).
 */

import { PGlite } from '@electric-sql/pglite';

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const DB_PATH = process.env.PGLITE_DATA_DIR || '.eliza/.elizadb';
const confirm = has('--confirm');
const list = has('--list');
const since = value('--since') ? new Date(value('--since')!).getTime() : undefined;
const matchText = value('--match');

if (!list && !since && !matchText) {
  console.error('Refusing to run with no filter. Pass --list, --since <iso> or --match <text>.');
  process.exit(1);
}

const db = new PGlite(DB_PATH);

// User contributions carry [MEMORY:userId:displayName:timestamp] at the head.
const MARKER = '[MEMORY:';

const rows = (await db.query(
  `SELECT id, content FROM memories WHERE content::text LIKE $1 ORDER BY id`,
  [`%${MARKER}%`]
)) as { rows: Array<{ id: string; content: any }> };

interface Candidate {
  id: string;
  text: string;
  at?: number;
  who?: string;
}

const candidates: Candidate[] = rows.rows.flatMap((r) => {
  const text: string = typeof r.content === 'string'
    ? r.content
    : r.content?.text ?? JSON.stringify(r.content);
  const m = text.match(/\[MEMORY:([^:]+):([^:]+):([^\]]+)\]/);
  if (!m) return [];
  const at = Number(m[3]);
  return [{ id: r.id, text, at: Number.isFinite(at) ? at : undefined, who: m[2] }];
});

let targets = candidates;
if (since !== undefined) targets = targets.filter((c) => c.at !== undefined && c.at >= since);
if (matchText) targets = targets.filter((c) => c.text.toLowerCase().includes(matchText.toLowerCase()));

if (list) {
  console.log(`${candidates.length} user-submitted memories in the store:\n`);
  for (const c of candidates) {
    const when = c.at ? new Date(c.at).toISOString() : 'unknown time';
    console.log(`  ${c.id}  ${when}  ${c.who}  ${c.text.slice(0, 90).replace(/\s+/g, ' ')}`);
  }
  await db.close();
  process.exit(0);
}

console.log(`${targets.length} memories match the filter.\n`);
for (const t of targets) {
  const when = t.at ? new Date(t.at).toISOString() : 'unknown time';
  console.log(`  ${when}  ${t.text.slice(0, 90).replace(/\s+/g, ' ')}`);
}

if (!confirm) {
  console.log('\nDry run. Re-run with --confirm to delete these, and their embeddings.');
  await db.close();
  process.exit(0);
}

let deleted = 0;
for (const t of targets) {
  // Embeddings are keyed on memory_id; remove them first so no orphan vector
  // survives to be retrieved without its text.
  await db.query(`DELETE FROM embeddings WHERE memory_id = $1`, [t.id]);
  await db.query(`DELETE FROM memories WHERE id = $1`, [t.id]);
  deleted++;
}

console.log(`\nDeleted ${deleted} memories and their embeddings.`);
await db.close();
