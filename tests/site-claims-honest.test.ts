/**
 * site-claims-honest.test.ts — the public copy a red-team review (XC1, 2026-10-15) found overstated
 * against what the code does, pinned so it cannot silently return.
 *
 * Source scan only: no build, no network. Two kinds of assertion, on purpose:
 *   - BANS on the old phrases; and
 *   - the CORRECTED sentences and labels, asserted to be present. A ban cannot see a reworded claim (round 1 of
 *     this review passed its own bans while nearby sentences asserted the same mechanism), so the replacement
 *     wording is pinned too: edit it back toward the claim, or delete it, and this goes red.
 *
 * The facts behind the wording:
 *   - a check on this site writes nothing to a score (lib/check-receipt.ts SCORE_LINE)
 *   - verifyOutput returns a verdict, a trust score and signals and writes no RepID (src/lib/trustshell.ts)
 *   - the five signals come from the style extractor / the engine's response, and read 0 when absent (same file)
 *   - STAKE is 5 on the tariff and 0 applied (repid-engine repid-deltas.ts / repid-update.ts)
 *   - the tier is overwritten by the database trigger trg_sync_tier (repid-engine CLAUDE.md)
 *   - purchaseService POSTs a route repid-engine does not have (lib/repid-engine.ts)
 *   - the passport and leaderboard repeat the engine's words; this site verifies none of them
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TERMS_BY_SLUG, STATUS_LABEL } from '../lib/glossary';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
// JSX and markdown wrap lines, so a phrase is matched across any whitespace.
const flat = (rel: string) => read(rel).replace(/\s+/g, ' ');

describe('/how-verification', () => {
  const src = flat('app/how-verification/page.tsx');

  it('says a check on this site writes nothing to a score, and never that it can move RepID', () => {
    expect(src).toContain('A check on this site writes nothing to a score.');
    expect(src).not.toMatch(/it can move RepID/i);
  });

  it('the lede matches the body: two families today, the golden-ratio supermajority is the design target', () => {
    expect(src).toContain('Today TrustShell runs a claim past');
    expect(src).toContain('two uncorrelated model families');
    expect(src).toContain('both must agree for a pass');
    expect(src).toContain('is the design target, not what runs');
    // The old lede said the supermajority DECIDES, over a body that says it is Roadmap.
    expect(src).not.toMatch(/lets a <span[^>]*>golden-ratio supermajority<\/span> decide/);
    expect(src).not.toMatch(/runs a claim past several/);
  });

  it('the five signals say what they are and where they come from, and are not tagged "Shipped today"', () => {
    expect(src).not.toContain('<ClaimTag tag="shipped" />');
    expect(src).toContain('What HAL’s five signals are, and where they come from');
    expect(src).toContain('the style-only extractor returns the harm and epistemic fields');
    expect(src).toContain('a signal the engine does not return reads 0 in the SDK');
    expect(src).toContain('they are not what decides Checks out or Caught on /check');
    expect(src).toContain('it does not return these signals');
    for (const field of ['evidenceQuality', 'certaintyAtClaim', 'scopeAppropriateness', 'epistemicUncertainty', 'harmProbability']) {
      expect(src).toContain(`field: '${field}'`);
    }
    expect(src).toContain('SDK field <code>{s.field}</code> · from {s.source}');
    // The old heading and sentence said HAL fact-check reads these inside each family.
    expect(src).not.toContain('What the check actually looks at');
    expect(src).not.toMatch(/Inside each family, HAL fact-check reads a claim along/);
  });
});

describe('docs/getting-started.md', () => {
  const doc = flat('docs/getting-started.md');

  it('does not say every score change is written on-chain, nor call the chain "the full loop"', () => {
    // Case-sensitive on purpose: the honest sentence in section 1 says "Not every score change is written on-chain".
    expect(doc).not.toMatch(/Every score change/);
    expect(doc).not.toMatch(/That['’]s the full loop/i);
    expect(doc).not.toMatch(/plus a delta on the agent['’]s portable reputation/);
  });

  it('says publishing is periodic and can be paused, and the sample transaction is historical', () => {
    expect(doc).toContain('is periodic and can be paused');
    expect(doc).toContain('historical sample');
  });

  it('says verifyOutput returns a verdict, a trust score and signals and writes no RepID', () => {
    expect(doc).toContain('returns a `PASS` / `FLAG` / `VETO` verdict, a trust score and signals. `verifyOutput` writes no RepID');
  });

  it('the diagram is split into what verifyOutput does and a design target that says it is not', () => {
    expect(doc).toContain('The top block is what `verifyOutput` does today; the bottom block is the design target, not something `verifyOutput` does');
    expect(doc).toContain('-- today ends here; verifyOutput writes no RepID --');
    expect(doc).toContain('Design target, NOT what verifyOutput does');
    // The old diagram drew verifyOutput -> RepID update -> on-chain attestation as one flow.
    expect(doc).not.toMatch(/├─▶ RepID update/);
  });
});

describe('/repid', () => {
  const src = flat('app/repid/page.tsx');

  it('states STAKE as 5 on the tariff and 0 when applied, never as +5', () => {
    expect(src).not.toMatch(/STAKE=5/);
    expect(src).not.toMatch(/stake \+5/i);
    expect(src).toContain('STAKE is 5 on the tariff and 0 when applied: no on-chain verifier');
  });

  it('names ONE tier mechanism, the database trigger, in both places and in the formula block', () => {
    // Round 1 said "derived by the database" at the top and "computed by the engine (computeTier)" below.
    expect(src).not.toMatch(/never from the application code/i);
    expect(src).not.toMatch(/never written by hand/i);
    expect(src).not.toMatch(/computed by the engine from the score/);
    expect(src).toContain('is derived by the database on every write, from the score and the agent&apos;s unique counterparties');
    expect(src).toContain('a trigger overwrites any tier the engine itself writes');
    expect(src).toContain('is derived by the database from the score and the agent&apos;s unique counterparties');
    expect(src).toContain('tier = compute_tier( new_repid, agent ) // database trigger; also demotes on counterparty count');
  });
});

describe('/passport', () => {
  const index = flat('app/passport/page.tsx');
  const detail = flat('app/passport/[agentId]/page.tsx');

  it('carries no claim that has no code behind it', () => {
    for (const src of [index, detail]) {
      expect(src).not.toMatch(/recorded fact/i);
      expect(src).not.toMatch(/never an unverified claim/i);
      expect(src).not.toMatch(/three-touchpoint/i);
      expect(src).not.toMatch(/verified by HAL/i);
      expect(src).not.toMatch(/Mock money earns zero reputation/i);
    }
  });

  it('says the engine reports the proof and this site does not verify it, and points at the real verifier', () => {
    expect(index).toContain('what the engine reports about its latest Plonky3 range proof');
    expect(index).toContain('This site does not verify that proof.');
    expect(index).toContain('does not bind agent execution transcripts');
    expect(index).toContain('the engine reports a Plonky3 range proof that the score exceeds a threshold');
    expect(index).toContain('<code>trustshell proof</code>');
    expect(index).toContain('<code>@hyperdag/proof-verifier</code>');
    // The old sentence: "One call returns ... a Plonky3 range proof".
    expect(index).not.toMatch(/and a Plonky3 range proof that the score exceeds a threshold/);
    // The Proof bullet comes first in the list.
    const list = index.slice(index.indexOf('What&apos;s in a passport'));
    expect(list.indexOf('>Proof<')).toBeGreaterThan(-1);
    expect(list.indexOf('>Proof<')).toBeLessThan(list.indexOf('>Identity<'));
  });

  it('the detail page does not paint a server boolean as a verification', () => {
    expect(detail).toContain('Verifiable (reported by the engine)');
    expect(detail).toContain('yes, the engine says so; this page did not check');
    expect(detail).toContain('EAS anchor (uid reported by the engine)');
    expect(detail).not.toContain('Cryptographically verifiable');
    expect(detail).not.toMatch(/text-green-500">yes/);
    expect(detail).toContain('Only the identity row is checked on-chain from here');
  });

  it('the glossary agrees with the passport: the engine has it, this site verifies nothing, and the status says so', () => {
    for (const slug of ['zkp', 'plonky3']) {
      const t = TERMS_BY_SLUG[slug];
      expect(t).toBeDefined();
      // Not "approximate" (that means measured against a stand-in) and not "not-live" (the engine does report proofs).
      expect(t?.status).toBe('engine-only');
      expect(`${t?.definition} ${t?.note}`).not.toMatch(/is a stub on this site|generates nothing real|prover is not running/i);
    }
    expect(STATUS_LABEL['engine-only']).toBe('In the engine, not verified here');
    expect(TERMS_BY_SLUG['zkp']?.note).toMatch(/This site verifies nothing/);
    expect(TERMS_BY_SLUG['zkp']?.note).toMatch(/not bound|public input/);
    expect(TERMS_BY_SLUG['plonky3']?.note).toMatch(/proves and verifies nothing itself/);
    const legend = flat('app/glossary/page.tsx');
    expect(legend).toContain('In the engine, not verified here');
    expect(legend).toContain('does not run it and cannot check it from here');
  });
});

describe('/market', () => {
  const page = flat('app/market/page.tsx');
  const dialog = flat('components/purchase-service.tsx');

  it('keeps "Coming soon" and drops the settled / earns-RepID / peer-verified promises', () => {
    expect(page).toContain('Coming soon');
    for (const src of [page, dialog]) {
      expect(src).not.toMatch(/settled on-chain via x402/i);
      expect(src).not.toMatch(/Every transaction earns RepID/i);
      expect(src).not.toMatch(/Every service is peer-verified/i);
      expect(src).not.toMatch(/x402 · on-chain USDC/);
    }
  });

  it('does not mount the purchase button while purchaseService targets a route that does not exist', () => {
    expect(page).not.toMatch(/PurchaseServiceButton/);
    expect(page).not.toMatch(/components\/purchase-service/);
  });

  it('does not point at a homepage receipts panel the homepage does not have', () => {
    expect(page).not.toMatch(/homepage receipts panel/i);
  });

  it('the settlements list says it is not wired, instead of a header that promises a feed', () => {
    expect(page).toContain('Recent settlements (not wired yet)');
    expect(page).toContain('No settlements are listed: nothing is wired to this list yet.');
    expect(page).not.toMatch(/Last 10, sanitized/);
    expect(page).not.toMatch(/x402 \+ ERC-8004/);
    expect(page).not.toMatch(/Awaiting marketplace activity/);
  });
});

describe('/layers', () => {
  const src = flat('app/layers/page.tsx');

  it('marks the band-restore cadence and the upstream host refusal as Roadmap', () => {
    expect(src).toContain('Roadmap, not shipped: roughly 14 days and 20 actions');
    expect(src).toContain('Roadmap, not shipped: its files and network');
  });

  it('beat 3 says a vote moves no score, in step with how-verification and the receipt', () => {
    expect(src).toContain('it may set the label, but it moves no score (a check on this site writes nothing to one)');
    expect(src).not.toMatch(/move testnet RepID/);
  });
});

describe('/leaderboard', () => {
  const src = flat('app/leaderboard/page.tsx');

  it('prints no accuracy percent without its ruler: the agents board has none, the models board names the metric and n', () => {
    expect(src).not.toMatch(/a\.avg_accuracy \* 100/);
    expect(src).toMatch(/Accuracy <span[^>]*> \{models\.metric\} <\/span>/);
    expect(src).toContain("n={m.n_items == null ? 'not given' : m.n_items}");
  });

  it('does not paint the engine’s verified flag as "verified", and says what “engine-flagged” means', () => {
    expect(src).not.toMatch(/> verified </);
    expect(src).toContain('engine-flagged');
    expect(src).toContain('the engine’s <code>verified</code> field is true for that agent. This page does not check what it refers to.');
  });
});
