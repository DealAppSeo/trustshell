#!/usr/bin/env node
/**
 * SKEPTIC'S RECEIPT CHALLENGE (DECISION 5): can a skeptic forge an owner-self-signed receipt that the
 * shipped verifier accepts? Run the attack matrix against the REAL built CLI and see each one REFUSED,
 * with the receipt in hand and a report that names the commit, the version, the input and the output.
 *
 *     npm run skeptic            (or: node scripts/skeptic-receipt.mjs)
 *
 * Needs Node >= 22 and a build (dist/). NO account, NO key, NO network — every check is offline. The
 * install key is a throwaway in a temp TRUSTSHELL_HOME, so your real key is untouched. The commands are
 * exactly the two a skeptic runs: `trustshell sign-receipt` and `trustshell verify-receipt`.
 *
 *   POSITIVE CONTROL   a real seal verifies under its own pinned key (exit 0). If this fails, every REFUSE
 *                      below is vacuous, so the whole run fails.
 *   missing root       verify with no --root -> NOT_CHECKED, never exit 0 (an unaccountable signer is not a pass)
 *   wrong key          verify under a different pinned key -> integrity FAILED (exit 1)
 *   tampered evidence  flip one decision field after sealing -> integrity FAILED (exit 1)
 *   forged signature   swap the signature for another -> integrity FAILED (exit 1)
 *   transplanted sig   lift one receipt's signature onto a different body (same key) -> FAILED (exit 1)
 *   expired authz      a policy expired before as-of -> the authorization claim is FAILED
 *   no self-promotion  a self-signature + an authenticated six-claim envelope is STILL owner-self-signed,
 *                      repid_eligible 'no' — validating your own receipt never earns production RepID
 *
 * LIMITATION (recorded, not a pass): offline verify is stateless, so it does not catch a verbatim replay
 * of one receipt. Replay is the engine's job (receipt_id / nullifier uniqueness), not the offline verifier.
 *
 * Verdicts: PASS | FAIL | NOT_CHECKED. NOT_CHECKED is a result, never a pass. A REFUSE attack PASSES when
 * the verifier refuses; it FAILS when the verifier accepts the attack (that would be a real defect).
 * Exit: 0 every check PASS | 1 any FAIL | 2 nothing FAILED but something NOT_CHECKED | 3 usage/setup.
 *
 *   --out-dir <dir>   where skeptic-receipt-<stem>.json/.md go (default docs/proof-pack)
 *   --stem <name>     file stem (default skeptic-receipt-<UTC date>)
 *   --keep            keep the temp dirs
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
if (has('--help') || has('-h')) { console.log(fs.readFileSync(SELF, 'utf8').split('*/')[0].replace(/^\/\*\*?\n?/, '').replace(/^ \* ?/gm, '')); process.exit(0); }
const UTC_DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.resolve(ROOT, opt('--out-dir', 'docs/proof-pack'));
const STEM = opt('--stem', `skeptic-receipt-${UTC_DATE}`);
const KEEP = has('--keep');

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const flipHex = (h) => h.slice(0, -1) + (h.endsWith('0') ? '1' : '0'); // valid-shaped but wrong (last nibble)
const CLI = path.join(ROOT, 'dist', 'cli', 'index.js');
const err = (m) => process.stderr.write(m + '\n');
const mdEscape = (s) => String(s).replace(/[\\|]/g, '\\$&');

// ---- the body under attack: byte-for-byte the one tests/owner-receipt.test.ts seals (the ruler) --------------------
function base() {
  return {
    header: { receipt_id: 'skeptic-0001', prev_receipt_id: null, prev_hash: null, created_at: '2026-11-07T00:00:00Z', env: { network: 'base-sepolia', chain_id: 84532, is_simulated: true } },
    subject: { agent: { agent_id: 'agent-1', agent_name: 'demo' }, owner: { wallet: null, assurance: null, status: 'none' } },
    request: { tool: { name: 'echo', class: 'read' }, origin: 'Cli', args_hash: `0x${'a'.repeat(64)}`, amount_raw: null, payee: null, asset: null, chain_id: null },
    decision: {
      verdict: 'ALLOW', blocking: false, executed: false, reasons: [], checks: [{ name: 'local', outcome: 'PASS', source: 'owner' }], does_not_attest: [],
      policy: { policy_hash: null, signer: null, signature: 'NOT_CHECKED', expires_at: null, revocation: 'NOT_CHECKED' },
      limits: { per_tx_raw: '0', daily_raw: '0', total_raw: '0', effective_per_tx_raw: '0', binding_term: 'none' },
      laya: { lane: null, mode: 'shadow', consulted: false },
    },
    payment: { status: 'none' },
    verification: { status: 'none' },
  };
}
const RULER_SHA = sha256(JSON.stringify(base()));
const SELF_SHA = sha256(fs.readFileSync(SELF));

// ---- plumbing: run the REAL built CLI with a throwaway install key, offline ----------------------------------------
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'skeptic-home-'));
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'skeptic-work-'));
const cleanup = () => { if (KEEP) return; for (const d of [HOME, WORK]) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } };
process.on('exit', cleanup);
function cli(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: WORK, input, encoding: 'utf8', windowsHide: true, timeout: 60000,
    env: { ...process.env, TRUSTSHELL_HOME: HOME, NO_COLOR: '1' },
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', err: r.error };
}
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const writeJson = (name, obj) => { const p = path.join(WORK, name); fs.writeFileSync(p, JSON.stringify(obj)); return p; };

// ---- results -------------------------------------------------------------------------------------------------------
const steps = [];
const limits = [];
let dir = null; // the deep-imported built lib (for the one claim the CLI exit code does not express)
const P = (detail, data) => ({ verdict: 'PASS', detail, data });
const F = (detail, data) => ({ verdict: 'FAIL', detail, data });
const N = (detail, cause, data) => ({ verdict: 'NOT_CHECKED', detail, cause, data });
function record(id, label, source, r) {
  const st = { id, label, source, verdict: r.verdict, detail: r.detail ?? '', ...(r.cause ? { cause: r.cause } : {}), ...(r.data ? { data: r.data } : {}) };
  steps.push(st);
  err(`  ${r.verdict.padEnd(11)} ${id.padEnd(18)} ${label}${st.detail ? ' | ' + String(st.detail).slice(0, 140) : ''}${r.cause ? ` [${r.cause}]` : ''}`);
  return st;
}

// ---- the challenge -------------------------------------------------------------------------------------------------
let PIN = null;
let sealed = null;

function setup() {
  if (!fs.existsSync(CLI)) { record('0-setup', 'build present (dist/cli/index.js)', '[fs]', N('no dist/cli/index.js — run `npm run sdk:build` first', 'no-build')); return false; }
  const help = cli(['--help']);
  if (!/sign-receipt/.test(help.stdout + help.stderr) || !/verify-receipt/.test(help.stdout + help.stderr)) {
    record('0-setup', 'this build ships sign-receipt + verify-receipt', '[cmd] trustshell --help', N('the owner-signed seam is not in this build (it lands with PR #681 / branch claude/run-signed-receipt)', 'not-on-this-build'));
    return false;
  }
  const bodyPath = writeJson('body.json', base());
  const s = cli(['sign-receipt', bodyPath]);
  sealed = json(s.stdout);
  PIN = (s.stderr.match(/--root (0x[0-9a-f]{64})/) || [])[1] || null;
  if (s.code !== 0 || !sealed || !PIN) { record('0-setup', 'seal a base receipt with this install key', '[cmd] trustshell sign-receipt', F(`sign-receipt failed (exit ${s.code})`, { stderr: s.stderr.slice(0, 200) })); return false; }
  record('0-setup', 'seal a base receipt with this install key (throwaway TRUSTSHELL_HOME)', '[cmd] trustshell sign-receipt', P(`provenance ${sealed.header.provenance}, pin ${PIN.slice(0, 14)}…`, { provenance: sealed.header.provenance }));
  // deep-import the BUILT lib for the one guard the CLI exit code cannot express (RepID eligibility)
  try { const req = createRequire(path.join(ROOT, 'x.js')); dir = { owner: req(path.join(ROOT, 'dist/lib/owner-receipt.js')), verify: req(path.join(ROOT, 'dist/lib/verify-receipt.js')), kernel: req(path.join(ROOT, 'dist/lib/kernel-client.js')) }; } catch (e) { dir = null; limits.push({ id: 'lib-import', meaning: `could not deep-import the built lib (${e.message}); the no-self-promotion check falls back to the provenance stamp only` }); }
  return true;
}

/** A verify-receipt call, returned with its exit code and parsed --json result. */
function verify(file, extra = []) { const r = cli(['verify-receipt', file, '--json', ...extra]); return { code: r.code, v: json(r.stdout), raw: r }; }

function runChallenge() {
  // POSITIVE CONTROL — the real seal must verify, or every refusal below means nothing.
  {
    const sealedPath = writeJson('sealed.json', sealed);
    const { code, v } = verify(sealedPath, ['--root', PIN]);
    const ok = code === 0 && v?.claims?.integrity?.status === 'VERIFIED' && v?.sealer?.trusted === true;
    record('positive-control', 'a real seal verifies under its own pinned key', '[cmd] verify-receipt --root <pin>', ok ? P(`exit 0, integrity VERIFIED, sealer trusted`, { exit: code }) : F(`expected exit 0 + VERIFIED + trusted; got exit ${code}, integrity ${v?.claims?.integrity?.status}, trusted ${v?.sealer?.trusted}`, { exit: code }));
    if (!ok) return; // vacuous to continue
  }

  // missing root — whole, but UNSEALED: NOT_CHECKED, never a pass.
  {
    const sealedPath = writeJson('sealed.json', sealed);
    const { code, v } = verify(sealedPath);
    const refused = code !== 0 && v?.sealer?.trusted === false;
    record('missing-root', 'no --root pinned -> never exit 0 (unaccountable signer is not a pass)', '[cmd] verify-receipt (no --root)', refused ? P(`exit ${code} (NOT_CHECKED), sealer not trusted, integrity ${v?.claims?.integrity?.status}`, { exit: code }) : F(`a receipt with no pinned signer read as a pass (exit ${code})`, { exit: code }));
  }

  // wrong key — a different pinned root: integrity FAILED.
  {
    const sealedPath = writeJson('sealed.json', sealed);
    const { code, v } = verify(sealedPath, ['--root', flipHex(PIN)]);
    const refused = code === 1 && v?.claims?.integrity?.status === 'FAILED';
    record('wrong-key', 'pinned to a DIFFERENT key -> integrity FAILED', '[cmd] verify-receipt --root <other>', refused ? P(`exit 1, integrity FAILED, sealer not trusted`, { exit: code }) : F(`a foreign pin did not fail (exit ${code}, integrity ${v?.claims?.integrity?.status})`, { exit: code }));
  }

  // tampered evidence — flip a decision field after sealing.
  {
    const t = JSON.parse(JSON.stringify(sealed)); t.decision.verdict = 'DENY';
    const p = writeJson('tampered.json', t);
    const { code, v } = verify(p, ['--root', PIN]);
    const refused = code === 1 && v?.claims?.integrity?.status === 'FAILED';
    record('tampered-evidence', 'flip decision.verdict after sealing -> integrity FAILED', '[cmd] verify-receipt --root <pin>', refused ? P(`exit 1, integrity FAILED (hash no longer matches)`, { exit: code }) : F(`a tampered receipt verified (exit ${code}, integrity ${v?.claims?.integrity?.status})`, { exit: code }));
  }

  // forged signature — swap the signature for a different (valid-shaped) one.
  {
    const f = JSON.parse(JSON.stringify(sealed)); f.header.signature = flipHex(sealed.header.signature);
    const p = writeJson('forged-sig.json', f);
    const { code, v } = verify(p, ['--root', PIN]);
    const refused = code === 1 && v?.claims?.integrity?.status === 'FAILED';
    record('forged-signature', 'swap the signature -> Ed25519 verify FAILED', '[cmd] verify-receipt --root <pin>', refused ? P(`exit 1, integrity FAILED`, { exit: code }) : F(`a forged signature verified (exit ${code}, integrity ${v?.claims?.integrity?.status})`, { exit: code }));
  }

  // transplanted signature — lift this key's signature from receipt A onto a DIFFERENT body B.
  {
    const bodyB = base(); bodyB.header.receipt_id = 'skeptic-0002';
    const sB = cli(['sign-receipt', writeJson('bodyB.json', bodyB)]);
    const sealedB = json(sB.stdout);
    if (sB.code === 0 && sealedB) {
      const transplant = JSON.parse(JSON.stringify(sealedB)); transplant.header.signature = sealed.header.signature; // A's sig on B's bytes
      const p = writeJson('transplant.json', transplant);
      const { code, v } = verify(p, ['--root', PIN]);
      const refused = code === 1 && v?.claims?.integrity?.status === 'FAILED';
      record('transplanted-sig', "lift one receipt's signature onto a different body (same key) -> FAILED", '[cmd] verify-receipt --root <pin>', refused ? P(`exit 1, integrity FAILED (a signature covers its own bytes only)`, { exit: code }) : F(`a transplanted signature verified (exit ${code}, integrity ${v?.claims?.integrity?.status})`, { exit: code }));
    } else record('transplanted-sig', 'seal a second body to transplant from', '[cmd] trustshell sign-receipt', N('could not seal the second body', 'setup'));
  }

  // expired authorization — a policy expired before the as-of anchor; the authorization claim must fail.
  {
    const b = base(); b.decision.policy.expires_at = 1_000_000_000; // 2001
    const sE = cli(['sign-receipt', writeJson('bodyE.json', b)]);
    const sealedE = json(sE.stdout);
    if (sE.code === 0 && sealedE) {
      const p = writeJson('expired.json', sealedE);
      const { code, v } = verify(p, ['--root', PIN, '--as-of', '2000000000']); // 2033
      const refused = v?.claims?.authorization?.status === 'FAILED';
      record('expired-authz', 'a policy expired before --as-of -> authorization claim FAILED', '[cmd] verify-receipt --root <pin> --as-of <future>', refused ? P(`authorization FAILED at as-of 2033 (integrity still VERIFIED, exit ${code})`, { exit: code }) : F(`an expired policy did not fail the authorization claim (${v?.claims?.authorization?.status})`, { exit: code }));
    } else record('expired-authz', 'seal a receipt with an expired policy', '[cmd] trustshell sign-receipt', N('could not seal the expired-policy body', 'setup'));
  }

  // no self-promotion — a self-signature, even with an AUTHENTICATED six-claim envelope, is still
  // owner-self-signed and repid_eligible 'no'. This is the CLI exit code's blind spot, so it is read
  // from the shipped evidenceLevel() directly (deep import), with the provenance stamp as the fallback.
  {
    if (dir) {
      const { SIX_CLAIM_KEYS, SIX_CLAIMS_PREDICATE_TYPE } = dir.kernel;
      const claims = {}; for (const k of SIX_CLAIM_KEYS) claims[k] = { status: 'VERIFIED', statement: `claim ${k}`, supports: [], gaps: [] };
      const envelope = { _type: 'https://in-toto.io/Statement/v1', predicateType: SIX_CLAIMS_PREDICATE_TYPE, subject: [{ name: `kernel-receipt:${sealed.header.receipt_id}`, digest: { keccak256: sealed.header.receipt_hash.replace(/^0x/, '') } }], predicate: { claims, what_this_does_not_establish: [] } };
      dir.verify.verifyReceiptOffline(sealed, { trustedRoots: [PIN], engineEnvelope: envelope, envelopeAuthenticated: true }).then((v) => {
        const lvl = dir.owner.evidenceLevel(v, sealed);
        const refused = lvl.level === 'OWNER_SELF_SIGNED' && lvl.repid_eligible === 'no';
        record('no-self-promotion', 'self-signature + authenticated envelope is STILL owner-self-signed, no RepID', '[shipped fn] evidenceLevel()', refused ? P(`level ${lvl.level}, repid_eligible ${lvl.repid_eligible}`) : F(`a self-signature was promoted: level ${lvl.level}, repid_eligible ${lvl.repid_eligible}`));
        finish();
      }).catch((e) => { record('no-self-promotion', 'evidenceLevel() on a self-signature', '[shipped fn]', F(`threw: ${e.message}`)); finish(); });
      return; // finish() is called in the promise
    }
    const refused = sealed.header.provenance === 'owner-self-signed';
    record('no-self-promotion', 'the seal is stamped owner-self-signed (RepID gate proven in owner-receipt.test.ts)', '[cmd] provenance stamp', refused ? P('provenance owner-self-signed') : F(`provenance is ${sealed.header.provenance}`));
  }
  finish();
}

// ---- limitation probe + report ------------------------------------------------------------------------------------
function replayLimitation() {
  const sealedPath = writeJson('sealed.json', sealed);
  const a = verify(sealedPath, ['--root', PIN]);
  const b = verify(sealedPath, ['--root', PIN]);
  limits.push({ id: 'offline-verify-is-stateless', observed: a.code === 0 && b.code === 0, evidence: `the same sealed receipt verified twice, both exit ${a.code}/${b.code}`, meaning: 'offline verify does NOT catch a verbatim replay of one receipt. Replay is prevented by the engine (receipt_id / nullifier uniqueness), not by the offline verifier. A relying party that must not accept a receipt twice checks the id against what it has already seen.' });
}

function finish() {
  if (sealed && PIN) replayLimitation();
  const roll = steps.some((s) => s.verdict === 'FAIL') ? 'FAIL' : steps.some((s) => s.verdict === 'NOT_CHECKED') ? 'NOT_CHECKED' : 'PASS';
  let commit = null; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* not a git checkout */ }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const report = {
    challenge: 'skeptic-receipt', decision: 'D5', rollup: roll, generated_at: new Date().toISOString(),
    commit, version: pkg.version, node: process.version, platform: `${process.platform} ${os.release()}`,
    ruler_sha256: RULER_SHA, self_sha256: SELF_SHA,
    inputs: { cli: path.relative(ROOT, CLI), body: base(), attacks: steps.map((s) => s.id) },
    steps, limitations: limits,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, `${STEM}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT_DIR, `${STEM}.md`), markdown(report));
  err('');
  err(`SKEPTIC CHALLENGE: ${roll}  (commit ${commit?.slice(0, 12) ?? '?'}, v${pkg.version})`);
  err(`report: ${path.relative(ROOT, jsonPath)}  and  ${STEM}.md`);
  process.exitCode = roll === 'FAIL' ? 1 : roll === 'NOT_CHECKED' ? 2 : 0;
}

function markdown(r) {
  const rows = r.steps.map((s) => `| ${s.id} | ${s.verdict} | ${mdEscape(s.label)} | ${mdEscape(s.source)} | ${mdEscape(s.detail)} |`).join('\n');
  const lims = r.limitations.map((l) => `- **${l.id}** — ${mdEscape(l.meaning)}${l.evidence ? ` _(${mdEscape(l.evidence)})_` : ''}`).join('\n');
  return [
    `# Skeptic's receipt challenge — ${r.rollup}`,
    '',
    `> Can a skeptic forge an owner-self-signed receipt the shipped verifier accepts? Each attack below PASSES when the verifier **refuses** it. Reproduce: \`npm run skeptic\`.`,
    '',
    `- **commit** \`${r.commit ?? '?'}\`  ·  **version** \`${r.version}\`  ·  **node** \`${r.node}\`  ·  **platform** \`${r.platform}\``,
    `- **ruler** (the body under attack) \`sha256:${r.ruler_sha256.slice(0, 16)}…\`  ·  **this script** \`sha256:${r.self_sha256.slice(0, 16)}…\``,
    `- **commands** \`trustshell sign-receipt\` and \`trustshell verify-receipt\` — offline, throwaway install key, no network`,
    '',
    '| attack | verdict | what it proves | source | detail |',
    '|---|---|---|---|---|',
    rows,
    '',
    '## Limitations (recorded, not passes)',
    lims || '- none',
    '',
    `_Generated ${r.generated_at}. PASS = the verifier refused the attack. A FAIL here is a real defect in the seam._`,
    '',
  ].join('\n');
}

// ---- go ------------------------------------------------------------------------------------------------------------
err(`skeptic's receipt challenge — attacking the owner-self-signed seam with the real CLI`);
if (!setup()) { finish(); } else { runChallenge(); }
