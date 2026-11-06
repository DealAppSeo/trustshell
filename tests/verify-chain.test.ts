/**
 * verifyReceiptChain: walk an ordered sequence of kernel receipts OFFLINE and verify the prev_hash /
 * prev_receipt_id linkage on top of each receipt's own integrity. No network. Fixtures are freshly
 * minted, correctly-hashed kernel-receipt/1 receipts (unsigned: integrity rests on the hash, so with
 * no roots pinned they verify — exactly what lets us build a valid multi-link chain without a signing
 * key).
 */
import { kernelReceiptHash } from '../src/lib/kernel-client';
import { verifyReceiptChain } from '../src/lib/verify-receipt';

// Any valid-format Ed25519 pin triggers the downgrade on an UNSIGNED /1 — the exact key is irrelevant,
// so a constructed dummy (not a real key) keeps the secret-scanner quiet.
const PIN = '0x' + '11'.repeat(32);
const G_ID = '00000000-0000-4000-8000-0000000000a0';
const C_ID = '00000000-0000-4000-8000-0000000000a1';

// A minimal, correctly-hashed kernel-receipt/1, mirroring conformance generate.mjs's v1Receipt.
async function mintV1(opts: { id: string; prevId?: string | null; prevHash?: string | null }): Promise<Record<string, unknown>> {
  const r: Record<string, unknown> = {
    header: { schema: 'kernel-receipt/1', version: 1, receipt_id: opts.id, prev_receipt_id: opts.prevId ?? null, prev_hash: opts.prevHash ?? null, created_at: '2027-01-15T08:00:00.000Z', receipt_hash: '', env: { network: 'base-sepolia', chain_id: 84532, is_simulated: true }, signer: null },
    subject: { agent: { agent_id: 'a', agent_name: 'a' }, owner: { wallet: null, assurance: null, status: 'none' } },
    request: { tool: { name: 'inspect', class: 'read' }, origin: 'Cli', args_hash: '0x' + '00'.repeat(32), amount_raw: null, payee: null, asset: null, chain_id: null },
    decision: { verdict: 'ALLOW', blocking: false, executed: false, reasons: [], checks: [{ name: 'request_wellformed', outcome: 'PASS', source: 'kernel/decide' }], does_not_attest: [], policy: { policy_hash: null, signer: null, signature: 'NOT_CHECKED', expires_at: null, revocation: 'NOT_CHECKED' }, limits: { per_tx_raw: '0', daily_raw: '0', total_raw: '0', effective_per_tx_raw: '0', binding_term: 'per_tx' }, laya: { lane: null, mode: 'shadow', consulted: false } },
    payment: { status: 'NOT_APPLICABLE' },
    verification: { status: 'NOT_CHECKED' },
  };
  (r.header as Record<string, unknown>).receipt_hash = await kernelReceiptHash(r as never);
  return r;
}
const hashOf = (r: Record<string, unknown>) => (r.header as Record<string, string>).receipt_hash;

describe('verifyReceiptChain', () => {
  it('a valid two-receipt chain verifies: root NOT_APPLICABLE, child links, nothing broken', async () => {
    const g = await mintV1({ id: G_ID });
    const c = await mintV1({ id: C_ID, prevId: G_ID, prevHash: hashOf(g) });
    const res = await verifyReceiptChain([g, c]);
    expect(res.chain).toBe('VERIFIED');
    expect(res.length).toBe(2);
    expect(res.broken_at).toBeNull();
    expect(res.links[0].link.status).toBe('NOT_APPLICABLE');
    expect(res.links[1].link.status).toBe('VERIFIED');
    expect(res.links[1].link.expected_prev_hash).toBe(hashOf(g));
    expect(res.links[1].link.actual_prev_hash).toBe(hashOf(g));
    expect(res.links.every((l) => l.verdict.claims.integrity.status === 'VERIFIED')).toBe(true);
  });

  it('an empty sequence is EMPTY, not a pass', async () => {
    const res = await verifyReceiptChain([]);
    expect(res.chain).toBe('EMPTY');
    expect(res.length).toBe(0);
    expect(res.links).toHaveLength(0);
    expect(res.broken_at).toBeNull();
  });

  it('a single receipt verifies (the root has no link to check)', async () => {
    const g = await mintV1({ id: G_ID });
    const res = await verifyReceiptChain([g]);
    expect(res.chain).toBe('VERIFIED');
    expect(res.links[0].link.status).toBe('NOT_APPLICABLE');
    expect(res.broken_at).toBeNull();
  });

  it('a wrong prev_hash breaks the link: chain FAILED at the child', async () => {
    const g = await mintV1({ id: G_ID });
    const c = await mintV1({ id: C_ID, prevId: G_ID, prevHash: '0x' + '11'.repeat(32) }); // points nowhere
    const res = await verifyReceiptChain([g, c]);
    expect(res.chain).toBe('FAILED');
    expect(res.broken_at).toBe(1);
    expect(res.links[1].link.status).toBe('FAILED');
    expect(res.links[1].link.notes.join(' ')).toMatch(/prev_hash/);
  });

  it('a wrong prev_receipt_id breaks the link even when the hash matches', async () => {
    const g = await mintV1({ id: G_ID });
    const c = await mintV1({ id: C_ID, prevId: '00000000-0000-4000-8000-0000000000ff', prevHash: hashOf(g) });
    const res = await verifyReceiptChain([g, c]);
    expect(res.chain).toBe('FAILED');
    expect(res.broken_at).toBe(1);
    expect(res.links[1].link.status).toBe('FAILED');
    expect(res.links[1].link.notes.join(' ')).toMatch(/prev_receipt_id/);
  });

  it('a tampered child (stale hash) fails on its own integrity, not the link', async () => {
    const g = await mintV1({ id: G_ID });
    const c = await mintV1({ id: C_ID, prevId: G_ID, prevHash: hashOf(g) });
    (c.decision as Record<string, unknown>).verdict = 'DENY'; // mutate bytes; header.receipt_hash now stale
    const res = await verifyReceiptChain([g, c]);
    expect(res.chain).toBe('FAILED');
    expect(res.broken_at).toBe(1);
    expect(res.links[1].verdict.claims.integrity.status).toBe('FAILED');
  });

  it('an unsigned chain under a pinned key is a downgrade attack: FAILED at the root', async () => {
    const g = await mintV1({ id: G_ID });
    const c = await mintV1({ id: C_ID, prevId: G_ID, prevHash: hashOf(g) });
    const res = await verifyReceiptChain([g, c], { trustedRoots: [PIN] });
    expect(res.chain).toBe('FAILED');
    expect(res.broken_at).toBe(0);
    expect(res.links[0].verdict.claims.integrity.status).toBe('FAILED');
  });

  it('never throws on garbage input', async () => {
    const res = await verifyReceiptChain([null, 'x', 42]);
    expect(res.chain).toBe('FAILED');
    expect(res.broken_at).toBe(0);
    expect(res.links[0].verdict.schema).toBe('MALFORMED');
  });
});
