/**
 * Over-cap demo: TRUSTSHELL_PAY_CAP required; amount above cap → exit 1; never signs.
 *
 *   TRUSTSHELL_PAY_CAP=500 TRUSTSHELL_AMOUNT=501 node over-cap.mjs   # exit 1
 *   TRUSTSHELL_PAY_CAP=500 TRUSTSHELL_AMOUNT=500 node over-cap.mjs   # exit 0, still no sign
 */
import { requirePayCap, refuseOverCap } from './require-pay-cap.mjs';

const capR = requirePayCap(process.env);
if (!capR.ok) {
  console.error(capR.message);
  process.exit(1);
}
const amount = process.env.TRUSTSHELL_AMOUNT;
if (amount === undefined || String(amount).trim() === '') {
  console.error('set TRUSTSHELL_AMOUNT (raw USDC units) — will not sign without an amount');
  process.exit(1);
}
const over = refuseOverCap(amount, capR.cap);
if (!over.ok) {
  console.error(over.message);
  process.exit(1);
}
console.log('at or below cap — this script never signs');
process.exit(0);
