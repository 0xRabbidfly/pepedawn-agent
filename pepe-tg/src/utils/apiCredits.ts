/**
 * What is left on the API accounts, by the bot's own ledger.
 *
 * Neither OpenAI nor xAI exposes a balance to an ordinary API key; the
 * billing pages do, the API does not. So the owner tells the bot what was
 * loaded and when (OPENAI_CREDIT_USD + OPENAI_CREDIT_SINCE, XAI_CREDIT_USD +
 * XAI_CREDIT_SINCE), and /fc subtracts everything the telemetry log has
 * charged to that provider's models since. It is an estimate: calls made
 * outside this process - the vision backfill in GitHub Actions, the
 * maintainer digest's one classification a day - are not in the ledger.
 */

export type Provider = 'openai' | 'xai';

export function providerOf(model: string): Provider {
  return /^grok/i.test(model || '') ? 'xai' : 'openai';
}

export interface CreditConfig {
  usd: number;
  since: Date;
}

export function creditConfig(env: NodeJS.ProcessEnv = process.env): Partial<Record<Provider, CreditConfig>> {
  const out: Partial<Record<Provider, CreditConfig>> = {};
  for (const [provider, prefix] of [['openai', 'OPENAI'], ['xai', 'XAI']] as const) {
    const usd = Number(env[`${prefix}_CREDIT_USD`]);
    const since = env[`${prefix}_CREDIT_SINCE`];
    if (!Number.isFinite(usd) || usd <= 0 || !since) continue;
    const date = new Date(since);
    if (Number.isNaN(date.getTime())) continue;
    out[provider] = { usd, since: date };
  }
  return out;
}

/** Spend per provider from a by-model cost table. */
export function spendByProvider(byModel: Record<string, { cost: number }>): Record<Provider, number> {
  const out: Record<Provider, number> = { openai: 0, xai: 0 };
  for (const [model, { cost }] of Object.entries(byModel)) out[providerOf(model)] += cost;
  return out;
}

const NAME: Record<Provider, string> = { openai: 'OpenAI', xai: 'xAI' };

/**
 * The credits lines for /fc. `spendSince(provider)` is the ledger total
 * for that provider since its configured date.
 */
export function creditsLines(
  config: Partial<Record<Provider, CreditConfig>>,
  spendSince: (provider: Provider, since: Date) => number,
): string[] {
  const providers = Object.keys(config) as Provider[];
  if (providers.length === 0) {
    return ['💳 Credits: not tracked. Set OPENAI_CREDIT_USD + OPENAI_CREDIT_SINCE (and XAI_…) to what was loaded and when; the APIs do not expose a balance.'];
  }
  return providers.map((p) => {
    const { usd, since } = config[p]!;
    const spent = spendSince(p, since);
    const left = usd - spent;
    const pct = usd > 0 ? Math.max(0, Math.min(100, Math.round((left / usd) * 100))) : 0;
    const flag = left <= 0 ? ' ⛔' : pct <= 15 ? ' ⚠️' : '';
    return `💳 ${NAME[p]}: ~$${left.toFixed(2)} of $${usd.toFixed(2)} left (${pct}%), $${spent.toFixed(2)} spent since ${since.toISOString().slice(0, 10)}${flag}`;
  });
}
