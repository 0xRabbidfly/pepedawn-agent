import { describe, it, expect } from 'bun:test';
import {
  findFirstBitcoinAddress,
  isBareBitcoinAddress,
  looksLikeAddressCallout,
} from '../../utils/bitcoinAddress';

describe('bitcoinAddress utils', () => {
  it('detects the first Bitcoin address in mixed text', () => {
    const address = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
    const result = findFirstBitcoinAddress(`gm ser send to ${address} asap`);
    expect(result).toBe(address);
  });

  it('identifies bare Bitcoin address drops', () => {
    const bare = ' bc1qw4hrd9xhw8g9tzge4q93w6a4x6l3mh4x8rg7ap ';
    expect(isBareBitcoinAddress(bare)).toBe(true);
    expect(isBareBitcoinAddress(`my address is ${bare.trim()}`)).toBe(false);
  });

  it('detects address callouts used by artists', () => {
    expect(looksLikeAddressCallout('next 4 addresses')).toBe(true);
    expect(looksLikeAddressCallout('3 addys now!')).toBe(true);
    expect(looksLikeAddressCallout('I like that addressable art')).toBe(false);
  });
});

