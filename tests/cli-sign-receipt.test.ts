/**
 * `trustshell sign-receipt <file>`: seal a kernel-receipt body with this install's OWN key, OFFLINE,
 * then hand the output to `trustshell verify-receipt` — the end-to-end "receipts, not promises" loop a
 * skeptic runs. No network. TRUSTSHELL_HOME is an ephemeral temp dir so the real install key is untouched.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, EXIT, type CliIO } from '../src/cli';
import type { TrustShell } from '../src/lib/trustshell';

const NO_CLIENT = {} as TrustShell; // sign/verify-receipt never touch the HAL client

function captureIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

function body(): unknown {
  return {
    header: { receipt_id: 'cli-sign-0001', prev_receipt_id: null, prev_hash: null, created_at: '2026-11-07T00:00:00Z', env: { network: 'base-sepolia', chain_id: 84532, is_simulated: true } },
    subject: { agent: { agent_id: 'agent-1', agent_name: 'demo' }, owner: { wallet: null, assurance: null, status: 'none' } },
    request: { tool: { name: 'echo', class: 'read' }, origin: 'Cli', args_hash: `0x${'a'.repeat(64)}`, amount_raw: null, payee: null, asset: null, chain_id: null },
    decision: { verdict: 'ALLOW', blocking: false, executed: false, reasons: [], checks: [{ name: 'local', outcome: 'PASS', source: 'owner' }], does_not_attest: [], policy: { policy_hash: null, signer: null, signature: 'NOT_CHECKED', expires_at: null, revocation: 'NOT_CHECKED' }, limits: {}, laya: { lane: null, mode: 'shadow', consulted: false } },
    payment: { status: 'none' },
    verification: { status: 'none' },
  };
}

describe('trustshell sign-receipt → verify-receipt (DECISION 1 E2E)', () => {
  let home = '';
  let prevHome: string | undefined;
  let dir = '';

  beforeEach(() => {
    prevHome = process.env.TRUSTSHELL_HOME;
    home = mkdtempSync(join(tmpdir(), 'tl-sign-home-'));
    process.env.TRUSTSHELL_HOME = home;
    dir = mkdtempSync(join(tmpdir(), 'tl-sign-io-'));
  });
  afterEach(() => {
    if (prevHome === undefined) delete process.env.TRUSTSHELL_HOME;
    else process.env.TRUSTSHELL_HOME = prevHome;
    rmSync(home, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  });

  it('needs a file operand', () => {
    expect(parseArgs(['sign-receipt']).error).toMatch(/requires <file>/);
    expect(parseArgs(['sign-receipt', 'body.json'])).toMatchObject({ command: 'sign-receipt', operand: 'body.json' });
  });

  it('seals a body as owner-self-signed, and the printed receipt verifies under the printed root (exit 0)', async () => {
    const bodyPath = join(dir, 'body.json');
    writeFileSync(bodyPath, JSON.stringify(body()));

    const s = captureIO();
    expect(await run(parseArgs(['sign-receipt', bodyPath]), NO_CLIENT, s.io)).toBe(EXIT.OK);

    // stdout is the sealed receipt; stderr carries the pin line and the self-attestation caveat.
    const receipt = JSON.parse(s.out.join('\n'));
    expect(receipt.header.schema).toBe('kernel-receipt/2');
    expect(receipt.header.provenance).toBe('owner-self-signed');
    const errText = s.err.join('\n');
    expect(errText).toMatch(/earns no production RepID/i);
    const root = errText.match(/--root (0x[0-9a-f]{64})/)?.[1];
    expect(root).toBeDefined();

    // the stranger pins exactly what sign-receipt told them to, and the seal verifies
    const receiptPath = join(dir, 'r.json');
    writeFileSync(receiptPath, JSON.stringify(receipt));
    const v = captureIO();
    expect(await run(parseArgs(['verify-receipt', receiptPath, '--root', root!]), NO_CLIENT, v.io)).toBe(EXIT.OK);
    expect(v.out.join('\n')).toMatch(/integrity\s+VERIFIED/i);

    // without pinning the owner key it is NOT a pass — whole, but unsealed (NOT_CHECKED, never 0)
    const u = captureIO();
    expect(await run(parseArgs(['verify-receipt', receiptPath]), NO_CLIENT, u.io)).toBe(EXIT.NOT_CHECKED);
  });

  it('refuses a body that is not an object with a header (exit 2)', async () => {
    const p = join(dir, 'bad.json');
    writeFileSync(p, JSON.stringify({ not: 'a receipt' }));
    const s = captureIO();
    expect(await run(parseArgs(['sign-receipt', p]), NO_CLIENT, s.io)).toBe(EXIT.USAGE);
    expect(s.err.join('\n')).toMatch(/must be a JSON object with a "header"/);
  });

  it('tampering with the sealed receipt breaks verification (exit 1)', async () => {
    const bodyPath = join(dir, 'body.json');
    writeFileSync(bodyPath, JSON.stringify(body()));
    const s = captureIO();
    await run(parseArgs(['sign-receipt', bodyPath]), NO_CLIENT, s.io);
    const receipt = JSON.parse(s.out.join('\n'));
    const root = s.err.join('\n').match(/--root (0x[0-9a-f]{64})/)![1];
    receipt.decision.verdict = 'DENY'; // flip after sealing
    const p = join(dir, 'tampered.json');
    writeFileSync(p, JSON.stringify(receipt));
    const v = captureIO();
    expect(await run(parseArgs(['verify-receipt', p, '--root', root]), NO_CLIENT, v.io)).toBe(EXIT.VETO);
  });
});
