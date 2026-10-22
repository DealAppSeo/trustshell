/**
 * WHO CAN GRANT A PERMISSION, AND WHAT THE OUTPUT CALLS IT. Pins of today's behaviour for the six cases in
 * E:\dev\reports\2026-10-22\GUARD_AUTHORITY_CONCLUSION.md, each classed there as:
 *   BY DESIGN        local guardrails: the policy FILE is the authority; anything running as the owner's OS user
 *                    can rewrite it, so a hand-edited, unsigned or stranger-signed policy is enforced. Disclosed.
 *   DISCLOSURE GAP   the behaviour is fine for local guardrails, the wording claims more.
 *   KNOWN DEFECT     a signature that is not the owner's earns a protected label. These assertions pin the
 *                    defect AS IT IS, so the fix has to flip them on purpose.
 * Today's code is LOCAL GUARDRAILS, not protected owner authority. If enforcement ever starts checking the
 * signature, the BY DESIGN pins here go red: that is a permission-model change (MAJOR, Sean), not a cleanup.
 */
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { runGuarded, runRun } from '../src/cli/guard';
import type { Bundle } from '../src/lib/bundle';
import {
  GUARD_DOES_NOT_COVER,
  GUARD_RECEIPTS_FILE,
  POLICY_FILE,
  SUGGESTED_POLICY_FILE,
  guardDecide,
  loadPolicy,
  policySha256,
  type GuardRecord,
  type LocalPolicy,
  type PolicyDocument,
} from '../src/lib/guardrails';
import { signValue, signerOf, signingKey, verifyValue } from '../src/lib/install-key';

type Host = { root: string; home: string; db: string; cwd: string };
const SCOPE = { mediated: ['test'], not_mediated: ['test'] };
/** The words a reader sees, pinned as text: renaming them is a visible change, not a refactor. */
const SIGNATURE_DOES_NOT_VERIFY = 'signature does NOT verify over this policy';

function newHost(name: string): Host {
  const root = mkdtempSync(join(tmpdir(), `ts-authority-${name}-`));
  const h = { root, home: join(root, 'home'), db: join(root, 'home', 'memory.sqlite'), cwd: join(root, 'work') };
  mkdirSync(h.cwd, { recursive: true });
  return h;
}

/** A key that is neither this install's nor one anybody was told to trust. */
function strangerKey() {
  const { privateKey } = generateKeyPairSync('ed25519');
  return { key: privateKey, signer: signerOf(privateKey) };
}

describe('guard authority: who can grant a permission, and what the output calls it', () => {
  const prevEnv = { ...process.env };
  const prevCwd = process.cwd();
  const made: Host[] = [];
  let out: string[] = [];
  let err: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  let A: Host;

  const host = (name: string) => {
    const h = newHost(name);
    made.push(h);
    return h;
  };
  function as(h: Host): void {
    process.env.TRUSTSHELL_HOME = h.home;
    process.env.TRUSTSHELL_MEMORY = h.db;
    process.chdir(h.cwd);
  }
  async function cli(h: Host, ...argv: string[]): Promise<number> {
    as(h);
    out = [];
    err = [];
    return run(parseArgs(argv), {} as never, io);
  }
  /** The way the binary runs a command: through the CLI gate (`run` alone skips it). */
  async function gated(h: Host, ...argv: string[]): Promise<number> {
    as(h);
    out = [];
    err = [];
    const args = parseArgs(argv);
    return runGuarded(args, () => run(args, {} as never, io), io, process.env);
  }
  /** `trustshell run --tool node -- node`, with a spawner that only records whether it was asked to start. */
  function runNode(h: Host): { code: number; started: boolean; card: string } {
    as(h);
    out = [];
    err = [];
    let started = false;
    const code = runRun(['--tool', 'node', '--', 'node', '-e', '0'], io, process.env, () => ((started = true), { status: 0, signal: null }));
    return { code, started, card: err.join('\n') };
  }
  const spend = (h: Host, amount = '100') => guardDecide(h.home, { tool: 'pay', class: 'spend', amount_raw: amount }, SCOPE)?.decision.decision;
  const doc = (h: Host): PolicyDocument => JSON.parse(readFileSync(join(h.home, POLICY_FILE), 'utf8'));
  const writeDoc = (h: Host, d: PolicyDocument | string) => {
    mkdirSync(h.home, { recursive: true });
    writeFileSync(join(h.home, POLICY_FILE), typeof d === 'string' ? d : JSON.stringify(d, null, 2));
  };
  const records = (h: Host): GuardRecord[] => {
    const p = join(h.home, GUARD_RECEIPTS_FILE);
    return existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as GuardRecord) : [];
  };
  const lastOf = (h: Host, kind: GuardRecord['kind']) => [...records(h)].reverse().find((r) => r.kind === kind);
  const widen = (p: LocalPolicy, over: Partial<LocalPolicy> = {}): LocalPolicy => ({
    ...p,
    actions: [...new Set([...p.actions, 'tool:node', 'spend'])],
    per_tx_raw: '1000',
    daily_raw: '1000',
    total_raw: '1000',
    ...over,
  });
  const showLine = async (h: Host) => {
    await cli(h, 'guard', 'show');
    return out.join('\n').split('\n').find((l) => l.startsWith('policy ')) ?? '';
  };
  const showJsonSigner = async (h: Host) => {
    await cli(h, 'guard', 'show', '--json');
    return JSON.parse(out.join('\n')).signed_by as string | null;
  };
  const exportLine = async (h: Host) => {
    expect(await cli(h, 'bundle', 'export', join(h.root, 'probe.json'), '--force')).toBe(0);
    return out.join('\n').split('\n').find((l) => l.startsWith('policy ')) ?? '';
  };
  /** A policy signed by the owner on host `name`, after the owner's own edit `mutate`. Returns the host and its key. */
  async function signedHost(name: string, mutate: (p: LocalPolicy) => LocalPolicy = (p) => p) {
    const h = host(name);
    expect(await cli(h, 'guard', 'init')).toBe(0);
    expect(await cli(h, 'guard', 'allow', 'tool:node')).toBe(0);
    writeDoc(h, { policy: mutate(doc(h).policy), signature: null });
    expect(await cli(h, 'guard', 'sign')).toBe(0);
    return { h, fp: signingKey(h.home).signer.fingerprint };
  }
  async function exportTo(h: Host, file: string): Promise<string> {
    expect(await cli(h, 'bundle', 'export', file)).toBe(0);
    return file;
  }
  async function importOn(h: Host, file: string, ...flags: string[]) {
    const code = await cli(h, 'bundle', 'import', file, ...flags);
    return { code, text: [...out, ...err].join('\n') };
  }
  /** Re-sign a bundle body with `k` as its author, as a forger who holds only their own key would. */
  function resignBundle(b: Bundle, k: { key: ReturnType<typeof strangerKey>['key']; signer: ReturnType<typeof strangerKey>['signer'] }): Bundle {
    const { signature: _s, ...body } = b;
    const unsigned = { ...body, author: k.signer };
    return { ...unsigned, signature: signValue(unsigned, k.key) } as Bundle;
  }

  beforeEach(() => {
    A = host('a');
  });
  afterEach(() => {
    process.chdir(prevCwd);
    process.env = { ...prevEnv };
    for (const h of made.splice(0)) rmSync(h.root, { recursive: true, force: true });
  });

  describe('1. owner-signed, then hand-edited without re-signing', () => {
    it('BY DESIGN the added action and spend are ALLOWED (the file is the authority); since #608 nothing calls it signed', async () => {
      await cli(A, 'guard', 'init');
      await cli(A, 'guard', 'sign');
      expect(runNode(A)).toMatchObject({ code: 5, started: false }); // control: tool:node is not listed yet
      const d = doc(A);
      writeDoc(A, { ...d, policy: widen(d.policy) }); // the signature object is left exactly as it was

      const r = runNode(A);
      expect(r).toMatchObject({ code: 0, started: true });
      expect(spend(A)).toBe('ALLOWED');

      expect(r.card).toContain(SIGNATURE_DOES_NOT_VERIFY);
      expect(r.card).not.toContain('owner-signed');
      expect(lastOf(A, 'decision')?.authorized.policy_signed_by).toBeNull();
      expect(lastOf(A, 'outcome')?.authorized.policy_signed_by).toBeNull();
      expect(await showLine(A)).toContain(SIGNATURE_DOES_NOT_VERIFY);
      expect(await showJsonSigner(A)).toBeNull();
      const exp = await exportLine(A);
      expect(exp).toContain(SIGNATURE_DOES_NOT_VERIFY);
      expect(exp).not.toContain('owner-signed');
    });

    it('DISCLOSURE GAP the same widening through the CLI plus `guard sign` reads "owner-signed": the install key is usable by anything running as the owner', async () => {
      await cli(A, 'guard', 'init');
      await cli(A, 'guard', 'allow', 'tool:node'); // no key, no password
      await cli(A, 'guard', 'sign'); // the install key: a file the same OS user can read
      const r = runNode(A);
      expect(r).toMatchObject({ code: 0, started: true });
      expect(r.card).toContain('owner-signed');
      expect(await exportLine(A)).toContain('owner-signed by');
    });
  });

  describe('2. signed with a key other than the owner\'s', () => {
    it('KNOWN DEFECT a stranger\'s key that verifies is labelled "owner-signed" on the run card and the bundle export', async () => {
      await cli(A, 'guard', 'init');
      await cli(A, 'guard', 'sign'); // A's install ("owner") key now exists
      const own = signingKey(A.home).signer.fingerprint;
      const k = strangerKey();
      expect(k.signer.fingerprint).not.toBe(own);
      const p = widen(doc(A).policy);
      writeDoc(A, { policy: p, signature: { ...k.signer, signature: signValue(p, k.key) } });

      const r = runNode(A);
      expect(r).toMatchObject({ code: 0, started: true }); // BY DESIGN: unsigned would be enforced too
      expect(spend(A)).toBe('ALLOWED');
      // Literally true: the key that signed, named by its fingerprint.
      expect(await showLine(A)).toContain(`signed by ${k.signer.fingerprint.slice(0, 16)}`);
      expect(await showJsonSigner(A)).toBe(k.signer.fingerprint);
      expect(lastOf(A, 'decision')?.authorized.policy_signed_by).toBe(k.signer.fingerprint);
      // THE DEFECT: a key this host never trusted is called the owner's.
      expect(r.card).toContain('owner-signed');
      expect(await exportLine(A)).toContain(`owner-signed by ${k.signer.fingerprint.slice(0, 16)}`);
    });

    it('since #608 a stranger\'s signature claiming the install key\'s fingerprint names nobody', async () => {
      await cli(A, 'guard', 'init');
      await cli(A, 'guard', 'sign');
      const own = signingKey(A.home).signer.fingerprint;
      const k = strangerKey();
      const p = widen(doc(A).policy);
      writeDoc(A, { policy: p, signature: { ...k.signer, fingerprint: own, signature: signValue(p, k.key) } });
      const r = runNode(A);
      expect(r).toMatchObject({ code: 0, started: true });
      expect(r.card).toContain(SIGNATURE_DOES_NOT_VERIFY);
      expect(r.card).not.toContain('owner-signed');
      expect(lastOf(A, 'decision')?.authorized.policy_signed_by).toBeNull();
      expect(await showLine(A)).not.toContain('signed by');
    });
  });

  it('3. BY DESIGN an unsigned policy (signature null) is enforced as written, and every output says unsigned', async () => {
    await cli(A, 'guard', 'init');
    await cli(A, 'guard', 'sign');
    writeDoc(A, { policy: widen(doc(A).policy), signature: null });
    const r = runNode(A);
    expect(r).toMatchObject({ code: 0, started: true });
    expect(spend(A)).toBe('ALLOWED');
    expect(r.card).toContain('unsigned');
    expect(r.card).not.toContain('owner-signed');
    expect(lastOf(A, 'decision')?.authorized.policy_signed_by).toBeNull();
    expect(await showLine(A)).toContain('unsigned');
    expect(await exportLine(A)).toContain('UNSIGNED (imports as suggested, never enforced)');
  });

  describe('4. Carry: a bundle edited after export, re-signed, or replayed', () => {
    it('HOLDS an edited policy is refused (exit 1) whether or not the payload hash was patched; B is unchanged', async () => {
      const { h, fp } = await signedHost('a4');
      const file = await exportTo(h, join(h.root, 'b.json'));
      const B = host('b4');
      await cli(B, 'guard', 'init');
      const before = loadPolicy(B.home);

      const edited = JSON.parse(readFileSync(file, 'utf8')) as Bundle;
      edited.payload.policy!.document.policy.actions.push('spend');
      writeFileSync(join(B.root, 'e1.json'), JSON.stringify(edited));
      const r1 = await importOn(B, join(B.root, 'e1.json'), '--signer', fp);
      expect(r1.code).toBe(1);
      expect(r1.text).toContain('REFUSED');

      edited.payload.policy!.sha256 = policySha256(edited.payload.policy!.document.policy);
      writeFileSync(join(B.root, 'e2.json'), JSON.stringify(edited));
      const r2 = await importOn(B, join(B.root, 'e2.json'), '--signer', fp);
      expect(r2.code).toBe(1);
      expect(r2.text).toContain('REFUSED the signature does not verify');
      expect(loadPolicy(B.home)).toEqual(before);
    });

    it('HOLDS a bundle re-signed by a forger: NOT_CHECKED without --signer; with it, the policy (A\'s signature broken) is only suggested', async () => {
      const { h, fp } = await signedHost('a4c');
      const b = JSON.parse(readFileSync(await exportTo(h, join(h.root, 'b.json')), 'utf8')) as Bundle;
      b.payload.policy!.document.policy.actions.push('spend');
      b.payload.policy!.sha256 = policySha256(b.payload.policy!.document.policy);
      const k = strangerKey();
      const B = host('b4c');
      await cli(B, 'guard', 'init');
      const before = loadPolicy(B.home);
      writeFileSync(join(B.root, 'f.json'), JSON.stringify(resignBundle(b, k)));
      expect((await importOn(B, join(B.root, 'f.json'))).code).toBe(2);
      expect((await importOn(B, join(B.root, 'f.json'), '--signer', fp)).code).toBe(2); // A's key did not sign this bundle
      const r = await importOn(B, join(B.root, 'f.json'), '--signer', k.signer.fingerprint);
      expect(r.code).toBe(0);
      expect(r.text).toMatch(/suggested, NOT enforced: .*its owner signature does not verify with a key you trust/);
      expect(loadPolicy(B.home)).toEqual(before);
      expect(existsSync(join(B.home, SUGGESTED_POLICY_FILE))).toBe(true);
    });

    it('BY DESIGN + DISCLOSURE GAP a policy the forger signed is ENFORCED once the importer names the forger\'s key, and reads "owner-signed"', async () => {
      // The importer is the same OS user who could `guard allow` anything; --signer is what makes a key "the owner's".
      const { h } = await signedHost('a4d');
      const b = JSON.parse(readFileSync(await exportTo(h, join(h.root, 'b.json')), 'utf8')) as Bundle;
      const k = strangerKey();
      const p = widen(b.payload.policy!.document.policy);
      b.payload.policy = { sha256: policySha256(p), nonce: p.nonce, document: { policy: p, signature: { ...k.signer, signature: signValue(p, k.key) } } };
      const B = host('b4d');
      await cli(B, 'guard', 'init');
      writeFileSync(join(B.root, 'f.json'), JSON.stringify(resignBundle(b, k)));
      const r = await importOn(B, join(B.root, 'f.json'), '--signer', k.signer.fingerprint);
      expect(r.code).toBe(0);
      expect(r.text).toContain(`ENFORCED (owner-signed by ${k.signer.fingerprint.slice(0, 16)}`);
      expect(lastOf(B, 'policy-change')?.change?.via).toBe(`bundle import (owner-signed by ${k.signer.fingerprint.slice(0, 16)}…)`);
      expect(spend(B)).toBe('ALLOWED');
    });

    it('HOLDS replay: an older signed bundle, or a different policy at the same nonce, is suggested and never replaces the newer one', async () => {
      const { h, fp } = await signedHost('a4e', (p) => ({ ...p, nonce: '20' }));
      const n20 = await exportTo(h, join(h.root, 'n20.json'));
      writeDoc(h, { policy: { ...doc(h).policy, actions: [...doc(h).policy.actions, 'spend'] }, signature: null }); // different content, SAME nonce
      await cli(h, 'guard', 'sign');
      const n20b = await exportTo(h, join(h.root, 'n20b.json'));
      await cli(h, 'guard', 'deny', 'tool:node'); // not `kill`: that also denies tool:bundle, and the export with it
      await cli(h, 'guard', 'sign');
      const n21 = await exportTo(h, join(h.root, 'n21.json'));
      const B = host('b4e');
      await cli(B, 'guard', 'init');
      expect((await importOn(B, n20, '--signer', fp)).text).toContain('ENFORCED');
      expect((await importOn(B, n20, '--signer', fp)).text).toContain('its nonce 20 does not supersede the policy in force (nonce 20)');
      expect((await importOn(B, n20b, '--signer', fp)).text).toContain('its nonce 20 does not supersede the policy in force (nonce 20)');
      expect((await importOn(B, n21, '--signer', fp)).text).toContain('ENFORCED');
      expect((await importOn(B, n20, '--signer', fp)).text).toMatch(/does not supersede .*a downgrade or a replay/);
      expect(doc(B).policy.nonce).toBe('21'); // the newer policy is still in force
      expect(runNode(B)).toMatchObject({ code: 5, started: false });
    });

    it('DISCLOSURE GAP replay onto a different subject: nothing compares `subject`, so agent-A\'s policy is ENFORCED on agent-B\'s host', async () => {
      const { h, fp } = await signedHost('a4f', (p) => ({ ...p, subject: 'agent-A', nonce: '50' }));
      const file = await exportTo(h, join(h.root, 'a.json'));
      const B = host('b4f');
      await cli(B, 'guard', 'init');
      writeDoc(B, { policy: { ...doc(B).policy, subject: 'agent-B' }, signature: null });
      await cli(B, 'guard', 'sign');
      const r = await importOn(B, file, '--signer', fp);
      expect(r.code).toBe(0);
      expect(r.text).toContain('ENFORCED (owner-signed by');
      expect(r.text).not.toContain('subject');
      expect(doc(B).policy.subject).toBe('agent-A');
      expect(runNode(B)).toMatchObject({ code: 0, started: true });
    });
  });

  describe('5. the same OS user deletes or replaces the policy, or skips trustshell', () => {
    it('BY DESIGN, disclosed: no policy file = `run` authorizes nothing, every other command is ungated; a command started directly leaves no record', async () => {
      await cli(A, 'guard', 'init');
      await cli(A, 'guard', 'deny', 'tool:remember');
      expect(await gated(A, 'remember', 'gate probe')).toBe(5);
      unlinkSync(join(A.home, POLICY_FILE));
      const r = runNode(A);
      expect(r).toMatchObject({ code: 2, started: false });
      expect(r.card).toContain('NOT_CHECKED no policy');
      expect(await gated(A, 'remember', 'after the delete')).toBe(0);
      await cli(A, 'guard', 'show');
      expect(out.join('\n')).toContain('trustshell run authorizes nothing, and nothing else is gated');

      await cli(A, 'guard', 'init', '--force');
      const n = records(A).length;
      expect(spawnSync(process.execPath, ['-e', '0']).status).toBe(0); // the same command, without trustshell
      expect(records(A)).toHaveLength(n);
      const shown = (await cli(A, 'guard', 'show'), out.join('\n'));
      for (const s of GUARD_DOES_NOT_COVER) expect(shown).toContain(s);
      expect(GUARD_DOES_NOT_COVER.join(' ')).toContain('Anything running as you can edit the policy, delete records, or act without trustshell.');
    });

    it('BY DESIGN, disclosed ("delete records"): deleting policy.json AND the ledger forgets the nonce high-water, so an older signed bundle is ENFORCED again', async () => {
      const { h, fp } = await signedHost('a5b');
      const old = await exportTo(h, join(h.root, 'old.json'));
      await cli(h, 'guard', 'deny', 'tool:node');
      await cli(h, 'guard', 'sign');
      const newer = await exportTo(h, join(h.root, 'newer.json'));
      const B = host('b5b');
      await cli(B, 'guard', 'init');
      expect((await importOn(B, newer, '--signer', fp)).text).toContain('ENFORCED');
      expect((await importOn(B, old, '--signer', fp)).text).toContain('does not supersede');
      expect(runNode(B)).toMatchObject({ code: 5, started: false });
      for (const f of [POLICY_FILE, GUARD_RECEIPTS_FILE, 'guard-receipts.checkpoint.json']) rmSync(join(B.home, f), { force: true });
      const r = await importOn(B, old, '--signer', fp);
      expect(r.text).toContain('ENFORCED (owner-signed by');
      expect(r.text).toContain('supersedes no policy');
      expect(runNode(B)).toMatchObject({ code: 0, started: true });
    });
  });

  describe('6. expiry, nonce reuse, non-canonical numbers', () => {
    it('HOLDS + BY DESIGN an expired signed policy denies everything; moving expires_at forward by hand re-allows it, labelled as not verifying', async () => {
      const { h } = await signedHost('a6a', (p) => ({ ...p, expires_at: Math.floor(Date.now() / 1000) - 60 }));
      const expired = runNode(h);
      expect(expired).toMatchObject({ code: 5, started: false });
      expect(expired.card).toMatch(/DENIED: the policy expired at .*owner-signed/);
      const d = doc(h);
      writeDoc(h, { ...d, policy: { ...d.policy, expires_at: Math.floor(Date.now() / 1000) + 86400 } });
      const revived = runNode(h);
      expect(revived).toMatchObject({ code: 0, started: true });
      expect(revived.card).toContain(SIGNATURE_DOES_NOT_VERIFY);
    });

    it('BY DESIGN the local file\'s nonce is not checked against the ledger: lowered by hand, it is enforced (only import checks supersession)', async () => {
      await cli(A, 'guard', 'init');
      for (const t of ['tool:x1', 'tool:x2', 'tool:x3']) await cli(A, 'guard', 'allow', t);
      expect(doc(A).policy.nonce).toBe('4');
      writeDoc(A, { policy: { ...widen(doc(A).policy), nonce: '1' }, signature: null });
      const r = runNode(A);
      expect(r).toMatchObject({ code: 0, started: true });
      expect(r.card).toContain('nonce 1, unsigned');
    });

    it('HOLDS a limit that is not a canonical decimal makes the whole file invalid, and everything is denied', async () => {
      await cli(A, 'guard', 'init');
      const base = widen(doc(A).policy);
      const fullwidth = `"${String.fromCodePoint(0xff11, 0xff10, 0xff10)}"`;
      const bad = ['"0100"', '"1e3"', '" 100"', '"+100"', '"100.0"', '"0x64"', fullwidth, '-1', '1.5', '1e21', '9007199254740992', `"${(BigInt(2) ** BigInt(256)).toString()}"`];
      for (const lit of bad) {
        writeDoc(A, JSON.stringify({ policy: { ...base, per_tx_raw: 'X' }, signature: null }).replace('"X"', lit));
        expect([lit, loadPolicy(A.home).state]).toEqual([lit, 'invalid']);
        expect([lit, spend(A, '1')]).toEqual([lit, 'DENIED']);
        expect([lit, runNode(A).code]).toEqual([lit, 5]);
      }
      writeDoc(A, { policy: base, signature: null });
      expect(await cli(A, 'guard', 'limit', 'per-tx', '0100')).toBe(2);
      expect(err.join('\n')).toContain('per_tx_raw: not a canonical non-negative decimal integer');
    });

    it('BY DESIGN a safe-integer JSON number (1000, or 1e3) is read as "1000", and a signature over "1000" still verifies: same value, so no new authority', async () => {
      await cli(A, 'guard', 'init');
      const p = widen(doc(A).policy);
      for (const lit of ['1000', '1e3']) {
        writeDoc(A, JSON.stringify({ policy: { ...p, per_tx_raw: 'X' }, signature: null }).replace('"X"', lit));
        const l = loadPolicy(A.home);
        expect(l.state === 'ok' && l.doc.policy.per_tx_raw).toBe('1000');
      }
      writeDoc(A, { policy: p, signature: null });
      await cli(A, 'guard', 'sign');
      writeDoc(A, readFileSync(join(A.home, POLICY_FILE), 'utf8').replace('"per_tx_raw": "1000"', '"per_tx_raw": 1e3'));
      const l = loadPolicy(A.home);
      expect(l.state === 'ok' && !!l.doc.signature && verifyValue(l.doc.policy, l.doc.signature, l.doc.signature.signature)).toBe(true);
      for (const amount of ['0100', '1e3', '100.0', '+100', '0']) expect([amount, spend(A, amount)]).toEqual([amount, 'DENIED']);
    });
  });
});
