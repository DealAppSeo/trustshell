#!/usr/bin/env node
/**
 * RELEASE E2E: what a new developer actually gets, tested on the real package in an empty folder.
 *
 * Packs this checkout (or takes --tarball), installs it into a temp directory with no key in the environment,
 * and drives the installed CLI the way a person would, through real shells. Every step records its evidence.
 * Needs only Node, npm, git and a network that reaches api.github.com. No account, no key, no secret of ours.
 *
 *   node scripts/release-e2e.mjs [--tarball <file.tgz>] [--out <dir>] [--only release|own-agent] [--keep]
 *
 * EXIT 0 every step passed. 1 a step failed. 2 no failure, but something was NOT_CHECKED (a shell that is not
 * installed, GitHub rate-limiting this address). A skipped step is reported as NOT_CHECKED and never as a pass.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const PKG_DIR = ['node_modules', '@hyperdag', 'trustshell'];

// Real public runs. GREEN is trustshell's own check workflow; RED is a real failure on PR #684, kept for this.
const GREEN = { url: 'https://github.com/DealAppSeo/trustshell/actions/runs/39619591025', id: '39619591025', sha: '392797a69b6a' };
const RED = { url: 'https://github.com/DealAppSeo/trustshell/actions/runs/42502305639', id: '42502305639' };
const GONE = 'https://github.com/DealAppSeo/trustshell/actions/runs/1';
const GITHUB = 'https://api.github.com';

function parseArgs(argv) {
  const o = { tarball: undefined, out: undefined, only: undefined, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--tarball') o.tarball = resolve(argv[++i]);
    else if (a === '--out') o.out = resolve(argv[++i]);
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--keep') o.keep = true;
    else throw new Error(`unexpected ${a}`);
  }
  return o;
}

// Passive: records every outbound request and connection the CLI makes, and changes none of them.
const TRACER = `const fs=require('fs');const dc=require('diagnostics_channel');const OUT=process.env.TS_E2E_TRACE;
const log=(o)=>{try{fs.appendFileSync(OUT,JSON.stringify(o)+'\\n')}catch{}};
dc.subscribe('undici:request:create',({request:r})=>{const h=Array.isArray(r.headers)?r.headers.join('\\n'):String(r.headers||'');log({via:'fetch',origin:r.origin,method:r.method,path:r.path,auth:/authorization/i.test(h)})});
dc.subscribe('http.client.request.start',({request:r})=>log({via:'http',origin:r.host,method:r.method,path:r.path}));
dc.subscribe('net.client.socket',({socket:s})=>s.once('connect',()=>log({via:'tcp',addr:s.remoteAddress,port:s.remotePort})));`;

const results = [];
function record(id, status, what, evidence = '') {
  results.push({ id, status, what, evidence: String(evidence).slice(0, 1200) });
  console.log(`${status.padEnd(11)} ${id}  ${what}${status === 'PASS' || !evidence ? '' : `\n            ${String(evidence).slice(0, 600)}`}`);
}
const expectStep = (id, what, ok, evidence) => record(id, ok ? 'PASS' : 'FAIL', what, evidence);

function shells() {
  if (!WIN) return [{ name: 'bash', cmd: 'bash', args: (c) => ['-c', c] }, { name: 'sh', cmd: 'sh', args: (c) => ['-c', c] }];
  const list = [{ name: 'powershell-5.1', cmd: 'powershell.exe', args: (c) => ['-NoProfile', '-NonInteractive', '-Command', `${c}; exit $LASTEXITCODE`] }];
  const git = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'].find(existsSync);
  if (git) list.push({ name: 'git-bash', cmd: git, args: (c) => ['-c', c] });
  return list;
}

function baseEnv(install, home, trace) {
  const keep = ['SystemRoot', 'windir', 'ComSpec', 'PATHEXT', 'SystemDrive', 'PSModulePath', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432'];
  const env = {};
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
  // One PATH key only. On Windows process.env answers to both spellings, and a child given both can read the old one.
  env.PATH = `${join(install, 'node_modules', '.bin')}${WIN ? ';' : ':'}${process.env.PATH ?? ''}`;
  mkdirSync(home, { recursive: true });
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, 'appdata'),
    LOCALAPPDATA: join(home, 'localappdata'),
    TEMP: tmpdir(),
    TMP: tmpdir(),
    TRUSTSHELL_HOME: home,
    NO_COLOR: '1',
    NODE_OPTIONS: `--require=${join(install, 'e2e-tracer.cjs').replace(/\\/g, '/')}`,
    TS_E2E_TRACE: trace,
  };
}

function sh(shell, command, { cwd, env, timeoutMs = 120_000 }) {
  return new Promise((done) => {
    const child = spawn(shell.cmd, shell.args(command), { cwd, env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(t);
      done({ code: null, stdout, stderr: String(e) });
    });
    child.on('close', (code) => {
      clearTimeout(t);
      done({ code, stdout, stderr });
    });
  });
}

const readTrace = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const origins = (trace) => [...new Set(trace.filter((t) => t.via !== 'tcp').map((t) => t.origin))];

/** Runs one CLI command and returns it with its own network trace. */
function makeRunner(ctx) {
  let n = 0;
  return async (shell, command, opts = {}) => {
    const trace = join(ctx.work, `trace-${(n += 1)}.jsonl`);
    const env = { ...baseEnv(ctx.install, opts.home ?? ctx.home, trace), ...(opts.env ?? {}) };
    // Guard rightly refuses to start node while NODE_OPTIONS is set, so `run` steps go without the tracer.
    if (opts.notrace) delete env.NODE_OPTIONS;
    const r = await sh(shell, command, { cwd: opts.cwd ?? ctx.work, env, timeoutMs: opts.timeoutMs });
    return { ...r, trace: readTrace(trace), hosts: origins(readTrace(trace)) };
  };
}

const limited = (r) => /rate limit|GitHub 403|GitHub 429/i.test(`${r.stdout}${r.stderr}`);

/** Decides a step that needed GitHub. Rate limiting is NOT_CHECKED, because the tool was never tested. */
function githubStep(id, what, r, want, extra = true) {
  if (limited(r)) return record(id, 'NOT_CHECKED', what, 'GitHub rate-limited this address');
  const onlyGitHub = r.hosts.length > 0 && r.hosts.every((h) => h === GITHUB);
  const noAuth = r.trace.every((t) => !t.auth);
  const ok = r.code === want && onlyGitHub && noAuth && extra;
  expectStep(id, what, ok, `exit ${r.code} (want ${want}); hosts ${r.hosts.join(',') || 'none'}; auth header ${noAuth ? 'absent' : 'PRESENT'}; ${r.stderr.slice(0, 200)}`);
}

async function tracerControl(ctx, run, shell) {
  const server = createServer((_, res) => res.end('ok'));
  await new Promise((d) => server.listen(0, '127.0.0.1', d));
  const port = server.address().port;
  const script = join(ctx.work, 'control.cjs');
  writeFileSync(script, `fetch('http://127.0.0.1:${port}/').then(r=>r.text()).then(()=>process.exit(0))`);
  const r = await run(shell, `node "${script.replace(/\\/g, '/')}"`);
  server.close();
  expectStep('tracer.control', 'the network tracer sees a request when one is made', r.hosts.includes(`http://127.0.0.1:${port}`), JSON.stringify(r.trace).slice(0, 300));
}

async function release(ctx, run) {
  const [primary, ...others] = ctx.shells;
  await tracerControl(ctx, run, primary);

  const env = baseEnv(ctx.install, ctx.home, join(ctx.work, 'x'));
  const leaked = Object.keys(env).filter((k) => /KEY|TOKEN|SECRET|PASSWORD|SUPABASE|DATABASE|REPID_/i.test(k));
  expectStep('first-use.no-keys', 'the install runs with no key, token or secret name in its environment', leaked.length === 0, leaked.join(','));

  const version = await run(primary, 'trustshell --version');
  const packaged = JSON.parse(readFileSync(join(ctx.install, ...PKG_DIR, 'package.json'), 'utf8')).version;
  expectStep('first-use.version', 'trustshell on the PATH is the package under test', version.code === 0 && version.stdout.includes(packaged) && version.hosts.length === 0, `want ${packaged}; got ${version.stdout}${version.stderr}`);

  const demo = await run(primary, 'trustshell demo');
  expectStep('first-use.offline-demo', 'demo seals and verifies a receipt, offline, with no account or key', demo.code === 0 && /VERIFIED/.test(demo.stdout) && demo.hosts.length === 0, `exit ${demo.code}; hosts ${demo.hosts}; ${demo.stderr.slice(0, 300)}`);

  const dj = await run(primary, 'trustshell demo --json');
  const sample = JSON.parse(dj.stdout);
  const pin = sample.root;
  const receipt = sample.receipt;
  writeFileSync(join(ctx.work, 'r.json'), JSON.stringify(receipt));
  writeFileSync(join(ctx.work, 'body.json'), JSON.stringify(receipt));

  const good = await run(primary, `trustshell verify-receipt r.json --root ${pin}`);
  expectStep('receipt.valid', 'a sealed receipt verifies locally (exit 0, no network)', good.code === 0 && good.hosts.length === 0, `exit ${good.code}; ${good.stdout.slice(0, 200)}`);

  const tampered = structuredClone(receipt);
  tampered.decision.reasons = ['changed after sealing'];
  writeFileSync(join(ctx.work, 'tampered.json'), JSON.stringify(tampered));
  const t = await run(primary, `trustshell verify-receipt tampered.json --root ${pin}`);
  expectStep('receipt.tampered', 'an altered receipt fails (exit 1)', t.code === 1, `exit ${t.code}`);

  const wrong = await run(primary, `trustshell verify-receipt r.json --root 0x${'ab'.repeat(32)}`);
  expectStep('receipt.wrong-key', 'the wrong key fails (exit 1)', wrong.code === 1, `exit ${wrong.code}`);

  writeFileSync(join(ctx.work, 'broken.json'), '{not json');
  const bad = await run(primary, 'trustshell verify-receipt broken.json');
  expectStep('receipt.malformed-json', 'a file that is not JSON is refused, not passed (exit 2)', bad.code === 2, `exit ${bad.code}`);

  writeFileSync(join(ctx.work, 'shape.json'), '{"a":1}');
  const shape = await run(primary, 'trustshell verify-receipt shape.json');
  expectStep('receipt.malformed-shape', 'JSON that is not a receipt fails (exit 1)', shape.code === 1 && /MALFORMED/.test(`${shape.stdout}${shape.stderr}`), `exit ${shape.code}; ${shape.stdout.slice(0, 160)}${shape.stderr.slice(0, 160)}`);

  const supported = await run(primary, `trustshell check ${GREEN.url} --claims "The check workflow succeeded, run ${GREEN.id}."`);
  githubStep('inspect.supported', 'a true claim about a real public run is SUPPORTED (exit 0)', supported, 0, /SUPPORTED/.test(supported.stdout));

  const contra = await run(primary, `trustshell check ${RED.url} --claims "The check workflow succeeded, run ${RED.id}."`);
  githubStep('inspect.contradicted', 'a false claim about a real failed run is CONTRADICTED (exit 1)', contra, 1, /CONTRADICTED/.test(contra.stdout));

  const nc = await run(primary, `trustshell check ${GREEN.url} --claims "All tests pass."`);
  githubStep('inspect.not-checked', 'a claim the run cannot decide is NOT_CHECKED (exit 3)', nc, 3, /NOT_CHECKED|not checked/i.test(nc.stdout));

  const marker = 'ZQXPRIVATEWORD';
  const priv = await run(primary, `trustshell check ${GREEN.url} --claims "${marker} is what my agent said."`);
  const sent = JSON.stringify(priv.trace);
  githubStep('privacy.claim-text-stays-local', 'claim text is never sent: only GET requests to api.github.com, none carrying it', priv, 3, !sent.includes(marker) && priv.trace.filter((x) => x.method).every((x) => x.method === 'GET'));

  const gone = await run(primary, `trustshell check ${GONE}`);
  githubStep('inspect.missing-run', 'a run that does not exist is an error, not a verdict (exit 3)', gone, 3, /404/.test(`${gone.stdout}${gone.stderr}`));

  const url = await run(primary, 'trustshell check https://github.com/a/b/actions/runs/xyz');
  expectStep('inspect.bad-url', 'a malformed run URL is refused (exit 2, no network)', url.code === 2 && url.hosts.length === 0, `exit ${url.code}; hosts ${url.hosts}`);

  const offline = await run(primary, `trustshell check ${GREEN.url}`, { env: { OFFLINE: '1' } });
  expectStep('privacy.offline-switch', 'OFFLINE=1 sends nothing and says NOT_CHECKED (exit 2)', offline.code === 2 && offline.hosts.length === 0 && /NOT_CHECKED/.test(`${offline.stdout}${offline.stderr}`), `exit ${offline.code}; hosts ${offline.hosts}`);

  await mcpStep(ctx);

  const scratchHome = join(ctx.work, 'parity-home');
  const parity = [
    ['trustshell demo', 0],
    [`trustshell verify-receipt tampered.json --root ${pin}`, 1],
    ['trustshell sign-receipt body.json > resealed.json', 0],
    ['trustshell guard init', 0],
    ['trustshell guard allow tool:git', 0],
    ["trustshell run --tool git '--' git --version", 0],
    ["trustshell run --tool curl '--' curl https://example.com", 5],
  ];
  for (const shell of ctx.shells) {
    const home = join(scratchHome, shell.name);
    const codes = [];
    let ok = true;
    for (const [c, want] of parity) {
      const r = await run(shell, c, { home });
      codes.push(`${r.code}`);
      if (r.code !== want) ok = false;
    }
    expectStep(`shells.${shell.name}`, `the same commands give the same exit codes in ${shell.name}`, ok, `got ${codes.join(' ')}, want ${parity.map((p) => p[1]).join(' ')}`);
    // Read the key straight from the receipt: Guard is on by now, and the receipt is what a person would have.
    const raw = readFileSync(join(ctx.work, 'resealed.json'));
    const text = raw[0] === 0xff ? raw.toString('utf16le').replace(/^﻿/, '') : raw.toString('utf8').replace(/^﻿/, '');
    const key = JSON.parse(text).header.signer.public_key;
    await run(shell, 'trustshell guard allow tool:verify-receipt', { home });
    const v = await run(shell, `trustshell verify-receipt resealed.json --root ${key}`, { home });
    expectStep(`shells.${shell.name}.redirect`, `a receipt saved with > in ${shell.name} verifies`, v.code === 0, `exit ${v.code}; ${v.stdout.slice(0, 160)}${v.stderr.slice(0, 200)}`);
  }
  if (others.length === 0) record('shells.second', 'NOT_CHECKED', 'a second shell on this machine', 'only one shell was found');
}

function mcpStep(ctx) {
  const server = join(ctx.install, ...PKG_DIR, 'dist', 'mcp', 'index.js');
  const trace = join(ctx.work, 'trace-mcp.jsonl');
  const env = baseEnv(ctx.install, join(ctx.work, 'mcp-home'), trace);
  return new Promise((done) => {
    const child = spawn(process.execPath, [server], { cwd: ctx.work, env, windowsHide: true });
    let buf = '';
    const finish = (status, ev) => {
      clearTimeout(timer);
      child.kill();
      record('mcp.inspect-run', status, 'an agent can ask inspect_run over MCP from the clean install, with no key', ev);
      done();
    };
    const timer = setTimeout(() => finish('FAIL', 'no answer in 90 s'), 90_000);
    const send = (m) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.id === 1) {
          send({ method: 'notifications/initialized' });
          send({ id: 2, method: 'tools/call', params: { name: 'inspect_run', arguments: { run_url: GREEN.url, claims: `The check workflow succeeded, run ${GREEN.id}.` } } });
        } else if (msg.id === 2) {
          const text = JSON.stringify(msg.result ?? msg.error);
          const hosts = origins(readTrace(trace));
          if (/rate limit/i.test(text)) return finish('NOT_CHECKED', 'GitHub rate-limited this address');
          const ok = /all_supported/.test(text) && hosts.every((h) => h === GITHUB);
          finish(ok ? 'PASS' : 'FAIL', `hosts ${hosts}; ${text.slice(0, 400)}`);
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'release-e2e', version: '0' } } });
  });
}

/** A small real project. The bug is real and its test really fails until it is fixed. */
function makeProject(dir, buggy) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sum.js'), `module.exports = (a, b) => a ${buggy ? '-' : '+'} b;\n`);
  writeFileSync(join(dir, 'test.js'), "const sum = require('./sum.js');\nif (sum(2, 2) !== 4) { console.error('FAIL sum(2,2) =', sum(2, 2)); process.exit(1); }\nconsole.log('ok');\n");
  writeFileSync(join(dir, 'exfil.js'), "require('fs').writeFileSync('EXFIL_RAN', 'yes');\n");
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

async function ownAgent(ctx, run) {
  const [primary] = ctx.shells;
  const second = ctx.shells[1] ?? primary;

  // ── Path 1: the agent's claims about a real run. No access to the agent is needed. ──
  const claimsDir = join(ctx.work, 'path1');
  mkdirSync(claimsDir, { recursive: true });
  writeFileSync(join(claimsDir, 'said.txt'), `The check workflow succeeded, run ${RED.id}.\n`);
  const p1 = await run(primary, `trustshell check ${RED.url} --claims-file path1/said.txt --out path1/evidence`, { home: join(ctx.work, 'p1-home') });
  githubStep('path1.check', "Path 1 finds a false claim in an agent's report of a real run", p1, 1);
  const p1Record = join('path1', 'evidence', 'record.json');
  const haveRecord = existsSync(join(ctx.work, p1Record));

  // ── Path 2, example A: an opted-in task that succeeds, with a refused action along the way. ──
  const homeA = join(ctx.work, 'home-a');
  const repoA = join(ctx.work, 'repo-a');
  makeProject(repoA, true);
  const inA = { home: homeA, cwd: repoA };
  const plainA = { ...inA, notrace: true };
  const guardInit = await run(primary, 'trustshell guard init', inA);
  await run(primary, 'trustshell guard allow tool:node --script test.js', inA);
  expectStep('path2.opt-in', 'opting in needs one local policy file and no account', guardInit.code === 0 && guardInit.hosts.length === 0, `exit ${guardInit.code}`);

  const before = await run(primary, "trustshell run --tool node '--' node test.js", plainA);
  expectStep('path2.a.bug-is-real', 'the test really fails before the fix, through trustshell run (exit 1)', before.code === 1, `exit ${before.code}`);

  const refused = await run(primary, "trustshell run --tool node '--' node exfil.js", plainA);
  expectStep('path2.a.denied-never-starts', 'a command the policy does not allow never starts (exit 5, its side effect absent)', refused.code === 5 && !existsSync(join(repoA, 'EXFIL_RAN')), `exit ${refused.code}`);
  // The control: run outside TrustShell, the same script does leave its mark, so "absent" above means something.
  spawnSync(process.execPath, ['exfil.js'], { cwd: repoA, windowsHide: true });
  expectStep('path2.a.denied-control', 'the same script, started without trustshell run, does its side effect', existsSync(join(repoA, 'EXFIL_RAN')), '');
  rmSync(join(repoA, 'EXFIL_RAN'), { force: true });

  const argMarker = 'ZQXSECRETARG';
  const curl = await run(primary, `trustshell run --tool curl '--' curl ${argMarker}`, inA);
  expectStep('path2.a.unlisted-tool', 'a tool the policy does not list is refused (exit 5)', curl.code === 5, `exit ${curl.code}`);

  writeFileSync(join(repoA, 'sum.js'), 'module.exports = (a, b) => a + b;\n'); // the agent's edit, made directly
  writeFileSync(join(repoA, 'OUTSIDE'), 'done without trustshell');

  const after = await run(primary, "trustshell run --tool node '--' node test.js", plainA);
  expectStep('path2.a.fixed', 'the test passes after the fix (exit 0)', after.code === 0, `exit ${after.code}`);

  const reportA = await run(primary, `trustshell trust-report --out ../out-a --bind "test.js=All tests pass" --title "Fixed the sum bug"`, inA);
  expectStep('path2.a.report', 'the report shows the command passed and lists the refusals (exit 0, no network)', reportA.code === 0 && reportA.hosts.length === 0, `exit ${reportA.code}; ${reportA.stderr.slice(0, 300)}`);
  const outA = join(ctx.work, 'out-a');
  const report = JSON.parse(readFileSync(join(outA, 'report.json'), 'utf8'));
  expectStep('path2.a.denials-shown', 'both refusals are in the report', report.guard.commands.filter((c) => c.decision === 'DENIED').length === 2, JSON.stringify(report.guard.commands.map((c) => c.decision)));
  const refusalRow = report.guard.commands.find((c) => c.decision === 'DENIED');
  expectStep('path2.a.failure-shown', 'the failing run before the fix is not hidden', report.guard.commands.some((c) => c.exit_code === 1), JSON.stringify(report.guard.commands.map((c) => c.exit_code)));
  expectStep('path2.a.refusal-reason', 'each refusal says why', refusalRow?.reasons?.length > 0, JSON.stringify(refusalRow));

  const allText = walk(outA).map((f) => readFileSync(f, 'utf8')).join('\n');
  expectStep('path2.privacy.command-text', 'the command line itself is not stored, only its hash', !allText.includes(argMarker), 'marker searched in every evidence file');
  const md = readFileSync(join(outA, 'trust-report.md'), 'utf8');
  expectStep('path2.boundary.stated', 'the report says what it cannot see', /This report cannot see them/.test(md) && /commands run without/.test(md), '');
  expectStep('path2.boundary.outside-edit-invisible', 'a file written outside trustshell run leaves no record in the report', !allText.includes('OUTSIDE') && report.guard.commands.length === 4, `${report.guard.commands.length} commands listed`);

  const key = JSON.parse(readFileSync(join(outA, 'report-receipt.json'), 'utf8')).header.signer.public_key;
  const v0 = await run(primary, `trustshell trust-report verify ../out-a --root ${key}`, inA);
  expectStep('report.verify', 'the folder verifies against the key that sealed it (exit 0, no network)', v0.code === 0 && v0.hosts.length === 0, `exit ${v0.code}; ${v0.stdout.slice(0, 200)}`);
  const v1 = await run(primary, 'trustshell trust-report verify ../out-a', inA);
  expectStep('report.no-key-is-not-a-pass', 'with no key to compare, authorship is NOT_CHECKED (exit 2)', v1.code === 2, `exit ${v1.code}`);
  const v2 = await run(primary, `trustshell trust-report verify ../out-a --root 0x${'cd'.repeat(32)}`, inA);
  expectStep('report.wrong-key', 'the wrong key fails (exit 1)', v2.code === 1, `exit ${v2.code}`);

  const manifest = readFileSync(join(outA, 'MANIFEST.sha256'), 'utf8').split('\n').filter(Boolean);
  const independentlyWhole = manifest.every((l) => {
    const [hash, file] = [l.slice(0, 64), l.slice(66)];
    return createHash('sha256').update(readFileSync(join(outA, file))).digest('hex') === hash;
  });
  expectStep('report.manifest-standalone', 'the manifest checks with plain sha256, no TrustShell code', independentlyWhole, `${manifest.length} files`);

  const tamperCases = [
    ['report.json', (s) => s.replace('"COMMAND_PASSED"', '"CONTRADICTED"'), 'report.tamper-report'],
    ['trust-report.md', (s) => `${s}\nAll good.\n`, 'report.tamper-readable'],
    [join('evidence', 'guard-receipts.jsonl'), (s) => s.replace('"DENIED"', '"ALLOWED"'), 'report.tamper-ledger'],
  ];
  for (const [file, edit, id] of tamperCases) {
    const copy = join(ctx.work, `tamper-${id}`);
    cpSync(outA, copy, { recursive: true });
    writeFileSync(join(copy, file), edit(readFileSync(join(copy, file), 'utf8')));
    const r = await run(primary, `trustshell trust-report verify ../${`tamper-${id}`} --root ${key}`, inA);
    expectStep(id, `changing ${file} fails verification (exit 1)`, r.code === 1, `exit ${r.code}`);
  }
  const extra = join(ctx.work, 'tamper-extra');
  cpSync(outA, extra, { recursive: true });
  writeFileSync(join(extra, 'evidence', 'added.txt'), 'x');
  const added = await run(primary, `trustshell trust-report verify ../tamper-extra --root ${key}`, inA);
  expectStep('report.tamper-added-file', 'adding a file fails verification (exit 1)', added.code === 1, `exit ${added.code}`);

  // Same keys and a rewritten manifest: an attacker with the key is out of scope, and one without it must fail.
  const forged = join(ctx.work, 'tamper-forged');
  cpSync(outA, forged, { recursive: true });
  const rewritten = readFileSync(join(forged, 'trust-report.md'), 'utf8').replace('Fixed the sum bug', 'Forged title');
  writeFileSync(join(forged, 'trust-report.md'), rewritten);
  writeFileSync(join(forged, 'MANIFEST.sha256'), manifest.map((l) => (l.endsWith('trust-report.md') ? `${createHash('sha256').update(rewritten).digest('hex')}  trust-report.md` : l)).join('\n') + '\n');
  const fg = await run(primary, `trustshell trust-report verify ../tamper-forged --root ${key}`, inA);
  expectStep('report.tamper-rewritten-manifest', 'a rewritten manifest without the key fails (exit 1)', fg.code === 1, `exit ${fg.code}`);

  // ── Path 2, example B: a separate task, shell and home. The agent reports success; the test says otherwise. ──
  const homeB = join(ctx.work, 'home-b');
  const repoB = join(ctx.work, 'repo-b');
  makeProject(repoB, true);
  const inB = { home: homeB, cwd: repoB };
  await run(second, 'trustshell guard init', inB);
  await run(second, 'trustshell guard allow tool:node --script test.js', inB);
  const failing = await run(second, "trustshell run --tool node '--' node test.js", { ...inB, notrace: true });
  expectStep('path2.b.failure-recorded', `a failing test is recorded with its real exit code (${second.name}, exit 1)`, failing.code === 1, `exit ${failing.code}`);
  const record1 = haveRecord ? `--record ../${p1Record.replace(/\\/g, '/')} ` : '';
  const reportB = await run(second, `trustshell trust-report --out ../out-b ${record1}--bind "test.js=All tests pass" --bind "lint=Lint is clean" --title "Agent said it was finished"`, inB);
  expectStep('path2.b.claim-contradicted', 'the false claim is CONTRADICTED and the report exits 1', reportB.code === 1, `exit ${reportB.code}; ${reportB.stderr.slice(0, 300)}`);
  const b = JSON.parse(readFileSync(join(ctx.work, 'out-b', 'report.json'), 'utf8'));
  expectStep('path2.b.statuses', 'one claim is contradicted and a claim with no command is NOT_CHECKED', b.bound_claims[0].status === 'CONTRADICTED' && b.bound_claims[1].status === 'NOT_CHECKED', JSON.stringify(b.bound_claims.map((x) => x.status)));
  if (haveRecord) expectStep('path2.b.two-paths-apart', 'Path 1 and Path 2 appear as separate sections', /Path 1 ·/.test(readFileSync(join(ctx.work, 'out-b', 'trust-report.md'), 'utf8')) && /Path 2 ·/.test(readFileSync(join(ctx.work, 'out-b', 'trust-report.md'), 'utf8')), '');
  else record('path2.b.two-paths-apart', 'NOT_CHECKED', 'Path 1 and Path 2 appear as separate sections', 'no Path 1 record: GitHub did not answer');
  const nextB = b.next_actions.join(' ');
  expectStep('path2.b.next-action', 'the report says what to do next', /Do not accept "All tests pass"/.test(nextB), nextB.slice(0, 300));

  // ── What an exit code can stand for. TrustShell sees how a command ended, not whether it tested anything. ──
  const gate = async (name) => {
    const where = { home: join(ctx.work, `home-${name}`), cwd: join(ctx.work, `repo-${name}`) };
    mkdirSync(where.cwd, { recursive: true });
    writeFileSync(join(where.cwd, 'gate.js'), "process.exit(process.argv.includes('--none') ? 0 : 1);\n");
    await run(primary, 'trustshell guard init', where);
    await run(primary, 'trustshell guard allow tool:node --script gate.js', where);
    return where;
  };
  const gateRun = (where, extra = '') => run(primary, `trustshell run --tool node '--' node gate.js${extra}`, { ...where, notrace: true });
  const gateReport = async (where, name) => {
    const r = await run(primary, `trustshell trust-report --out ../out-${name} --bind "gate.js=All tests pass"`, where);
    return { code: r.code, claim: JSON.parse(readFileSync(join(ctx.work, `out-${name}`, 'report.json'), 'utf8')).bound_claims[0] };
  };

  const emptyOnly = await gate('empty');
  await gateRun(emptyOnly, ' --none');
  const empty = await gateReport(emptyOnly, 'empty');
  expectStep('evidence.empty-run', 'one run that selected nothing reads COMMAND_PASSED, never SUPPORTED', empty.claim.status === 'COMMAND_PASSED', empty.claim.status);
  expectStep('evidence.empty-run-says', 'the report says an exit code does not show what was tested', /not that it tests what the claim says/.test(empty.claim.why), empty.claim.why);

  const easier = await gate('easier');
  await gateRun(easier);
  await gateRun(easier, ' --none');
  const swappedRun = await gateReport(easier, 'easier');
  expectStep('evidence.easier-run', 'a failure followed by an easier run is NOT_CHECKED (exit 3)', swappedRun.claim.status === 'NOT_CHECKED' && swappedRun.code === 3, `${swappedRun.claim.status}, exit ${swappedRun.code}`);

  const swapped = await gate('swapped');
  writeFileSync(join(swapped.cwd, 'gate.js'), "require('fs').writeFileSync('SWAPPED_RAN', 'yes');\n");
  const swappedExit = await gateRun(swapped);
  expectStep('evidence.swapped-script', 'a script changed after it was pinned never starts (exit 5, its side effect absent)', swappedExit.code === 5 && !existsSync(join(swapped.cwd, 'SWAPPED_RAN')), `exit ${swappedExit.code}`);
  const swappedReport = await gateReport(swapped, 'swapped');
  expectStep('evidence.swapped-claim', 'the claim is NOT_CHECKED when its command was refused', swappedReport.claim.status === 'NOT_CHECKED', swappedReport.claim.status);

  // The sandbox path: refused without a runtime, and not claimed either way when one exists.
  const runtimeFound = ['docker', 'runc', 'runsc'].some((b) => spawnSync(b, ['--version'], { stdio: 'ignore', windowsHide: true }).status === 0);
  if (runtimeFound) record('path2.sandbox', 'NOT_CHECKED', 'run --sandbox on this machine', 'a container runtime is present; this E2E does not start containers');
  else {
    await run(primary, 'trustshell guard allow tool:git', inA);
    const sb = await run(primary, "trustshell run --sandbox --tool git '--' git --version", inA);
    expectStep('path2.sandbox', 'with no container runtime, run --sandbox refuses instead of running on the host (exit 3)', sb.code === 3, `exit ${sb.code}`);
  }

  if (ctx.out) {
    for (const [name, dir] of [['example-a-report', outA], ['example-b-report', join(ctx.work, 'out-b')]]) cpSync(dir, join(ctx.out, name), { recursive: true });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const work = mkdtempSync(join(tmpdir(), 'ts-release-e2e-'));
  const install = join(work, 'install');
  mkdirSync(install);
  const started = new Date().toISOString();
  let tarball = opts.tarball;
  const npm = (args, cwd) => spawnSync(WIN ? 'npm.cmd' : 'npm', args, { cwd, encoding: 'utf8', shell: WIN, windowsHide: true, timeout: 15 * 60_000 });
  if (!tarball) {
    const p = npm(['pack', '--ignore-scripts', '--pack-destination', `"${work}"`.replace(/"/g, WIN ? '"' : ''), '--silent'], ROOT);
    tarball = join(work, p.stdout.trim().split('\n').pop().trim());
  }
  if (!existsSync(tarball)) {
    console.error(`NOT_CHECKED no tarball at ${tarball}`);
    process.exit(2);
  }
  const digest = createHash('sha256').update(readFileSync(tarball)).digest('hex');
  writeFileSync(join(install, 'package.json'), '{ "name": "ts-release-e2e", "private": true }\n');
  const installed = npm(['install', WIN ? `"${tarball}"` : tarball, '--ignore-scripts', '--no-audit', '--no-fund', '--silent'], install);
  if (installed.status !== 0) {
    console.error(`FAIL install: ${installed.stderr}`);
    process.exit(1);
  }
  writeFileSync(join(install, 'e2e-tracer.cjs'), TRACER);
  const ctx = { work, install, home: join(work, 'home'), shells: shells().filter((s) => spawnSync(s.cmd, s.args('exit 0'), { windowsHide: true }).status === 0), out: opts.out };
  const run = makeRunner(ctx);
  console.log(`tarball sha256 ${digest}\nnode ${process.version} · ${process.platform} · shells ${ctx.shells.map((s) => s.name).join(', ')}\n`);
  try {
    if (opts.only !== 'own-agent') await release(ctx, run);
    if (opts.only !== 'release') await ownAgent(ctx, run);
  } catch (e) {
    record('harness', 'FAIL', 'the test run itself crashed', e?.stack ?? e);
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  const summary = { started, finished: new Date().toISOString(), node: process.version, platform: process.platform, shells: ctx.shells.map((s) => s.name), tarball_sha256: digest, pass: count('PASS'), fail: count('FAIL'), not_checked: count('NOT_CHECKED'), results };
  console.log(`\n${summary.pass} passed · ${summary.fail} failed · ${summary.not_checked} not checked`);
  if (opts.out) {
    mkdirSync(opts.out, { recursive: true });
    writeFileSync(join(opts.out, `e2e-${process.platform}.json`), `${JSON.stringify(summary, null, 2)}\n`);
  }
  if (!opts.keep) rmSync(work, { recursive: true, force: true });
  else console.log(`kept ${work}`);
  process.exit(summary.fail ? 1 : summary.not_checked ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
