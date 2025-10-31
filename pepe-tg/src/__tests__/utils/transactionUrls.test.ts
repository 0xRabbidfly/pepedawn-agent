import { describe, it, expect } from 'bun:test';
import { 
  buildTokenScanUrl, 
  buildXChainUrl, 
  buildHorizonAssetUrl,
  buildHorizonTxUrl 
} from '../../utils/transactionUrls';

describe('Transaction URL Utilities', () => {
  describe('buildTokenScanUrl', () => {
    it('should build correct TokenScan URL', () => {
      const url = buildTokenScanUrl('abc123');
      expect(url).toBe('https://cp20.tokenscan.io/tx/abc123');
    });

    it('should handle long transaction hashes', () => {
      const hash = '60b1920c1ad643823601e492558e736f17a085ab1b4a9e942f2a13a82985e95f';
      const url = buildTokenScanUrl(hash);
      expect(url).toBe(`https://cp20.tokenscan.io/tx/${hash}`);
    });
  });

  describe('buildXChainUrl', () => {
    it('should build correct XChain URL', () => {
      const url = buildXChainUrl('abc123');
      expect(url).toBe('https://xchain.io/tx/abc123');
    });
  });

  describe('buildHorizonAssetUrl', () => {
    it('should build dispenser URL correctly', () => {
      const url = buildHorizonAssetUrl('PEPENOPOULOS', 'BTC', 'DIS_LISTING');
      expect(url).toBe('https://horizon.market/assets/PEPENOPOULOS?from=1M&quote_asset=BTC&tab=buy&type=dispenser');
    });

    it('should build DEX swap URL correctly', () => {
      const url = buildHorizonAssetUrl('GROYPERTL', 'XCP', 'DEX_LISTING');
      expect(url).toBe('https://horizon.market/assets/GROYPERTL?from=1M&quote_asset=XCP&tab=buy&type=swap');
    });

    it('should handle BTC payment asset', () => {
      const url = buildHorizonAssetUrl('CORNBADGER', 'BTC', 'DIS_LISTING');
      expect(url).toContain('quote_asset=BTC');
    });

    it('should handle XCP payment asset', () => {
      const url = buildHorizonAssetUrl('PEPELETTERA', 'PEPECASH', 'DEX_LISTING');
      expect(url).toContain('quote_asset=PEPECASH');
    });
  });

  describe('buildHorizonTxUrl', () => {
    it('should build correct Horizon transaction URL', () => {
      const url = buildHorizonTxUrl('abc123');
      expect(url).toBe('https://horizon.market/explorer/tx/abc123');
    });
  });
});

