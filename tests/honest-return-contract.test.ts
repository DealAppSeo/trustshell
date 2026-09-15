import {
  verifyOutputGrounding,
  countProviders,
  repidHonesty,
  proofHonesty,
} from '../src/lib/honest-contract';

// T4 (ai_dispatch #92, board #63): a return type that carries its own evidence cannot lie.
describe('honest return contract (T4) — pure derivations', () => {
  it('A1: grounding is "none" for an ungrounded verdict, "hal" only when a real quorum spoke', () => {
    expect(verifyOutputGrounding(0)).toBe('none'); // HAL could not check
    expect(verifyOutputGrounding(2)).toBe('hal'); // groq + cerebras spoke
  });

  it('docs are generated from the types (providers_used cannot drift to a constant 6)', () => {
    const { readFileSync } = require('node:fs');
    const { resolve } = require('node:path');
    const docs = readFileSync(resolve(process.cwd(), 'docs/SDK_HONEST_RETURN_TYPES.md'), 'utf8');
    expect(docs).toMatch(/generated/i);
    expect(docs).toMatch(/providers_used/);
    expect(docs).toMatch(/grounding/);
    expect(docs).toMatch(/minted/);
    expect(docs).not.toMatch(/\bproviders_used\b.*\b6\b/);
  });

  it('A2: providers_used reflects the LIVE quorum (measured), never a constant', () => {
    // The number varies with the actual evidence — it is not hardcoded (and is 2, not the "6" copy claimed).
    expect(countProviders({ evidence: ['groq:TRUE', 'cerebras:TRUE'] })).toBe(2);
    expect(countProviders({ evidence: ['a', 'b', 'c'] })).toBe(3);
    // Falls back to non-errored provider_responses when `evidence` is absent.
    expect(
      countProviders({ provider_responses: [{ verdict: 'TRUE' }, { verdict: 'ERROR' }, { verdict: 'FALSE' }] }),
    ).toBe(2);
    expect(countProviders({})).toBe(0);
  });

  it('A3: a null field carries a reason — never omitted, never defaulted to a plausible value', () => {
    // The live GET /api/v1/repid/:id shape: no mint/signer fields, `source` present.
    const h = repidHonesty({ repid_score: 2177, tier: 'ESTABLISHED', source: 'cache' } as never);
    expect(h.minted).toBeNull();
    expect(h.reasons.minted).toMatch(/mint status/i);
    expect(h.signer).toBeNull();
    expect(h.reasons.signer.length).toBeGreaterThan(0);
    expect(h.scoreLane).toBe('cache'); // derived from the REAL `source` field, not invented
  });

  it('minted is derived from real on-chain fields; placeholders are NOT mints', () => {
    expect(repidHonesty({ erc8004_address: '0xabc123', erc8004_token_id: '6705' }).minted).toBe(true);
    expect(repidHonesty({ erc8004_address: 'external:foo' }).minted).toBe(false);
    expect(
      repidHonesty({ erc8004_address: 'pending-mint:trinity-w3c', erc8004_token_id: '6706' }).minted,
    ).toBe(false); // the flagship: token id present but address is a placeholder → NOT minted
  });

  it('presentProof note is the fixed honest label; signer is null-with-reason when absent', () => {
    const p = proofHonesty({ scheme: 'plonky3_range_check' } as never);
    expect(p.note).toBe('not a registry aggregate');
    expect(p.signer).toBeNull();
    expect(p.reasons.signer.length).toBeGreaterThan(0);
    // When the payload DOES carry a signer, it is passed through from the real source.
    expect(proofHonesty({ signer: '0xdead' } as never).signer).toBe('0xdead');
    expect(proofHonesty({ eas: { attester: '0xbeef' } } as never).signer).toBe('0xbeef');
  });
});
