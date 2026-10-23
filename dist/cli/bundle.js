"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUNDLE_USAGE = void 0;
exports.parseBundleArgs = parseBundleArgs;
exports.runBundle = runBundle;
/**
 * `trustshell bundle export | verify | import | context` — the CLI over src/lib/bundle.ts.
 * EGRESS: none. Reads and writes local files only.
 */
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const action_evidence_1 = require("../lib/action-evidence");
const bundle_1 = require("../lib/bundle");
const guardrails_1 = require("../lib/guardrails");
const init_1 = require("../lib/init");
const install_key_1 = require("../lib/install-key");
const version_1 = require("../lib/version");
const local_store_1 = require("../memory/local-store");
const quarantine_1 = require("../memory/quarantine");
const profile_1 = require("./profile");
const guard_1 = require("./guard");
exports.BUNDLE_USAGE = `trustshell bundle export <file> [--note <id>]... [--notes released] [--evidence <file>]... [--force]
trustshell bundle verify <file> [--signer <fingerprint>] [--json]
trustshell bundle context <file> [--signer <fingerprint>]
trustshell bundle import <file> [--signer <fingerprint>] [--force] [--json]`;
/** PURE. A flag that does not belong to the verb is refused, never ignored. */
function parseBundleArgs(argv) {
    const [verb, ...rest] = argv;
    if (verb !== 'export' && verb !== 'verify' && verb !== 'import' && verb !== 'context') {
        return { error: `bundle takes export, verify, import or context\n${exports.BUNDLE_USAGE}` };
    }
    const a = { verb, file: '', notes: [], allReleased: false, evidence: [], force: false, json: false };
    const pos = [];
    for (let i = 0; i < rest.length; i += 1) {
        const w = rest[i];
        const v = rest[i + 1];
        if (w === '--force' && (verb === 'export' || verb === 'import'))
            a.force = true;
        else if (w === '--json' && verb !== 'context')
            a.json = true;
        else if (w === '--signer' && verb !== 'export') {
            if (!v || !/^[0-9a-fA-F]{64}$/.test(v))
                return { error: '--signer takes the 64-hex fingerprint that export printed' };
            a.signer = v;
            i += 1;
        }
        else if (w === '--note' && verb === 'export') {
            if (!v || !/^[1-9][0-9]*$/.test(v))
                return { error: '--note takes a note id (a whole number)' };
            a.notes.push(Number(v));
            i += 1;
        }
        else if (w === '--notes' && verb === 'export') {
            if (v !== 'released')
                return { error: '--notes takes released (every note that is not quarantined)' };
            a.allReleased = true;
            i += 1;
        }
        else if (w === '--evidence' && verb === 'export') {
            if (!v || v.startsWith('-'))
                return { error: '--evidence takes a file' };
            a.evidence.push(v);
            i += 1;
        }
        else if (w.startsWith('-'))
            return { error: `bundle ${verb}: unknown option ${w}` };
        else
            pos.push(w);
    }
    if (pos.length !== 1)
        return { error: `bundle ${verb} takes one <file>\n${exports.BUNDLE_USAGE}` };
    a.file = pos[0];
    return a;
}
function summaryLines(b) {
    const p = b.payload;
    const pol = p.policy;
    const signer = pol && (0, guardrails_1.policySigner)(pol.document);
    // "Owner" is the author's key only: any other key that verifies read "owner-signed" until 2026-10-22 (case 2).
    const signed = !signer ? null : signer === b.author.fingerprint ? `owner-signed by ${signer.slice(0, 16)}…` : `signed by ${signer.slice(0, 16)}…, NOT the bundle author's key`;
    return [
        `author      ${b.author.fingerprint}`,
        `profile     ${p.profile !== null ? 'yes' : 'none'}`,
        `policy      ${pol ? `sha256 ${pol.sha256.slice(0, 16)}…, nonce ${pol.nonce}, ${signed ?? (pol.document.signature ? `${guardrails_1.SIGNATURE_DOES_NOT_VERIFY} (imports as suggested, never enforced)` : 'UNSIGNED (imports as suggested, never enforced)')}` : 'none'}`,
        `memories    ${p.memories.length} note(s) you selected (they import as untrusted, quarantined)`,
        // The name is the sender's text, signed but not safe to print: a control or bidi byte in it reached the terminal (antifragile night, 2026-10-24).
        `evidence    ${p.evidence.length ? p.evidence.map((e) => `${e.kind} ${(0, action_evidence_1.cleanCodePoints)(e.name)} ${e.sha256.slice(0, 12)}…`).join('; ') : 'none'}`,
    ];
}
function runBundle(argv, io, env = process.env) {
    if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
        io.out(exports.BUNDLE_USAGE);
        return 0;
    }
    const a = parseBundleArgs(argv);
    if ('error' in a) {
        io.err(`error: ${a.error}`);
        return 2;
    }
    const fs = require('node:fs');
    const home = (0, guardrails_1.trustshellHome)(env);
    try {
        if (a.verb === 'export') {
            if (fs.existsSync(a.file) && !a.force) {
                io.err(`bundle export: ${a.file} exists; nothing was written (--force replaces it)`);
                return 2;
            }
            const loaded = (0, guardrails_1.loadPolicy)(home);
            if (loaded.state === 'invalid') {
                io.err(`bundle export: ${loaded.path} does not parse (${(0, action_evidence_1.cleanCodePoints)(loaded.problems.join('; '))}); fix it first (trustshell guard show). Nothing was written.`);
                return 1;
            }
            // Memories only when the owner selects them; the memory file is not even opened otherwise.
            let memories = [];
            if (a.notes.length || a.allReleased) {
                const sel = (0, local_store_1.selectableNotes)((0, local_store_1.memoryDbPath)(env));
                for (const id of a.notes) {
                    if (sel.notes.some((n) => n.id === id))
                        continue;
                    const why = sel.quarantined.includes(id) ? 'is quarantined: release it first' : sel.encrypted.includes(id) ? 'is encrypted: encrypted notes do not ship in a plain bundle' : 'is not a note in this memory file';
                    io.err(`bundle export: note ${id} ${why}. Nothing was written.`);
                    return 2;
                }
                memories = sel.notes.filter((n) => a.allReleased || a.notes.includes(n.id)).map((n) => ({ text: n.body, created_at: n.created_at }));
            }
            const evidence = [];
            for (const e of a.evidence)
                evidence.push({ kind: 'file', name: (0, node_path_1.basename)(e), sha256: (0, node_crypto_1.createHash)('sha256').update(fs.readFileSync(e)).digest('hex') });
            const ledgerPath = (0, node_path_1.join)(home, guardrails_1.GUARD_RECEIPTS_FILE);
            if (fs.existsSync(ledgerPath)) {
                const l = (0, guardrails_1.readLedger)(fs.readFileSync(ledgerPath, 'utf8'));
                if (l.verdict === 'INTACT' && l.last)
                    evidence.push({ kind: 'guard-ledger-head', name: guardrails_1.GUARD_RECEIPTS_FILE, sha256: l.last.hash });
            }
            const key = (0, install_key_1.signingKey)(home);
            if (key.created)
                io.err(`created this install's signing key: ${key.path} (private; it never goes in a bundle)`);
            const bundle = (0, bundle_1.buildBundle)({
                profile: fs.existsSync(profile_1.PROFILE_PATH) ? fs.readFileSync(profile_1.PROFILE_PATH, 'utf8') : null,
                policy: loaded.state === 'ok' ? { sha256: loaded.sha256, nonce: loaded.doc.policy.nonce, document: loaded.doc } : null,
                memories,
                evidence,
            }, key.key, key.signer, (0, version_1.resolvePackageVersion)(__dirname));
            // Written whole or not at all: a crash leaves the .partial file, never a half bundle under the real name.
            const tmp = `${a.file}.partial-${process.pid}`;
            fs.writeFileSync(tmp, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 });
            fs.renameSync(tmp, a.file);
            if (a.json)
                io.out(JSON.stringify({ file: a.file, author: bundle.author.fingerprint, memories: memories.length, evidence, policy: bundle.payload.policy && { sha256: bundle.payload.policy.sha256, signed: !!bundle.payload.policy.document.signature, signed_by: (0, guardrails_1.policySigner)(bundle.payload.policy.document) } }, null, 2));
            else
                io.out([`exported ${a.file}`, ...summaryLines(bundle), '', `On the other machine: trustshell bundle import ${a.file} --signer ${bundle.author.fingerprint}`].join('\n'));
            io.err('A bundle is signed, NOT encrypted: anyone with the file can read it. Keep it out of git and shared folders.');
            return 0;
        }
        const own = (0, install_key_1.ownFingerprint)(home);
        const v = (0, bundle_1.verifyBundle)(fs.readFileSync(a.file, 'utf8'), { ownFingerprint: own, signer: a.signer });
        const p = v.bundle.payload;
        if (a.verb === 'context') {
            io.out((0, bundle_1.brainContext)(p));
            return 0;
        }
        const trustedOwners = [own, a.signer?.toLowerCase()].filter((x) => !!x);
        const inForce = (0, guardrails_1.loadPolicy)(home);
        // Supersession is checked against the HIGHEST nonce this host has had (file or ledger), so deleting
        // policy.json or re-running guard init cannot reopen an old, looser signed policy.
        const hw = (0, guardrails_1.nonceHighWater)(home);
        const pol = (0, bundle_1.policyImportDecision)(p.policy, trustedOwners, hw === null ? null : { nonce: hw }, guardrails_1.policySignedBy);
        // The decision stands. Its reason, "a downgrade or a replay", was all a stranger read for the very policy
        // in force, on the machine that had just exported it (stranger walk, 2026-10-23); say that it is the same.
        if (pol && !pol.enforce && p.policy && inForce.state === 'ok' && inForce.sha256 === p.policy.sha256) {
            pol.why += '. It is the policy already in force here (same sha256), so importing it changes nothing';
        }
        if (a.verb === 'verify') {
            const lines = [`VERIFIED signature good, author trusted as ${v.trusted_as}`, ...summaryLines(v.bundle)];
            if (pol)
                lines.push(`policy here ${pol.enforce ? 'WOULD BE ENFORCED' : 'would be suggested, NOT enforced'}: ${pol.why}`);
            io.out(a.json ? JSON.stringify({ verified: true, trusted_as: v.trusted_as, policy_on_import: pol }, null, 2) : lines.join('\n'));
            return 0;
        }
        // import: every conflict is found before anything is written.
        const profileHere = fs.existsSync(profile_1.PROFILE_PATH) ? fs.readFileSync(profile_1.PROFILE_PATH, 'utf8') : null;
        const writeProfile = p.profile !== null && profileHere !== p.profile;
        if (writeProfile && profileHere !== null && !a.force) {
            io.err(`NOT_CHECKED nothing was imported: ${profile_1.PROFILE_PATH} differs from the bundle's. --force replaces it.`);
            return 2;
        }
        // Imported memories are UNTRUSTED input, whatever they were on the machine that sent them.
        const source = `bundle:${v.bundle.author.fingerprint.slice(0, 16)}`;
        const present = new Set((0, local_store_1.listNotes)((0, local_store_1.memoryDbPath)(env), env, { includeQuarantined: true }).filter((n) => n.source === source).map((n) => n.body));
        let added = 0;
        let held = 0;
        for (const m of p.memories) {
            if (present.has(m.text))
                continue;
            const rec = (0, quarantine_1.rememberUntrusted)(m.text, { source }, env);
            added += 1;
            if (String(rec.reason).startsWith(local_store_1.INJECTION_PREFIX))
                held += 1;
        }
        if (writeProfile) {
            fs.mkdirSync(init_1.TRUSTSHELL_DIR, { recursive: true });
            fs.writeFileSync(profile_1.PROFILE_PATH, p.profile, 'utf8');
        }
        let policyResult = 'none in bundle';
        if (p.policy && pol) {
            fs.mkdirSync(home, { recursive: true, mode: 0o700 });
            const target = (0, node_path_1.join)(home, pol.enforce ? guardrails_1.POLICY_FILE : guardrails_1.SUGGESTED_POLICY_FILE);
            fs.writeFileSync(target, (0, guardrails_1.renderPolicyDocument)(p.policy.document), { mode: 0o600 });
            if (pol.enforce)
                (0, guard_1.recordPolicyChange)(home, `bundle import (owner-signed by ${p.policy.document.signature?.fingerprint.slice(0, 16)}…)`, inForce.state === 'ok' ? inForce.sha256 : null, p.policy.document);
            policyResult = pol.enforce ? `ENFORCED (${pol.why})` : `suggested, NOT enforced: saved as ${guardrails_1.SUGGESTED_POLICY_FILE} because ${pol.why}`;
            if (!pol.enforce)
                io.err(`policy NOT enforced: ${pol.why}. The policy in force here is unchanged.`);
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
        if (added)
            io.err(`${added} note(s) are quarantined as untrusted: trustshell quarantine list, then release what you recognise.`);
        return 0;
    }
    catch (e) {
        // The message can quote the file: an unknown field name, a bad schema value. The shape is checked BEFORE any
        // signature, so an unsigned file from anyone reached the reader's terminal through here (antifragile night, cycle 2).
        if (e instanceof bundle_1.BundleError) {
            io.err((0, action_evidence_1.cleanCodePoints)(e.message));
            return e.exit;
        }
        io.err(`bundle ${a.verb} failed: ${(0, action_evidence_1.cleanCodePoints)(e?.message ?? String(e))}`);
        return 3;
    }
}
