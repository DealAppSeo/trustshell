#!/usr/bin/env node
/**
 * PROOF PACK: can a stranger reproduce the headline claims with ONE command, and see PASS / FAIL /
 * NOT_CHECKED per step with the receipt in hand?
 *
 *     npm run proof-pack            (or: node scripts/proof-pack.mjs)
 *
 * Needs Node >= 22 and an internet connection. Needs NO account, NO key and NO node_modules in this repo:
 * it packs this checkout with `npm pack`, installs the tarball into a temp dir, and runs the commands the
 * README tells a stranger to run. Standard library only.
 *
 *   1  check, as the README runs it: a known-TRUE and a known-FALSE claim about a pinned GitHub Actions run
 *      (1a), and one sentence of each kind through the hosted checkers (1b). Each is run from the PACKED
 *      artifact and from the PUBLISHED @hyperdag/trustshell@latest, and the two must agree.
 *   2  the receipt in hand (record.json), verified OFFLINE: the digest recomputed by this file's own RFC 8785
 *      code and by the shipped digestRecord(), and the shipped `inspect` on a chained log. Run with a guard
 *      that makes any network connect throw, so "offline" is a check and not a claim.
 *   3  TAMPER NEGATIVE CONTROL: flip one character and require the verifiers to FAIL. Each verifier must
 *      also PASS the untouched copy first, or a verifier that always says "no" would pass this step.
 *   4  ERC-8004: read-only eth_call on Base Sepolia, public RPC only. Only eth_chainId / eth_getCode /
 *      eth_call / eth_blockNumber are ever sent. A one-nibble-wrong address is the control.
 *   5  x402 receipt-BEFORE-payment gate (guardedX402Payment + writeReceipt), a throwaway key, and a local
 *      Hardhat devnet (chain 31337) when one is available. Nothing is sent to any chain. Egress is recorded.
 *
 * Verdicts: PASS | FAIL | NOT_CHECKED. NOT_CHECKED is a result and never a pass. A step that cannot run
 * because the network, a quota or a provider failed says THAT (`cause`), it is not a quality result.
 * Exit: 0 every check PASS | 1 any FAIL | 2 nothing FAILED but something is NOT_CHECKED | 3 usage/setup.
 *
 *   --out-dir <dir>         where proof-pack-<stem>.json/.md go (default docs/proof-pack)
 *   --stem <name>           file stem (default proof-pack-<UTC date>)
 *   --runs-log <file>       also append one JSON line per run (the loop's ledger)
 *   --skip a,b              hosted | published | erc8004 | devnet | gate
 *   --state-file <file>     hosted-call counter (default <tmp>/proof-pack-state.json)
 *   --hosted-daily-cap <n>  stop calling the hosted checkers after n calls per UTC day (default 60)
 *   --tarball <file>        test this tarball instead of packing the checkout (how a broken build is shown to FAIL)
 *   --keep                  keep the temp dir
 * Env: PROOF_PACK_DEVNET_MODULE / PROOF_PACK_DEVNET_DIR  devnet.mjs and the folder with hardhat in it
 *      PROOF_PACK_RPC                                    Base Sepolia RPC (default https://sepolia.base.org)
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
if (has('--help') || has('-h')) { console.log(fs.readFileSync(SELF, 'utf8').split('*/')[0].replace(/^\/\*\*?\n?/, '').replace(/^ \* ?/gm, '')); process.exit(0); }
const SKIP = new Set((opt('--skip', '') || '').split(',').filter(Boolean));
const NOW = new Date();
const UTC_DATE = NOW.toISOString().slice(0, 10);
const OUT_DIR = path.resolve(ROOT, opt('--out-dir', 'docs/proof-pack'));
const STEM = opt('--stem', `proof-pack-${UTC_DATE}`);
const STATE_FILE = opt('--state-file', path.join(os.tmpdir(), 'proof-pack-state.json'));
const HOSTED_CAP = Number(opt('--hosted-daily-cap', '60'));
const TARBALL = opt('--tarball', null); // test a tarball you built (or a deliberately broken one) instead of packing this checkout

// ---- the ruler: what exactly is being asked. Changing any of this changes pack_ruler_sha256. ----------------------
const RUN_ID = '39619591025';
const RUN_URL = `https://github.com/DealAppSeo/trustshell/actions/runs/${RUN_ID}`;
const CLAIM_TRUE = `The check workflow succeeded, run ${RUN_ID}.`;
const CLAIM_FALSE = `The check workflow succeeded on commit 5d1c5e3f57e1, run ${RUN_ID}.`; // the run is on 392797a69b6a
const SENT_TRUE = 'The capital of France is Paris.';
const SENT_FALSE = 'The Eiffel Tower is located in Rome, Italy.';
const RPC_LIST = [process.env.PROOF_PACK_RPC || 'https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'];
const IDENTITY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const REPUTATION = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
const DEVNET_MODULE = process.env.PROOF_PACK_DEVNET_MODULE || 'E:/dev/ops/loop/devnet.mjs';
const DEVNET_DIR = process.env.PROOF_PACK_DEVNET_DIR || 'E:/dev/ops/loop/arena/devnet';
const RULER = { RUN_URL, CLAIM_TRUE, CLAIM_FALSE, SENT_TRUE, SENT_FALSE, IDENTITY, REPUTATION, chain: [84532, 31337] };
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const RULER_SHA = sha256(JSON.stringify(RULER));
const SELF_SHA = sha256(fs.readFileSync(SELF));

// ---- plumbing ------------------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const err = (m) => process.stderr.write(m + '\n');
const SCRUB = ['TRUSTSHELL_API_URL', 'REPID_API_KEY', 'OFFLINE', 'TRUSTSHELL_LAYA', 'TRUSTSHELL_HOME', 'NODE_OPTIONS'];
const CACHE = path.join(os.tmpdir(), 'proof-pack-npm-cache'); // private: the shared npm cache collides with other sessions (EEXIST)
/** A stranger's environment: no TrustShell variables, and none of the npm_* ones `npm run` injects. */
function childEnv(extra = {}) {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (/^npm_/i.test(k)) delete e[k];
  for (const k of SCRUB) delete e[k];
  return { ...e, npm_config_cache: CACHE, npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_loglevel: 'error', NO_COLOR: '1', ...extra };
}
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
}
function run(cmd, args, { cwd, env, timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let stdout = '', stderr = '', timedOut = false;
    const child = spawn(cmd, args, { cwd, env: env || childEnv(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { if (stdout.length < 2e6) stdout += d; });
    child.stderr.on('data', (d) => { if (stderr.length < 2e6) stderr += d; });
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: null, stdout, stderr: stderr + String(e.message), ms: Date.now() - t0, timedOut, spawnError: true }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, ms: Date.now() - t0, timedOut }); });
  });
}
function npmCli(name) {
  const bin = path.dirname(process.execPath);
  for (const d of [path.join(bin, 'node_modules', 'npm', 'bin'), path.join(bin, '..', 'lib', 'node_modules', 'npm', 'bin')]) {
    const f = path.join(d, `${name}-cli.js`);
    if (fs.existsSync(f)) return f;
  }
  throw new Error(`cannot find ${name}-cli.js next to ${process.execPath}`);
}
const npm = (args, o) => run(process.execPath, [npmCli('npm'), ...args], o);
const npx = (args, o) => run(process.execPath, [npmCli('npx'), ...args], o);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const first = (s) => String(s || '').trim().split(/\r?\n/).find(Boolean) || '';

// ---- results -------------------------------------------------------------------------------------------------------
const steps = [];
const limits = [];
const P = (detail, data) => ({ verdict: 'PASS', detail, data });
const F = (detail, cause = 'logic', data) => ({ verdict: 'FAIL', detail, cause, data });
const N = (detail, cause, data) => ({ verdict: 'NOT_CHECKED', detail, cause, data });
function mkStep(id, label, source) { const st = { id, label, source, verdict: null, ms: 0, checks: [] }; steps.push(st); return st; }
async function check(st, label, fn, source) {
  const t0 = Date.now();
  let r;
  try { r = await fn(); } catch (e) { r = F(String(e?.stack || e).split('\n').slice(0, 3).join(' | '), 'pack-bug'); }
  const c = { label, verdict: r.verdict, ms: Date.now() - t0, source: r.source || source, detail: r.detail ?? '', ...(r.cause ? { cause: r.cause } : {}), ...(r.data ? { data: r.data } : {}) };
  st.checks.push(c);
  err(`  ${c.verdict.padEnd(11)} ${st.id} ${label}${c.detail ? ' | ' + String(c.detail).slice(0, 160) : ''}${c.cause ? ` [${c.cause}]` : ''}`);
  return c;
}
const roll = (cs) => (cs.some((c) => c.verdict === 'FAIL') ? 'FAIL' : cs.some((c) => c.verdict === 'NOT_CHECKED') || !cs.length ? 'NOT_CHECKED' : 'PASS');
const notRun = (st, label, reason, cause) => st.checks.push({ label, verdict: 'NOT_CHECKED', ms: 0, detail: reason, cause });

// ---- RFC 8785 (JCS), for I-JSON data: sorted keys (UTF-16 order) and JSON.stringify's own string and number forms ---
const jcs = (v) => (Array.isArray(v) ? `[${v.map(jcs).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + jcs(v[k])).join(',')}}` : JSON.stringify(v));
const flipHex = (h) => h.slice(0, -1) + (h.endsWith('0') ? '1' : '0');

/** The record file's own claim about itself, recomputed. */
function verifyRecordText(text) {
  let j;
  try { j = JSON.parse(text); } catch { return { ok: false, reason: 'not JSON' }; }
  if (!j?.record || !j?.digest?.value) return { ok: false, reason: 'no record/digest' };
  if (j.digest.algorithm !== 'sha-256' || j.digest.canonicalization !== 'RFC 8785') return { ok: false, reason: 'unexpected digest scheme' };
  const computed = sha256(jcs(j.record));
  return computed === j.digest.value ? { ok: true, computed } : { ok: false, reason: 'digest mismatch', computed, claimed: j.digest.value };
}

/** A tamper control passes only if the verifier accepts the UNTOUCHED copy and rejects the changed one: a verifier that always says no (or always yes) cannot pass it. */
function controlVerdict(verify, good, bad) {
  if (!verify(good).ok) return F('positive control failed: the verifier rejects the UNTOUCHED copy', 'control-failed');
  const v = verify(bad);
  return v.ok ? F('tamper NOT detected (this pack is invalid until that is fixed)', 'control-failed') : P(v.reason);
}
export { jcs, verifyRecordText, controlVerdict, flipHex, chainedLog, classifySentence, classifyRun }; // imported by tests/e2e/proof-pack-controls.mjs

// ---- state: hosted-call budget (the production engine's budgets are real visitors') ---------------------------------
const loadState = () => { try { const s = readJson(STATE_FILE); if (s.utc === UTC_DATE) return s; } catch { /* first run today */ } return { utc: UTC_DATE, hosted: 0, quota: false }; };
const saveState = (s) => { try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch { /* best effort */ } };
let lastHosted = 0;
async function hostedGate() { const wait = lastHosted + 21000 - Date.now(); if (wait > 0) await sleep(wait); lastHosted = Date.now(); } // <= 2.9 requests/minute

// ---- setup: pack, install packed, install published ----------------------------------------------------------------
const S = { tmp: null, packedDir: null, publishedDir: null, gateDir: null, cleanDir: null, tgz: null, pubVersion: null, receipts: {}, pkg: readJson(path.join(ROOT, 'package.json')) };
const tools = { node: process.version, platform: `${process.platform} ${os.release()}`, packed: null, published: null };
const binOf = (dir) => { const pj = path.join(dir, 'node_modules', '@hyperdag', 'trustshell'); return path.join(pj, readJson(path.join(pj, 'package.json')).bin.trustshell); };
const verOf = (dir) => readJson(path.join(dir, 'node_modules', '@hyperdag', 'trustshell', 'package.json')).version;
function installPkg(dir, specs) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: path.basename(dir), private: true })); return npm(['install', '--prefer-offline', ...specs], { cwd: dir, timeoutMs: 600000 }); }

async function setup() {
  const st = mkStep('0', 'setup: pack this checkout, install it cold, find what npm serves', '[npm]');
  S.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-pack-'));
  fs.mkdirSync(CACHE, { recursive: true });
  S.packedDir = path.join(S.tmp, 'packed'); S.publishedDir = path.join(S.tmp, 'published'); S.gateDir = path.join(S.tmp, 'gate'); S.cleanDir = path.join(S.tmp, 'clean');
  fs.mkdirSync(S.cleanDir);
  const v = await npm(['--version'], { timeoutMs: 30000 });
  tools.npm = first(v.stdout);
  await check(st, 'npm view @hyperdag/trustshell version (what a stranger gets from @latest)', async () => {
    const r = await npm(['view', '@hyperdag/trustshell', 'version'], { timeoutMs: 180000 }); // ~25 s on a loaded laptop
    S.pubVersion = first(r.stdout);
    if (r.code !== 0 || !/^\d+\.\d+\.\d+/.test(S.pubVersion)) { S.pubVersion = null; return N(first(r.stderr) || 'npm view failed', r.timedOut ? 'timeout' : 'npm'); }
    tools.published = { version: S.pubVersion, source: 'npm view @hyperdag/trustshell version' };
    return P(`latest is ${S.pubVersion}`);
  }, '[npm]');
  await check(st, TARBALL ? `use the tarball given with --tarball (${path.basename(TARBALL)})` : 'npm pack this checkout', async () => {
    if (TARBALL) {
      if (!fs.existsSync(TARBALL)) return N(`no such file: ${TARBALL}`, 'usage');
      S.tgz = path.resolve(TARBALL);
      tools.packed = { name: '(from --tarball)', version: null, bytes: fs.statSync(S.tgz).size, tarball_sha256: sha256(fs.readFileSync(S.tgz)), note: 'a tarball the caller supplied; this pack did not build it' };
      return P(`${tools.packed.bytes} bytes, sha256 ${tools.packed.tarball_sha256.slice(0, 12)}`);
    }
    const r = await npm(['pack', '--json', '--pack-destination', S.tmp], { cwd: ROOT, timeoutMs: 120000 });
    if (r.code !== 0) return F(first(r.stderr) || 'npm pack failed', 'npm');
    const j = JSON.parse(r.stdout)[0];
    S.tgz = path.join(S.tmp, j.filename);
    tools.packed = { name: j.name, version: j.version, files: j.entryCount, bytes: j.size, tarball_sha256: sha256(fs.readFileSync(S.tgz)), note: 'packed from the committed dist/ (not rebuilt here); tests/sdk-dist-fresh gates its freshness' };
    return P(`${j.name}@${j.version}, ${j.entryCount} files, ${j.size} bytes`);
  }, '[npm]');
  if (S.tgz) await check(st, 'install the packed tarball cold into an empty dir', async () => {
    const r = await installPkg(S.packedDir, [S.tgz]);
    if (r.code !== 0) return N(first(r.stderr) || 'npm install failed', r.timedOut ? 'timeout' : 'npm');
    tools.packed.version ??= verOf(S.packedDir);
    return P(`installed ${verOf(S.packedDir)} in ${r.ms} ms`);
  }, '[npm]');
  if (S.pubVersion && !SKIP.has('published')) await check(st, `install the published @hyperdag/trustshell@${S.pubVersion} cold into an empty dir`, async () => {
    const r = await installPkg(S.publishedDir, [`@hyperdag/trustshell@${S.pubVersion}`]);
    if (r.code !== 0) return N(first(r.stderr) || 'npm install failed', r.timedOut ? 'timeout' : 'npm');
    return P(`installed ${verOf(S.publishedDir)} in ${r.ms} ms`);
  }, '[npm]');
  if (S.tgz && !SKIP.has('gate')) await check(st, 'install the packed tarball + ethers (the README: ethers only if you sign x402)', async () => {
    const r = await installPkg(S.gateDir, [S.tgz, 'ethers@^6']);
    if (r.code !== 0) return N(first(r.stderr) || 'npm install failed', r.timedOut ? 'timeout' : 'npm');
    tools.ethers = readJson(path.join(S.gateDir, 'node_modules', 'ethers', 'package.json')).version;
    return P(`ethers ${tools.ethers}`);
  }, '[npm]');
  st.verdict = roll(st.checks);
  // The offline guard: any network connect from a node process that preloads this throws and is logged.
  S.egressLog = path.join(S.tmp, 'egress.log');
  S.preload = path.join(S.tmp, 'offline-guard.cjs').replace(/\\/g, '/');
  fs.writeFileSync(S.preload, `const net=require('net'),fs=require('fs');net.Socket.prototype.connect=function(...a){try{fs.appendFileSync(process.env.PP_EGRESS_LOG,JSON.stringify(a.map(String))+'\\n')}catch{}throw new Error('proof-pack offline guard: network connect blocked')};\n`);
}
const installed = (dir) => { try { return !!dir && fs.existsSync(binOf(dir)); } catch { return false; } };
const havePacked = () => installed(S.packedDir);
const havePublished = () => installed(S.publishedDir);
/** README-faithful: packed = the local bin through npx; published = `npx @hyperdag/trustshell@latest` from an empty dir. */
const cli = {
  packed: (a, o) => npx(['--no-install', 'trustshell', ...a], { cwd: S.packedDir, timeoutMs: 240000, ...o }),
  // The FIRST published call of a run is exactly the README's `npx @hyperdag/trustshell@latest`. Re-resolving @latest over the
  // network for every later call took 150-300 s each on the loaded laptop, so the rest pin the version `npm view` just returned
  // and prefer the cache. (`@latest` itself is checked once per run, by that first call and by `npm view`.)
  published: (a, o) => { const first = !S.publishedUsed; S.publishedUsed = true; return npx(first || !S.pubVersion ? ['--yes', '@hyperdag/trustshell@latest', ...a] : ['--yes', '--prefer-offline', `@hyperdag/trustshell@${S.pubVersion}`, ...a], { cwd: S.cleanDir, timeoutMs: 360000, ...o }); },
};
/** Offline: the very file the `trustshell` bin runs, with the network-connect guard preloaded. */
async function offline(leg, args) {
  const dir = leg === 'packed' ? S.packedDir : S.publishedDir;
  const r = await run(process.execPath, [binOf(dir), ...args], { cwd: S.cleanDir, timeoutMs: 120000, env: childEnv({ NODE_OPTIONS: `--require=${S.preload}`, PP_EGRESS_LOG: S.egressLog }) });
  return r;
}
const egressAttempts = () => { try { return fs.readFileSync(S.egressLog, 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
const LEGS = () => ['packed', ...(S.pubVersion && !SKIP.has('published') ? ['published'] : [])];

// ---- step 1a: check a pinned CI run (api.github.com only) ------------------------------------------------------------
const statusKey = (rec) => JSON.stringify((rec?.claims || []).map((c) => [c.template, c.status]));
function classifyRun(r, kind, dir) {
  const text = r.stdout + r.stderr;
  if (r.timedOut) return N('timed out', 'timeout');
  if (r.spawnError) return F(first(r.stderr), 'tool-missing');
  if (r.code === 2 && /unknown|usage/i.test(text)) return F(`README command refused: ${first(text)}`, 'artifact');
  let rec = null;
  try { rec = readJson(path.join(dir, 'record.json')).record; } catch { /* no record written */ }
  if (!rec) return N(first(r.stderr) || first(r.stdout) || `exit ${r.code}, no record.json`, /403|429|rate limit/i.test(text) ? 'quota' : 'github');
  const sts = rec.claims.map((c) => c.status);
  const unread = !!rec.observation && rec.observation.conclusion == null;
  if (unread) return N('GitHub did not return the run', 'github');
  if (kind === 'true') return r.code === 0 && sts.every((s) => s === 'SUPPORTED') ? P(`exit 0, ${sts.length} claims SUPPORTED`, { exit: r.code, statuses: statusKey(rec) }) : F(`expected exit 0 and all SUPPORTED; got exit ${r.code}, ${sts.join(',')}`, 'logic', { exit: r.code, statuses: statusKey(rec) });
  return r.code === 1 && sts.includes('CONTRADICTED') ? P(`exit 1, ${sts.filter((s) => s === 'CONTRADICTED').length} CONTRADICTED`, { exit: r.code, statuses: statusKey(rec) }) : F(`expected exit 1 with a CONTRADICTED claim; got exit ${r.code}, ${sts.join(',')}`, 'logic', { exit: r.code, statuses: statusKey(rec) });
}
async function step1a() {
  const st = mkStep('1a', `check a pinned CI run (run ${RUN_ID}): one TRUE and one FALSE claim, packed vs published`, '[cmd] trustshell check <runUrl> --claims-file claims.txt --out <dir>   (api.github.com only)');
  const outcomes = {};
  for (const kind of ['true', 'false']) {
    const file = path.join(S.tmp, `claims-${kind}.txt`);
    fs.writeFileSync(file, (kind === 'true' ? CLAIM_TRUE : CLAIM_FALSE) + '\n');
    for (const leg of LEGS()) {
      if (leg === 'packed' && !havePacked()) { notRun(st, `${leg} ${kind}`, 'packed install missing', 'npm'); continue; }
      if (leg === 'published' && !S.pubVersion) continue;
      const dir = path.join(S.tmp, 'out', `${leg}-${kind}`);
      const c = await check(st, `${leg}: ${kind} claim -> ${kind === 'true' ? 'exit 0, SUPPORTED' : 'exit 1, CONTRADICTED'}`, async () => {
        const r = await cli[leg](['check', RUN_URL, '--claims-file', file, '--out', dir]);
        const v = classifyRun(r, kind, dir);
        v.data = { ...(v.data || {}), cmd_ms: r.ms };
        if (fs.existsSync(path.join(dir, 'record.json'))) (S.receipts[leg] ||= {})[kind] = { dir, text: fs.readFileSync(path.join(dir, 'record.json'), 'utf8'), card: fs.existsSync(path.join(dir, 'card.md')) ? fs.readFileSync(path.join(dir, 'card.md'), 'utf8') : '' };
        return v;
      });
      (outcomes[kind] ||= {})[leg] = c;
    }
    const lab = ['packed', 'published'].map((l) => outcomes[kind]?.[l]).filter(Boolean);
    if (lab.length === 2) await check(st, `packed and published agree on the ${kind} claim (exit code and per-claim statuses)`, async () => {
      if (lab.some((c) => c.verdict === 'NOT_CHECKED')) return N('a leg was not checked', lab.find((c) => c.cause)?.cause || 'network');
      const [a, b] = lab.map((c) => JSON.stringify([c.data?.exit, c.data?.statuses]));
      return a === b ? P('same exit code and statuses') : F(`packed ${a} vs published ${b}`, 'drift');
    }, '[pack]');
  }
  for (const leg of LEGS()) {
    const t = outcomes.true?.[leg], f = outcomes.false?.[leg];
    if (t && f) await check(st, `${leg}: the check discriminates (true and false claims get different results)`, async () => (t.verdict === 'NOT_CHECKED' || f.verdict === 'NOT_CHECKED' ? N('a claim was not checked', t.cause || f.cause) : t.data.statuses !== f.data.statuses && t.data.exit !== f.data.exit ? P(`exit ${t.data.exit} vs ${f.data.exit}`) : F('true and false claims were treated alike', 'logic')), '[pack]');
  }
  // Windows PowerShell 5.1 `Set-Content` writes CRLF (and `-Encoding utf8` writes a BOM): the README's PowerShell path.
  if (havePacked()) await check(st, 'packed: the TRUE claim in a CRLF+BOM file (what PowerShell 5.1 writes) gives the same record', async () => {
    const file = path.join(S.tmp, 'claims-crlf.txt');
    fs.writeFileSync(file, '\ufeff' + CLAIM_TRUE + '\r\n');
    const dir = path.join(S.tmp, 'out', 'packed-crlf');
    const r = await cli.packed(['check', RUN_URL, '--claims-file', file, '--out', dir]);
    const v = classifyRun(r, 'true', dir);
    const ref = outcomes.true?.packed;
    if (v.verdict !== 'PASS') return v;
    return ref?.data?.statuses === v.data.statuses ? P('same statuses as the LF file') : F('CRLF/BOM changed the statuses', 'logic');
  }, '[cmd]');
  st.verdict = roll(st.checks);
}

// ---- step 1b: check one sentence (hosted checkers: leaves the machine) ------------------------------------------------
const EXIT_LABEL = { pass: 0, veto: 1 };
function classifySentence(r, expect) {
  if (r.timedOut) return N('timed out', 'timeout');
  if (r.spawnError) return F(first(r.stderr), 'tool-missing');
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* not JSON */ }
  const text = r.stdout + r.stderr;
  const data = j ? { label: j.label, by: j.by, latency_ms: j.latency_ms, voters: j.voters, votes: Array.isArray(j.votes) ? j.votes.map((v) => `${v.voter}(${v.family})=${v.verdict}`) : undefined, exit: r.code } : { exit: r.code };
  if (j?.label === expect && r.code === EXIT_LABEL[expect]) return P(`${j.label} (exit ${r.code}) by ${j.by ?? '?'}${data.votes ? ' ' + data.votes.join(' ') : ''} in ${j.latency_ms} ms`, data);
  if (j?.label === 'pass' || j?.label === 'veto') return F(`expected ${expect}, the checkers said ${j.label}`, 'quality', data);
  if (/429|too many|limit/i.test(text)) return N('429 from the hosted checkers', 'quota', data);
  if (j?.label === 'not-checked') return N(`not-checked (${j.by ?? 'no checker answered'}${j.reason ? ': ' + j.reason : ''})`, 'provider', data);
  return N(first(r.stderr) || first(r.stdout) || `exit ${r.code}`, 'network', data);
}
async function step1b() {
  const st = mkStep('1b', 'check one sentence through the hosted checkers: a TRUE and a FALSE one, packed vs published', '[cmd] trustshell check "<sentence>" --json   (POST /api/v1/classify; paced <= 2.9 requests/minute)');
  const state = loadState();
  const out = {};
  for (const kind of ['true', 'false']) {
    for (const leg of LEGS()) {
      const expect = kind === 'true' ? 'pass' : 'veto';
      const c = await check(st, `${leg}: "${kind === 'true' ? SENT_TRUE : SENT_FALSE}" -> ${expect}`, async () => {
        if (leg === 'packed' && !havePacked()) return N('packed install missing', 'npm');
        if (state.quota) return N('the hosted checkers answered 429 earlier today (UTC); not asking again until tomorrow', 'quota');
        if (state.hosted >= HOSTED_CAP) return N(`this pack's own daily budget of ${HOSTED_CAP} hosted calls is spent (a budget, not an outage)`, 'budget');
        await hostedGate();
        state.hosted++; saveState(state);
        const r = await cli[leg](['check', kind === 'true' ? SENT_TRUE : SENT_FALSE, '--json']);
        const v = classifySentence(r, expect);
        if (v.cause === 'quota') { state.quota = true; saveState(state); }
        return v;
      });
      (out[kind] ||= {})[leg] = c;
    }
    const lab = ['packed', 'published'].map((l) => out[kind]?.[l]).filter(Boolean);
    if (lab.length === 2) await check(st, `packed and published agree on the ${kind} sentence`, async () => {
      if (lab.some((c) => c.verdict === 'NOT_CHECKED')) return N('a leg was not checked', lab.find((c) => c.cause)?.cause);
      return lab[0].data.label === lab[1].data.label ? P(`both said ${lab[0].data.label}`) : F(`packed ${lab[0].data.label} vs published ${lab[1].data.label}`, 'drift');
    }, '[pack]');
  }
  st.verdict = roll(st.checks);
}

// ---- steps 2 + 3: the receipt in hand, verified offline, then tampered ---------------------------------------------
function chainedLog(n = 5) {
  const lines = []; let prev = null;
  for (let seq = 1; seq <= n; seq++) {
    const e = { seq, ts: `2026-10-24T00:00:0${seq}.000Z`, tool: ['Read', 'Grep', 'Edit', 'Bash', 'Read'][seq - 1] || 'Read', input_sha256: sha256(`in${seq}`), output_sha256: sha256(`out${seq}`), prev };
    e.hash = sha256(JSON.stringify([e.seq, e.ts, e.tool, e.input_sha256, e.output_sha256, e.prev]));
    lines.push(e); prev = e.hash;
  }
  return lines;
}
const logText = (lines) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
async function inspectLog(leg, file) {
  const r = await offline(leg, ['inspect', file, '--json']);
  let verdict = null; try { verdict = JSON.parse(r.stdout).verdict; } catch { /* not JSON */ }
  return { verdict, code: r.code, ms: r.ms };
}
async function step23() {
  const st2 = mkStep('2', 'the receipt in hand, verified OFFLINE (no socket may open)', '[pack] RFC 8785 digest recomputed here · [shipped] digestRecord() · [shipped cmd] trustshell inspect');
  const st3 = mkStep('3', 'TAMPER NEGATIVE CONTROL: change one character, the verifiers must FAIL', '[pack] + [shipped cmd] trustshell inspect');
  const have = [];
  for (const leg of LEGS()) for (const kind of ['true', 'false']) if (S.receipts[leg]?.[kind]) have.push([leg, kind, S.receipts[leg][kind]]);
  if (!have.length) { notRun(st2, 'record.json', 'step 1a produced no record to verify', 'upstream'); notRun(st3, 'tamper', 'no record to tamper with', 'upstream'); }
  // the offline guard must itself work, or "offline" means nothing
  if (havePacked()) await check(st2, 'control: the offline guard blocks a connect attempt', async () => {
    const before = egressAttempts();
    const r = await run(process.execPath, ['-e', "fetch('http://127.0.0.1:59999/').then(()=>process.exit(1),e=>process.exit(/offline guard/.test(String(e.cause&&e.cause.message||e))?0:1))"], { cwd: S.cleanDir, timeoutMs: 20000, env: childEnv({ NODE_OPTIONS: `--require=${S.preload}`, PP_EGRESS_LOG: S.egressLog }) });
    return r.code === 0 && egressAttempts() === before + 1 ? P('a fetch from a guarded process threw and was logged') : F(`guard did not hold (exit ${r.code})`, 'logic');
  }, '[pack]');
  const guardBase = egressAttempts();
  const shipped = {};
  for (const leg of ['packed', 'published']) {
    try { const dir = leg === 'packed' ? S.packedDir : S.publishedDir; if (installed(dir)) shipped[leg] = createRequire(path.join(dir, 'x.js'))(path.join(dir, 'node_modules', '@hyperdag', 'trustshell', 'dist', 'lib', 'action-evidence.js')).digestRecord; } catch { /* leg absent */ }
  }
  for (const [leg, kind, rc] of have) {
    const tag = `${leg}/${kind}`;
    await check(st2, `${tag}: record.json digest recomputed offline equals the digest in the file`, async () => {
      const v = verifyRecordText(rc.text);
      return v.ok ? P(`sha-256 ${v.computed.slice(0, 16)}… over RFC 8785`, { digest: v.computed }) : F(v.reason, 'logic');
    }, '[pack]');
    await check(st2, `${tag}: the digest in card.md's footer equals the record's`, async () => {
      const m = /sha-256 `([0-9a-f]{64})`/.exec(rc.card);
      return m && m[1] === JSON.parse(rc.text).digest.value ? P('card footer, record.json and recomputation agree') : F(m ? 'card footer digest differs' : 'no digest in card.md', 'logic');
    }, '[pack]');
    if (shipped[leg]) await check(st2, `${tag}: the shipped digestRecord() agrees with this file's own RFC 8785 code`, async () => {
      const j = JSON.parse(rc.text);
      const d = shipped[leg](j.record);
      return d.value === sha256(jcs(j.record)) ? P('two independent implementations, same digest') : F('shipped and pack digests differ', 'drift');
    }, '[shipped fn, deep import: not a CLI command]');
  }
  // the shipped offline verifier: `inspect` on a chained log
  const good = chainedLog();
  const goodFile = path.join(S.tmp, 'session-good.jsonl'); fs.writeFileSync(goodFile, logText(good));
  const cases = [
    ['flip one hex digit of one output_sha256', () => logText(good.map((l, i) => (i === 2 ? { ...l, output_sha256: flipHex(l.output_sha256) } : l)))],
    ['delete one middle line', () => logText(good.filter((_, i) => i !== 2))],
  ];
  for (const leg of LEGS()) {
    const dir = leg === 'packed' ? S.packedDir : S.publishedDir;
    if (!installed(dir)) { notRun(st2, `${leg}: shipped inspect`, `${leg} install missing`, 'npm'); continue; }
    await check(st2, `${leg}: shipped \`inspect\` on an untouched 5-entry chained log -> INTACT (positive control)`, async () => {
      const r = await inspectLog(leg, goodFile);
      return r.verdict === 'INTACT' && r.code === 0 ? P(`INTACT, exit 0, ${r.ms} ms`) : F(`expected INTACT/0, got ${r.verdict}/${r.code}`, 'logic');
    }, '[shipped cmd] trustshell inspect');
    for (const [name, make] of cases) {
      await check(st3, `${leg}: shipped \`inspect\` after "${name}" -> BROKEN`, async () => {
        const f = path.join(S.tmp, `session-bad-${leg}.jsonl`); fs.writeFileSync(f, make());
        const r = await inspectLog(leg, f);
        return r.verdict === 'BROKEN' && r.code === 1 ? P(`BROKEN, exit 1`) : F(`tamper NOT detected: ${r.verdict}/${r.code} (this pack is invalid until that is fixed)`, 'control-failed');
      }, '[shipped cmd] trustshell inspect');
    }
  }
  // tamper the record files
  for (const [leg, kind, rc] of have) {
    const tag = `${leg}/${kind}`;
    const head = JSON.parse(rc.text).record.observation?.head_sha;
    const dig = JSON.parse(rc.text).digest.value;
    const variants = [
      ['one hex character of observation.head_sha', head && rc.text.replace(head, flipHex(head))],
      ['one hex digit of digest.value', rc.text.replace(dig, flipHex(dig))],
    ];
    for (const [name, text] of variants) {
      await check(st3, `${tag}: record.json after changing ${name} -> digest check FAILS`, async () => {
        if (!text || text === rc.text) return F('could not make the tamper (pattern absent)', 'pack-bug');
        const c = controlVerdict(verifyRecordText, rc.text, text);
        if (c.verdict !== 'PASS') return c;
        const d = shipped[leg] ? shipped[leg](JSON.parse(text).record).value === JSON.parse(text).digest.value : null;
        return d === true ? F('the shipped digestRecord() accepted the tampered record', 'control-failed') : P(`${c.detail}${d === false ? '; the shipped digestRecord() also disagrees' : ''}`);
      }, '[pack]');
    }
  }
  // limit probe, not a verdict: what the chain does NOT catch
  if (havePacked()) {
    const forged = good.map((l) => ({ ...l })); let prev = null;
    forged[2].tool = 'Rm'; // edit, then re-derive every later hash: the chain is unkeyed
    for (const e of forged) { e.prev = prev; e.hash = sha256(JSON.stringify([e.seq, e.ts, e.tool, e.input_sha256, e.output_sha256, e.prev])); prev = e.hash; }
    const f = path.join(S.tmp, 'session-forged.jsonl'); fs.writeFileSync(f, logText(forged));
    const r = await inspectLog('packed', f);
    limits.push({ id: 'inspect-unkeyed', observed: r.verdict === 'INTACT', evidence: `an edited log whose later hashes were re-derived verified ${r.verdict} (exit ${r.code}); inspect's own card says an INTACT chain has no trusted anchor`, meaning: 'the tamper control proves inspect catches an edit that leaves later hashes alone, not a log rewritten end to end' });
  }
  if (egressAttempts() !== guardBase) await check(st2, 'no network connect was attempted by any offline verifier', async () => F(`${egressAttempts() - guardBase} connect attempt(s) logged in ${S.egressLog}`, 'logic'), '[pack]');
  else await check(st2, 'no network connect was attempted by any offline verifier', async () => P('0 connect attempts logged by the guard'), '[pack]');
  // enumerate what ships: is there a CLI command that verifies a record.json digest?
  const helps = {};
  for (const leg of LEGS()) { const dir = leg === 'packed' ? S.packedDir : S.publishedDir; if (installed(dir)) helps[leg] = (await offline(leg, ['--help'])).stdout; }
  const verbs = {};
  for (const [leg, h] of Object.entries(helps)) verbs[leg] = h.split(/\r?\n/).filter((l) => /^  \S/.test(l) && /verif|inspect|receipt|bundle/i.test(l)).map((l) => l.trim().slice(0, 90));
  const recordVerifier = Object.entries(helps).some(([, h]) => /(verify|check)[ -]?(a )?(record|digest)|record\.json.*(verify|digest)|digest.*(recompute|verify)/i.test(h.replace(/Prints a Markdown card[^\n]*\n[^\n]*\n/g, '')));
  limits.push({ id: 'no-shipped-record-verifier', observed: !recordVerifier, evidence: `searched: the --help text of ${Object.keys(helps).map((l) => `${l} ${l === 'packed' ? tools.packed?.version : S.pubVersion}`).join(' and ')}. Offline verbs found: ${JSON.stringify(verbs)}`, not_searched: 'the SDK exports other than digestRecord (deep import), the MCP server tools, trustshell.dev/inspect in a browser', meaning: 'step 2 verifies record.json with this file\'s own RFC 8785 code and the deep-imported digestRecord(); no `trustshell` command re-checks the digest a card prints' });
  st2.verdict = roll(st2.checks); st3.verdict = roll(st3.checks);
}

// ---- step 4: ERC-8004, read-only ----------------------------------------------------------------------------------------
const READ_ONLY = new Set(['eth_chainId', 'eth_getCode', 'eth_call', 'eth_blockNumber']);
const methodsUsed = new Set();
async function rpc(url, method, params) {
  if (!READ_ONLY.has(method)) throw new Error(`proof pack refuses ${method}: only read methods are allowed`);
  methodsUsed.add(method);
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12000) });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message || 'rpc error'); e.rpcError = true; throw e; }
  return j.result;
}
const word = (n) => BigInt(n).toString(16).padStart(64, '0');
const decodeString = (hex) => { const b = Buffer.from(hex.slice(2), 'hex'); const len = Number(BigInt('0x' + b.subarray(32, 64).toString('hex'))); return b.subarray(64, 64 + len).toString('utf8'); };
async function step4() {
  const st = mkStep('4', 'ERC-8004 on Base Sepolia, READ-ONLY (eth_chainId / eth_getCode / eth_call, public RPC)', '[rpc] eth_call against the IdentityRegistry');
  let url = null;
  await check(st, 'a public RPC answers as Base Sepolia (chain id 84532)', async () => {
    const tried = [];
    for (const u of RPC_LIST) {
      try { const id = await rpc(u, 'eth_chainId', []); tried.push(`${new URL(u).host}:${id}`); if (BigInt(id) === 84532n) { url = u; return P(`${new URL(u).host} answered 0x14a34${tried.length > 1 ? ` (after ${tried.slice(0, -1).join(', ')})` : ''}`, { rpc: new URL(u).host }); } return F(`${new URL(u).host} answered chain ${BigInt(id)}`, 'rpc'); }
      catch (e) { tried.push(`${new URL(u).host}:${e.name === 'TimeoutError' ? 'timeout' : e.message}`); }
    }
    return N(`no public RPC answered: ${tried.join('; ')}`, 'rpc');
  }, '[rpc]');
  if (!url) { notRun(st, 'IdentityRegistry reads', 'no RPC to ask', 'rpc'); st.verdict = roll(st.checks); return; }
  const call = (to, data) => rpc(url, 'eth_call', [{ to, data }, 'latest']);
  await check(st, `the IdentityRegistry ${IDENTITY} has contract code, and the README names it`, async () => {
    const code = await rpc(url, 'eth_getCode', [IDENTITY, 'latest']);
    const readme = fs.existsSync(path.join(ROOT, 'README.md')) && fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').includes(IDENTITY);
    if (code.length <= 2) return F('no code at that address', 'logic');
    return readme ? P(`${(code.length - 2) / 2} bytes of code; README names the address`) : F('code present but README.md does not name this address (docs drift)', 'drift');
  }, '[rpc]');
  await check(st, 'an ERC-721 read decodes (supportsInterface(0x80ac58cd), name(), symbol())', async () => {
    const got = {};
    for (const [k, data] of [['erc721', '0x01ffc9a7' + '80ac58cd'.padEnd(64, '0')], ['name', '0x06fdde03'], ['symbol', '0x95d89b41']]) {
      try { const r = await call(IDENTITY, data); got[k] = k === 'erc721' ? BigInt(r) === 1n : decodeString(r); } catch (e) { got[k] = `error: ${e.message}`; }
    }
    return got.erc721 === true || (typeof got.name === 'string' && !got.name.startsWith('error')) ? P(JSON.stringify(got), got) : F(`no read decoded: ${JSON.stringify(got)}`, 'logic', got);
  }, '[rpc]');
  await check(st, 'info: ownerOf(6706) on the IdentityRegistry (not scored)', async () => {
    try { const r = await call(IDENTITY, '0x6352211e' + word(6706)); return P(`owner 0x${r.slice(-40)}`, { owner: '0x' + r.slice(-40) }); } catch (e) { return P(`reverts or has no such token: ${e.message}`); }
  }, '[rpc]');
  await check(st, `the ReputationRegistry ${REPUTATION} has contract code`, async () => { const c = await rpc(url, 'eth_getCode', [REPUTATION, 'latest']); return c.length > 2 ? P(`${(c.length - 2) / 2} bytes of code`) : F('no code at that address', 'logic'); }, '[rpc]');
  await check(st, 'control: the same address with its last hex digit changed has NO code (the check can say no)', async () => {
    const wrong = IDENTITY.slice(0, -1) + (IDENTITY.endsWith('0') ? '1' : '0');
    const c = await rpc(url, 'eth_getCode', [wrong, 'latest']);
    return c === '0x' ? P(`${wrong} -> 0x`) : F(`expected no code at ${wrong}, got ${c.length} chars`, 'logic');
  }, '[rpc]');
  await check(st, 'only read methods were sent', async () => P([...methodsUsed].sort().join(', '), { methods: [...methodsUsed] }), '[pack]');
  st.verdict = roll(st.checks);
}

// ---- step 5: the x402 receipt-before-payment gate ---------------------------------------------------------------------
async function step5() {
  const st = mkStep('5', 'pay gate: receipt BEFORE payment (guardedX402Payment + writeReceipt; the SDK\'s EIP-3009 envelope, not an x402 v2 payload), local devnet only', '[shipped fn] guardedX402Payment from the packed tarball · [devnet] chain 31337');
  if (SKIP.has('gate')) { notRun(st, 'gate', 'skipped by --skip gate', 'skipped'); st.verdict = 'NOT_CHECKED'; return; }
  if (!S.tgz || !fs.existsSync(path.join(S.gateDir, 'node_modules', 'ethers'))) { notRun(st, 'gate', 'packed tarball + ethers not installed', 'npm'); st.verdict = 'NOT_CHECKED'; return; }
  const req = createRequire(path.join(S.gateDir, 'x.js'));
  const lib = req('@hyperdag/trustshell');
  const E = req('ethers');
  const egress = new Set();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (u, ...rest) => { const h = new URL(String(u?.url || u)).hostname; egress.add(h); if (!['127.0.0.1', 'localhost'].includes(h)) return Promise.reject(new Error(`proof pack blocks ${h} during the x402 step`)); return realFetch(u, ...rest); };
  const ev = [];
  const hadOwn = Object.hasOwn(E.Wallet.prototype, 'signTypedData');
  const origSign = E.Wallet.prototype.signTypedData;
  E.Wallet.prototype.signTypedData = function (...a) { ev.push('sign'); return origSign.apply(this, a); };
  let dev = null;
  const stopDev = () => { try { dev?.stop(); } catch { /* already stopped */ } };
  process.once('SIGINT', () => { stopDev(); process.exit(130); });
  try {
    const CHAIN = 31337;
    const payerKey = '0x' + randomBytes(32).toString('hex'); // throwaway, never funded, never printed
    const payer = new E.Wallet(payerKey).address;
    const to = E.getAddress('0x' + randomBytes(20).toString('hex'));
    const asset = E.getAddress('0x' + randomBytes(20).toString('hex'));
    const rdir = path.join(S.tmp, 'x402-receipts'); const blocker = path.join(S.tmp, 'a-file'); fs.writeFileSync(blocker, 'x');
    const written = [];
    const writer = (dir, { inject } = {}) => async () => {
      try {
        if (inject) throw new Error('receipt invalid (injected)');
        fs.mkdirSync(dir, { recursive: true });
        const f = path.join(dir, `receipt-${randomBytes(4).toString('hex')}.json`);
        fs.writeFileSync(f, JSON.stringify({ schema: 'proof-pack/receipt-0', intent: { to, amount: '100', chain_id: CHAIN }, at: new Date().toISOString() }));
        const fd = fs.openSync(f, 'r+'); fs.fsyncSync(fd); // Windows refuses fsync on a read-only handle (EPERM) fs.closeSync(fd);
        written.push(f); ev.push('receipt:write');
      } catch (e) { ev.push('receipt:throw'); throw e; }
    };
    const attempt = async (over) => {
      ev.length = 0; const lines = []; let header = null, error = null;
      try { header = await lib.guardedX402Payment({ privateKey: payerKey, to, amount: 100, cap: 1000, agentId: 'proof-pack', origin: 'Cli', policy: { allow: true }, chainId: CHAIN, asset, ...over }, { stream: { write: (s) => lines.push(String(s)) } }); } catch (e) { error = e; }
      return { header, error, ev: [...ev], audit: lines.length };
    };
    const domain = (chainId) => ({ name: 'USDC', version: '2', chainId, verifyingContract: asset });
    const types = { TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] };
    const recover = (header, chainId) => { const p = JSON.parse(Buffer.from(header, 'base64').toString('utf8')); return { p, who: E.verifyTypedData(domain(chainId), types, { from: p.from, to: p.to, value: p.value, validAfter: p.validAfter, validBefore: p.validBefore, nonce: p.nonce }, p.signature) }; };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    await check(st, 'the gate is exported by the packed tarball', async () => (typeof lib.guardedX402Payment === 'function' ? P('guardedX402Payment is a function') : F('not exported', 'artifact')), '[shipped fn]');
    let header = null;
    await check(st, 'receipt OK -> a payment header is produced, receipt written BEFORE the signature', async () => {
      const a = await attempt({ writeReceipt: writer(rdir) });
      if (a.error || !a.header) return F(`refused: ${a.error?.message}`, 'logic');
      header = a.header;
      const keys = Object.keys(JSON.parse(Buffer.from(a.header, 'base64').toString('utf8')));
      limits.push({ id: 'envelope-not-x402-spec', observed: !keys.includes('x402Version'), evidence: `the signed header decodes to a flat object with keys ${keys.join(', ')}; the x402 exact/EVM spec payload is nested (x402Version, accepted, payload{signature, authorization})`, meaning: 'step 5 shows the TrustShell escrow envelope (EIP-3009). It does not show interoperability with an x402 facilitator (spec: x402-foundation/x402, specs/schemes/exact/scheme_exact_evm.md; first observed by the ERC-8004/x402 lane on 2026-10-24)' });
      return same(a.ev, ['receipt:write', 'sign']) && a.audit === 1 ? P(`events ${a.ev.join(' -> ')}; 1 audit row; receipt file ${path.basename(written[0])}`, { events: a.ev }) : F(`wrong order: ${a.ev.join(' -> ')}, audit rows ${a.audit}`, 'logic', { events: a.ev });
    }, '[shipped fn]');
    await check(st, 'the signature recovers to the payer under the chain-31337 domain', async () => {
      if (!header) return N('no header from the previous check', 'upstream');
      const r = recover(header, CHAIN);
      return r.who === payer && r.p.to === to ? P(`recovered ${r.who.slice(0, 10)}… = payer; to = payee`) : F('signature does not recover to the payer', 'logic');
    }, '[pack] ethers.verifyTypedData');
    await check(st, 'NEGATIVE CONTROL: the receipt writer THROWS -> the payment REFUSES and nothing is signed', async () => {
      const a = await attempt({ writeReceipt: writer(rdir, { inject: true }) });
      return !a.header && /receipt invalid/.test(a.error?.message || '') && same(a.ev, ['receipt:throw']) ? P(`refused: ${a.error.message}; events ${a.ev.join(' -> ')}; 0 signatures`) : F(`header=${!!a.header} events=${a.ev.join(' -> ')} error=${a.error?.message}`, 'control-failed');
    }, '[shipped fn]');
    await check(st, 'NEGATIVE CONTROL: the receipt cannot really be written (ENOTDIR) -> REFUSES, nothing signed', async () => {
      const a = await attempt({ writeReceipt: writer(path.join(blocker, 'sub')) });
      return !a.header && a.error && same(a.ev, ['receipt:throw']) ? P(`refused: ${a.error.code || a.error.message}`) : F(`header=${!!a.header} events=${a.ev.join(' -> ')}`, 'control-failed');
    }, '[shipped fn]');
    await check(st, 'origin Unknown -> origin_refused, no receipt written, nothing signed', async () => {
      const a = await attempt({ origin: 'Unknown', writeReceipt: writer(rdir) });
      return !a.header && /origin_refused/.test(a.error?.message || '') && a.ev.length === 0 ? P('refused before any receipt') : F(`events ${a.ev.join(' -> ')} error ${a.error?.message}`, 'logic');
    }, '[shipped fn]');
    await check(st, 'no policy -> policy_required, no receipt written, nothing signed', async () => {
      const a = await attempt({ policy: undefined, writeReceipt: writer(rdir) });
      return !a.header && /policy_required/.test(a.error?.message || '') && a.ev.length === 0 ? P(`refused; ${a.audit} audit row written first`) : F(`events ${a.ev.join(' -> ')} error ${a.error?.message}`, 'logic');
    }, '[shipped fn]');
    await check(st, 'policy denies -> policy_denied, no receipt written, nothing signed', async () => {
      const a = await attempt({ policy: { allow: false }, writeReceipt: writer(rdir) });
      return !a.header && /policy_denied/.test(a.error?.message || '') && a.ev.length === 0 ? P('refused before any receipt') : F(`events ${a.ev.join(' -> ')} error ${a.error?.message}`, 'logic');
    }, '[shipped fn]');
    await check(st, 'amount over the cap -> cap_exceeded, nothing signed', async () => {
      const a = await attempt({ amount: 2000, writeReceipt: writer(rdir) });
      return !a.header && /cap_exceeded/.test(a.error?.message || '') && !a.ev.includes('sign') ? P(`refused; events ${a.ev.join(' -> ') || 'none'}`, { receipt_written_before_cap_refusal: a.ev.includes('receipt:write') }) : F(`header=${!!a.header} events ${a.ev.join(' -> ')} error ${a.error?.message}`, 'logic');
    }, '[shipped fn]');
    const capA = await attempt({ amount: 2000, writeReceipt: writer(rdir) });
    limits.push({ id: 'receipt-written-before-cap-check', observed: capA.ev.includes('receipt:write') && !capA.header, evidence: `an over-cap spend wrote a receipt (events ${capA.ev.join(' -> ')}) and was then refused by buildX402Payment`, meaning: 'the receipt gate runs before the cap check, so a refused spend can leave a receipt behind' });
    const ctrl = await attempt({});
    limits.push({ id: 'receipt-gate-is-opt-in', observed: !!ctrl.header && same(ctrl.ev, ['sign']), evidence: `with no writeReceipt the same call signed (events ${ctrl.ev.join(' -> ')})`, meaning: 'the gate exists only for callers that pass writeReceipt; omitting it pays with no receipt' });
    await check(st, 'CONTROL: with NO writeReceipt the same payment signs (so the refusals above are caused by the gate)', async () => (ctrl.header && same(ctrl.ev, ['sign']) ? P('signed without a receipt: the gate is opt-in') : F(`events ${ctrl.ev.join(' -> ')}`, 'logic')), '[shipped fn]');
    // ---- the devnet
    let mod = null;
    if (!SKIP.has('devnet') && fs.existsSync(DEVNET_MODULE) && fs.existsSync(path.join(DEVNET_DIR, 'node_modules', 'hardhat'))) mod = await import(pathToFileURL(DEVNET_MODULE).href).catch(() => null);
    if (!mod) notRun(st, 'local Hardhat devnet (chain 31337)', SKIP.has('devnet') ? 'skipped by --skip devnet' : `no devnet: set PROOF_PACK_DEVNET_MODULE and PROOF_PACK_DEVNET_DIR (looked for ${DEVNET_MODULE}, hardhat in ${DEVNET_DIR}). The gate checks above ran without a chain.`, 'devnet-unavailable');
    else {
      await check(st, 'a local Hardhat node answers as chain 31337 (devnet.mjs proves it before anything runs)', async () => {
        try { dev = await mod.startDevnet({ dir: DEVNET_DIR, waitMs: 120000 }); } catch (e) { return N(first(e.message).slice(0, 200), 'devnet'); }
        const id = await rpc2(dev.rpc, 'eth_chainId', []);
        return BigInt(id) === 31337n ? P(`${dev.rpc} up in ${dev.ms} ms`) : F(`answered chain ${BigInt(id)}`, 'logic');
      }, '[devnet]');
      if (dev) {
        const block0 = await rpc2(dev.rpc, 'eth_blockNumber', []);
        const a = await attempt({ writeReceipt: writer(rdir) });
        await check(st, 'devnet run: receipt written, then a header signed for chain 31337', async () => (a.header && same(a.ev, ['receipt:write', 'sign']) ? P(a.ev.join(' -> ')) : F(`events ${a.ev.join(' -> ')} error ${a.error?.message}`, 'logic')), '[devnet]');
        await check(st, 'the authorization is bound to chain 31337: it does NOT recover to the payer under the Base Sepolia (84532) domain', async () => {
          if (!a.header) return N('no header', 'upstream');
          const ok = recover(a.header, CHAIN).who === payer, wrong = recover(a.header, 84532).who;
          return ok && wrong !== payer ? P('recovers under 31337, not under 84532') : F(`recovers to payer under 31337: ${ok}; under 84532: ${wrong === payer}`, 'logic');
        }, '[pack] ethers.verifyTypedData');
        await check(st, 'nothing was sent to the devnet: same block number, payer nonce 0', async () => {
          const block1 = await rpc2(dev.rpc, 'eth_blockNumber', []); const nonce = await rpc2(dev.rpc, 'eth_getTransactionCount', [payer, 'latest']);
          return block0 === block1 && BigInt(nonce) === 0n ? P(`block ${BigInt(block1)} before and after; nonce ${BigInt(nonce)}`) : F(`block ${BigInt(block0)} -> ${BigInt(block1)}, nonce ${BigInt(nonce)}`, 'logic');
        }, '[devnet]');
        limits.push({ id: 'devnet-does-not-settle', observed: true, evidence: 'the arena devnet is a bare Hardhat node with no contracts, so no EIP-3009 token exists on it', meaning: 'the gate step proves refusal, ordering, signing and chain-binding; it does not settle a transfer on chain 31337' });
      }
    }
    await check(st, 'egress during this step: loopback only, no Base Sepolia contact', async () => {
      const hosts = [...egress]; const bad = hosts.filter((h) => !['127.0.0.1', 'localhost'].includes(h));
      return bad.length ? F(`contacted ${bad.join(', ')}`, 'logic') : P(hosts.length ? `hosts: ${hosts.join(', ')}` : 'no fetch at all', { hosts });
    }, '[pack]');
  } finally {
    stopDev();
    globalThis.fetch = realFetch;
    if (hadOwn) E.Wallet.prototype.signTypedData = origSign; else delete E.Wallet.prototype.signTypedData;
  }
  st.verdict = roll(st.checks);
}
async function rpc2(url, method, params) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(8000) }); return (await r.json()).result; }

// ---- reports -------------------------------------------------------------------------------------------------------
function gitInfo() {
  const g = (a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }).stdout?.trim();
  return { sha: g(['rev-parse', 'HEAD']) || null, branch: g(['rev-parse', '--abbrev-ref', 'HEAD']) || null, dirty: !!g(['status', '--porcelain', '--', 'dist', 'src', 'package.json']) };
}
function renderMd(res) {
  const L = [];
  L.push(`<!-- doc-version: historical (a dated record of what one run measured; it names versions as measured, not as current) -->`, '');
  L.push(`# Proof pack ${res.started_at.slice(0, 10)}: ${res.verdict}`, '');
  L.push(`One command: \`npm run proof-pack\`. Each check is PASS, FAIL or NOT_CHECKED. NOT_CHECKED is never a pass, and a step that failed because the network, a quota or a provider failed says so (\`cause\`).`, '');
  L.push(`**Ruler:** pack \`${res.pack_script_sha256.slice(0, 12)}\` (this file), claims \`${res.pack_ruler_sha256.slice(0, 12)}\`. Packed \`${res.tools.packed?.name}@${res.tools.packed?.version}\` (tarball \`${res.tools.packed?.tarball_sha256?.slice(0, 12)}\`) from commit \`${(res.git.sha || '').slice(0, 10)}\`; npm \`latest\` was \`${res.tools.published?.version ?? 'NOT_CHECKED'}\`. Node ${res.tools.node}, npm ${res.tools.npm}, ethers ${res.tools.ethers ?? 'n/a'}. Started ${res.started_at}, took ${Math.round(res.duration_ms / 1000)} s.`, '');
  L.push(`**Counts:** ${res.summary.pass} PASS · ${res.summary.fail} FAIL · ${res.summary.not_checked} NOT_CHECKED, of ${res.summary.checks} checks.`, '');
  L.push('| Step | Verdict | s | What it ran |', '|---|---|---|---|');
  for (const s of res.steps) L.push(`| ${s.id} | **${s.verdict}** | ${(s.ms / 1000).toFixed(1)} | ${s.label}<br>${s.source} |`);
  L.push('');
  for (const s of res.steps) {
    L.push(`## ${s.id}. ${s.label}`, '');
    for (const c of s.checks) L.push(`- **${c.verdict}** ${c.label} (${c.ms} ms)${c.detail ? ': ' + String(c.detail).replace(/\|/g, '\\|') : ''}${c.cause ? ` \`[${c.cause}]\`` : ''}`);
    L.push('');
  }
  L.push('## What this pack observed about itself (limits, not verdicts)', '');
  for (const l of res.limits) L.push(`- **${l.id}** (${l.observed ? 'observed' : 'not observed'}): ${l.evidence}. ${l.meaning}${l.not_searched ? ` NOT searched: ${l.not_searched}.` : ''}`);
  L.push('', '## What a pass here does not prove', '',
    '- A PASS on step 1b is two hosted model checkers agreeing on one sentence. It is a second opinion, not a proof.',
    '- Step 2 shows a record has not changed since it was made. It is unsigned: it does not show who made it, and `inspect` has no trusted anchor.',
    '- Step 4 reads two contracts on a test network. It does not show any agent holds a token or that its reputation is earned.',
    '- Step 5 shows the gate refuses and orders its steps. Nothing was settled on chain, a caller can omit the gate, and the header is the flat EIP-3009 envelope the TrustShell escrow endpoint reads, not the x402 v2 payload: it shows no interoperability with an x402 facilitator.',
    '', `Reproduce: \`npm run proof-pack\` from a clone of DealAppSeo/trustshell, Node >= 22. Exit 0 all PASS, 1 any FAIL, 2 some NOT_CHECKED, 3 setup error.`);
  return L.join('\n') + '\n';
}

// ---- main ----------------------------------------------------------------------------------------------------------
// Imported (by the controls test) the file only offers its pure functions; run as a script it runs the pack.
if (path.resolve(process.argv[1] || '').toLowerCase() === SELF.toLowerCase()) {
// One pack at a time: two at once fought over the npm cache and the loaded laptop's memory.
const LOCK = path.join(os.tmpdir(), 'proof-pack.lock');
try { const pid = Number(fs.readFileSync(LOCK, 'utf8')); if (pid && pid !== process.pid) { process.kill(pid, 0); err(`another proof pack is running (pid ${pid}); not starting a second`); process.exit(3); } } catch (e) { if (e?.code !== 'ESRCH' && e?.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
fs.writeFileSync(LOCK, String(process.pid));
process.on('exit', () => { try { if (fs.readFileSync(LOCK, 'utf8') === String(process.pid)) fs.unlinkSync(LOCK); } catch { /* gone */ } });
const t0 = Date.now();
const startedAt = new Date().toISOString();
err(`proof pack ${startedAt} · node ${process.version} · ${ROOT}`);
let fatal = null;
try {
  await setup();
  for (const [name, fn, skipKey] of [['1a', step1a, null], ['1b', step1b, 'hosted'], ['2-3', step23, null], ['4', step4, 'erc8004'], ['5', step5, 'gate']]) {
    if (skipKey && SKIP.has(skipKey)) { const st = mkStep(name, `skipped by --skip ${skipKey}`, ''); notRun(st, name, `skipped by --skip ${skipKey}`, 'skipped'); st.verdict = 'NOT_CHECKED'; continue; }
    err(`step ${name}`);
    try { await fn(); } catch (e) { fatal = e; const st = steps[steps.length - 1]; st.checks.push({ label: `step ${name} crashed`, verdict: 'FAIL', cause: 'pack-bug', ms: 0, detail: String(e?.stack || e).split('\n').slice(0, 3).join(' | ') }); st.verdict = 'FAIL'; }
  }
} catch (e) { fatal = e; err(`setup crashed: ${e?.stack || e}`); }
for (const s of steps) s.ms = s.checks.reduce((a, c) => a + c.ms, 0); // a step's time is the sum of its checks'
const all = steps.flatMap((s) => s.checks);
const summary = { checks: all.length, pass: all.filter((c) => c.verdict === 'PASS').length, fail: all.filter((c) => c.verdict === 'FAIL').length, not_checked: all.filter((c) => c.verdict === 'NOT_CHECKED').length };
const verdict = fatal && !all.length ? 'ERROR' : summary.fail ? 'FAIL' : summary.not_checked ? 'NOT_CHECKED' : 'PASS';
const res = { schema: 'dev.trustshell.proof-pack/0.1', started_at: startedAt, ended_at: new Date().toISOString(), duration_ms: Date.now() - t0, verdict, summary, git: gitInfo(), tools, pack_script_sha256: SELF_SHA, pack_ruler_sha256: RULER_SHA, ruler: RULER, steps, limits };
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, `${STEM}.json`), JSON.stringify(res, null, 2) + '\n');
fs.writeFileSync(path.join(OUT_DIR, `${STEM}.md`), renderMd(res));
if (opt('--runs-log')) {
  fs.mkdirSync(path.dirname(opt('--runs-log')), { recursive: true });
  fs.appendFileSync(opt('--runs-log'), JSON.stringify({ ts: startedAt, verdict, summary, duration_ms: res.duration_ms, git_sha: res.git.sha, pack_script_sha256: SELF_SHA, pack_ruler_sha256: RULER_SHA, packed: tools.packed?.version, published: tools.published?.version, steps: steps.map((s) => ({ id: s.id, verdict: s.verdict, ms: s.ms })), checks: all.map((c) => ({ label: c.label, verdict: c.verdict, ms: c.ms, ...(c.cause ? { cause: c.cause } : {}) })) }) + '\n');
}
if (!has('--keep') && S.tmp) { try { fs.rmSync(S.tmp, { recursive: true, force: true }); } catch { /* temp is the OS's to clean */ } }
console.log(`${verdict}: ${summary.pass} PASS, ${summary.fail} FAIL, ${summary.not_checked} NOT_CHECKED of ${summary.checks} checks in ${Math.round(res.duration_ms / 1000)} s -> ${path.join(OUT_DIR, STEM)}.{json,md}`);
process.exit(verdict === 'ERROR' ? 3 : summary.fail ? 1 : summary.not_checked ? 2 : 0);
}
