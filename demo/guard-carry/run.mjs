#!/usr/bin/env node
/**
 * Guard + Carry, on two hosts: the owner's policy is enforced on Host A, carried in a signed bundle, and enforced
 * again on Host B. Then every limit the story could hide is exercised, not just stated.
 *
 *   node demo/guard-carry/run.mjs                 uses this checkout's dist/cli/index.js
 *   node demo/guard-carry/run.mjs --cli <path>    another build, e.g. an installed package's dist/cli/index.js
 *   node demo/guard-carry/run.mjs --keep          keep the two homes and print where they are
 *
 * TWO HOMES ARE TWO HOSTS. Each host is its own HOME, TRUSTSHELL_HOME and working folder under one temp folder,
 * and every command runs with a minimal environment (PATH and the OS basics only), so no key, token or setting of
 * yours reaches it. Copying bundle.json between the two folders is the transfer. No model, no account, and no
 * network: every trustshell process starts with no-network.cjs preloaded, which refuses and logs any TCP connect
 * or host lookup, and the demo fails if that log is not empty.
 *
 * `reader` and `deleter` are two named copies of the node binary, so the guard can tell them apart by name: `run`
 * allows an executable only by its own name. It bounds WHICH executable starts, not what it then does.
 *
 * EXIT 0 every step and every limit held · 1 something did not hold (printed) · 2 NOT_CHECKED (no CLI, or the MCP
 * server could not be asked). tests/guard-carry-demo.test.ts runs this and compares it with docs/guard-carry-demo.md.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const at = argv.indexOf('--cli');
const KEEP = argv.includes('--keep');
const CLI = path.resolve(at >= 0 && argv[at + 1] ? argv[at + 1] : path.join(here, '..', '..', 'dist', 'cli', 'index.js'));
const MCP = path.join(path.dirname(CLI), '..', 'mcp', 'index.js');
if (!fs.existsSync(CLI)) {
  console.log(`NOT_CHECKED no trustshell CLI at ${CLI}. In a clone: npm ci, then run this again (dist/ is committed).`);
  process.exit(2);
}

const say = (s = '') => console.log(s);
const short = (h) => `${String(h).slice(0, 12)}…`;
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'trustshell-guard-carry-'));
const PRELOAD = path.join(here, 'no-network.cjs');
const NET_LOG = path.join(ROOT, 'network-attempts.log');
// The OS basics only: a credential in the caller's environment never reaches either host.
const BASICS = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG']);
const BASE_ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => BASICS.has(k.toUpperCase()))),
  GUARD_CARRY_NET_LOG: NET_LOG,
  NODE_NO_WARNINGS: '1',
};
const BIN = path.join(ROOT, 'bin');
const exe = (n) => path.join(BIN, n + (process.platform === 'win32' ? '.exe' : ''));
fs.mkdirSync(BIN);
// A link where the OS allows it. Where it does not (node under Program Files on Windows), ONE copy and a hard link
// to it: the first start of every new executable waits for the virus scanner, about 12 s each (measured).
function alias(target, n) {
  try {
    fs.linkSync(target, exe(n));
  } catch {
    try {
      fs.symlinkSync(target, exe(n));
    } catch {
      fs.copyFileSync(target, exe(n));
    }
  }
}
alias(process.execPath, 'reader');
alias(exe('reader'), 'deleter');

const PRECIOUS = 'the project file the owner never wants deleted\n';
function host(name, label) {
  const dir = path.join(ROOT, name);
  const home = path.join(dir, 'home');
  const work = path.join(dir, 'work');
  const ts = path.join(home, '.trustshell');
  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(work, 'notes.txt'), 'meeting notes the agent may read\n');
  fs.writeFileSync(path.join(work, 'precious.txt'), PRECIOUS);
  fs.writeFileSync(path.join(work, 'read.js'), "const fs = require('fs'); fs.writeFileSync('summary.txt', fs.readFileSync('notes.txt', 'utf8').length + ' bytes read\\n');\n");
  fs.writeFileSync(path.join(work, 'delete.js'), "require('fs').unlinkSync('precious.txt');\n");
  const env = { ...BASE_ENV, HOME: home, USERPROFILE: home, TRUSTSHELL_HOME: ts };
  const h = {
    label,
    work,
    env,
    cli: (...a) => {
      const r = spawnSync(process.execPath, ['--require', PRELOAD, CLI, ...a], { cwd: work, env, encoding: 'utf8', input: '', timeout: 120000, windowsHide: true });
      return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '', argv: a };
    },
    precious: () => fs.existsSync(path.join(work, 'precious.txt')),
    restore: () => fs.writeFileSync(path.join(work, 'precious.txt'), PRECIOUS),
    records: () => {
      const f = path.join(ts, 'guard-receipts.jsonl');
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    },
  };
  h.read = (...extra) => h.cli('run', '--tool', 'reader', ...extra, '--', exe('reader'), 'read.js');
  h.del = (...extra) => h.cli('run', '--tool', 'deleter', ...extra, '--', exe('deleter'), 'delete.js');
  h.show = () => JSON.parse(must(h.cli('guard', 'show', '--json'), 0).out);
  return h;
}

/** A step that did not go as the story says stops the demo, loudly, with what the CLI printed. */
function must(r, code, label = `trustshell ${r.argv.join(' ')}`) {
  if (r.code === code) return r;
  say(`NOT HELD  ${label}: exit ${r.code}, expected ${code}`);
  say(`${r.out}${r.err}`.trim().replace(/^/gm, '          '));
  finish(1);
}
const held = [];
function hold(id, ok, text) {
  held.push({ id, ok });
  say(`${ok === true ? 'HELD' : ok === null ? 'NOT_CHECKED' : 'NOT HELD'}  ${id}: ${text}`);
}
const denial = (r) => (r.err.match(/authorized +DENIED: (.*) \(policy /) ?? [])[1] ?? '(no reason printed)';
function finish(code) {
  if (KEEP) console.error(`kept: ${ROOT}`);
  else {
    try {
      fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (e) {
      console.error(`could not remove ${ROOT}: ${e.message}`);
    }
  }
  process.exit(code);
}

const A = host('host-a', 'Host A');
const B = host('host-b', 'Host B');
const NOTE_CARRY = 'precious.txt is the project file the owner never wants deleted';
const NOTE_PRIVATE = 'private: dentist on Tuesday';

say('TrustShell Guard + Carry: one owner policy, carried from Host A to Host B. No model, no credentials.');
say('Each host is a separate TrustShell home on this machine. reader and deleter are two named copies');
say('of the node binary, so the guard can tell them apart by name.');
say();

// 1 ------------------------------------------------------------------------------------------------
say('1  The owner sets a policy and chooses what context travels (Host A)');
must(A.cli('guard', 'init'), 0);
must(A.cli('guard', 'allow', 'tool:reader'), 0);
must(A.cli('guard', 'sign'), 0);
must(A.cli('profile', 'add', 'value', 'answer in plain language'), 0);
must(A.cli('profile', 'add', 'constraint', 'never delete project files without asking'), 0);
must(A.cli('remember', '--trusted', NOTE_CARRY), 0);
must(A.cli('remember', '--trusted', NOTE_PRIVATE), 0);
const showA = A.show();
const fp = showA.signature?.fingerprint;
if (!fp || !showA.policy.actions.includes('tool:reader') || showA.policy.actions.includes('tool:deleter')) {
  say('NOT HELD  the signed policy on Host A does not allow tool:reader and leave tool:deleter out');
  finish(1);
}
if (!must(A.cli('quarantine', 'explain', '1'), 0).out.includes(NOTE_CARRY)) {
  say('NOT HELD  note 1 on Host A is not the note the owner selects');
  finish(1);
}
say(`   guard init, guard allow tool:reader, guard sign`);
say(`   policy ${short(showA.sha256)}, nonce ${showA.policy.nonce}, signed by Host A's install key ${short(fp)}`);
say('   tool:reader is listed; tool:deleter is not, so it is denied');
say('   profile: one value, one constraint. Two notes written; the owner selects note 1 to carry');
say();

// 2 ------------------------------------------------------------------------------------------------
say('2  Host A runs the allowed read and refuses the forbidden delete');
must(A.read(), 0);
const dA = must(A.del(), 5);
if (!fs.existsSync(path.join(A.work, 'summary.txt')) || !A.precious()) {
  say('NOT HELD  Host A: the read did not write summary.txt, or precious.txt is gone');
  finish(1);
}
say('   run --tool reader   ALLOWED, started, exited 0 (summary.txt written)');
say(`   run --tool deleter  DENIED before it started, exit 5: ${denial(dA)}`);
say('   precious.txt is still there');
say();

// 3 ------------------------------------------------------------------------------------------------
say('3  The bundle is exported (Host A) and verified (Host B)');
const bundle = path.join(ROOT, 'bundle.json');
const ex = must(A.cli('bundle', 'export', bundle, '--note', '1'), 0);
const exportedBy = (ex.out.match(/--signer ([0-9a-f]{64})/) ?? [])[1];
const notEncrypted = ex.err.split('\n').find((l) => /NOT encrypted/.test(l)) ?? '';
const unnamed = must(B.cli('bundle', 'verify', bundle), 2, 'Host B: bundle verify without --signer');
const ver = must(B.cli('bundle', 'verify', bundle, '--signer', fp), 0, 'Host B: bundle verify --signer');
if (exportedBy !== fp || !/WOULD BE ENFORCED/.test(ver.out) || !/^NOT_CHECKED/.test(unnamed.err)) {
  say('NOT HELD  the bundle author is not the policy signer, or Host B did not verify it as the story says');
  finish(1);
}
say('   Host A  bundle export --note 1   the profile, the policy by hash with its signature, the one');
say("                                    selected note, and a pointer to Host A's guard ledger");
say(`           the CLI says: ${notEncrypted}`);
say('   Host B  bundle verify            NOT_CHECKED, exit 2: no key named, so nothing is trusted');
say(`   Host B  bundle verify --signer   VERIFIED, signed by ${short(fp)}; the policy WOULD BE ENFORCED here`);
say();

// 4 ------------------------------------------------------------------------------------------------
say('4  Host B imports the approved context and establishes its effective policy');
const before = must(B.read(), 2, 'Host B: run before any policy');
const imp = must(B.cli('bundle', 'import', bundle, '--signer', fp), 0);
const showB = B.show();
const ctx = must(B.cli('bundle', 'context', bundle, '--signer', fp), 0).out;
const quarantined = (must(B.cli('quarantine', 'list'), 0).out.match(/quarantined COUNT (\d+)/) ?? [])[1];
const sameProfile =
  fs.readFileSync(path.join(A.work, '.trustshell', 'profile.md'), 'utf8') === fs.readFileSync(path.join(B.work, '.trustshell', 'profile.md'), 'utf8');
if (
  !/^NOT_CHECKED/.test(before.err) ||
  !/^policy +ENFORCED/m.test(imp.out) ||
  showB.sha256 !== showA.sha256 ||
  showB.signature?.fingerprint !== fp ||
  !sameProfile ||
  quarantined !== '1' ||
  !ctx.includes(NOTE_CARRY) ||
  ctx.includes(NOTE_PRIVATE)
) {
  say('NOT HELD  Host B did not end up with the owner policy, the profile and only the selected note');
  finish(1);
}
say('   before the import       run --tool reader: NOT_CHECKED, exit 2 (no policy here, nothing is authorized)');
say(`   bundle import --signer  policy ENFORCED; profile written; 1 note stored untrusted, in quarantine`);
say(`   guard show              policy ${short(showB.sha256)}, nonce ${showB.policy.nonce}, signed by ${short(fp)}: the same policy as Host A`);
say('   bundle context          what a model on Host B is handed:');
for (const l of ctx.trimEnd().split('\n')) say(l ? `     | ${l}` : '     |');
say();

// 5 ------------------------------------------------------------------------------------------------
say('5  Host B refuses the same forbidden delete');
must(B.read(), 0);
const dB = must(B.del(), 5);
if (!B.precious()) {
  say('NOT HELD  Host B: precious.txt is gone');
  finish(1);
}
say('   run --tool reader   ALLOWED, started, exited 0');
say(`   run --tool deleter  DENIED before it started, exit 5: ${denial(dB)}`);
say();

// 6 ------------------------------------------------------------------------------------------------
say('6  Both hosts wrote evidence, and every record says what it did not see');
const carried = JSON.parse(fs.readFileSync(bundle, 'utf8'));
for (const h of [A, B]) {
  const R = h.records();
  const chain = h.show().records.chain;
  const allowed = R.find((r) => r.kind === 'decision' && r.requested.tool === 'reader' && r.authorized.decision === 'ALLOWED');
  const outcome = R.find((r) => r.kind === 'outcome' && r.requested.tool === 'reader' && r.executed?.exit_code === 0);
  const denied = R.find((r) => r.kind === 'decision' && r.requested.tool === 'deleter' && r.authorized.decision === 'DENIED');
  const scoped = R.every((r) => r.assurance_scope?.not_mediated?.length > 0);
  if (chain !== 'INTACT' || !allowed || !outcome || denied?.executed !== 'not run' || denied.authorized.policy_signed_by !== fp || !scoped) {
    say(`NOT HELD  ${h.label}'s guard ledger does not hold the allowed run, its exit code and the denial, chained and scoped`);
    finish(1);
  }
  say(`   ${h.label}  guard-receipts.jsonl, ${R.length} records, chain INTACT`);
  say(`           record ${allowed.seq} tool:reader ALLOWED; record ${outcome.seq} it exited 0`);
  say(`           record ${denied.seq} tool:deleter DENIED, executed "not run", under the policy signed by ${short(fp)}`);
}
const pointer = carried.payload.evidence.find((e) => e.kind === 'guard-ledger-head');
const pointed = A.records().find((r) => r.hash === pointer?.sha256);
if (!pointed) {
  say("NOT HELD  the bundle's ledger pointer is not a record on Host A");
  finish(1);
}
say(`   each record lists what it did not see, e.g. "${B.records().find((r) => r.kind === 'outcome')?.assurance_scope.not_mediated[1]}"`);
say(`   the bundle points at Host A's ledger by record ${pointed.seq}'s hash: the hash travels, the records do not`);
say();

// The limits ---------------------------------------------------------------------------------------
// Each is exercised against the CLI, not asserted. If one stops being true (the MCP server starts reading the
// policy, say), this demo exits 1 and its test fails until the sentence is changed to match.

// A declaration is not authorization.
const asRead = must(B.del('--class', 'read'), 5, 'Host B: the delete labelled --class read');
const misnamed = must(B.cli('run', '--tool', 'reader', '--', exe('deleter'), 'delete.js'), 5, 'Host B: the deleter started as --tool reader');
const declOk = B.precious() && /does not list tool:deleter/.test(denial(asRead)) && /starts deleter, not reader/.test(denial(misnamed)) && ctx.includes('enforced by the harness, not by you');

// Signed: a key the receiving host names, and one changed byte refuses the whole file.
const tampered = path.join(ROOT, 'bundle-tampered.json');
fs.writeFileSync(tampered, fs.readFileSync(bundle, 'utf8').replace('never wants deleted', 'now wants deleted'));
const refused = must(B.cli('bundle', 'verify', tampered, '--signer', fp), 1, 'Host B: verify a bundle with one changed word');
const signedOk = /^REFUSED the signature does not verify/.test(refused.err);

// Not encrypted: the selected note is plain text in the file; the unselected one is not in it.
const raw = fs.readFileSync(bundle, 'utf8');
const plainOk = raw.includes(NOTE_CARRY) && !raw.includes(NOTE_PRIVATE) && /NOT encrypted/.test(notEncrypted);

// Mediated: the CLI gate and `run`. Not mediated: the MCP server, and any command started without trustshell.
must(A.cli('guard', 'deny', 'tool:remember'), 0);
const viaCli = must(A.cli('remember', '--trusted', 'a note through the CLI'), 5, 'Host A: remember after guard deny tool:remember');
const viaMcp = await mcpRemember(A, 'a note over MCP while the policy denies tool:remember');
const direct = spawnSync(exe('deleter'), ['delete.js'], { cwd: B.work, env: B.env, windowsHide: true });
const bypassed = direct.status === 0 && !B.precious();
B.restore();

// Editable: whoever runs the CLI as the owner changes the policy. Recorded, not prevented.
const widen = must(B.cli('guard', 'allow', 'tool:deleter'), 0, 'Host B: guard allow tool:deleter');
const ran = must(B.del(), 0, 'Host B: the delete after guard allow tool:deleter');
const change = B.records().filter((r) => r.kind === 'policy-change').pop();
const editOk =
  !B.precious() &&
  /signature covered the old policy, so it was removed/.test(widen.err) &&
  B.show().signature === null &&
  change?.change?.via === 'guard allow tool:deleter' &&
  change.change.before_sha256 === showA.sha256 &&
  ran.code === 0;
// The signature does not tell the owner apart from anything running as the owner: on Host A the same widening,
// re-signed with the install key, is ENFORCED by a fresh host that trusts that key.
must(A.cli('guard', 'allow', 'tool:deleter'), 0, 'Host A: guard allow tool:deleter');
must(A.cli('guard', 'sign'), 0, 'Host A: guard sign');
const bundle2 = path.join(ROOT, 'bundle-2.json');
must(A.cli('bundle', 'export', bundle2), 0, 'Host A: export the widened policy');
const C = host('host-c', 'Host C');
const impC = must(C.cli('bundle', 'import', bundle2, '--signer', fp), 0, 'Host C: bundle import --signer');
must(C.del(), 0, 'Host C: the delete under the re-signed policy');
const resignOk = /^policy +ENFORCED/m.test(impC.out) && C.show().signature?.fingerprint === fp && !C.precious();

say('What this shows, and what it does not. Each line was exercised just now; the demo exits 1 if one');
say('did not hold.');
hold(
  'owner-signed',
  signedOk && exportedBy === fp,
  `the policy carries a signature by Host A's install key ${short(fp)}. Host B enforced it only because its operator named that key (--signer); without it, NOT_CHECKED. That fingerprint must reach Host B by a channel you trust: the bundle naming its own author proves nothing. One changed word in the file: REFUSED. A record names a key, not a person.`,
);
hold(
  'mediated paths only',
  /does not list tool:remember/.test(viaCli.err) && /does not list tool:deleter/.test(denial(dB)),
  'the guard decides for `trustshell run` (the deleter, exit 5) and for trustshell commands at the CLI gate (`remember`, exit 5, once the owner denied tool:remember). Nothing else.',
);
hold(
  'not mediated',
  viaMcp === null ? null : viaMcp.ok && bypassed,
  viaMcp === null
    ? `the MCP server could not be asked (${MCP}), so this is not checked`
    : `an MCP \`remember\` call wrote note ${viaMcp.id} on Host A while the policy denied tool:remember (stored untrusted, in quarantine), and the deleter started without trustshell deleted precious.txt on Host B. The guard sees only what goes through it.`,
);
hold('signed, not encrypted', plainOk, 'the carried note reads as plain text in bundle.json; the note the owner did not select is not in it. Anyone with the file can read it.');
hold(
  'a declaration is not authorization',
  declOk,
  'the delete labelled `--class read`, and the deleter started as `--tool reader`, were both refused. A model is told the policy is "enforced by the harness, not by you"; what it says about its own permission changes nothing.',
);
hold(
  'whoever runs the CLI as the owner can change the policy',
  editOk && resignOk,
  "on Host B `guard allow tool:deleter` needed no key and no password: the owner signature was dropped and the next delete ran. On Host A the same edit plus `guard sign` re-signed it with the install key, and a third host trusting that key enforced it and ran the delete. The signature says which key signed, not that the owner meant it. Each change was recorded with the policy hash before and after; none was prevented.",
);
const attempts = fs.existsSync(NET_LOG) ? fs.readFileSync(NET_LOG, 'utf8').split('\n').filter(Boolean).length : 0;
hold('no network', attempts === 0, `every trustshell process ran with TCP connects and host lookups refused and logged: ${attempts} attempt(s).`);
const notHeld = held.filter((h) => h.ok === false).length;
const notChecked = held.filter((h) => h.ok === null).length;
say();
say(`RESULT  steps 1-6 held; ${held.length - notHeld - notChecked} of ${held.length} lines above held${notChecked ? `, ${notChecked} NOT_CHECKED` : ''}`);
finish(notHeld ? 1 : notChecked ? 2 : 0);

/** One `remember` call to trustshell-mcp over stdio. null: the server could not be asked. */
async function mcpRemember(h, text) {
  if (!fs.existsSync(MCP)) return null;
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ['--require', PRELOAD, MCP], { cwd: h.work, env: h.env, windowsHide: true });
    const timer = setTimeout(() => done(null), 60000);
    let buf = '';
    function done(v) {
      clearTimeout(timer);
      c.kill();
      resolve(v);
    }
    const send = (m) => c.stdin.write(JSON.stringify(m) + '\n');
    c.on('error', () => done(null));
    c.on('exit', () => done(null));
    c.stdout.on('data', (d) => {
      buf += d;
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        let m;
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        if (m.id === 1) {
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'remember', arguments: { text } } });
        } else if (m.id === 2) {
          try {
            const r = JSON.parse(m.result.content[0].text);
            done({ ok: !m.result.isError && r.remembered === true && r.quarantined === true, id: r.id });
          } catch {
            done({ ok: false, id: null });
          }
        }
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'guard-carry-demo', version: '1' } } });
  });
}
