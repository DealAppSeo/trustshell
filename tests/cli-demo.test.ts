/**
 * `trustshell demo` (DECISION 4): the whole offline receipt loop in one command — seal a sample
 * receipt with THIS install's key, verify it HERE under that key, print the six-claim verdict and the
 * line to reproduce it. No network, no account. TRUSTSHELL_HOME is an ephemeral temp dir so the real
 * install key is untouched.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, EXIT, type CliIO } from '../src/cli';
import type { TrustShell } from '../src/lib/trustshell';

const NO_CLIENT = {} as TrustShell; // demo never touches the HAL client

function captureIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

describe('trustshell demo (DECISION 4 — one-command offline loop)', () => {
  let home = '';
  let prevHome: string | undefined;

  beforeEach(() => {
    prevHome = process.env.TRUSTSHELL_HOME;
    home = mkdtempSync(join(tmpdir(), 'tl-demo-home-'));
    process.env.TRUSTSHELL_HOME = home;
  });
  afterEach(() => {
    if (prevHome === undefined) delete process.env.TRUSTSHELL_HOME;
    else process.env.TRUSTSHELL_HOME = prevHome;
    rmSync(home, { recursive: true, force: true });
  });

  it('parses with no operand', () => {
    expect(parseArgs(['demo'])).toMatchObject({ command: 'demo' });
  });

  it('seals a sample receipt and verifies it here under its own key (exit 0)', async () => {
    const s = captureIO();
    expect(await run(parseArgs(['demo']), NO_CLIENT, s.io)).toBe(EXIT.OK);
    const out = s.out.join('\n');
    expect(out).toMatch(/Integrity\s+VERIFIED/i);
    expect(out).toContain('owner-self-signed');
    // the five engine claims stay NOT_CHECKED — a self-signature is not independent verification
    expect(out).toMatch(/Authorization\s+NOT_CHECKED/);
    // the reproduce line carries a real 0x pin
    expect(out).toMatch(/verify-receipt r\.json --root 0x[0-9a-f]{64}/);
    // the self-attestation caveat goes to stderr so stdout stays the human report
    expect(s.err.join('\n')).toMatch(/earns no production RepID/i);
  });

  it('--json emits the sealed receipt + the offline verdict a stranger reproduces', async () => {
    const s = captureIO();
    expect(await run(parseArgs(['demo', '--json']), NO_CLIENT, s.io)).toBe(EXIT.OK);
    const d = JSON.parse(s.out.join('\n')) as {
      receipt: { header: { schema: string; provenance: string } };
      verify: { claims: { integrity: { status: string } }; sealer: { trusted: boolean } };
      root: string;
    };
    expect(d.receipt.header.schema).toBe('kernel-receipt/2');
    expect(d.receipt.header.provenance).toBe('owner-self-signed');
    expect(d.verify.claims.integrity.status).toBe('VERIFIED');
    expect(d.verify.sealer.trusted).toBe(true);
    expect(d.root).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
