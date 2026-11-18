'use strict';
/**
 * Portable Toolbelt v1, PROOF ONLY: the harness side of a belt (toolbelts/<name>/: SKILL.md + toolbelt.json).
 * scripts/toolbelt-proof.mjs and tests/toolbelt-inspect-run.test.ts both use it. Nothing here ships in the package.
 *
 * NO NEW GRANT FORMAT. The grant is the Guard owner policy (`trustshell guard`), carried by the Carry bundle
 * (`trustshell bundle`), decided per call by the CLI gate and by trustshell-mcp. This file only:
 *   - reads a belt and checks every file against the sha256 its manifest lists (and lists nothing else)
 *   - checks, at attach, that the owner-signed bundle names THIS belt version and that the grant in force in the
 *     runtime's home is exactly the manifest's permissions, unexpired and owner-signed
 *   - compares a known-answer result with what the manifest expects, digest recomputed
 *   - builds and verifies a runtime passport and a receipt that bind the belt version and file hashes
 * Every TrustShell function it calls is the published package's own (dist/), so one JCS, one key format, one
 * policy reader. TOOLBELT_DIST points it at another build (an installed package, or the mutation runner's copy).
 *
 * WHAT A PASSING ATTACH DOES NOT PROVE: that the runtime will obey the belt. The guard decides each call; this
 * check only refuses to start a runtime whose belt or grant is not the one the owner signed.
 */
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DEFAULT_DIST = process.env.TOOLBELT_DIST || path.join(ROOT, 'dist');
const EGRESS = path.join(__dirname, 'toolbelt-egress.cjs');
const MANIFEST = 'toolbelt.json';
const BELT_SCHEMA = 'trustshell.toolbelt/0-proof';
const PASSPORT_SCHEMA = 'trustshell.toolbelt-passport/0-proof';
const RECEIPT_SCHEMA = 'trustshell.toolbelt-receipt/0-proof';

/** The synthetic notes the owner holds in the proof. Only the first is the belt's; the second must never travel. */
const FIXTURE_NOTES = {
  belt: 'inspect-run known answer: run 42502305639 of DealAppSeo/trustshell (commit f569e43ec807) concluded failure, so the claim that it succeeded comes back CONTRADICTED with exit 1.',
  private: 'owner private: dentist on Tuesday',
};

const NOT_PROVEN = [
  'Same controller: the owner, both runtimes and this harness ran as one OS user on one machine; every key was readable by all of them.',
  'The passport is measured by the harness from files it can read; nothing outside this machine observed the runtime.',
  'The guard decides only calls that go through trustshell or trustshell-mcp; the belt files do not restrain anything else the runtime does.',
];

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/** The published package's own modules, from one dist/ tree. */
function lib(dist = DEFAULT_DIST) {
  const r = (p) => require(path.join(dist, p));
  return {
    dist,
    jcs: r('lib/jcs.js'),
    key: r('lib/install-key.js'),
    guard: r('lib/guardrails.js'),
    bundle: r('lib/bundle.js'),
    version: r('lib/version.js'),
    store: r('memory/local-store.js'),
    passport: r('sandbox/passport.js'),
    cliGuard: r('cli/guard.js'),
  };
}

// ---------------------------------------------------------------------------------------------------- discovery

/**
 * SKILL.md frontmatter. ponytail: single-line `key: value` scalars only (all the Agent Skills spec requires);
 * a nested `metadata:` map is refused, not misread. A real loader needs a YAML parser.
 */
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!m) return { error: 'SKILL.md does not open with YAML frontmatter between --- lines' };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z][a-z-]*): (\S.*)$/.exec(line);
    if (!kv) return { error: `frontmatter line is not a one-line "key: value": ${JSON.stringify(line.slice(0, 60))}` };
    fields[kv[1]] = kv[2].trim();
  }
  return { fields, bytes: Buffer.byteLength(m[0], 'utf8'), body: text.slice(m[0].length) };
}

/** The Agent Skills frontmatter rules (agentskills.io/specification, read 2026-11-09). */
function specProblems(fields, dirName) {
  const p = [];
  const KNOWN = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];
  for (const k of Object.keys(fields)) if (!KNOWN.includes(k)) p.push(`frontmatter field ${k} is not in the Agent Skills spec`);
  const n = fields.name ?? '';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n) || n.length > 64) p.push(`name ${JSON.stringify(n)}: 1-64 of a-z, 0-9 and single hyphens, not at either end`);
  if (n !== dirName) p.push(`name ${JSON.stringify(n)} does not match its directory ${JSON.stringify(dirName)}`);
  const d = fields.description ?? '';
  if (d.length < 1 || d.length > 1024) p.push(`description is ${d.length} characters; it must be 1-1024`);
  if (fields.compatibility !== undefined && fields.compatibility.length > 500) p.push('compatibility is over 500 characters');
  return p;
}

/**
 * What an agent runtime sees before it activates a belt: each belt's name and description (the frontmatter),
 * plus the manifest's version and permissions for the harness. The SKILL.md body is not handed over here.
 */
function discover(beltsRoot) {
  const out = [];
  for (const d of fs.readdirSync(beltsRoot, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const skill = path.join(beltsRoot, d.name, 'SKILL.md');
    if (!fs.existsSync(skill)) continue;
    const fm = frontmatter(fs.readFileSync(skill, 'utf8'));
    let m = null;
    try {
      m = JSON.parse(fs.readFileSync(path.join(beltsRoot, d.name, MANIFEST), 'utf8'));
    } catch {
      /* listed with its problem below */
    }
    const problems = fm.error ? [fm.error] : specProblems(fm.fields, d.name);
    if (!m) problems.push(`${MANIFEST} is missing or not JSON`);
    out.push({
      dir: d.name,
      name: fm.fields?.name ?? null,
      description: fm.fields?.description ?? null,
      version: m?.version ?? null,
      permissions: m?.permissions ?? null,
      metadata_bytes: fm.bytes ?? null,
      skill_bytes: fs.statSync(skill).size,
      problems,
    });
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------- belt

/** Read a belt and check each file against its manifest. Unlisted files are refused: nothing rides along. */
function readBelt(dir) {
  const problems = [];
  let raw;
  let m;
  try {
    raw = fs.readFileSync(path.join(dir, MANIFEST));
    m = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return { problems: [`${MANIFEST} is missing or not JSON (${e.message})`], manifest: null, manifest_sha256: null };
  }
  if (m.schema !== BELT_SCHEMA) problems.push(`schema is ${JSON.stringify(m.schema)}, not ${BELT_SCHEMA}`);
  if (!/^\d+\.\d+\.\d+$/.test(String(m.version))) problems.push('version is not x.y.z');
  const files = m.files && typeof m.files === 'object' ? m.files : {};
  if (!('SKILL.md' in files)) problems.push('the manifest does not list SKILL.md');
  for (const [name, want] of Object.entries(files)) {
    if (name.includes('/') || name.includes('\\') || name === MANIFEST) {
      problems.push(`file entry ${JSON.stringify(name)} must be a plain name in the belt folder`);
      continue;
    }
    const f = path.join(dir, name);
    if (!fs.existsSync(f)) problems.push(`${name} is listed and missing`);
    else if (sha256(fs.readFileSync(f)) !== want) problems.push(`${name} does not match the sha256 its manifest lists: it was changed`);
  }
  for (const name of fs.readdirSync(dir)) if (name !== MANIFEST && !(name in files)) problems.push(`${name} is in the belt folder and not in its manifest`);
  const skill = path.join(dir, 'SKILL.md');
  if (fs.existsSync(skill)) {
    const fm = frontmatter(fs.readFileSync(skill, 'utf8'));
    if (fm.error) problems.push(fm.error);
    else {
      problems.push(...specProblems(fm.fields, path.basename(dir)));
      if (fm.fields.name !== m.name) problems.push(`SKILL.md is named ${fm.fields.name}, the manifest ${m.name}`);
    }
  }
  const perms = Array.isArray(m.permissions) ? m.permissions : [];
  // Task-scoped: one named tool per entry. A bare `tool`, `spend` or `post` would grant a whole class.
  if (!perms.length || !perms.every((x) => /^tool:[a-z0-9_.-]{1,128}$/.test(x))) problems.push('permissions must be a non-empty list of tool:<name>');
  if (!Array.isArray(m.network) || !m.network.every((h) => /^[a-z0-9.-]+$/.test(h))) problems.push('network must be a list of host names');
  if (!Array.isArray(m.memory) || !m.memory.every((x) => x && typeof x.ref === 'string' && /^[0-9a-f]{64}$/.test(String(x.sha256)))) {
    problems.push('memory must be a list of { ref, sha256 }');
  }
  return { manifest: m, manifest_sha256: sha256(raw), problems };
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/**
 * Before a runtime serves the belt. `signer` is the owner key's fingerprint, which must reach the runtime by a
 * channel the operator trusts (the bundle naming its own author proves nothing).
 */
function attach({ L = lib(), beltDir, home, bundleText, signer, nowS = Math.floor(Date.now() / 1000) }) {
  const problems = [];
  const belt = readBelt(beltDir);
  problems.push(...belt.problems);
  let carried = null;
  try {
    carried = L.bundle.verifyBundle(bundleText, { ownFingerprint: null, signer }).bundle;
  } catch (e) {
    problems.push(`bundle: ${e.message}`);
  }
  if (carried && belt.manifest) {
    const pl = carried.payload;
    const want = { [MANIFEST]: belt.manifest_sha256, ...belt.manifest.files };
    for (const [name, sha] of Object.entries(want)) {
      if (!pl.evidence.some((e) => e.kind === 'file' && e.name === name && e.sha256 === sha)) {
        problems.push(`the owner-signed bundle does not name ${name} at sha256 ${String(sha).slice(0, 12)}…: this copy is not the version the owner granted`);
      }
    }
    for (const e of pl.evidence) if (e.kind === 'file' && !(e.name in want)) problems.push(`the bundle points at ${e.name}, which is not part of this belt`);
    if (pl.profile !== null) problems.push('the bundle carries a profile: the belt asks for none, so it is more than the task needs');
    const refs = belt.manifest.memory.map((x) => x.sha256);
    if (!sameSet(pl.memories.map((x) => sha256(Buffer.from(x.text, 'utf8'))), refs)) problems.push('the bundle carries notes other than the ones the manifest references');
    if (!pl.policy || !L.guard.policySignedBy(pl.policy.document, [signer])) problems.push('the bundle carries no grant signed by the owner key');
    else if (!sameSet(pl.policy.document.policy.actions, belt.manifest.permissions)) problems.push('the carried grant is not exactly the manifest permissions');
  }
  const loaded = L.guard.loadPolicy(home);
  if (loaded.state !== 'ok') problems.push(`no grant in force in ${home} (${loaded.state})`);
  else if (belt.manifest) {
    const acts = loaded.doc.policy.actions;
    const outside = acts.filter((a) => !belt.manifest.permissions.includes(a));
    if (outside.length) problems.push(`the grant in force allows ${outside.join(', ')}, outside the manifest`);
    const missing = belt.manifest.permissions.filter((a) => !acts.includes(a));
    if (missing.length) problems.push(`the grant in force does not allow ${missing.join(', ')}`);
    if (nowS >= loaded.doc.policy.expires_at) problems.push(`the grant expired at ${new Date(loaded.doc.policy.expires_at * 1000).toISOString()}`);
    if (!L.guard.policySignedBy(loaded.doc, [signer])) problems.push('the grant in force is not signed by the owner key');
    if (carried?.payload.policy && loaded.sha256 !== carried.payload.policy.sha256) problems.push('the grant in force is not the one the bundle carried');
  }
  return { ok: problems.length === 0, problems, belt, carried, policy: loaded };
}

/** The env a belt runtime serves under: the OS basics, its own home, and the belt's fail-closed switch. */
function hostEnv(home, extra = {}) {
  const BASICS = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => BASICS.has(k.toUpperCase())));
  if (process.env.TOOLBELT_NODE_PATH) env.NODE_PATH = process.env.TOOLBELT_NODE_PATH;
  return { ...env, HOME: path.dirname(home), USERPROFILE: path.dirname(home), TRUSTSHELL_HOME: home, NODE_NO_WARNINGS: '1', ...extra };
}
function runtimeEnv(home, manifest, extra = {}) {
  // An absent policy otherwise ALLOWS (C9 warn-and-allow), so a runtime with no grant of its own would run the belt.
  return hostEnv(home, { ...(manifest.grant?.require_policy ? { TRUSTSHELL_REQUIRE_POLICY: '1' } : {}), ...extra });
}

// --------------------------------------------------------------------------------------------------- the owner

/** `guard expire` + `guard sign`, in seconds: the CLI's shortest grant is one day. Recorded as a policy change. */
function setExpiry(L, home, expiresAtS, via) {
  const loaded = L.guard.loadPolicy(home);
  if (loaded.state !== 'ok') throw new Error(`no policy to shorten in ${home}`);
  const policy = { ...loaded.doc.policy, expires_at: expiresAtS, nonce: (BigInt(loaded.doc.policy.nonce) + BigInt(1)).toString() };
  const k = L.key.signingKey(home);
  const doc = { policy, signature: { ...k.signer, signature: L.key.signValue(policy, k.key) } };
  fs.writeFileSync(path.join(home, L.guard.POLICY_FILE), L.guard.renderPolicyDocument(doc), { mode: 0o600 });
  L.cliGuard.recordPolicyChange(home, via, loaded.sha256, doc);
  return doc;
}

/**
 * The owner issues the belt's grant and carries it. CLI where the CLI can: notes, `guard init/kill/allow`.
 * `bundle export` itself is gated by the policy it exports, so with only tool:check allowed it is DENIED (exit 5,
 * kept as `cli_export`); the bundle is then built by buildBundle, the function `bundle export` calls, from the same
 * inputs: the policy in force, the selected notes, file pointers and the guard-ledger head.
 */
function issueGrant({ L = lib(), cli, home, beltDir, bundleFile, expiresInS, narrow = true }) {
  const belt = readBelt(beltDir);
  if (belt.problems.length) throw new Error(`the belt does not verify: ${belt.problems.join('; ')}`);
  const m = belt.manifest;
  const must = (r, code) => {
    if (r.code !== code) throw new Error(`trustshell ${r.argv.join(' ')}: exit ${r.code}, expected ${code}\n${r.out}${r.err}`);
    return r;
  };
  must(cli('remember', '--trusted', FIXTURE_NOTES.belt), 0);
  must(cli('remember', '--trusted', FIXTURE_NOTES.private), 0);
  must(cli('guard', 'init', '--days', '1'), 0);
  // The narrowing step: `guard init` allows every local command; the belt's grant is the manifest and nothing else.
  if (narrow) must(cli('guard', 'kill'), 0);
  for (const p of m.permissions) must(cli('guard', 'allow', p), 0);
  const doc = setExpiry(L, home, Math.floor(Date.now() / 1000) + expiresInS, `toolbelt-proof: grant for ${m.name}@${m.version}, expires in ${expiresInS} s`);
  const cliExport = cli('bundle', 'export', bundleFile, '--evidence', path.join(beltDir, MANIFEST), '--evidence', path.join(beltDir, 'SKILL.md'));
  const refs = new Set(m.memory.map((x) => x.sha256));
  const notes = L.store.selectableNotes(L.store.memoryDbPath({}, path.dirname(home))).notes;
  const memories = notes.filter((n) => refs.has(sha256(Buffer.from(n.body, 'utf8')))).map((n) => ({ text: n.body, created_at: n.created_at }));
  const evidence = [MANIFEST, ...Object.keys(m.files)].map((name) => ({ kind: 'file', name, sha256: sha256(fs.readFileSync(path.join(beltDir, name))) }));
  const ledger = path.join(home, L.guard.GUARD_RECEIPTS_FILE);
  const l = L.guard.readLedger(fs.readFileSync(ledger, 'utf8'));
  if (l.verdict === 'INTACT' && l.last) evidence.push({ kind: 'guard-ledger-head', name: L.guard.GUARD_RECEIPTS_FILE, sha256: l.last.hash });
  const loaded = L.guard.loadPolicy(home);
  const k = L.key.signingKey(home);
  const bundle = L.bundle.buildBundle(
    { profile: null, policy: { sha256: loaded.sha256, nonce: loaded.doc.policy.nonce, document: loaded.doc }, memories, evidence },
    k.key,
    k.signer,
    L.version.resolvePackageVersion(path.join(L.dist, 'cli')),
  );
  fs.writeFileSync(bundleFile, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 });
  return { fingerprint: k.signer.fingerprint, policy: doc.policy, policy_sha256: loaded.sha256, bundle, cli_export: cliExport, notes_held: notes.length, notes_carried: memories.length };
}

// ------------------------------------------------------------------------------------------------ the runtimes

function cliRunner(cliJs, { env, cwd, nodeArgs = [] }) {
  return (...a) => {
    const t = Date.now();
    const r = spawnSync(process.execPath, [...nodeArgs, cliJs, ...a], { cwd, env, encoding: 'utf8', input: '', timeout: 180000, windowsHide: true });
    return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '', argv: a, ms: Date.now() - t };
  };
}

/** One trustshell-mcp process over stdio, newline-delimited JSON-RPC. `ready_ms` is spawn to initialize result. */
function mcpSession(serverJs, { env, cwd, nodeArgs = [] }) {
  const t0 = Date.now();
  const c = spawn(process.execPath, [...nodeArgs, serverJs], { cwd, env, windowsHide: true });
  let buf = '';
  let stderr = '';
  let next = 1;
  const waiting = new Map();
  const fail = (why) => {
    for (const [, w] of waiting) w.reject(new Error(why));
    waiting.clear();
  };
  c.on('error', (e) => fail(`trustshell-mcp did not start: ${e.message}`));
  c.on('exit', (code) => fail(`trustshell-mcp exited ${code}: ${stderr.slice(-500)}`));
  c.stderr.on('data', (d) => (stderr += d));
  c.stdout.on('data', (d) => {
    buf += d;
    for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const w = waiting.get(msg.id);
      if (w) {
        waiting.delete(msg.id);
        w.resolve(msg);
      }
    }
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = next++;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`trustshell-mcp: no answer to ${method} in 120 s`));
      }, 120000);
      waiting.set(id, { resolve: (m) => (clearTimeout(timer), resolve(m)), reject: (e) => (clearTimeout(timer), reject(e)) });
      c.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  const s = {
    stderr: () => stderr,
    ready: (async () => {
      const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'toolbelt-proof', version: '1' } });
      c.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      const tools = await request('tools/list', {});
      return { ready_ms: Date.now() - t0, server: init.result?.serverInfo ?? null, tools: (tools.result?.tools ?? []).map((t) => t.name) };
    })(),
    async call(name, args) {
      await s.ready;
      const t = Date.now();
      const m = await request('tools/call', { name, arguments: args });
      const text = String(m.result?.content?.[0]?.text ?? m.error?.message ?? '');
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* a refusal is plain text */
      }
      return { isError: m.result?.isError === true || !!m.error, text, json, ms: Date.now() - t };
    },
    close: () => {
      c.removeAllListeners('exit');
      c.kill();
    },
  };
  return s;
}

/** The last guard record in `home` for `action`, decided at `origin` ('Cli' or 'Mcp'). */
function lastRecord(L, home, { action, origin, decision }) {
  const f = path.join(home, L.guard.GUARD_RECEIPTS_FILE);
  const rows = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return rows.filter((r) => r.kind === 'decision' && r.requested.action === action && r.origin === origin && (!decision || r.authorized.decision === decision)).pop() ?? null;
}

// ------------------------------------------------------------------------------------------------ known answer

/** Every way `got` ({exit_code, record, digest}) differs from the belt's known answer. Empty: it is the answer. */
function knownAnswerProblems(ka, got, L = lib()) {
  const p = [];
  if (got.exit_code !== ka.expect.exit_code) p.push(`exit ${got.exit_code}, expected ${ka.expect.exit_code}`);
  if (!got.record || !got.digest) return [...p, 'no record and digest came back'];
  if (got.digest.algorithm !== 'sha-256' || got.digest.canonicalization !== 'RFC 8785') p.push('the digest is not sha-256 over RFC 8785');
  const again = L.jcs.jcsSha256(got.record);
  if (again !== got.digest.value) p.push(`the digest ${got.digest.value} does not recompute from the record (${again})`);
  const o = got.record.observation ?? {};
  if (o.url !== ka.run_url) p.push(`the record observed ${o.url}, not ${ka.run_url}`);
  for (const [k, v] of Object.entries(ka.expect.observation)) if (o[k] !== v) p.push(`observation.${k} is ${JSON.stringify(o[k])}, expected ${JSON.stringify(v)}`);
  const claims = got.record.claims ?? [];
  const seen = Object.fromEntries(claims.map((c) => [c.template, c.status]));
  for (const [t, s] of Object.entries(ka.expect.claims)) if (seen[t] !== s) p.push(`claim ${t} is ${seen[t] ?? 'absent'}, expected ${s}`);
  for (const t of Object.keys(seen)) if (!(t in ka.expect.claims)) p.push(`an unexpected claim ${t} came back`);
  if (claims.some((c) => c.sentence !== ka.claims)) p.push('a claim was read from a different sentence than the one sent');
  return p;
}

/** The same digest, by a second implementation in another language (Python's json, stdlib only). null: no Python. */
function pythonDigest(recordFile) {
  const code =
    'import json,sys,hashlib\n' +
    "d=json.load(open(sys.argv[1],encoding='utf-8'))['record']\n" +
    "s=json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)\n" +
    "print(hashlib.sha256(s.encode('utf-8')).hexdigest())";
  for (const py of ['python3', 'python', 'py']) {
    const r = spawnSync(py, ['-I', '-c', code, recordFile], { encoding: 'utf8', timeout: 60000, windowsHide: true });
    if (r.status === 0 && /^[0-9a-f]{64}\s*$/.test(r.stdout)) return { python: py, value: r.stdout.trim() };
  }
  return null;
}

// --------------------------------------------------------------------------------------- passport and receipt

const field = (value, source) => ({ value, source });

/**
 * The belt's runtime passport, in the TrustMedic passport's `{ value, source }` field shape so its
 * comparePassports can diff two runtimes field by field. Not a TrustMedic passport: that one measures a docker
 * mission (image digest, docker inspect), and a CLI or MCP process has none of those to measure.
 */
function buildPassport({ L = lib(), runtime, entry, trustshellVersion, beltDir, home }) {
  const belt = readBelt(beltDir);
  const p = L.guard.loadPolicy(home);
  const pol = p.state === 'ok' ? p.doc.policy : null;
  const notes = L.store.listNotes(L.store.memoryDbPath({}, path.dirname(home)), {}, { includeQuarantined: true });
  return {
    schema: PASSPORT_SCHEMA,
    runtime: field({ kind: runtime, entry: path.basename(path.dirname(entry)) + '/' + path.basename(entry), entry_sha256: sha256(fs.readFileSync(entry)), trustshell_version: trustshellVersion, node: process.version }, 'harness: the entry file it starts, hashed; trustshell --version'),
    tool_belt: field({ name: belt.manifest?.name ?? null, version: belt.manifest?.version ?? null, manifest_sha256: belt.manifest_sha256, files: belt.manifest?.files ?? null, problems: belt.problems }, 'harness: the runtime copy of the belt, every listed file hashed'),
    grant: field(
      pol ? { policy_sha256: p.sha256, nonce: pol.nonce, actions: pol.actions, expires_at: pol.expires_at, signed_by: L.guard.policySigner(p.doc) } : { state: p.state },
      'harness: the Guard policy.json in the runtime home (loadPolicy)',
    ),
    memory: field({ notes_sha256: notes.map((n) => sha256(Buffer.from(n.body, 'utf8'))).sort(), quarantined: notes.filter((n) => n.quarantined !== false).length }, 'harness: every note in the runtime home memory file, hashed'),
    network: field({ declared: belt.manifest?.network ?? null }, 'toolbelt.json: declared; TrustShell itself does not enforce it'),
    attestation: field({ key_fingerprint: L.key.signingKey(home).signer.fingerprint }, 'the runtime home install key'),
    not_proven: NOT_PROVEN.join(' '),
  };
}

function seal(L, value, home) {
  const k = L.key.signingKey(home);
  return { body: value, sha256: L.jcs.jcsSha256(value), signer: k.signer, signature: L.key.signValue(value, k.key) };
}

function sealProblems(L, s, schema) {
  const e = [];
  try {
    if (s.body.schema !== schema) e.push(`schema ${s.body.schema}, expected ${schema}`);
    if (L.jcs.jcsSha256(s.body) !== s.sha256) e.push('sha256 does not match the body');
    if (!L.key.verifyValue(s.body, s.signer, s.signature)) e.push('the signature does not verify over the body');
  } catch (x) {
    e.push(`malformed (${x.message})`);
  }
  return e;
}

/** A receipt for one belt call: the belt version and file hashes, the guard decision, the evidence digest. */
function buildReceipt({ runtime, surface, passport, guardRecord, call, got }) {
  const b = passport.body.tool_belt.value;
  return {
    schema: RECEIPT_SCHEMA,
    created_at: new Date().toISOString(),
    runtime,
    surface,
    tool_belt: { name: b.name, version: b.version, manifest_sha256: b.manifest_sha256, files: b.files },
    authorization: guardRecord && {
      guard_record_seq: guardRecord.seq,
      guard_record_hash: guardRecord.hash,
      origin: guardRecord.origin,
      action: guardRecord.requested.action,
      decision: guardRecord.authorized.decision,
      policy_sha256: guardRecord.authorized.policy_sha256,
      policy_nonce: guardRecord.authorized.policy_nonce,
      policy_signed_by: guardRecord.authorized.policy_signed_by,
    },
    call: { run_url: call.run_url, claims_sha256: sha256(Buffer.from(call.claims, 'utf8')), exit_code: got.exit_code },
    evidence: got.record && { schema: got.record.schema, digest: got.digest.value, statuses: Object.fromEntries(got.record.claims.map((c) => [c.template, c.status])) },
    passport_sha256: passport.sha256,
    not_proven: NOT_PROVEN,
  };
}

/** Everything a stranger can re-check about a receipt from the files beside it. */
function receiptProblems(L, sealed, { beltDir, ledgerText, record, passport }) {
  const e = sealProblems(L, sealed, RECEIPT_SCHEMA);
  const r = sealed.body;
  if (beltDir) {
    const b = readBelt(beltDir);
    if (b.problems.length) e.push(...b.problems.map((x) => `belt: ${x}`));
    if (r.tool_belt.version !== b.manifest?.version || r.tool_belt.manifest_sha256 !== b.manifest_sha256) e.push('the receipt names another belt version than the one beside it');
  }
  if (ledgerText !== undefined) {
    const l = L.guard.readLedger(ledgerText);
    if (l.verdict !== 'INTACT') e.push(`the guard ledger is ${l.verdict}`);
    const rows = ledgerText.split('\n').filter(Boolean).map((x) => JSON.parse(x));
    const hit = rows.find((x) => x.seq === r.authorization?.guard_record_seq && x.hash === r.authorization?.guard_record_hash);
    if (!hit || hit.authorized.decision !== 'ALLOWED' || hit.requested.action !== 'tool:check') e.push('the ledger holds no ALLOWED tool:check record with that seq and hash');
  }
  if (record && L.jcs.jcsSha256(record) !== r.evidence?.digest) e.push('the evidence record does not hash to the receipt digest');
  if (passport) {
    e.push(...sealProblems(L, passport, PASSPORT_SCHEMA).map((x) => `passport: ${x}`));
    if (passport.sha256 !== r.passport_sha256) e.push('the receipt names another passport');
    if (passport.signer.fingerprint !== sealed.signer.fingerprint) e.push('the passport and the receipt were sealed by different keys');
  }
  return e;
}

module.exports = {
  ROOT,
  EGRESS,
  MANIFEST,
  BELT_SCHEMA,
  PASSPORT_SCHEMA,
  RECEIPT_SCHEMA,
  FIXTURE_NOTES,
  NOT_PROVEN,
  sha256,
  lib,
  frontmatter,
  specProblems,
  discover,
  readBelt,
  attach,
  hostEnv,
  runtimeEnv,
  setExpiry,
  issueGrant,
  cliRunner,
  mcpSession,
  lastRecord,
  knownAnswerProblems,
  pythonDigest,
  buildPassport,
  seal,
  sealProblems,
  buildReceipt,
  receiptProblems,
};

// `node scripts/toolbelt-harness.cjs verify <proof-dir>`: re-check a proof run's receipts from its files alone.
if (require.main === module) {
  const [verb, dir] = process.argv.slice(2);
  if (verb !== 'verify' || !dir) {
    console.error('usage: node scripts/toolbelt-harness.cjs verify <proof output dir>');
    process.exit(2);
  }
  const L = lib();
  let bad = 0;
  for (const rt of ['cli', 'mcp']) {
    const at = (f) => path.join(dir, rt, f);
    if (!fs.existsSync(at('receipt.json'))) {
      console.log(`NOT_CHECKED ${rt}: no receipt.json`);
      bad = Math.max(bad, 2);
      continue;
    }
    const belts = fs.readdirSync(at('belts'));
    const e = receiptProblems(L, JSON.parse(fs.readFileSync(at('receipt.json'), 'utf8')), {
      beltDir: belts.length === 1 ? at(path.join('belts', belts[0])) : at('belts'),
      ledgerText: fs.readFileSync(at('guard-receipts.jsonl'), 'utf8'),
      record: JSON.parse(fs.readFileSync(at('record.json'), 'utf8')).record,
      passport: JSON.parse(fs.readFileSync(at('passport.json'), 'utf8')),
    });
    console.log(e.length ? `REFUSED ${rt}: ${e.join('; ')}` : `VERIFIED ${rt}: receipt, passport, belt files, ledger record and evidence digest agree`);
    if (e.length) bad = 1;
  }
  process.exit(bad);
}
