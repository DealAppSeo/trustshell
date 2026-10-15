/**
 * site-claims-honest.test.ts — the public copy a red-team review (XC1, 2026-10-15) found overstated
 * against what the code does, pinned so the phrases cannot silently return.
 *
 * Source scan only: no build, no network. Each block names the file and the fact behind the wording:
 *   - a check on this site writes nothing to a score (lib/check-receipt.ts SCORE_LINE)
 *   - STAKE is 5 on the tariff and 0 applied (repid-engine repid-deltas.ts / repid-update.ts)
 *   - purchaseService POSTs a route repid-engine does not have (lib/repid-engine.ts)
 *   - the leaderboard cannot check a registry, so it does not say "verified"
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TERMS_BY_SLUG } from '../lib/glossary';

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

  it('does not tag the five HAL signals "Shipped today": the check returns a label and votes, not signals', () => {
    expect(src).not.toContain('<ClaimTag tag="shipped" />');
    expect(src).toContain('it does not return these signals');
  });
});

describe('docs/getting-started.md', () => {
  const doc = flat('docs/getting-started.md');

  it('does not say every score change is written on-chain, nor call the chain "the full loop"', () => {
    // Case-sensitive on purpose: the honest sentence in section 1 says "Not every score change is written on-chain".
    expect(doc).not.toMatch(/Every score change/);
    expect(doc).not.toMatch(/That['’]s the full loop/i);
  });

  it('says publishing is periodic and can be paused, and the sample transaction is historical', () => {
    expect(doc).toContain('is periodic and can be paused');
    expect(doc).toContain('historical sample');
  });
});

describe('/repid', () => {
  const src = flat('app/repid/page.tsx');

  it('states STAKE as 5 on the tariff and 0 when applied, never as +5', () => {
    expect(src).not.toMatch(/STAKE=5/);
    expect(src).not.toMatch(/stake \+5/i);
    expect(src).toContain('STAKE is 5 on the tariff and 0 when applied: no on-chain verifier');
  });

  it('says the engine computes the tier (computeTier), not "never from the application code"', () => {
    expect(src).not.toMatch(/never from the application code/i);
    expect(src).toMatch(/computed by the engine from the score/);
    expect(src).toContain('computeTier');
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

  it('leads with the honest proof description: Plonky3 range proof, score public, transcripts not bound', () => {
    expect(index).toContain('a Plonky3 range proof that the score exceeds a threshold');
    expect(index).toContain('the proof does not bind agent execution transcripts');
    // The Proof bullet comes first in the list.
    const list = index.slice(index.indexOf('What&apos;s in a passport'));
    expect(list.indexOf('>Proof<')).toBeGreaterThan(-1);
    expect(list.indexOf('>Proof<')).toBeLessThan(list.indexOf('>Identity<'));
  });

  it('the glossary agrees with the passport: the proof is real-with-caveats, not "a stub on this site"', () => {
    for (const slug of ['zkp', 'plonky3']) {
      const t = TERMS_BY_SLUG[slug];
      expect(t).toBeDefined();
      expect(t?.status).not.toBe('not-live');
      expect(`${t?.definition} ${t?.note}`).not.toMatch(/is a stub on this site|generates nothing real|prover is not running/i);
    }
    expect(TERMS_BY_SLUG['zkp']?.note).toMatch(/not bound|public input/);
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
});

describe('/layers', () => {
  const src = flat('app/layers/page.tsx');

  it('marks the band-restore cadence and the upstream host refusal as Roadmap', () => {
    expect(src).toContain('Roadmap, not shipped: roughly 14 days and 20 actions');
    expect(src).toContain('Roadmap, not shipped: its files and network');
  });
});

describe('/leaderboard', () => {
  const src = flat('app/leaderboard/page.tsx');

  it('prints no accuracy percent without its metric: the agents board has none, the models board names it', () => {
    expect(src).not.toMatch(/a\.avg_accuracy \* 100/);
    expect(src).toMatch(/Accuracy <span[^>]*> \{models\.metric\} <\/span>/);
  });

  it('does not paint the engine’s verified flag as "verified"', () => {
    expect(src).not.toMatch(/> verified </);
    expect(src).toContain('engine-flagged');
  });
});
