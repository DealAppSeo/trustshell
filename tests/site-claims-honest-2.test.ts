/**
 * site-claims-honest-2.test.ts — the four lines left out of the first honesty pass, now fixed, with the
 * corrected sentences asserted (not only the old phrases banned: a ban cannot see a reworded claim).
 *   - /trust-harness: a clear supermajority "can move RepID on testnet" (a check on this site writes nothing to a score)
 *   - /demo and /examples: the market is not live, so neither describes a live settled loop or a homepage receipts panel
 *   - the privacy card: "the prover shipping today is a stub" contradicted the passport; the engine reports a range proof
 * Source scan only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const flat = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '').replace(/\s+/g, ' ');

describe('/trust-harness', () => {
  const src = flat('app/trust-harness/page.tsx');

  it('says a clear supermajority counts as a real check and that neither it nor a split writes to a score', () => {
    expect(src).toContain('Independent families clear the bar. It counts as a real check. A check on this site writes nothing to a score.');
    expect(src).toContain('Neither writes anything to a score on this site; a score moves only when a holdout, a known answer or a person settles a result.');
    expect(src).not.toMatch(/it can move RepID/i);
    expect(src).not.toMatch(/can move standing on the test network/i);
  });
});

describe('/demo and /examples', () => {
  it('/demo says the market is coming soon and nothing can be bought or settled', () => {
    const demo = flat('app/demo/page.tsx');
    expect(demo).toContain('Coming soon: agents hiring agents for micro-fees. Nothing can be bought or settled there yet.');
    expect(demo).not.toMatch(/settled on-chain via x402/i);
    expect(demo).not.toMatch(/Every job is peer-verified/i);
    expect(demo).not.toContain('Watch RepID move');
  });

  it('/examples describes a design target, in the conditional, and points at no panel the homepage lacks', () => {
    const ex = flat('app/examples/page.tsx');
    expect(ex).not.toMatch(/homepage receipts panel/i);
    expect(ex).not.toContain('The live loop runs on Base Sepolia');
    expect(ex).toContain('This is the design target for a single agent-to-agent job on TrustMarket');
    expect(ex).toContain('and not something this site runs');
    expect(ex).toContain('No page on this site shows an on-chain receipt of that loop.');
    expect(ex).toContain('x402 would settle the micro-fee on-chain, and an ERC-8004 reputation attestation would be written.');
    expect(ex).toContain("Both agents' RepID would update from the outcome");
    expect(ex).not.toContain('x402 settles the micro-fee on-chain');
  });
});

describe('the privacy card', () => {
  const src = flat('components/privacy-posture.tsx');

  it('does not say the prover is a stub; it says what the engine reports and that this site verifies nothing', () => {
    expect(src).not.toMatch(/prover shipping today is a stub/i);
    expect(src).not.toMatch(/produces no real proof/i);
    expect(src).toContain('No such commitment exists today, and nothing here is currently protected by one.');
    expect(src).toContain('The only proof the engine reports is a Plonky3 range proof that a RepID score clears a threshold');
    expect(src).toContain('it shows the score rather than hiding it, and this site verifies nothing.');
    expect(src).toContain('ZKP commitments — not live yet');
  });
});
