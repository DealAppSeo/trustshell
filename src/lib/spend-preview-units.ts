/**
 * Preview a 50 or 100 USDC setting as eth and cbbtc numbers.
 * Fixed scale, not a market price. This does not send.
 */
const ETH_PER_USDC = 1000;
const CBBTC_PER_USDC = 10;

export function spendPreviewUnits(usdc: number): { eth: number; cbbtc: number } {
  if (usdc !== 50 && usdc !== 100) {
    throw new Error('preview setting must be 50 or 100');
  }
  return { eth: usdc * ETH_PER_USDC, cbbtc: usdc * CBBTC_PER_USDC };
}
