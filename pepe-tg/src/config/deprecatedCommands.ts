/**
 * Deprecated Command Registry
 *
 * Single source of truth for slash commands scheduled for removal.
 *
 * Basis: production telemetry from 2025-10-31 to 2026-08-18 (33k records across
 * token/conversation/lore/smart-router logs, plus PM2 command logs). Each command
 * below had zero recorded use in the trailing quarter, while the SmartRouter's
 * natural-language path served the same intent automatically — e.g. /fl was used
 * 47 times ever and not once since 2026-04, against 911 auto-routed lore queries.
 *
 * Deprecated commands STILL WORK. They append a one-line notice pointing at the
 * replacement, and every invocation is recorded through
 * TelemetryService.logCommandUsage() so we can confirm they are genuinely unused
 * before deleting the code paths.
 */

export interface DeprecationInfo {
  /** Command token as passed to executeCommand(), e.g. '/fl' */
  command: string;
  /** ISO date the deprecation shipped */
  since: string;
  /** ISO date after which the command may be deleted */
  removeAfter: string;
  /** User-facing guidance shown in the notice */
  replacement: string;
  /** Internal justification, kept with the entry so the decision is auditable */
  reason: string;
}

/** Commands stay in place for one full quarter after deprecation. */
export const DEPRECATION_SINCE = '2026-08-18';
export const DEPRECATION_REMOVE_AFTER = '2026-11-18';

const entry = (
  command: string,
  replacement: string,
  reason: string
): DeprecationInfo => ({
  command,
  since: DEPRECATION_SINCE,
  removeAfter: DEPRECATION_REMOVE_AFTER,
  replacement,
  reason,
});

export const DEPRECATED_COMMANDS: Record<string, DeprecationInfo> = {
  '/fl': entry(
    '/fl',
    'Just ask me about a card in plain language — lore comes back automatically.',
    '47 uses ever, 0 since 2026-04; superseded by auto-routed lore (911 queries).'
  ),
  '/fv': entry(
    '/fv',
    'Ask me what a card looks like or says and I will read it for you.',
    '41 vision calls ever, 0 since 2026-02.'
  ),
  '/ft': entry(
    '/ft',
    'No replacement — the fake appeal scorer is being retired.',
    '13 calls ever, 0 since 2026-06. Sole consumer of the 18MB card-embeddings.json.'
  ),
  '/dawn': entry(
    '/dawn',
    'No replacement — lottery stats are being retired.',
    'Zero recorded invocations across the full telemetry window.'
  ),
  '/educate': entry(
    '/educate',
    'Just ask me anything about Fake Rares and I will explain.',
    'Action was never registered in the plugin actions array — already unreachable.'
  ),
};

/** Look up a deprecation entry. Accepts '/fl' or 'fl'. */
export function getDeprecation(command: string): DeprecationInfo | null {
  if (!command) return null;
  const key = command.startsWith('/') ? command : `/${command}`;
  return DEPRECATED_COMMANDS[key.toLowerCase()] ?? null;
}

export function isDeprecatedCommand(command: string): boolean {
  return getDeprecation(command) !== null;
}

/** One-line notice appended after a deprecated command's normal response. */
export function formatDeprecationNotice(info: DeprecationInfo): string {
  return `⚠️ \`${info.command}\` is deprecated and will be removed after ${info.removeAfter}. ${info.replacement}`;
}
