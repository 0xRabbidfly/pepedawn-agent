/**
 * Counterparty quantities, as the market posts print them.
 *
 * The API gives a divisible asset's quantity in its smallest unit - BTC and
 * XCP both carry eight decimals - so 100 XCP arrives as 10,000,000,000.
 *
 * 24 September, from the owner: "fix the prices being reported in the
 * marketplace- FAKEASF is not being offered for 1 xcp". The listing post and
 * /fm both trimmed zeros with /\.?0+$/ on the plain number, and that pattern
 * does not stop at the decimal point: "100" became "1". Every whole price
 * ending in zero lost its zeros - 10, 100 and 1,000 XCP all read "1 XCP", 20
 * read "2", 250 read "25". A price under a millionth printed as "1e-7".
 *
 * Fixed to eight places first, so only the zeros after the point can go.
 */

export const UNITS_PER_WHOLE = 100_000_000;

export function formatUnits(raw: number): string {
  if (!Number.isFinite(raw) || raw === 0) return '0';
  return (raw / UNITS_PER_WHOLE).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}
