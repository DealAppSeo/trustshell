/**
 * Portable Toolbelt v1 (toolbelts/inspect-run): the negative tests. Each drives the CLI and the MCP server from
 * dist/ in child processes against disposable homes, and each carries its positive control in the same test, so a
 * protection that stopped working, or a test that could no longer tell, goes red. scripts/toolbelt-mutation.mjs
 * removes each protection in turn and shows the matching test go red.
 *
 * OFFLINE BY DESIGN. Under OFFLINE=1 a call the guard ALLOWS starts and answers NOT_CHECKED without asking GitHub
 * (CLI exit 2, MCP status not_checked), and a call it DENIES is refused before it starts (CLI exit 5, MCP text
 * "DENIED"), so allowed and refused are told apart with no network. The live known answer against GitHub is
 * scripts/toolbelt-proof.mjs; TOOLBELT_LIVE=1 runs it here, and without it that test reports as skipped.
 *
 * TOOLBELT_DIST and TOOLBELT_HARNESS point these tests at another build or harness (the mutation runner's copies).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const H: any = require(process.env.TOOLBELT_HARNESS ?? join(ROOT, 'scripts', 'toolbelt-harness.cjs'));
const DIST = process.env.TOOLBELT_DIST ?? join(ROOT, 'dist');
const CLI = join(DIST, 'cli', 'index.js');
const MCP = join(DIST, 'mcp', 'index.js');
const BELT = join(ROOT, 'toolbelts', 'inspect-run');
const L = H.lib(DIST);
const m = H.readBelt(BELT).manifest;
const ka = m.known_answer;
const EXAMPLE = join(ROOT, 'public', 'examples', 'run-failed-record.json');

type Run = { code: number | null; out: string; err: string };
type Place = { dir: string; home: string; work: string };
type Runtime = Place & { belt: string; cli: (...a: string[]) => Run; env: Record<string, string>; setup: (...a: string[]) => Run };

let TMP = '';
let bundleFile = '';
let bundleText = '';
let fp = '';

function place(name: string): Place {
  const dir = join(TMP, name);
  const home = join(dir, 'home', '.trustshell');
  const work = join(dir, 'work');
  mkdirSync(home, { recursive: true });
  mkdirSync(work, { recursive: true });
  return { dir, home, work };
}

/** An owner home that issues the belt's grant and carries it in a bundle (scripts/toolbelt-harness.cjs issueGrant). */
function owner(name: string, expiresInS: number, narrow = true) {
  const O = place(name);
  const file = join(TMP, `${name}-bundle.json`);
  const g = H.issueGrant({ L, cli: H.cliRunner(CLI, { env: H.hostEnv(O.home), cwd: O.work }), home: O.home, beltDir: BELT, bundleFile: file, expiresInS, narrow });
  return { file, text: readFileSync(file, 'utf8'), fp: g.fingerprint as string, g };
}

/** A runtime: its own home and belt copy, the owner's bundle imported under the owner key, OFFLINE for its calls. */
function runtime(name: string, bundle = bundleFile, signer = fp): Runtime {
  const R = place(name);
  // The Agent Skills spec: a skill's folder is named after it, so the copy keeps the name.
  const belt = join(R.dir, 'belts', m.name);
  cpSync(BELT, belt, { recursive: true });
  const setup = H.cliRunner(CLI, { env: H.hostEnv(R.home), cwd: R.work });
  const imp = setup('bundle', 'import', bundle, '--signer', signer);
  expect({ code: imp.code, out: imp.out }).toMatchObject({ code: 0, out: expect.stringMatching(/^policy +ENFORCED/m) });
  const env = H.runtimeEnv(R.home, m, { OFFLINE: '1' });
  return { ...R, belt, env, setup, cli: H.cliRunner(CLI, { env, cwd: R.work }) };
}

const check = (cli: (...a: string[]) => Run) => cli('check', ka.run_url, '--claims', ka.claims, '--json');
/** The guard let the call start: OFFLINE=1 then stopped it before GitHub. Not a refusal. */
const startedOffline = (r: Run) => r.code === 2 && /OFFLINE=1 is set/.test(r.out);
const mcpStartedOffline = (r: { text: string }) => /"status": "not_checked"/.test(r.text) && /OFFLINE=1 is set/.test(r.text);

async function mcp(env: Record<string, string>, cwd: string, calls: [string, Record<string, unknown>][]) {
  const s = H.mcpSession(MCP, { env, cwd });
  try {
    const out: { isError: boolean; text: string }[] = [];
    for (const [name, args] of calls) out.push(await s.call(name, args));
    return out;
  } finally {
    s.close();
  }
}
const inspect: [string, Record<string, unknown>] = ['inspect_run', { run_url: ka.run_url, claims: ka.claims }];
const attachProblems = (R: Runtime, text = bundleText, signer = fp): string => H.attach({ L, beltDir: R.belt, home: R.home, bundleText: text, signer }).problems.join('\n');

beforeAll(() => {
  TMP = mkdtempSync(join(tmpdir(), 'toolbelt-test-'));
  const o = owner('owner', 3600);
  bundleFile = o.file;
  bundleText = o.text;
  fp = o.fp;
}, 120000);

afterAll(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe('the inspect-run belt: refusals, each with its positive control', () => {
  jest.setTimeout(240000);

  it('tamper: a changed SKILL.md or toolbelt.json is refused at attach', () => {
    const R = runtime('tamper');
    expect(attachProblems(R)).toBe('');

    const skill = join(R.belt, 'SKILL.md');
    const manifest = join(R.belt, 'toolbelt.json');
    const skillBytes = readFileSync(skill);
    const manifestBytes = readFileSync(manifest);
    const restore = () => {
      writeFileSync(skill, skillBytes);
      writeFileSync(manifest, manifestBytes);
    };

    writeFileSync(skill, Buffer.concat([skillBytes, Buffer.from(' ')]));
    expect(attachProblems(R)).toMatch(/SKILL\.md does not match the sha256 its manifest lists/);
    restore();

    // A consistent forgery: SKILL.md changed AND the manifest re-hashed to match. It verifies against itself, and
    // is still not the version the owner signed.
    writeFileSync(skill, Buffer.concat([skillBytes, Buffer.from(' ')]));
    const forged = JSON.parse(manifestBytes.toString('utf8'));
    forged.files['SKILL.md'] = H.sha256(readFileSync(skill));
    writeFileSync(manifest, JSON.stringify(forged, null, 2) + '\n');
    expect(H.readBelt(R.belt).problems).toEqual([]);
    expect(attachProblems(R)).toMatch(/the owner-signed bundle does not name toolbelt\.json at sha256/);
    restore();

    const widened = JSON.parse(manifestBytes.toString('utf8'));
    widened.permissions.push('tool:remember');
    writeFileSync(manifest, JSON.stringify(widened, null, 2) + '\n');
    expect(attachProblems(R)).toMatch(/the owner-signed bundle does not name toolbelt\.json/);
    restore();

    writeFileSync(join(R.belt, 'extra.md'), 'rides along\n');
    expect(attachProblems(R)).toMatch(/extra\.md is in the belt folder and not in its manifest/);
    rmSync(join(R.belt, 'extra.md'));
    expect(attachProblems(R)).toBe('');
  });

  it('expiry: an expired grant is refused at the call on both surfaces, and the refusal is recorded', async () => {
    const live = runtime('expiry-live');
    expect(startedOffline(check(live.cli))).toBe(true);
    const [liveMcp] = await mcp(live.env, live.work, [inspect]);
    expect(mcpStartedOffline(liveMcp)).toBe(true);

    // The owner issues the same grant with an expiry that has already passed.
    const o = owner('owner-expired', -60);
    const R = runtime('expiry-past', o.file, o.fp);
    const r = check(R.cli);
    expect({ code: r.code, err: r.err }).toMatchObject({ code: 5, err: expect.stringMatching(/the policy expired at/) });
    const rec = H.lastRecord(L, R.home, { action: 'tool:check', origin: 'Cli' });
    expect(rec).toMatchObject({ authorized: { decision: 'DENIED' }, executed: 'not run' });
    const [viaMcp] = await mcp(R.env, R.work, [inspect]);
    expect(viaMcp.text).toMatch(/^DENIED by the owner policy .*the policy expired at/);
    expect(H.lastRecord(L, R.home, { action: 'tool:check', origin: 'Mcp' })).toMatchObject({ authorized: { decision: 'DENIED' }, executed: 'not run' });
    expect(attachProblems(R, o.text, o.fp)).toMatch(/the grant expired at/);
  });

  it('no grant: a runtime without its own grant is refused on both surfaces, and a revoked grant cannot be replayed', async () => {
    const N = place('no-grant');
    const env = H.runtimeEnv(N.home, m, { OFFLINE: '1' });
    const c = check(H.cliRunner(CLI, { env, cwd: N.work }));
    expect({ code: c.code, err: c.err }).toMatchObject({ code: 5, err: expect.stringMatching(/no policy at .* TRUSTSHELL_REQUIRE_POLICY is set/) });
    const [viaMcp] = await mcp(env, N.work, [inspect]);
    expect(viaMcp.text).toMatch(/^DENIED: no policy at /);
    // There is no ledger to write the refusal to: it exists only in the caller's own output.
    expect(existsSync(join(N.home, 'guard-receipts.jsonl'))).toBe(false);

    // Control: the same home and call with the belt's switch off RUNS (C9 warn-and-allow). The switch is load-bearing.
    const off = H.hostEnv(N.home, { OFFLINE: '1' });
    expect(startedOffline(check(H.cliRunner(CLI, { env: off, cwd: N.work })))).toBe(true);
    const [offMcp] = await mcp(off, N.work, [inspect]);
    expect(mcpStartedOffline(offMcp)).toBe(true);

    // Replay: a runtime whose grant was revoked deletes the policy and imports the original bundle again.
    const R = runtime('replay');
    expect(startedOffline(check(R.cli))).toBe(true);
    expect(R.setup('guard', 'kill').code).toBe(0);
    expect(check(R.cli).code).toBe(5);
    rmSync(join(R.home, 'policy.json'));
    const again = R.setup('bundle', 'import', bundleFile, '--signer', fp);
    expect(again.err).toMatch(/policy NOT enforced: .*a downgrade or a replay/);
    expect(existsSync(join(R.home, 'policy.json'))).toBe(false);
    expect(check(R.cli).code).toBe(5);
    const [replayed] = await mcp(R.env, R.work, [inspect]);
    expect(replayed.text).toMatch(/^DENIED: no policy at /);
  });

  it('scope: a permission outside the manifest is refused by the guard on both surfaces, and a wider grant by attach', async () => {
    const R = runtime('scope');
    expect(startedOffline(check(R.cli))).toBe(true);
    const rem = R.cli('remember', 'a note outside the belt');
    expect({ code: rem.code, err: rem.err }).toMatchObject({ code: 5, err: expect.stringMatching(/does not list tool:remember/) });
    expect(H.lastRecord(L, R.home, { action: 'tool:remember', origin: 'Cli' })).toMatchObject({ authorized: { decision: 'DENIED' }, executed: 'not run' });
    const [ok, refused] = await mcp(R.env, R.work, [inspect, ['remember', { text: 'a note outside the belt' }]]);
    expect(mcpStartedOffline(ok)).toBe(true);
    expect(refused.text).toMatch(/^DENIED by the owner policy .*does not list tool:remember/);
    expect(H.lastRecord(L, R.home, { action: 'tool:remember', origin: 'Mcp' })).toMatchObject({ authorized: { decision: 'DENIED' } });

    // A grant left at `guard init`'s default (every local command) plus tool:check, owner-signed: attach refuses it.
    const o = owner('owner-wide', 3600, false);
    const W = runtime('wide', o.file, o.fp);
    const why = attachProblems(W, o.text, o.fp);
    expect(why).toMatch(/the carried grant is not exactly the manifest permissions/);
    expect(why).toMatch(/the grant in force allows tool:bundle, .*outside the manifest/);
  });

  it('known answer: the right result passes and a wrong one fails the check', () => {
    const ex = JSON.parse(readFileSync(EXAMPLE, 'utf8'));
    const right = { exit_code: 1, record: ex.record, digest: ex.digest };
    expect(H.knownAnswerProblems(ka, right, L)).toEqual([]);

    const clone = () => JSON.parse(JSON.stringify(right));
    const flipped = clone();
    flipped.record.claims.find((c: { template: string }) => c.template === 'gha.run_succeeded').status = 'SUPPORTED';
    flipped.digest.value = L.jcs.jcsSha256(flipped.record);
    expect(H.knownAnswerProblems(ka, flipped, L)).toEqual(['claim gha.run_succeeded is SUPPORTED, expected CONTRADICTED']);

    expect(H.knownAnswerProblems(ka, { ...right, exit_code: 0 }, L)).toEqual(['exit 0, expected 1']);

    const edited = clone();
    edited.record.observation.conclusion = 'success';
    const why = H.knownAnswerProblems(ka, edited, L).join('\n');
    expect(why).toMatch(/does not recompute from the record/);
    expect(why).toMatch(/observation\.conclusion is "success", expected "failure"/);

    expect(H.knownAnswerProblems(ka, { exit_code: 1, record: null, digest: null }, L)).toEqual(['no record and digest came back']);
  });

  const py = H.pythonDigest(EXAMPLE);
  (py ? it : it.skip)('known answer: a second implementation (Python json + hashlib) recomputes the same digest', () => {
    expect(py.value).toBe(JSON.parse(readFileSync(EXAMPLE, 'utf8')).digest.value);
  });

  it('receipt: the belt version and file hashes are inside what is signed, and a changed one is refused', () => {
    const R = runtime('receipt');
    expect(startedOffline(check(R.cli))).toBe(true);
    const ex = JSON.parse(readFileSync(EXAMPLE, 'utf8'));
    const got = { exit_code: 1, record: ex.record, digest: ex.digest };
    const passport = H.seal(L, H.buildPassport({ L, runtime: 'cli', entry: CLI, trustshellVersion: 'test', beltDir: R.belt, home: R.home }), R.home);
    const rec = H.lastRecord(L, R.home, { action: 'tool:check', origin: 'Cli', decision: 'ALLOWED' });
    const receipt = H.seal(L, H.buildReceipt({ runtime: 'cli', surface: 'test', passport, guardRecord: rec, call: ka, got }), R.home);
    const ledgerText = readFileSync(join(R.home, 'guard-receipts.jsonl'), 'utf8');
    expect(receipt.body.tool_belt).toEqual({ name: m.name, version: m.version, manifest_sha256: H.readBelt(BELT).manifest_sha256, files: m.files });
    expect(H.receiptProblems(L, receipt, { beltDir: R.belt, ledgerText, record: ex.record, passport })).toEqual([]);

    const forged = JSON.parse(JSON.stringify(receipt));
    forged.body.tool_belt.version = '1.0.1';
    expect(H.receiptProblems(L, forged, {}).join('\n')).toMatch(/the signature does not verify over the body/);

    writeFileSync(join(R.belt, 'SKILL.md'), Buffer.concat([readFileSync(join(R.belt, 'SKILL.md')), Buffer.from(' ')]));
    expect(H.receiptProblems(L, receipt, { beltDir: R.belt }).join('\n')).toMatch(/belt: SKILL\.md does not match/);
  });

  it('discovery: the belt is found from its frontmatter alone, which meets the Agent Skills name rules', () => {
    const found = H.discover(join(ROOT, 'toolbelts'));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ dir: 'inspect-run', name: 'inspect-run', version: m.version, permissions: m.permissions, problems: [] });
    expect(found[0].metadata_bytes).toBeLessThan(found[0].skill_bytes);
    // Control: the same rules refuse the names the spec forbids.
    for (const bad of ['Inspect-Run', '-inspect', 'inspect--run', 'a'.repeat(65)]) expect(H.specProblems({ name: bad, description: 'd' }, bad).length).toBeGreaterThan(0);
    expect(H.specProblems({ name: 'inspect-run', description: 'd' }, 'other-dir').join()).toMatch(/does not match its directory/);
    expect(H.specProblems({ name: 'inspect-run', description: '' }, 'inspect-run').join()).toMatch(/description is 0 characters/);
  });

  (process.env.TOOLBELT_LIVE === '1' ? it : it.skip)('live: the whole proof against GitHub, exit 0 (TOOLBELT_LIVE=1)', () => {
    const out = join(TMP, 'live-proof');
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'toolbelt-proof.mjs'), '--out', out, '--scratch', TMP, '--cli', CLI, '--expire', '60'], { encoding: 'utf8', timeout: 230000 });
    expect({ status: r.status, tail: (r.stdout ?? '').split('\n').slice(-10).join('\n'), err: r.stderr }).toMatchObject({ status: 0 });
  });
});
