/**
 * F-9 and F-12 (BUS, 2026-10-07): four places that said something the code does not do.
 *
 * - F-9: /stake promised that a testnet stake raises the agent's authority ceiling. The figure the
 *   page shows does count practice deposits, but the engine marks it non-binding, and the ceiling
 *   the spend gate uses counts only real, backed deposits.
 * - F-12: the a2a example fell back to signing a payment to an agent id (a UUID), which the signer
 *   rejects as an invalid address. The home page and two SDK comments called proof-verifier
 *   "bundled", "peer" or "optional"; it is a regular dependency (README pin test checks the README).
 *
 * Each check reads the source as text, and each asserts the file was found and non-empty first,
 * so a moved file fails instead of passing over nothing.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (rel: string): string => {
  const s = readFileSync(join(ROOT, rel), 'utf8');
  expect(s.length).toBeGreaterThan(100);
  return s;
};

describe('F-9: /stake does not promise that testnet stake raises spending', () => {
  const page = read('app/stake/page.tsx');

  it('the testnet success message says the stake does not raise what the agent may spend', () => {
    expect(page).not.toMatch(/testnet USDC\. Your authority ceiling is recalculating/);
    expect(page).toMatch(/testnet USDC\. It shows in the figure above, but only a real on-chain deposit raises what the agent may actually spend/);
  });

  it('the intro says only a real on-chain deposit raises the ceiling the spend gate uses', () => {
    expect(page).toMatch(/Only a real on-chain deposit\s+raises the ceiling the spend gate uses/);
  });
});

describe('F-12: the a2a example never signs a payment to an agent id', () => {
  const src = read('examples/a2a-purchase/a2a-purchase.mjs');

  it('signs only to TRUSTSHELL_PAY_TO, with no fallback to providerAgentId', () => {
    expect(src).not.toMatch(/to:\s*[^\n]*providerAgentId/);
    expect(src).toMatch(/to:\s*PAY_TO\b/);
  });

  it('stops cleanly before signing when TRUSTSHELL_PAY_TO is not set', () => {
    const guard = src.indexOf('if (!PAY_TO)');
    const sign = src.indexOf('guardedX402Payment({');
    expect(guard).toBeGreaterThan(-1);
    expect(sign).toBeGreaterThan(guard);
  });
});

describe('F-12: proof-verifier is described as what it is, a regular dependency', () => {
  it('the home page does not say it ships inside or is bundled with trustshell', () => {
    expect(read('components/how-it-works.tsx')).not.toMatch(/ships inside trustshell|bundled with trustshell/i);
  });

  it('the SDK comments do not call it a peer, optional or bundled dependency', () => {
    const sdk = read('src/lib/trustshell.ts');
    expect(sdk).not.toMatch(/proof-verifier \(peer dependency\)/);
    expect(sdk).not.toMatch(/ships as an optionalDependency/);
    expect(sdk).not.toMatch(/bundled WASM verifier/);
  });
});
