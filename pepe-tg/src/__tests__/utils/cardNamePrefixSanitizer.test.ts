import { describe, expect, it } from 'bun:test';
import { stripCardNamePrefix } from '../../utils/cardNamePrefixSanitizer';

describe('stripCardNamePrefix', () => {
  it('removes leading card name prefixes with colon', () => {
    const original = 'PEPEDAWN: The raven’s call echoed through Telegram.';
    const sanitized = stripCardNamePrefix(original);
    expect(sanitized).toBe('The raven’s call echoed through Telegram.');
  });

  it('preserves natural mentions without colon', () => {
    const original = 'PEPEDAWN was minted during the dawn raids.';
    const sanitized = stripCardNamePrefix(original);
    expect(sanitized).toBe(original);
  });

  it('does not touch non-card prefixes', () => {
    const original = 'FAM: this is just banter.';
    const sanitized = stripCardNamePrefix(original);
    expect(sanitized).toBe(original);
  });

  it('keeps leading whitespace intact', () => {
    const original = '  PEPEDAWN: still shows up with spacing.';
    const sanitized = stripCardNamePrefix(original);
    expect(sanitized).toBe('  still shows up with spacing.');
  });
});

