/**
 * `trustshell bundle export | verify | import | context` — the CLI over src/lib/bundle.ts.
 * EGRESS: none. Reads and writes local files only.
 */
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { cleanCodePoints } from '../lib/action-evidence';
import { brainContext, buildBundle, BundleError, policyImportDecision, verifyBundle, type Bundle, type BundlePayload, type EvidencePointer } from '../lib/bundle';
import { GUARD_RECEIPTS_FILE, POLICY_FILE, SIGNATURE_DOES_NOT_VERIFY, SUGGESTED_POLICY_FILE, loadPolicy, nonceHighWater, policySignedBy, policySigner, readLedger, renderPolicyDocument, trustshellHome } from '../lib/guardrails';
import { TRUSTSHELL_DIR } from '../lib/init';
import { ownFingerprint, signingKey } from '../lib/install-key';
import { resolvePackageVersion } from '../lib/version';
import { listNotes, memoryDbPath, selectableNotes, INJECTION_PREFIX } from '../memory/local-store';
import { rememberUntrusted } from '../memory/quarantine';
import { PROFILE_PATH } from './profile';
import { recordPolicyChange } from './guard';

type IO = { out: (s: string) => void; err: (s: string) => void };

export const BUNDLE_USAGE = `trustshell bundle export <file> [--note <id>]... [--notes released] [--evidence <file>]... [--force]
trustshell bundle verify <file> [--signer <fingerprint>] [--json]
trustshell bundle context <file> [--signer <fingerprint>]
trustshell bundle import <file> [--signer <fingerprint>] [--force] [--json]`;

export interface BundleArgs {
  verb: 'export' | 'verify' | 'import' | 'context';
  file: string;
  signer?: string;
  notes: number[];
  allReleased: boolean;
  evidence: string[];
  force: boolean;
  json: boolean;
}

/** PURE. A flag that does not belong to the verb is refused, never ignored. */
export function parseBundleArgs(argv: string[]): BundleArgs | { error: string } {
  const [verb, ...rest] = argv;
  if (verb !== 'export' && verb !== 'verify' && verb !== 'import' && verb !== 'context') {
    return { error: `bundle takes export, verify, import or context\n${BUNDLE_USAGE}` };
  }
  const a: BundleArgs = { verb, file: '', notes: [], allReleased: false, evidence: [], force: false, json: false };
  const pos: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const w = rest[i] as string;
    const v = rest[i + 1];
    if (w === '--force' && (verb === 'export' || verb === 'import')) a.force = true;
    else if (w === '--json' && verb !== 'context') a.json = true;
    else if (w === '--signer' && verb !== 'export') {
      if (!v || !/^[0-9a-fA-F]{64}$/.test(v)) return { error: '--signer takes the 64-hex fingerprint that export printed' };
      a.signer = v;
      i += 1;
    } else if (w === '--note' && verb === 'export') {
      if (!v || !/^[1-9][0-9]*$/.test(v)) return { error: '--note takes a note id (a whole number)' };
      a.notes.push(Number(v));
      i += 1;
    } else if (w === '--notes' && verb === 'export') {
      if (v !== 'released') return { error: '--notes takes released (every note that is not quarantined)' };
      a.allReleased = true;
      i += 1;
    } else if (w === '--evidence' && verb === 'export') {
      if (!v || v.startsWith('-')) return { error: '--evidence takes a file' };
      a.evidence.push(v);
      i += 1;
    } else if (w.startsWith('-')) return { error: `bundle ${verb}: unknown option ${w}` };
    else pos.push(w);
  }
  if (pos.length !== 1) return { error: `bundle ${verb} takes one <file>\n${BUNDLE_USAGE}` };
  a.file = pos[0] as string;
  return a;
}

function summaryLines(b: Bundle): string[] {
  const p = b.payload;
  const pol = p.policy;
  const signer = pol && policySigner(pol.document);
  // "Owner" is the author's key only: any other key that verifies read "owner-signed" until 2026-10-22 (case 2).
  const signed = !signer ? null : signer === b.author.fingerprint ? `owner-signed by ${signer.slice(0, 16)}…` : `signed by ${signer.slice(0, 16)}…, NOT the bundle author's key`;
  return [
    `author      ${b.author.fingerprint}`,
    `profile     ${p.profile !== null ? 'yes' : 'none'}`,
    `policy      ${pol ? `sha256 ${pol.sha256.slice(0, 16)}…, nonce ${pol.nonce}, ${signed ?? (pol.document.signature ? `${SIGNATURE_DOES_NOT_VERIFY} (imports as suggested, never enforced)` : 'UNSIGNED (imports as suggested, never enforced)')}` : 'none'}`,
    `memories    ${p.memories.length} note(s) you selected (they import as untrusted, quarantined)`,
    // The name is the sender's text, signed but not safe to print: a control or bidi byte in it reached the terminal (antifragile night, 2026-10-24).
    `evidence    ${p.evidence.length ? p.evidence.map((e) => `${e.kind} ${cleanCodePoints(e.name)} ${e.sha256.slice(0, 12)}…`).join('; ') : 'none'}`,
  ];
}

export function runBundle(argv: string[], io: IO, env: NodeJS.ProcessEnv = process.env): number {
  const a = parseBundleArgs(argv);
  if ('error' in a) {
    io.err(`error: ${a.error}`);
    return 2;
  }
  const fs = require('node:fs') as typeof import('node:fs');
  const home = trustshellHome(env);
  try {
    if (a.verb === 'export') {
      if (fs.existsSync(a.file) && !a.force) {
        io.err(`bundle export: ${a.file} exists; nothing was written (--force replaces it)`);
        return 2;
      }
      const loaded = loadPolicy(home);
      if (loaded.state === 'invalid') {
        io.err(`bundle export: ${loaded.path} does not parse (${loaded.problems.join('; ')}); fix it first (trustshell guard show). Nothing was written.`);
        return 1;
      }
      // Memories only when the owner selects them; the memory file is not even opened otherwise.
      let memories: BundlePayload['memories'] = [];
      if (a.notes.length || a.allReleased) {
        const sel = selectableNotes(memoryDbPath(env));
        for (const id of a.notes) {
          if (sel.notes.some((n) => n.id === id)) continue;
          const why = sel.quarantined.includes(id) ? 'is quarantined: release it first' : sel.encrypted.includes(id) ? 'is encrypted: encrypted notes do not ship in a plain bundle' : 'is not a note in this memory file';
          io.err(`bundle export: note ${id} ${why}. Nothing was written.`);
          return 2;
        }
        memories = sel.notes.filter((n) => a.allReleased || a.notes.includes(n.id)).map((n) => ({ text: n.body, created_at: n.created_at }));
      }
      const evidence: EvidencePointer[] = [];
      for (const e of a.evidence) evidence.push({ kind: 'file', name: basename(e), sha256: createHash('sha256').update(fs.readFileSync(e)).digest('hex') });
      const ledgerPath = join(home, GUARD_RECEIPTS_FILE);
      if (fs.existsSync(ledgerPath)) {
        const l = readLedger(fs.readFileSync(ledgerPath, 'utf8'));
        if (l.verdict === 'INTACT' && l.last) evidence.push({ kind: 'guard-ledger-head', name: GUARD_RECEIPTS_FILE, sha256: l.last.hash });
      }
      const key = signingKey(home);
      if (key.created) io.err(`created this install's signing key: ${key.path} (private; it never goes in a bundle)`);
      const bundle = buildBundle(
        {
          profile: fs.existsSync(PROFILE_PATH) ? fs.readFileSync(PROFILE_PATH, 'utf8') : null,
          policy: loaded.state === 'ok' ? { sha256: loaded.sha256, nonce: loaded.doc.policy.nonce, document: loaded.doc } : null,
          memories,
          evidence,
        },
        key.key,
        key.signer,
        resolvePackageVersion(__dirname),
      );
      // Written whole or not at all: a crash leaves the .partial file, never a half bundle under the real name.
      const tmp = `${a.file}.partial-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(tmp, a.file);
      if (a.json) io.out(JSON.stringify({ file: a.file, author: bundle.author.fingerprint, memories: memories.length, evidence, policy: bundle.payload.policy && { sha256: bundle.payload.policy.sha256, signed: !!bundle.payload.policy.document.signature, signed_by: policySigner(bundle.payload.policy.document) } }, null, 2));
      else io.out([`exported ${a.file}`, ...summaryLines(bundle), '', `On the other machine: trustshell bundle import ${a.file} --signer ${bundle.author.fingerprint}`].join('\n'));
      io.err('A bundle is signed, NOT encrypted: anyone with the file can read it. Keep it out of git and shared folders.');
      return 0;
    }

    const own = ownFingerprint(home);
    const v = verifyBundle(fs.readFileSync(a.file, 'utf8'), { ownFingerprint: own, signer: a.signer });
    const p = v.bundle.payload;
    if (a.verb === 'context') {
      io.out(brainContext(p));
      return 0;
    }
    const trustedOwners = [own, a.signer?.toLowerCase()].filter((x): x is string => !!x);
    const inForce = loadPolicy(home);
    // Supersession is checked against the HIGHEST nonce this host has had (file or ledger), so deleting
    // policy.json or re-running guard init cannot reopen an old, looser signed policy.
    const hw = nonceHighWater(home);
    const pol = policyImportDecision(p.policy, trustedOwners, hw === null ? null : { nonce: hw }, policySignedBy);
    if (a.verb === 'verify') {
      const lines = [`VERIFIED signature good, author trusted as ${v.trusted_as}`, ...summaryLines(v.bundle)];
      if (pol) lines.push(`policy here ${pol.enforce ? 'WOULD BE ENFORCED' : 'would be suggested, NOT enforced'}: ${pol.why}`);
      io.out(a.json ? JSON.stringify({ verified: true, trusted_as: v.trusted_as, policy_on_import: pol }, null, 2) : lines.join('\n'));
      return 0;
    }

    // import: every conflict is found before anything is written.
    const profileHere = fs.existsSync(PROFILE_PATH) ? fs.readFileSync(PROFILE_PATH, 'utf8') : null;
    const writeProfile = p.profile !== null && profileHere !== p.profile;
    if (writeProfile && profileHere !== null && !a.force) {
      io.err(`NOT_CHECKED nothing was imported: ${PROFILE_PATH} differs from the bundle's. --force replaces it.`);
      return 2;
    }
    // Imported memories are UNTRUSTED input, whatever they were on the machine that sent them.
    const source = `bundle:${v.bundle.author.fingerprint.slice(0, 16)}`;
    const present = new Set(listNotes(memoryDbPath(env), env, { includeQuarantined: true }).filter((n) => n.source === source).map((n) => n.body));
    let added = 0;
    let held = 0;
    for (const m of p.memories) {
      if (present.has(m.text)) continue;
      const rec = rememberUntrusted(m.text, { source }, env);
      added += 1;
      if (String(rec.reason).startsWith(INJECTION_PREFIX)) held += 1;
    }
    if (writeProfile) {
      fs.mkdirSync(TRUSTSHELL_DIR, { recursive: true });
      fs.writeFileSync(PROFILE_PATH, p.profile as string, 'utf8');
    }
    let policyResult = 'none in bundle';
    if (p.policy && pol) {
      fs.mkdirSync(home, { recursive: true, mode: 0o700 });
      const target = join(home, pol.enforce ? POLICY_FILE : SUGGESTED_POLICY_FILE);
      fs.writeFileSync(target, renderPolicyDocument(p.policy.document), { mode: 0o600 });
      if (pol.enforce) recordPolicyChange(home, `bundle import (owner-signed by ${p.policy.document.signature?.fingerprint.slice(0, 16)}…)`, inForce.state === 'ok' ? inForce.sha256 : null, p.policy.document);
      policyResult = pol.enforce ? `ENFORCED (${pol.why})` : `suggested, NOT enforced: saved as ${SUGGESTED_POLICY_FILE} because ${pol.why}`;
      if (!pol.enforce) io.err(`policy NOT enforced: ${pol.why}. The policy in force here is unchanged.`);
    }
    const result = {
      imported: true,
      trusted_as: v.trusted_as,
      profile: writeProfile ? 'written' : p.profile === null ? 'none in bundle' : 'unchanged',
      policy: policyResult,
      memories_quarantined: added,
      memories_held_as_injection: held,
      memories_already_here: p.memories.length - added,
      evidence_pointers: p.evidence.length,
    };
    io.out(a.json ? JSON.stringify(result, null, 2) : Object.entries(result).map(([k, x]) => `${k.padEnd(28)}${String(x)}`).join('\n'));
    if (added) io.err(`${added} note(s) are quarantined as untrusted: trustshell quarantine list, then release what you recognise.`);
    return 0;
  } catch (e) {
    // The message can quote the file: an unknown field name, a bad schema value. The shape is checked BEFORE any
    // signature, so an unsigned file from anyone reached the reader's terminal through here (antifragile night, cycle 2).
    if (e instanceof BundleError) {
      io.err(cleanCodePoints(e.message));
      return e.exit;
    }
    io.err(`bundle ${a.verb} failed: ${cleanCodePoints((e as Error)?.message ?? String(e))}`);
    return 3;
  }
}
