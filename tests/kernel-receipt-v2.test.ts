/**
 * Signed kernel receipts (kernel-receipt/2) in the kernel client (src/lib/kernel-client.ts).
 *
 * repid-engine PR #1486 makes the kernel emit kernel-receipt/2 when KERNEL_RECEIPT_SIGNING_KEY is set.
 * Before this, the client refused every schema but kernel-receipt/1, so turning signing on would have
 * refused every kernel call. Three groups:
 *   1. a GOLDEN receipt the engine's own code produced (repid-engine a8c94c76, dryDecision with a
 *      throwaway key: tests/fixtures/kernel-receipt-v2.golden.json; the private key was never written),
 *      so the two implementations are pinned to each other byte for byte;
 *   2. receipts signed here exactly as the engine signs them, with a key generated per test, broken one
 *      way at a time;
 *   3. kernel-receipt/1, unchanged when no signer is pinned, and a downgrade when one is.
 *
 * Nothing here dials a host or holds a real key.
 */
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kernelCanonicalJson, kernelDecide, kernelReceipt, kernelReceiptHash, type KernelCallInput } from '../src/lib/kernel-client';

const GOLDEN = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'kernel-receipt-v2.golden.json'), 'utf8'));
const GOLDEN_KEY: string = GOLDEN.public_key;
const GOLDEN_FINGERPRINT = '0x72852912932120fb01e2ad446f26292e1631225c5aef0a8896205aee38fff8c8';
/** The engine's KERNEL_RECEIPT_SIGNATURE_DOMAIN (src/kernel/receipt-signing.ts), written out here on purpose. */
const ENGINE_DOMAIN = 'hyperdag.kernel-receipt.signature.v1\n';
const ENV = 'TRUSTSHELL_KERNEL_TRUSTED_SIGNERS';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const answering = (body: unknown) => jest.fn(async () => json(200, body)) as unknown as typeof fetch & jest.Mock;

/** The request the golden ALLOW was made for (the engine's spendRequest fixture). */
const goldenInput = (): KernelCallInput => ({
  agent: { agent_id: '11111111-1111-4111-8111-111111111111', agent_name: 'kernel-demo-agent' },
  tool: { name: 'x402.pay', class: 'spend' },
  origin: 'Cli',
  args: { resource: 'https://example.invalid/paid' },
  amount_raw: 10000,
  payee: '0x000000000000000000000000000000000000dEaD',
  asset: 'USDC',
  chain_id: 84532,
});

function newKey(): { privateKey: KeyObject; publicHex: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicHex: `0x${Buffer.from(String(publicKey.export({ format: 'jwk' }).x), 'base64url').toString('hex')}` };
}

/** Seal `receipt` as kernel-receipt/2 the way the engine's buildReceipt does: signer, signature, then the hash. */
async function signAsEngine(receipt: any, key: { privateKey: KeyObject; publicHex: string }): Promise<any> {
  const r = clone(receipt);
  const raw = Buffer.from(key.publicHex.slice(2), 'hex');
  r.header.schema = 'kernel-receipt/2';
  r.header.version = 2;
  r.header.signer = { alg: 'ed25519', public_key: key.publicHex, fingerprint: `0x${createHash('sha256').update(raw).digest('hex')}` };
  delete r.header.signature;
  const { receipt_hash: _h, ...header } = r.header;
  r.header.signature = `0x${sign(null, Buffer.from(ENGINE_DOMAIN + kernelCanonicalJson({ ...r, header }), 'utf8'), key.privateKey).toString('hex')}`;
  r.header.receipt_hash = await kernelReceiptHash(r);
  return r;
}

/** The golden /decide answer with its receipt replaced by `receipt`. */
const decideWith = (receipt: unknown) => ({ ...clone(GOLDEN.decide_response), receipt_preview: receipt });

let savedEnv: string | undefined;
beforeEach(() => {
  savedEnv = process.env[ENV];
  delete process.env[ENV];
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV];
  else process.env[ENV] = savedEnv;
});

// ── 1. the engine's own receipt ─────────────────────────────────────────────────────────────────

describe('a kernel-receipt/2 the engine produced (golden, repid-engine a8c94c76)', () => {
  it('is what it says it is: signed, ALLOW, and its hash recomputes here', async () => {
    const r = GOLDEN.decide_response.receipt_preview;
    expect(r.header.schema).toBe('kernel-receipt/2');
    expect(r.header.signer).toEqual({ alg: 'ed25519', public_key: GOLDEN_KEY, fingerprint: GOLDEN_FINGERPRINT });
    expect(await kernelReceiptHash(r)).toBe(r.header.receipt_hash);
  });

  it('pinned to the engine key: the ALLOW is accepted and AUTHENTIC', async () => {
    const out: any = await kernelDecide(goldenInput(), { fetch: answering(GOLDEN.decide_response), trustedSigners: [GOLDEN_KEY] });
    expect(out).toMatchObject({ allowed: true, verdict: 'ALLOW' });
    expect(out.authenticity).toEqual({ status: 'AUTHENTIC', fingerprint: GOLDEN_FINGERPRINT });
  });

  it('the pin can come from TRUSTSHELL_KERNEL_TRUSTED_SIGNERS, upper-case and beside a retired key', async () => {
    process.env[ENV] = ` ${newKey().publicHex}, 0x${GOLDEN_KEY.slice(2).toUpperCase()} `;
    const out: any = await kernelDecide(goldenInput(), { fetch: answering(GOLDEN.decide_response) });
    expect(out.allowed).toBe(true);
    expect(out.authenticity?.status).toBe('AUTHENTIC');
  });

  it('no pin: the ALLOW passes, and says NOT_CHECKED (who signed it was not checked)', async () => {
    const out: any = await kernelDecide(goldenInput(), { fetch: answering(GOLDEN.decide_response) });
    expect(out.allowed).toBe(true);
    expect(out.authenticity).toMatchObject({ status: 'NOT_CHECKED', reason: 'no_trusted_signers' });
  });

  it('pinned to a different key: REFUSED as not authentic', async () => {
    const out: any = await kernelDecide(goldenInput(), { fetch: answering(GOLDEN.decide_response), trustedSigners: [newKey().publicHex] });
    expect(out).toMatchObject({ allowed: false, verdict: 'NOT_CHECKED', source: 'client' });
    expect(out.reasons[0].code).toBe('receipt_not_authentic');
    expect(out.reasons[0].detail).toMatch(/untrusted_signer/);
  });

  it('reading it back: ok, AUTHENTIC, with its six claims', async () => {
    const out: any = await kernelReceipt('00000000-0000-4000-8000-000000000001', { fetch: answering(GOLDEN.receipt_response), trustedSigners: [GOLDEN_KEY] });
    expect(out.ok).toBe(true);
    expect(out.authenticity).toEqual({ status: 'AUTHENTIC', fingerprint: GOLDEN_FINGERPRINT });
    expect(out.six_claims).not.toBeNull();
  });

  it('reading it back pinned to another key: not ok, receipt_not_authentic', async () => {
    const out: any = await kernelReceipt('00000000-0000-4000-8000-000000000001', { fetch: answering(GOLDEN.receipt_response), trustedSigners: [newKey().publicHex] });
    expect(out).toMatchObject({ ok: false, reason: 'receipt_not_authentic' });
  });
});

// ── 2. signed here, as the engine signs ────────────────────────────────────────────────────────

describe('kernel-receipt/2 signed with a throwaway key, exactly as the engine does', () => {
  const base = GOLDEN.decide_response.receipt_preview;

  it('this test signs byte-for-byte like the engine: re-signing the golden body reproduces a verifying receipt', async () => {
    const k = newKey();
    const r = await signAsEngine(base, k);
    const out: any = await kernelDecide(goldenInput(), { fetch: answering(decideWith(r)), trustedSigners: [k.publicHex] });
    expect(out.allowed).toBe(true);
    expect(out.authenticity?.status).toBe('AUTHENTIC');
  });

  const breaks: Array<[string, (r: any) => void]> = [
    ['one byte of the body changed, hash resealed', (r) => { r.subject.agent.agent_name += 'x'; }],
    ['one hex digit of the signature changed, hash resealed', (r) => { r.header.signature = r.header.signature.slice(0, -1) + (r.header.signature.endsWith('0') ? '1' : '0'); }],
    ['the same signature upper-cased (a second encoding)', (r) => { r.header.signature = '0x' + r.header.signature.slice(2).toUpperCase(); }],
    ['a fingerprint that is not the key\'s', (r) => { r.header.signer.fingerprint = '0x' + '00'.repeat(32); }],
    ['the signer swapped for the pinned key, signature kept', (r) => { r.header.signer = clone(base.header.signer); }],
    ['no signature', (r) => { delete r.header.signature; }],
    ['signer null on a kernel-receipt/2', (r) => { r.header.signer = null; }],
    ['version 1 on a kernel-receipt/2', (r) => { r.header.version = 1; }],
    ['an alg that is not ed25519', (r) => { r.header.signer.alg = 'secp256k1'; }],
  ];
  it.each(breaks)('%s → REFUSED, with the signer pinned and with no pin', async (_label, mutate) => {
    const k = newKey();
    const r = await signAsEngine(base, k);
    mutate(r);
    r.header.receipt_hash = await kernelReceiptHash(r); // a forger reseals the hash: no key is needed for that
    for (const trustedSigners of [[k.publicHex, GOLDEN_KEY], []]) {
      const out: any = await kernelDecide(goldenInput(), { fetch: answering(decideWith(r)), trustedSigners });
      expect(out.allowed).toBe(false);
      expect(out.reasons[0].code).toMatch(/^(receipt_not_authentic|allow_not_bound_to_request)$/);
      const read: any = await kernelReceipt(r.header.receipt_id, { fetch: answering({ receipt: r }), trustedSigners });
      expect(read.ok).toBe(false);
    }
  });

  it('a body edit without resealing is still the hash mismatch it always was', async () => {
    const k = newKey();
    const r = await signAsEngine(base, k);
    r.request.amount_raw = '999';
    const read: any = await kernelReceipt(r.header.receipt_id, { fetch: answering({ receipt: r }), trustedSigners: [k.publicHex] });
    expect(read).toMatchObject({ ok: false, reason: 'receipt_hash_mismatch' });
  });

  it('a forger\'s OWN key signs validly but is not pinned → REFUSED (never trust the header\'s signer by itself)', async () => {
    const forger = newKey();
    const r = await signAsEngine(base, forger);
    const out: any = await kernelDecide(goldenInput(), { fetch: answering(decideWith(r)), trustedSigners: [GOLDEN_KEY] });
    expect(out.allowed).toBe(false);
    expect(out.reasons[0]).toMatchObject({ code: 'receipt_not_authentic' });
  });

  it('a forger\'s own key with NO pin is NOT_CHECKED, never AUTHENTIC', async () => {
    const r = await signAsEngine(base, newKey());
    const out: any = await kernelDecide(goldenInput(), { fetch: answering(decideWith(r)) });
    expect(out.allowed).toBe(true);
    expect(out.authenticity?.status).toBe('NOT_CHECKED');
  });

  it('a malformed pin refuses before anything is sent (fail closed, never "trust none and pass")', async () => {
    for (const pin of [['not-a-key'], [GOLDEN_KEY.slice(0, -2)], [`${GOLDEN_KEY}00`]]) {
      const f = answering(GOLDEN.decide_response);
      const out: any = await kernelDecide(goldenInput(), { fetch: f, trustedSigners: pin });
      expect(out).toMatchObject({ allowed: false, source: 'client' });
      expect(out.reasons[0].code).toBe('trusted_signers_invalid');
      expect(f).not.toHaveBeenCalled();
    }
    process.env[ENV] = `${GOLDEN_KEY},oops`;
    const read: any = await kernelReceipt('00000000-0000-4000-8000-000000000001', { fetch: answering(GOLDEN.receipt_response) });
    expect(read).toMatchObject({ ok: false, reason: 'trusted_signers_invalid' });
  });
});

// ── 3. kernel-receipt/1 ─────────────────────────────────────────────────────────────────────────

describe('kernel-receipt/1', () => {
  /** The golden body as the engine emits it with no key: schema 1, signer null, no signature, the unsigned line. */
  async function v1(): Promise<any> {
    const r = clone(GOLDEN.decide_response.receipt_preview);
    r.header.schema = 'kernel-receipt/1';
    r.header.version = 1;
    r.header.signer = null;
    delete r.header.signature;
    r.header.receipt_hash = await kernelReceiptHash(r);
    return r;
  }

  it('no pin: accepted exactly as before, and its authenticity says it is unsigned and unchecked', async () => {
    const r = await v1();
    const out: any = await kernelDecide(goldenInput(), { fetch: answering(decideWith(r)) });
    expect(out).toMatchObject({ allowed: true, verdict: 'ALLOW', source: 'kernel', reasons: [] });
    expect(out.receipt).toEqual(r);
    expect(out.authenticity).toMatchObject({ status: 'NOT_CHECKED', reason: 'unsigned' });
    const read: any = await kernelReceipt(r.header.receipt_id, { fetch: answering({ receipt: r }) });
    expect(read.ok).toBe(true);
  });

  it('a signer is pinned: an unsigned receipt is a downgrade and is REFUSED', async () => {
    const r = await v1();
    const out: any = await kernelDecide(goldenInput(), { fetch: answering(decideWith(r)), trustedSigners: [GOLDEN_KEY] });
    expect(out.allowed).toBe(false);
    expect(out.reasons[0].code).toBe('receipt_not_authentic');
    expect(out.reasons[0].detail).toMatch(/unsigned/);
  });

  it('a schema that is neither is still refused', async () => {
    const r = await v1();
    r.header.schema = 'kernel-receipt/3';
    r.header.receipt_hash = await kernelReceiptHash(r);
    expect(((await kernelDecide(goldenInput(), { fetch: answering(decideWith(r)) })) as any).allowed).toBe(false);
    expect(((await kernelReceipt(r.header.receipt_id, { fetch: answering({ receipt: r }) })) as any).reason).toBe('unreadable_response');
  });
});
