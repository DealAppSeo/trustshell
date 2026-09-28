/**
 * Preview a spend of 50 or 100. The amount is a number. This does not send.
 */
export function spendPreview(amount: number): { amount: 50 | 100; send: false } {
  if (amount !== 50 && amount !== 100) {
    throw new Error('preview amount must be 50 or 100');
  }
  return { amount, send: false };
}
