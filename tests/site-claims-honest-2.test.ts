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

  it('says what runs today (two families on /check) and tags the third vote and the supermajority as Roadmap', () => {
    // Round 1 tagged "Why at least three agents cross-validate" as shipped, while /how-verification says two checkers run.
    expect(src).not.toMatch(/Why at least three agents cross-validate/);
    expect(src).not.toMatch(/lets the quorum break a tie/);
    expect(src).toContain('Why more than one family checks a claim');
    expect(src).toContain('<ClaimTag tag="shipped" /> Today the check on');
    expect(src).toContain('asks two model families, from different builders, and both must agree for a pass');
    expect(src).toContain('<ClaimTag tag="roadmap" /> The design goes further, and none of this runs today.');
    expect(src).toContain('A third vote from a different family would break a tie');
    expect(src).toContain('agreement would have to clear a golden-ratio supermajority across more families');
    // The design cases are labelled as design, not shown with a measured badge.
    expect(src).toContain('Design: a clear supermajority');
    expect(src).toContain('Design: a 2&#8211;1 split');
    expect(src).not.toContain('<TrustBadge state="MEASURED" />');
  });

  it('says a clear supermajority counts as a real check and that neither it nor a split writes to a score', () => {
    expect(src).toContain('Independent families would clear the bar. It would count as a real check. A check on this site writes nothing to a score.');
    expect(src).not.toMatch(/it can move RepID/i);
    expect(src).not.toMatch(/can move standing on the test network/i);
  });

  it('claims only that THIS site moves no score, and points at /repid for how scores move; /repid really documents the movers', () => {
    // The old sentence said a score moves ONLY when a holdout, a known answer or a person settles a result. /repid documents
    // other movers, so that universal was false. Assert the fact the new sentence leans on, not just its wording.
    expect(src).not.toMatch(/a score moves only when/i);
    expect(src).toContain('Neither writes anything to a score on this site. How scores do move is documented on');
    expect(src).toContain('href="/repid"');
    const repid = flat('app/repid/page.tsx');
    for (const mover of ['code_contribution +25', 'referral +20', 'peacemaker +15', 'challenge', 'prediction']) {
      expect(repid).toContain(mover);
    }
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
    expect(ex).toContain('x402 would settle the micro-fee on-chain, and an ERC-8004 reputation attestation would be written.');
    expect(ex).toContain("Both agents' RepID would update from the outcome");
    expect(ex).not.toContain('x402 settles the micro-fee on-chain');
  });

  it('/examples points at a page that really shows the sample receipt, and says nothing false about where it is', () => {
    // The old sentence said NO page on this site shows an on-chain receipt of that loop. /docs/getting-started renders
    // docs/getting-started.md, which carries the USDC -> reputation receipt with two BaseScan links. Check the chain of facts.
    const ex = flat('app/examples/page.tsx');
    expect(ex).not.toMatch(/No page on this site shows an on-chain receipt/i);
    expect(ex).toContain('href="/docs/getting-started"');
    expect(ex).toContain('One historical sample of that loop');
    // 1. the route exists and renders that markdown file
    const route = flat('app/docs/getting-started/page.tsx');
    expect(route).toContain('"docs", "getting-started.md"');
    // 2. the file carries a settlement receipt: two BaseScan transaction links, called historical
    const doc = readFileSync(join(ROOT, 'docs/getting-started.md'), 'utf8');
    const links = doc.match(/https:\/\/sepolia\.basescan\.org\/tx\/0x[0-9a-fA-F]{64}/g) ?? [];
    expect(new Set(links).size).toBeGreaterThanOrEqual(2);
    expect(doc).toMatch(/historical receipt/);
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

  it('does not say the range proof is the only proof: the passport can also show a stub/fallback proof, and the card says so', () => {
    expect(src).toContain('or a stub/fallback proof that the passport marks as one');
    // The fact behind it: the passport detail page really does mark an engine proof as a stub/fallback one.
    const detail = flat('app/passport/[agentId]/page.tsx');
    expect(detail).toContain('stub/fallback proof');
    expect(detail).toContain('cryptographically_verifiable');
  });
});
