/**
 * `trustshell verify-receipt <file>`: verify a receipt OFFLINE from disk and print the six claims.
 * No network — run() never touches a socket here. Reads the committed signed golden, and a tampered
 * copy written to a temp file, as the inputs.
 */
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, EXIT, type CliIO } from '../src/cli';
import type { TrustShell } from '../src/lib/trustshell';

const GOLDEN = join(__dirname, 'fixtures', 'kernel-receipt-v2.golden.json');
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const KEY: string = golden.public_key;
const NO_CLIENT = {} as TrustShell; // verify-receipt never touches the HAL client

function captureIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

function tmpJson(obj: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'tl-verify-'));
  const p = join(dir, 'receipt.json');
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

describe('trustshell verify-receipt', () => {
  it('needs a file operand', () => {
    expect(parseArgs(['verify-receipt']).error).toMatch(/requires <file>/);
    expect(parseArgs(['verify-receipt', 'r.json', '--root', KEY])).toMatchObject({ command: 'verify-receipt', operand: 'r.json', root: KEY });
  });

  it('the signed golden under the pinned key → exit 0, integrity VERIFIED, but envelope claims stay NOT_CHECKED (read, not re-derived), no rollup line', async () => {
    const c = captureIO();
    expect(await run(parseArgs(['verify-receipt', GOLDEN, '--root', KEY]), NO_CLIENT, c.io)).toBe(EXIT.OK);
    const text = c.out.join('\n');
    expect(text).toContain('There is no single verdict');
    for (const label of ['Integrity', 'Authenticity', 'Observation', 'Correctness', 'Authorization', 'Containment']) expect(text).toContain(label);
    expect(text).toMatch(/Integrity\s+VERIFIED/);
    // The envelope is bound but NOT covered by the receipt signature, so even under the pinned root its
    // authorization attestation is READ, not independently verified — it must surface as NOT_CHECKED.
    expect(text).toMatch(/Authorization\s+NOT_CHECKED/);
    expect(text).toMatch(/sealer\s+✓ trusted/);
    expect(text).toMatch(/downgraded to NOT_CHECKED/);
    expect(text).not.toMatch(/\b(overall|valid ✓|trusted ✓ overall)\b/i);
  });

  it('no --root → integrity still VERIFIED on the hash, but with no confirmed sealer it is NOT a pass (exit 2, NOT_CHECKED)', async () => {
    const c = captureIO();
    expect(await run(parseArgs(['verify-receipt', GOLDEN]), NO_CLIENT, c.io)).toBe(EXIT.NOT_CHECKED);
    const text = c.out.join('\n');
    expect(text).toMatch(/Integrity\s+VERIFIED/);
    expect(text).toMatch(/Authorization\s+NOT_CHECKED/);
    expect(text).toMatch(/sealer\s+not trusted/);
  });

  it('a pinned key that did not seal it → integrity FAILED, exit 1, on stderr', async () => {
    const c = captureIO();
    const other = '0x' + 'ab'.repeat(32);
    expect(await run(parseArgs(['verify-receipt', GOLDEN, '--root', other]), NO_CLIENT, c.io)).toBe(EXIT.VETO);
    expect(c.err.join('\n')).toMatch(/Integrity\s+FAILED/);
  });

  it('a tampered receipt → integrity FAILED, exit 1', async () => {
    const tampered = JSON.parse(JSON.stringify(golden.receipt_response));
    tampered.receipt.decision.verdict = 'DENY'; // mutates bytes; header.receipt_hash is now stale
    const p = tmpJson(tampered);
    const c = captureIO();
    expect(await run(parseArgs(['verify-receipt', p, '--root', KEY]), NO_CLIENT, c.io)).toBe(EXIT.VETO);
    expect(c.err.join('\n')).toMatch(/Integrity\s+FAILED/);
  });

  it('--json emits the structured result', async () => {
    const c = captureIO();
    await run(parseArgs(['verify-receipt', GOLDEN, '--root', KEY, '--json']), NO_CLIENT, c.io);
    const parsed = JSON.parse(c.out.join('\n'));
    expect(parsed.claims.integrity.status).toBe('VERIFIED');
    expect(parsed.sealer.trusted).toBe(true);
    expect(parsed.reconciliation.engine_envelope).toBe('BOUND');
  });

  it('a missing file → usage error, nothing thrown', async () => {
    const c = captureIO();
    expect(await run(parseArgs(['verify-receipt', join(tmpdir(), 'does-not-exist-xyz.json'), '--root', KEY]), NO_CLIENT, c.io)).toBe(EXIT.USAGE);
    expect(c.err.join('\n')).toMatch(/cannot read/);
  });
});
