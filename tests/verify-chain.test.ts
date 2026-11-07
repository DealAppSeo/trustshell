/**
 * verifyReceiptChain: walk an ordered sequence of kernel receipts OFFLINE and verify the prev_hash /
 * prev_receipt_id linkage on top of each receipt's own integrity. No network. Fixtures are freshly
 * minted, correctly-hashed kernel-receipt/1 receipts (unsigned: integrity rests on the hash, so with
 * no roots pinned they verify — exactly what lets us build a valid multi-link chain without a signing
 * key).
 */
import { generateKeyPairSync, sign as edSign, createHash } from 'node:crypto';
import { kernelReceiptHash, kernelCanonicalJson, KERNEL_RECEIPT_SIGNATURE_DOMAIN } from '../src/lib/kernel-client';
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

// An EPHEMERAL Ed25519 key, generated per test run — never persisted, never a real secret. It lets us
// mint genuinely-signed kernel-receipt/2 receipts and pin their key, the only way a chain can roll up
// to VERIFIED under the "every link sealer-confirmed" rule. (A committed golden has no private half.)
const { publicKey: PUBKEY, privateKey: PRIVKEY } = generateKeyPairSync('ed25519');
const RAW_PUB = Buffer.from((PUBKEY.export({ format: 'jwk' }) as { x: string }).x, 'base64url');
const PUB = '0x' + RAW_PUB.toString('hex');
const FP = '0x' + createHash('sha256').update(RAW_PUB).digest('hex');

// Mint a signed kernel-receipt/2 with the engine's exact recipe: sign the canonical receipt whose header
// omits receipt_hash+signature, then hash (with the signature present). Verifies AUTHENTIC under PUB.
async function mintSigned(opts: { id: string; prevId?: string | null; prevHash?: string | null; expiresAt?: number | null }): Promise<Record<string, unknown>> {
  const r: Record<string, unknown> = {
    header: { schema: 'kernel-receipt/2', version: 2, receipt_id: opts.id, prev_receipt_id: opts.prevId ?? null, prev_hash: opts.prevHash ?? null, created_at: '2027-01-15T08:00:00.000Z', env: { network: 'base-sepolia', chain_id: 84532, is_simulated: true }, signer: { alg: 'ed25519', public_key: PUB, fingerprint: FP } },
    subject: { agent: { agent_id: 'a', agent_name: 'a' }, owner: { wallet: null, assurance: null, status: 'none' } },
    request: { tool: { name: 'inspect', class: 'read' }, origin: 'Cli', args_hash: '0x' + '00'.repeat(32), amount_raw: null, payee: null, asset: null, chain_id: null },
    decision: { verdict: 'ALLOW', blocking: false, executed: false, reasons: [], checks: [{ name: 'request_wellformed', outcome: 'PASS', source: 'kernel/decide' }], does_not_attest: [], policy: { policy_hash: null, signer: null, signature: 'NOT_CHECKED', expires_at: opts.expiresAt ?? null, revocation: 'NOT_CHECKED' }, limits: { per_tx_raw: '0', daily_raw: '0', total_raw: '0', effective_per_tx_raw: '0', binding_term: 'per_tx' }, laya: { lane: null, mode: 'shadow', consulted: false } },
    payment: { status: 'NOT_APPLICABLE' },
    verification: { status: 'NOT_CHECKED' },
  };
  const sig = '0x' + edSign(null, Buffer.from(KERNEL_RECEIPT_SIGNATURE_DOMAIN + kernelCanonicalJson(r), 'utf8'), PRIVKEY).toString('hex');
  (r.header as Record<string, unknown>).signature = sig;
  (r.header as Record<string, unknown>).receipt_hash = await kernelReceiptHash(r as never);
  return r;
}

describe('verifyReceiptChain', () => {
  it('two linked UNSIGNED receipts, no root pinned: links are intact but the chain is NOT_CHECKED, not a pass (no confirmed sealer)', async () => {
    const g = await mintV1({ id: G_ID });
    const c = await mintV1({ id: C_ID, prevId: G_ID, prevHash: hashOf(g) });
    const res = await verifyReceiptChain([g, c]);
    // The linkage itself is sound (child → parent), and each receipt's hash integrity holds...
    expect(res.length).toBe(2);
    expect(res.broken_at).toBeNull();
    expect(res.links[0].link.status).toBe('NOT_APPLICABLE');
    expect(res.links[1].link.status).toBe('VERIFIED');
    expect(res.links[1].link.expected_prev_hash).toBe(hashOf(g));
    expect(res.links[1].link.actual_prev_hash).toBe(hashOf(g));
    expect(res.links.every((l) => l.verdict.claims.integrity.status === 'VERIFIED')).toBe(true);
    // ...but with no trusted key sealing either receipt, the chain is unauthenticated: NOT a VERIFIED pass.
    expect(res.chain).toBe('NOT_CHECKED');
    expect(res.links.every((l) => l.verdict.sealer.trusted === false)).toBe(true);
  });

  it('an empty sequence is EMPTY, not a pass', async () => {
    const res = await verifyReceiptChain([]);
    expect(res.chain).toBe('EMPTY');
    expect(res.length).toBe(0);
    expect(res.links).toHaveLength(0);
    expect(res.broken_at).toBeNull();
  });

  it('a single UNSIGNED receipt, no root: integrity holds but the chain is NOT_CHECKED (unauthenticated)', async () => {
    const g = await mintV1({ id: G_ID });
    const res = await verifyReceiptChain([g]);
    expect(res.chain).toBe('NOT_CHECKED');
    expect(res.links[0].link.status).toBe('NOT_APPLICABLE');
    expect(res.links[0].verdict.claims.integrity.status).toBe('VERIFIED');
    expect(res.broken_at).toBeNull();
  });

  it('a two-link SIGNED chain under the pinned key → VERIFIED: every link sealer-confirmed and linked', async () => {
    const g = await mintSigned({ id: G_ID });
    const c = await mintSigned({ id: C_ID, prevId: G_ID, prevHash: hashOf(g) });
    const res = await verifyReceiptChain([g, c], { trustedRoots: [PUB] });
    expect(res.chain).toBe('VERIFIED');
    expect(res.length).toBe(2);
    expect(res.broken_at).toBeNull();
    expect(res.links.every((l) => l.verdict.sealer.trusted === true)).toBe(true);
    expect(res.links.every((l) => l.verdict.claims.integrity.status === 'VERIFIED')).toBe(true);
    expect(res.links[1].link.status).toBe('VERIFIED');
  });

  it('a signed, linked receipt whose policy expired before as_of → chain FAILED on freshness', async () => {
    const g = await mintSigned({ id: G_ID, expiresAt: 1_800_000_000 });
    const res = await verifyReceiptChain([g], { trustedRoots: [PUB], asOf: 1_800_000_001 });
    expect(res.chain).toBe('FAILED');
    expect(res.broken_at).toBe(0);
    expect(res.links[0].verdict.claims.authorization.status).toBe('FAILED');
    expect(res.links[0].verdict.claims.integrity.status).toBe('VERIFIED'); // the bytes are fine; freshness is not
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
