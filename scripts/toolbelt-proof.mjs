#!/usr/bin/env node
/**
 * Portable Toolbelt v1, a PROOF and not a product: one verification belt (toolbelts/inspect-run) moved between two
 * agent runtimes, the trustshell CLI and the trustshell-mcp server, each with its own disposable TRUSTSHELL_HOME.
 *
 *   node scripts/toolbelt-proof.mjs --out <dir> [--scratch <dir>] [--cli <dist/cli/index.js>] [--expire <s>] [--keep]
 *
 * --cli     another build, e.g. an installed @hyperdag/trustshell's dist/cli/index.js (default: this checkout's dist/)
 * --scratch where the disposable homes go (default: the OS temp folder). Removed at the end unless --keep.
 * --out     where the evidence goes: proof.json, transcript.txt, and per runtime the belt copy, record, passport,
 *           receipt and guard ledger. Never a private key: those stay in the scratch homes.
 * --expire  seconds the owner's grant lives (default 90). The proof waits for it to pass.
 *
 * NETWORK: api.github.com only, unauthenticated, from the two runtimes (four requests, measured). Every runtime process
 * loads scripts/toolbelt-egress.cjs, which logs each TCP connect and refuses any host the manifest does not list.
 * No model is called, no key or token is read from your environment (each process gets the OS basics only), and
 * nothing is published or deployed.
 *
 * EXIT 0 every property line held as stated · 1 one did not (printed) · 2 NOT_CHECKED (no CLI, no network).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const H = require('./toolbelt-harness.cjs');

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const KEEP = argv.includes('--keep');
const CLI = path.resolve(opt('cli', path.join(H.ROOT, 'dist', 'cli', 'index.js')));
const DIST = path.dirname(path.dirname(CLI));
const MCP = path.join(DIST, 'mcp', 'index.js');
const OUT = opt('out');
const EXPIRE = Number(opt('expire', '90'));
if (!OUT) {
  console.error('usage: node scripts/toolbelt-proof.mjs --out <dir> [--scratch <dir>] [--cli <path>] [--expire <s>] [--keep]');
  process.exit(2);
}
if (!fs.existsSync(CLI) || !fs.existsSync(MCP)) {
  console.log(`NOT_CHECKED no trustshell CLI and MCP server under ${DIST}`);
  process.exit(2);
}
const L = H.lib(DIST);
fs.mkdirSync(OUT, { recursive: true });
const SCRATCH = fs.mkdtempSync(path.join(path.resolve(opt('scratch', os.tmpdir())), 'proof-'));
const BELT_SRC = path.join(H.ROOT, 'toolbelts', 'inspect-run');
const BUNDLE = path.join(SCRATCH, 'bundle.json');
const NET_LOG = path.join(OUT, 'egress.log');
fs.rmSync(NET_LOG, { force: true });

const lines = [];
const say = (s = '') => {
  lines.push(s);
  console.log(s);
};
const facts = { started_at: new Date().toISOString(), cli: CLI, node: process.version, platform: `${process.platform} ${os.release()}` };
const props = [];
/** One property line. status: PROVEN | SAME-CONTROLLER | NOT_CHECKED | NOT HELD. */
function prop(id, status, text, evidence) {
  props.push({ id, status, text, evidence });
  say(`${status.padEnd(15)} ${id}: ${text}`);
}
const sessions = [];
function finish(code) {
  for (const s of sessions) s.close();
  facts.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, properties: props }, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'transcript.txt'), lines.join('\n') + '\n');
  if (KEEP) console.error(`kept: ${SCRATCH}`);
  else fs.rmSync(SCRATCH, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exit(code);
}
function stop(why, detail = '') {
  say(`NOT HELD  ${why}`);
  if (detail) say(String(detail).trim().replace(/^/gm, '          '));
  finish(1);
}
const must = (r, code, label = `trustshell ${r.argv.join(' ')}`) => (r.code === code ? r : stop(`${label}: exit ${r.code}, expected ${code}`, `${r.out}${r.err}`));
function place(name) {
  const dir = path.join(SCRATCH, name);
  const home = path.join(dir, 'home', '.trustshell');
  const work = path.join(dir, 'work');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(work, { recursive: true });
  return { name, dir, home, work };
}
const filesUnder = (dir) => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => path.relative(dir, path.join(d.parentPath ?? d.path, d.name)).replace(/\\/g, '/')).sort();
const records = (home) => {
  const f = path.join(home, L.guard.GUARD_RECEIPTS_FILE);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
async function rateRemaining() {
  try {
    const r = await fetch('https://api.github.com/rate_limit', { headers: { 'user-agent': 'trustshell-toolbelt-proof' } });
    return (await r.json()).resources.core.remaining;
  } catch {
    return null;
  }
}

const belt = H.readBelt(BELT_SRC);
if (belt.problems.length) stop('the belt in this checkout does not verify', belt.problems.join('\n'));
const m = belt.manifest;
const ka = m.known_answer;
const version = must(H.cliRunner(CLI, { env: H.hostEnv(path.join(SCRATCH, 'v', '.trustshell')), cwd: SCRATCH })('--version'), 0).out.trim();
facts.trustshell_version = version;
facts.belt = { name: m.name, version: m.version, manifest_sha256: belt.manifest_sha256, files: m.files };
facts.github_rate_remaining_before = await rateRemaining();

// The egress instrument must be shown to SEE a connection before an empty refusal list means anything.
const CANARY = path.join(SCRATCH, 'canary.log');
spawnSync(process.execPath, ['--require', H.EGRESS, '-e', "fetch('https://example.com').catch(() => {})"], {
  env: { ...H.hostEnv(path.join(SCRATCH, 'c', '.trustshell')), TOOLBELT_NET_LOG: CANARY, TOOLBELT_NET_ALLOW: m.network.join(',') },
  timeout: 60000,
  windowsHide: true,
});
const canary = fs.existsSync(CANARY) ? fs.readFileSync(CANARY, 'utf8') : '';
facts.egress_canary = canary.trim();
const EGRESS_VARS = { TOOLBELT_NET_LOG: NET_LOG, TOOLBELT_NET_ALLOW: m.network.join(',') };
const PRE = ['--require', H.EGRESS];

say(`TrustShell Portable Toolbelt v1, a proof. Belt ${m.name}@${m.version} (manifest ${belt.manifest_sha256.slice(0, 12)}…), trustshell ${version}`);
say(`build: ${CLI}`);
say();

// 1 DISCOVERY ----------------------------------------------------------------------------------------------------
const found = H.discover(path.join(H.ROOT, 'toolbelts'));
const d = found.find((x) => x.name === m.name);
facts.discovery = found;
say('1  Discovery: what a runtime reads before it activates a belt');
say(`   ${found.length} belt(s) under toolbelts/; ${m.name}: ${d?.metadata_bytes} bytes of frontmatter (name, description, compatibility) of a ${d?.skill_bytes}-byte SKILL.md`);

// 2 THE OWNER ----------------------------------------------------------------------------------------------------
const O = place('owner');
const ownerCli = H.cliRunner(CLI, { env: H.hostEnv(O.home), cwd: O.work });
const g = H.issueGrant({ L, cli: ownerCli, home: O.home, beltDir: BELT_SRC, bundleFile: BUNDLE, expiresInS: EXPIRE });
const fp = g.fingerprint;
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
fs.copyFileSync(BUNDLE, path.join(OUT, 'bundle.json'));
facts.owner = {
  fingerprint: fp,
  policy_sha256: g.policy_sha256,
  actions: g.policy.actions,
  expires_at: new Date(g.policy.expires_at * 1000).toISOString(),
  nonce: g.policy.nonce,
  notes_held: g.notes_held,
  notes_carried: g.notes_carried,
  cli_bundle_export: { exit: g.cli_export.code, said: g.cli_export.err.trim().split('\n').slice(0, 2) },
};
say();
say(`2  The owner issues the grant (guard init, guard kill, guard allow ${m.permissions.join(', ')}, then a ${EXPIRE} s expiry, signed)`);
say(`   policy ${g.policy_sha256.slice(0, 12)}…, nonce ${g.policy.nonce}, actions ${g.policy.actions.join(', ')}, expires ${facts.owner.expires_at}, signed by ${fp.slice(0, 12)}…`);
say(`   ${g.notes_held} notes held, ${g.notes_carried} carried; bundle export through the CLI: exit ${g.cli_export.code} (${facts.owner.cli_bundle_export.said[0] ?? ''})`);

// 3 TWO RUNTIMES -------------------------------------------------------------------------------------------------
async function runtime(name, kind) {
  const t0 = performance.now();
  const R = place(name);
  R.kind = kind;
  R.beltDir = path.join(R.dir, 'belts', m.name);
  fs.cpSync(BELT_SRC, R.beltDir, { recursive: true });
  R.setup = H.cliRunner(CLI, { env: H.hostEnv(R.home), cwd: R.work });
  must(R.setup('bundle', 'verify', BUNDLE, '--signer', fp), 0);
  R.imported = must(R.setup('bundle', 'import', BUNDLE, '--signer', fp), 0).out;
  R.attached = H.attach({ L, beltDir: R.beltDir, home: R.home, bundleText, signer: fp });
  R.env = H.runtimeEnv(R.home, m, EGRESS_VARS);
  R.run = H.cliRunner(CLI, { env: R.env, cwd: R.work, nodeArgs: PRE });
  if (kind === 'mcp') {
    R.session = H.mcpSession(MCP, { env: R.env, cwd: R.work, nodeArgs: PRE });
    sessions.push(R.session);
    R.ready = await R.session.ready;
  }
  R.setup_ms = Math.round(performance.now() - t0);
  R.files_at_ready = filesUnder(R.dir);
  return R;
}
const C = await runtime('cli-runtime', 'cli');
const M = await runtime('mcp-runtime', 'mcp');
say();
say('3  Two runtimes, each its own home: verify the bundle under the owner key, import it, attach the belt');
for (const R of [C, M]) {
  say(`   ${R.kind.padEnd(3)}  import: ${(R.imported.match(/^policy +(.*)$/m) ?? [])[1] ?? '?'}`);
  say(`        attach: ${R.attached.ok ? 'OK' : 'REFUSED ' + R.attached.problems.join('; ')}; ready in ${R.setup_ms} ms${R.ready ? ` (MCP initialize + tools/list ${R.ready.ready_ms} ms, ${R.ready.tools.length} tools)` : ''}`);
}
if (!C.attached.ok || !M.attached.ok) stop('a runtime did not attach', [...C.attached.problems, ...M.attached.problems].join('\n'));

const ownerPem = fs.readFileSync(path.join(O.home, L.key.SIGNING_KEY_FILE), 'utf8');
const pemBody = ownerPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
const holdsOwnerKey = (R) => filesUnder(R.dir).some((f) => fs.readFileSync(path.join(R.dir, f)).toString('latin1').replace(/\s+/g, '').includes(pemBody));
const credNames = (env) => Object.keys(env).filter((k) => /TOKEN|SECRET|KEY|PASSWORD|AUTH/i.test(k));
facts.runtimes = Object.fromEntries(
  [C, M].map((R) => [
    R.kind,
    {
      setup_ms: R.setup_ms,
      mcp_ready: R.ready ?? null,
      files_at_ready: R.files_at_ready,
      env_names: Object.keys(R.env).sort(),
      credential_named_env: credNames(R.env),
      holds_owner_private_key: holdsOwnerKey(R),
      holds_any_key_at_ready: R.files_at_ready.some((f) => f.endsWith('.pem')),
    },
  ]),
);
const noCreds =
  !bundleText.includes('PRIVATE KEY') &&
  [C, M].every((R) => !facts.runtimes[R.kind].holds_owner_private_key && !facts.runtimes[R.kind].holds_any_key_at_ready && credNames(R.env).length === 0);

// 4 SCOPE: only the task's instructions, permissions and memory ------------------------------------------------------
const carried = C.attached.carried;
const context = L.bundle.brainContext(carried.payload);
fs.writeFileSync(path.join(OUT, 'model-context.txt'), context);
const notesIn = (R) => L.store.listNotes(L.store.memoryDbPath({}, path.dirname(R.home)), {}, { includeQuarantined: true });
const scope = {};
for (const R of [C, M]) {
  const notes = notesIn(R);
  const pol = L.guard.loadPolicy(R.home);
  const outside = R.kind === 'cli' ? R.run('remember', 'a note outside the belt') : await R.session.call('remember', { text: 'a note outside the belt' });
  scope[R.kind] = {
    belt_files: fs.readdirSync(R.beltDir).sort(),
    actions: pol.doc.policy.actions,
    notes: notes.map((n) => ({ sha256: H.sha256(Buffer.from(n.body, 'utf8')), quarantined: n.quarantined !== false })),
    out_of_manifest_call: R.kind === 'cli' ? { exit: outside.code, said: outside.err.trim().split('\n')[1] ?? outside.err.trim() } : { isError: outside.isError, said: outside.text.slice(0, 200) },
    out_of_manifest_record: H.lastRecord(L, R.home, { action: 'tool:remember', origin: R.kind === 'cli' ? 'Cli' : 'Mcp', decision: 'DENIED' })?.seq ?? null,
  };
}
const refs = m.memory.map((x) => x.sha256);
const scopeOk =
  carried.payload.profile === null &&
  carried.payload.memories.length === refs.length &&
  carried.payload.evidence.filter((e) => e.kind === 'file').map((e) => e.name).sort().join() === [H.MANIFEST, ...Object.keys(m.files)].sort().join() &&
  context.includes(H.FIXTURE_NOTES.belt) &&
  !context.includes(H.FIXTURE_NOTES.private) &&
  !bundleText.includes(H.FIXTURE_NOTES.private) &&
  Object.values(scope).every(
    (s) =>
      s.belt_files.join() === [...Object.keys(m.files), H.MANIFEST].sort().join() &&
      s.actions.join() === m.permissions.join() &&
      s.notes.length === refs.length &&
      s.notes.every((n) => refs.includes(n.sha256) && n.quarantined) &&
      s.out_of_manifest_record !== null,
  ) &&
  scope.cli.out_of_manifest_call.exit === 5 &&
  scope.mcp.out_of_manifest_call.isError === true;
facts.scope = { bundle_payload: { profile: carried.payload.profile, memories: carried.payload.memories.length, evidence: carried.payload.evidence.map((e) => `${e.kind}:${e.name}`) }, per_runtime: scope };
say();
say('4  What each runtime received');
say(`   bundle: profile ${carried.payload.profile === null ? 'none' : 'YES'}, ${carried.payload.memories.length} note, pointers ${carried.payload.evidence.map((e) => e.name).join(', ')}`);
for (const [k, s] of Object.entries(scope)) {
  say(`   ${k.padEnd(3)}  belt files ${s.belt_files.join(', ')}; grant ${s.actions.join(', ')}; ${s.notes.length} note (quarantined ${s.notes.filter((n) => n.quarantined).length})`);
  say(`        remember (not in the manifest): ${k === 'cli' ? `exit ${s.out_of_manifest_call.exit}` : `isError ${s.out_of_manifest_call.isError}`}, record ${s.out_of_manifest_record} DENIED`);
}

// 5 KNOWN ANSWER --------------------------------------------------------------------------------------------------
const answers = {};
{
  const evDir = path.join(OUT, 'cli', 'evidence');
  const r = C.run('check', ka.run_url, '--claims', ka.claims, '--json', '--out', evDir);
  let got = { exit_code: r.code, record: null, digest: null };
  try {
    got = { exit_code: r.code, ...JSON.parse(r.out) };
  } catch {
    /* no record: knownAnswerProblems says so */
  }
  answers.cli = { got, ms: r.ms, problems: H.knownAnswerProblems(ka, got, L) };
}
{
  const r = await M.session.call('inspect_run', { run_url: ka.run_url, claims: ka.claims });
  const u = r.json?.untrusted_data ?? {};
  const got = { exit_code: u.exit_code ?? null, record: u.record ?? null, digest: u.digest ?? null, status: u.status ?? null };
  const problems = H.knownAnswerProblems(ka, got, L);
  if (r.json?.screening?.ingest !== 'clean') problems.push(`screening withheld part of the record (${JSON.stringify(r.json?.screening)})`);
  if (got.status !== 'contradicted') problems.push(`MCP status ${got.status}, expected contradicted`);
  answers.mcp = { got, ms: r.ms, problems };
}
if (!answers.cli.got.record && !answers.mcp.got.record) {
  say('NOT_CHECKED  neither runtime got a record from GitHub (no network?)');
  finish(2);
}
for (const k of ['cli', 'mcp']) {
  const f = path.join(OUT, k, 'record.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ record: answers[k].got.record, digest: answers[k].got.digest }, null, 2) + '\n');
  answers[k].python = H.pythonDigest(f);
}
const strip = (rec) => {
  const c = JSON.parse(JSON.stringify(rec));
  delete c.observation.fetchedAt;
  return JSON.stringify(c);
};
const example = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'public', 'examples', 'run-failed-record.json'), 'utf8')).record;
const sameObservation = answers.cli.got.record && answers.mcp.got.record && strip(answers.cli.got.record) === strip(answers.mcp.got.record);
const sameAsExample = answers.cli.got.record && strip(answers.cli.got.record) === strip(example);
facts.known_answer = Object.fromEntries(
  Object.entries(answers).map(([k, a]) => [
    k,
    { exit_code: a.got.exit_code, statuses: a.got.record?.claims.map((c) => `${c.template}:${c.status}`), digest: a.got.digest?.value, python_digest: a.python, fetched_at: a.got.record?.observation.fetchedAt, ms: a.ms, problems: a.problems },
  ]),
);
facts.known_answer.records_equal_but_fetchedAt = sameObservation;
facts.known_answer.equal_to_committed_example_but_fetchedAt = sameAsExample;
say();
say(`5  Known answer: "${ka.claims}" against run ${ka.expect.observation.run_id}`);
for (const k of ['cli', 'mcp']) {
  const a = answers[k];
  say(`   ${k.padEnd(3)}  exit ${a.got.exit_code}; ${facts.known_answer[k].statuses?.join(', ')}; digest ${a.got.digest?.value.slice(0, 16)}…, Python ${a.python ? (a.python.value === a.got.digest?.value ? 'agrees' : 'DISAGREES ' + a.python.value) : 'not available'}; ${a.problems.length ? 'PROBLEMS ' + a.problems.join('; ') : 'matches the manifest'}`);
}
say(`   the two records differ only in observation.fetchedAt: ${sameObservation}; and from public/examples/run-failed-record.json only there too: ${sameAsExample}`);

// 6 PASSPORT AND RECEIPT ------------------------------------------------------------------------------------------
const sealed = {};
for (const R of [C, M]) {
  const entry = R.kind === 'cli' ? CLI : MCP;
  const passport = H.seal(L, H.buildPassport({ L, runtime: R.kind, entry, trustshellVersion: version, beltDir: R.beltDir, home: R.home }), R.home);
  const rec = H.lastRecord(L, R.home, { action: 'tool:check', origin: R.kind === 'cli' ? 'Cli' : 'Mcp', decision: 'ALLOWED' });
  const receipt = H.seal(L, H.buildReceipt({ runtime: R.kind, surface: R.kind === 'cli' ? 'trustshell check --claims' : 'trustshell-mcp inspect_run', passport, guardRecord: rec, call: ka, got: answers[R.kind].got }), R.home);
  const dir = path.join(OUT, R.kind);
  fs.cpSync(R.beltDir, path.join(dir, 'belts', m.name), { recursive: true });
  fs.writeFileSync(path.join(dir, 'passport.json'), JSON.stringify(passport, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  fs.copyFileSync(path.join(R.home, L.guard.GUARD_RECEIPTS_FILE), path.join(dir, 'guard-receipts.jsonl'));
  const ledgerText = fs.readFileSync(path.join(dir, 'guard-receipts.jsonl'), 'utf8');
  const ok = H.receiptProblems(L, receipt, { beltDir: path.join(dir, 'belts', m.name), ledgerText, record: answers[R.kind].got.record, passport });
  // Controls: the same checks must refuse a receipt that names another version, and a belt copy with one changed byte.
  const forged = JSON.parse(JSON.stringify(receipt));
  forged.body.tool_belt.version = '1.0.1';
  const changedBelt = path.join(SCRATCH, `${R.kind}-changed`, m.name);
  fs.cpSync(R.beltDir, changedBelt, { recursive: true });
  fs.appendFileSync(path.join(changedBelt, 'SKILL.md'), ' ');
  sealed[R.kind] = {
    passport,
    receipt,
    verify: ok,
    forged_version: H.receiptProblems(L, forged, {}),
    changed_belt: H.receiptProblems(L, receipt, { beltDir: changedBelt }),
  };
}
const cmp = L.passport.comparePassports(sealed.cli.passport.body, sealed.mcp.passport.body);
fs.writeFileSync(path.join(OUT, 'passport-compare.json'), JSON.stringify(cmp, null, 2) + '\n');
const verifyCli = spawnSync(process.execPath, [path.join(H.ROOT, 'scripts', 'toolbelt-harness.cjs'), 'verify', OUT], { encoding: 'utf8', env: { ...process.env, TOOLBELT_DIST: DIST }, windowsHide: true });
facts.receipts = {
  cli: { sha256: sealed.cli.receipt.sha256, signer: sealed.cli.receipt.signer.fingerprint, problems: sealed.cli.verify, forged_version_refused: sealed.cli.forged_version, changed_belt_refused: sealed.cli.changed_belt },
  mcp: { sha256: sealed.mcp.receipt.sha256, signer: sealed.mcp.receipt.signer.fingerprint, problems: sealed.mcp.verify, forged_version_refused: sealed.mcp.forged_version, changed_belt_refused: sealed.mcp.changed_belt },
  passport_compare: cmp.drifts.map((x) => `${x.field}:${x.status}`),
  stranger_verify: { exit: verifyCli.status, out: (verifyCli.stdout ?? '').trim().split('\n') },
};
say();
say('6  Passport and receipt per runtime, sealed by that runtime home\'s own key');
for (const k of ['cli', 'mcp']) {
  const s = sealed[k];
  say(`   ${k.padEnd(3)}  receipt ${s.receipt.sha256.slice(0, 12)}… by ${s.receipt.signer.fingerprint.slice(0, 12)}…: ${s.verify.length ? 'PROBLEMS ' + s.verify.join('; ') : 'verifies'}; version edited: ${s.forged_version.length ? 'refused' : 'NOT REFUSED'}; SKILL.md changed: ${s.changed_belt.length ? 'refused' : 'NOT REFUSED'}`);
}
say(`   passports cli vs mcp: ${cmp.drifts.map((x) => `${x.field} ${x.status}`).join(', ')}`);
say(`   node scripts/toolbelt-harness.cjs verify <out>: exit ${verifyCli.status}`);

// 7 DETACH, EXPIRE, DENY REUSE ------------------------------------------------------------------------------------
const deny = {};
// R3, while the grant is still valid: a COPY of the CLI runtime's policy.json in a home that never imported anything.
{
  const X = place('copied-grant');
  fs.copyFileSync(path.join(C.home, L.guard.POLICY_FILE), path.join(X.home, L.guard.POLICY_FILE));
  const s = H.mcpSession(MCP, { env: H.runtimeEnv(X.home, m, { ...EGRESS_VARS, OFFLINE: '1' }), cwd: X.work, nodeArgs: PRE });
  const r = await s.call('inspect_run', { run_url: ka.run_url, claims: ka.claims });
  s.close();
  deny.copied_grant = { refused: /^DENIED/.test(r.text), said: r.text.slice(0, 160), ledger: records(X.home).map((x) => `${x.seq} ${x.requested.action} ${x.authorized.decision}`) };
}
// Revoke the MCP runtime's grant; the running server reads the policy on every call.
const before = records(M.home).length;
must(M.setup('guard', 'kill'), 0);
const revoked = await M.session.call('inspect_run', { run_url: ka.run_url, claims: ka.claims });
const revokedRec = H.lastRecord(L, M.home, { action: 'tool:check', origin: 'Mcp', decision: 'DENIED' });
deny.revoked = { refused: revoked.isError && /^DENIED/.test(revoked.text), said: revoked.text.slice(0, 200), record: revokedRec && { seq: revokedRec.seq, reasons: revokedRec.authorized.reasons, executed: revokedRec.executed }, attach: H.attach({ L, beltDir: M.beltDir, home: M.home, bundleText, signer: fp }).problems };
// Replay: delete the killed policy, import the ORIGINAL bundle again.
fs.rmSync(path.join(M.home, L.guard.POLICY_FILE));
const replay = M.setup('bundle', 'import', BUNDLE, '--signer', fp);
const n0 = records(M.home).length;
const replayed = await M.session.call('inspect_run', { run_url: ka.run_url, claims: ka.claims });
deny.replay = {
  import_exit: replay.code,
  import_said: replay.err.trim().split('\n')[0],
  policy_in_force: fs.existsSync(path.join(M.home, L.guard.POLICY_FILE)),
  refused: replayed.isError && /^DENIED/.test(replayed.text),
  said: replayed.text.slice(0, 200),
  new_records: records(M.home).length - n0,
};
M.session.close();
// R1: a runtime with no grant of its own, with the belt's switch on, then (the control) with it off and OFFLINE=1.
{
  const N = place('no-grant');
  const s = H.mcpSession(MCP, { env: H.runtimeEnv(N.home, m, EGRESS_VARS), cwd: N.work, nodeArgs: PRE });
  const r = await s.call('inspect_run', { run_url: ka.run_url, claims: ka.claims });
  s.close();
  const c = H.cliRunner(CLI, { env: H.runtimeEnv(N.home, m, EGRESS_VARS), cwd: N.work, nodeArgs: PRE })('check', ka.run_url, '--claims', ka.claims, '--json');
  const off = H.mcpSession(MCP, { env: H.hostEnv(N.home, { ...EGRESS_VARS, OFFLINE: '1' }), cwd: N.work, nodeArgs: PRE });
  const o = await off.call('inspect_run', { run_url: ka.run_url, claims: ka.claims });
  off.close();
  deny.no_grant = {
    mcp: { refused: r.isError && /^DENIED: no policy/.test(r.text), said: r.text.slice(0, 200) },
    cli: { exit: c.code, said: c.err.trim().split('\n')[0] },
    ledger_written: fs.existsSync(path.join(N.home, L.guard.GUARD_RECEIPTS_FILE)),
    control_without_require_policy: { refused: /^DENIED/.test(o.text), said: o.text.slice(0, 160) },
  };
}
// Expiry: wait until the owner's grant has passed, then the CLI runtime asks again.
const waitMs = g.policy.expires_at * 1000 - Date.now() + 2000;
say();
say(`7  Detach, expire, deny reuse (waiting ${Math.max(0, Math.round(waitMs / 1000))} s for the grant to expire)`);
if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
const expired = C.run('check', ka.run_url, '--claims', ka.claims, '--json');
const expiredRec = H.lastRecord(L, C.home, { action: 'tool:check', origin: 'Cli', decision: 'DENIED' });
deny.expired = { exit: expired.code, said: expired.err.trim().split('\n').slice(0, 2), record: expiredRec && { seq: expiredRec.seq, reasons: expiredRec.authorized.reasons, executed: expiredRec.executed }, attach: H.attach({ L, beltDir: C.beltDir, home: C.home, bundleText, signer: fp }).problems };
for (const R of [C, M]) {
  const l = L.guard.readLedger(fs.readFileSync(path.join(R.home, L.guard.GUARD_RECEIPTS_FILE), 'utf8'));
  deny[`${R.kind}_ledger`] = { verdict: l.verdict, count: l.count, records: records(R.home).map((x) => `${x.seq} ${x.origin} ${x.kind} ${x.requested.action} ${x.authorized.decision}`) };
  fs.copyFileSync(path.join(R.home, L.guard.GUARD_RECEIPTS_FILE), path.join(OUT, R.kind, 'guard-receipts.after-detach.jsonl'));
}
facts.detach = deny;
say(`   mcp  guard kill, then inspect_run: ${deny.revoked.refused ? 'DENIED' : 'NOT REFUSED'}, record ${deny.revoked.record?.seq} (${deny.revoked.record?.reasons.join('; ')})`);
say(`   mcp  policy.json deleted, the original bundle imported again: ${deny.replay.policy_in_force ? 'ENFORCED' : 'not enforced'} (${deny.replay.import_said}); inspect_run ${deny.replay.refused ? 'DENIED' : 'NOT REFUSED'}, ${deny.replay.new_records} new record(s)`);
say(`   cli  after ${facts.owner.expires_at}: exit ${deny.expired.exit}, record ${deny.expired.record?.seq} (${deny.expired.record?.reasons.join('; ')})`);
say(`   a runtime with no grant: MCP ${deny.no_grant.mcp.refused ? 'DENIED' : 'NOT REFUSED'}, CLI exit ${deny.no_grant.cli.exit}; ledger written: ${deny.no_grant.ledger_written}; without TRUSTSHELL_REQUIRE_POLICY: ${deny.no_grant.control_without_require_policy.refused ? 'refused' : 'it RAN'}`);
say(`   a copy of the CLI runtime's policy.json in a fresh home: ${deny.copied_grant.refused ? 'refused' : 'it RAN'} (${deny.copied_grant.ledger.join('; ')})`);

// 8 EGRESS ---------------------------------------------------------------------------------------------------------
const net = fs.existsSync(NET_LOG) ? fs.readFileSync(NET_LOG, 'utf8').split('\n').filter(Boolean) : [];
const hosts = [...new Set(net.map((l) => l.split(' ')[2]?.split(':')[0]))];
facts.egress = { connects: net.length, refused: net.filter((l) => / REFUSED$/.test(l)).length, hosts, canary_caught: /example\.com:443 REFUSED/.test(canary) };
facts.github_rate_remaining_after = await rateRemaining();
say();
say(`8  Egress from every runtime process: ${net.length} TCP connect(s) to ${hosts.join(', ') || 'nothing'}, ${facts.egress.refused} refused; canary ${facts.egress.canary_caught ? 'caught' : 'NOT caught'}`);
say(`   GitHub unauthenticated rate limit, remaining before / after: ${facts.github_rate_remaining_before} / ${facts.github_rate_remaining_after}`);

// THE SIX PROPERTIES ------------------------------------------------------------------------------------------------
say();
say('The six properties. Each line is computed from what ran above; the proof exits 1 if one does not hold.');
const held = (ok, status) => (ok ? status : 'NOT HELD');
prop(
  '1 discovered through minimal metadata',
  held(!!d && d.problems.length === 0 && d.version === m.version, 'PROVEN'),
  `toolbelts/${m.name}/SKILL.md frontmatter meets the Agent Skills name and description rules and is ${d?.metadata_bytes} of ${d?.skill_bytes} bytes; the manifest adds version and permissions. A real agent runtime (Claude Code, OpenClaw) discovering it: NOT_CHECKED.`,
  { discovery: d },
);
prop(
  '2 attached to two runtimes without copying persistent credentials',
  held(C.attached.ok && M.attached.ok && noCreds, 'SAME-CONTROLLER'),
  'the CLI and trustshell-mcp each attached from the owner-signed bundle into their own TRUSTSHELL_HOME; neither home holds the owner key or any key at attach, no credential-named variable reached either, and the GitHub reads are unauthenticated. Both runtimes ran as one OS user on one machine.',
  { runtimes: facts.runtimes },
);
prop(
  '3 receives only its task-scoped instructions, permissions and memory',
  held(scopeOk && facts.egress.refused === 0 && hosts.every((h) => m.network.includes(h)) && facts.egress.canary_caught, 'PROVEN'),
  `delivered: two belt files, grant ${m.permissions.join(', ')}, the one referenced note (quarantined), no profile; the private note did not travel; remember was DENIED and recorded on both; every connect went to ${m.network.join(', ')}. What is reachable on a shared machine is a different question: SAME-CONTROLLER.`,
  { scope: facts.scope, egress: facts.egress },
);
const kaOk = answers.cli.problems.length === 0 && answers.mcp.problems.length === 0 && ['cli', 'mcp'].every((k) => answers[k].python?.value === answers[k].got.digest?.value);
prop(
  '4 known-answer test, independently inspectable',
  held(kaOk && sameObservation, 'PROVEN'),
  `both runtimes: CONTRADICTED, exit 1; each digest recomputed by Python's json + hashlib; the records differ only in fetchedAt. Re-run: python -c "import json,hashlib,sys;d=json.load(open(sys.argv[1]))['record'];print(hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest())" record.json`,
  { known_answer: facts.known_answer },
);
const sealOk = ['cli', 'mcp'].every((k) => sealed[k].verify.length === 0 && sealed[k].forged_version.length > 0 && sealed[k].changed_belt.length > 0) && verifyCli.status === 0;
const driftOk = cmp.drifts.filter((x) => x.status !== 'identical').map((x) => x.field).sort().join() === 'attestation,runtime';
prop(
  '5 version-bound receipt and runtime passport',
  held(sealOk && driftOk, 'SAME-CONTROLLER'),
  `belt version, manifest sha256 and SKILL.md sha256 are inside each signed receipt and passport; an edited version and a changed SKILL.md are refused; the two passports differ only in runtime and attestation. Each is signed by its own runtime home's key: self-attested.`,
  { receipts: facts.receipts },
);
const detachOk =
  deny.revoked.refused &&
  deny.revoked.record?.executed === 'not run' &&
  !deny.replay.policy_in_force &&
  deny.replay.refused &&
  deny.expired.exit === 5 &&
  deny.expired.record?.reasons.some((x) => /expired/.test(x)) &&
  deny.no_grant.mcp.refused &&
  deny.no_grant.cli.exit === 5 &&
  !deny.no_grant.control_without_require_policy.refused &&
  deny.cli_ledger.verdict === 'INTACT' &&
  deny.mcp_ledger.verdict === 'INTACT';
prop(
  '6 detach, expire, deny unauthorized reuse',
  held(detachOk, 'SAME-CONTROLLER'),
  `revoked (guard kill): DENIED, record ${deny.revoked.record?.seq}; replayed bundle: not enforced, DENIED; expired: DENIED, record ${deny.expired.record?.seq}; a runtime with no grant: DENIED on both surfaces, only because TRUSTSHELL_REQUIRE_POLICY is set (without it the call ran), and no ledger record exists for it. A copied policy.json was ${deny.copied_grant.refused ? 'refused' : 'NOT refused'}: the grant is a file bound to no runtime.`,
  { detach: deny },
);
const notHeld = props.filter((p) => p.status === 'NOT HELD').length;
say();
say(`RESULT  ${props.length - notHeld} of ${props.length} property lines held as stated`);
finish(notHeld ? 1 : 0);
