/**
 * Who counts as an admin.
 *
 * The same check was written inline in /xcp, /cost and /fr, each reading the
 * environment slightly differently. It now governs real privilege - bypassing
 * the /fr artist gate and the command rate limiter - so it lives in one place.
 *
 * Ids are authoritative: Telegram handles can be changed by their owner, and a
 * handle freed up by one user can be claimed by another.
 */

function list(name: string): string[] {
  return process.env[name]?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
}

export function isAdminUser(telegramId?: string, username?: string): boolean {
  if (telegramId && list('TELEGRAM_ADMIN_IDS').includes(telegramId)) return true;
  if (!username) return false;
  return list('TELEGRAM_ADMIN_USERNAMES')
    .map((u) => u.toLowerCase().replace(/^@/, ''))
    .includes(username.toLowerCase().replace(/^@/, ''));
}

/**
 * Admins are exempt from the rate limiter.
 *
 * Deliberate: an admin locked out by the limiter cannot lift anyone else's
 * silence, which turns a burst of moderation activity into a stuck channel.
 */
export function isRateLimitExempt(telegramId?: string, username?: string): boolean {
  return isAdminUser(telegramId, username);
}
