/**
 * `trustshell receipt <id>`: read a kernel receipt back, check its hash here, print six claims.
 * NO live network: the global fetch is replaced for each test.
 */
import { parseArgs, run, EXIT, type CliIO } from '../src/cli';
import { SIX_CLAIM_KEYS, kernelReceiptHash, type KernelReceiptV1 } from '../src/lib/kernel-client';
import type { TrustShell } from '../src/lib/trustshell';
import { createServer } from '../src/mcp';

const RID = '00000000-0000-4000-8000-0000000000a1';

function captureIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

async function hashedReceipt(): Promise<KernelReceiptV1> {
  const r: any = {
    header: { schema: 'kernel-receipt/1', version: 1, receipt_id: RID, prev_receipt_id: null, prev_hash: null, created_at: '2027-01-01T00:00:00.000Z', receipt_hash: '', env: { network: 'base-sepolia', chain_id: 84532, is_simulated: true }, signer: null },
    subject: { agent: { agent_id: 'a', agent_name: 'a' }, owner: { wallet: null, assurance: null, status: 'none' } },
    decision: { verdict: 'DENY', blocking: true, executed: false, reasons: [], checks: [], does_not_attest: [] },
    payment: { status: 'NOT_APPLICABLE' },
    verification: { status: 'NOT_CHECKED' },
  };
  r.header.receipt_hash = await kernelReceiptHash(r);
  return r;
}

const envelope = (r: KernelReceiptV1) => ({
  _type: 'https://in-toto.io/Statement/v1',
  subject: [{ name: `kernel-receipt:${RID}`, digest: { keccak256: r.header.receipt_hash.slice(2) } }],
  predicateType: 'https://hyperdag.dev/predicates/trust-receipt-six-claims/v1',
  predicate: {
    claims: Object.fromEntries(SIX_CLAIM_KEYS.map((k) => [k, { status: k === 'integrity' ? 'VERIFIED' : 'NOT_CHECKED', statement: `${k} says.`, supports: [], gaps: [`${k} gap`] }])),
    what_this_does_not_establish: ['what the tool did beyond the gated decision'],
  },
});

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });
const answer = (status: number, body: unknown) => { global.fetch = jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch; };
const NO_CLIENT = {} as TrustShell; // `receipt` never touches the HAL client

describe('trustshell receipt', () => {
  it('needs a receipt id', () => {
    expect(parseArgs(['receipt']).error).toMatch(/requires <receiptId>/);
    expect(parseArgs(['receipt', RID])).toMatchObject({ command: 'receipt', operand: RID });
  });

  it('a hash-matched receipt → exit 0, six claims printed one by one, and no rollup line', async () => {
    const r = await hashedReceipt();
    answer(200, { receipt_id: RID, receipt: r, entries: [], six_claims: envelope(r) });
    const c = captureIO();
    expect(await run(parseArgs(['receipt', RID]), NO_CLIENT, c.io)).toBe(EXIT.OK);
    const text = c.out.join('\n');
    expect(text).toContain('There is no single verdict');
    for (const label of ['Integrity', 'Authenticity', 'Observation', 'Correctness', 'Authorization', 'Containment']) expect(text).toContain(label);
    expect(text).toContain('does not establish: correctness gap');
    expect(text).not.toMatch(/\b(overall|verdict:|trusted ✓)/i);
  });

  it('a receipt that does not match its own hash → exit 1 (tampered), printed on stderr', async () => {
    const r: any = await hashedReceipt();
    r.decision.verdict = 'ALLOW';
    answer(200, { receipt_id: RID, receipt: r, entries: [], six_claims: null });
    const c = captureIO();
    expect(await run(parseArgs(['receipt', RID]), NO_CLIENT, c.io)).toBe(EXIT.VETO);
    expect(c.err.join('\n')).toMatch(/does not match its own hash/);
  });

  it('the MCP kernel_receipt tool returns the same read the CLI prints, and a tampered receipt is not ok', async () => {
    const tool = (createServer(NO_CLIENT) as unknown as { _registeredTools: Record<string, { handler: (a: unknown) => Promise<{ content: Array<{ text: string }> }> }> })._registeredTools['kernel_receipt']!;
    const r = await hashedReceipt();
    answer(200, { receipt_id: RID, receipt: r, entries: [], six_claims: envelope(r) });
    const ok = JSON.parse((await tool.handler({ receipt_id: RID })).content[0]!.text).untrusted_data;
    expect(ok).toMatchObject({ ok: true, receipt_id: RID, six_claims_note: null });
    expect(Object.keys(ok.six_claims.predicate.claims)).toEqual([...SIX_CLAIM_KEYS]);
    const edited: any = JSON.parse(JSON.stringify(r));
    edited.decision.executed = true;
    answer(200, { receipt_id: RID, receipt: edited, entries: [], six_claims: envelope(r) });
    const bad = JSON.parse((await tool.handler({ receipt_id: RID })).content[0]!.text).untrusted_data;
    expect(bad).toMatchObject({ ok: false, reason: 'receipt_hash_mismatch' });
  });

  it('no key (401) → exit 3, and it says which variable to set', async () => {
    answer(401, { error: 'Unauthorized: API key required' });
    const c = captureIO();
    expect(await run(parseArgs(['receipt', RID]), NO_CLIENT, c.io)).toBe(EXIT.RUNTIME);
    expect(c.err.join('\n')).toMatch(/REPID_API_KEY/);
  });
});
