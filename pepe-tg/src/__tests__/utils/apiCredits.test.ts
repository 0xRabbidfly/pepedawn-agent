/**
 * /fc says what is left on the accounts, by the ledger: loaded minus spent
 * since the load date, per provider. No API exposes the real balance.
 */
import { describe, expect, it } from 'bun:test';
import { creditConfig, creditsLines, providerOf, spendByProvider } from '../../utils/apiCredits';
import { formatCostReport } from '../../actions/costCommand';

describe('api credits', () => {
  it('knows which account a model bills', () => {
    expect(providerOf('gpt-5.6-luna')).toBe('openai');
    expect(providerOf('text-embedding-3-small')).toBe('openai');
    expect(providerOf('grok-4.6')).toBe('xai');
    expect(spendByProvider({ 'gpt-4o': { cost: 1.5 }, 'grok-4.3': { cost: 2 }, 'grok-4.6': { cost: 0.5 } })).toEqual({ openai: 1.5, xai: 2.5 });
  });

  it('reads the config only when both amount and date are usable', () => {
    expect(creditConfig({})).toEqual({});
    expect(creditConfig({ OPENAI_CREDIT_USD: '100' })).toEqual({});
    expect(creditConfig({ OPENAI_CREDIT_USD: 'lots', OPENAI_CREDIT_SINCE: '2026-09-01' })).toEqual({});
    const c = creditConfig({ OPENAI_CREDIT_USD: '100', OPENAI_CREDIT_SINCE: '2026-09-01', XAI_CREDIT_USD: '25', XAI_CREDIT_SINCE: '2026-09-10' });
    expect(c.openai?.usd).toBe(100);
    expect(c.xai?.since.toISOString().slice(0, 10)).toBe('2026-09-10');
  });

  it('renders what is left, and flags when it is running out', () => {
    const config = creditConfig({ OPENAI_CREDIT_USD: '100', OPENAI_CREDIT_SINCE: '2026-09-01', XAI_CREDIT_USD: '25', XAI_CREDIT_SINCE: '2026-09-10' });
    const lines = creditsLines(config, (p) => (p === 'openai' ? 37.5 : 23));
    expect(lines[0]).toBe('💳 OpenAI: ~$62.50 of $100.00 left (63%), $37.50 spent since 2026-09-01');
    expect(lines[1]).toBe('💳 xAI: ~$2.00 of $25.00 left (8%), $23.00 spent since 2026-09-10 ⚠️');
    expect(creditsLines(config, () => 200)[0]).toContain('⛔');
    expect(creditsLines({}, () => 0)[0]).toMatch(/not tracked/);
  });

  it('/fc puts credits above the breakdowns and names what it cannot count', () => {
    const stats: any = {
      callCount: 3, totalCost: 1.2, totalTokensIn: 10, totalTokensOut: 5,
      byModel: { 'gpt-5.6-luna': { cost: 0.2, calls: 2 }, 'grok-4.6': { cost: 1.0, calls: 1 } },
      bySource: { 'Router-CHAT': { cost: 0.2, calls: 2 }, 'X-Harvest-market': { cost: 1.0, calls: 1 } },
    };
    const out = formatCostReport(stats, 'Today', undefined, ['💳 OpenAI: ~$62.50 of $100.00 left (63%), $37.50 spent since 2026-09-01']);
    expect(out.indexOf('💳 OpenAI')).toBeLessThan(out.indexOf('**By Provider:**'));
    expect(out).toContain('• OpenAI: $0.2000');
    expect(out).toContain('• xAI: $1.0000');
    expect(out).toContain('Not counted: the daily vision backfill');
  });
});
