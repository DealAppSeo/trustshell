"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUNDLE_USAGE = void 0;
exports.parseBundleArgs = parseBundleArgs;
exports.runBundle = runBundle;
/**
 * `trustshell bundle export <file> | verify <file> | import <file>` — the CLI over src/lib/bundle.ts.
 * EGRESS: none. Reads and writes local files only.
 */
const node_path_1 = require("node:path");
const bundle_1 = require("../lib/bundle");
const guardrails_1 = require("../lib/guardrails");
const init_1 = require("../lib/init");
const local_store_1 = require("../memory/local-store");
const profile_1 = require("./profile");
exports.BUNDLE_USAGE = `trustshell bundle export <file> [--force]
trustshell bundle verify <file> [--signer <fingerprint>] [--json]
trustshell bundle context <file> [--signer <fingerprint>]
trustshell bundle import <file> [--signer <fingerprint>] [--force] [--json]`;
/** PURE. A flag that does not belong to the verb is refused, never ignored. */
function parseBundleArgs(argv) {
    const [verb, ...rest] = argv;
    if (verb !== 'export' && verb !== 'verify' && verb !== 'import' && verb !== 'context') {
        return { error: `bundle takes export, verify, import or context\n${exports.BUNDLE_USAGE}` };
    }
    const pos = [];
    let signer;
    let force = false;
    let json = false;
    for (let i = 0; i < rest.length; i += 1) {
        const a = rest[i];
        if (a === '--force' && (verb === 'export' || verb === 'import'))
            force = true;
        else if (a === '--json' && verb !== 'context')
            json = true;
        else if (a === '--signer' && verb !== 'export') {
            const v = rest[i + 1];
            if (!v || !/^[0-9a-fA-F]{64}$/.test(v))
                return { error: '--signer takes the 64-hex fingerprint that export printed' };
            signer = v;
            i += 1;
        }
        else if (a.startsWith('-'))
            return { error: `bundle ${verb}: unknown option ${a}` };
        else
            pos.push(a);
    }
    if (pos.length !== 1)
        return { error: `bundle ${verb} takes one <file>\n${exports.BUNDLE_USAGE}` };
    return { verb, file: pos[0], signer, force, json };
}
function summary(b) {
    const p = b.payload;
    return {
        signer: b.signer.fingerprint,
        created_at: b.created_at,
        profile: p.profile !== null,
        guardrails: p.guardrails !== null,
        notes: p.memory.notes.length,
        values: p.memory.values.length,
        left_out: p.withheld,
    };
}
function summaryLines(b) {
    const p = b.payload;
    const w = p.withheld;
    return [
        `signer      ${b.signer.fingerprint}`,
        `profile     ${p.profile !== null ? 'yes' : 'none'}`,
        `guardrails  ${p.guardrails !== null ? 'yes' : 'none'}`,
        `memory      ${p.memory.notes.length} notes, ${p.memory.values.length} keyed values`,
        `left out    ${w.secret_shaped} credential-shaped, ${w.injection_held} injection-held, ${w.encrypted} encrypted, ${w.do_not_send} do_not_send, ${w.learn} learn-loop rows (counts only; their text is not in the file)`,
    ];
}
function runBundle(argv, io, env = process.env) {
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
            const g = (0, guardrails_1.loadGuardrails)(home);
            if (g.state === 'invalid') {
                io.err(`bundle export: ${g.path} does not parse (${g.problems.join('; ')}); fix it first (trustshell guard show). Nothing was written.`);
                return 1;
            }
            const rows = (0, local_store_1.exportRows)((0, local_store_1.memoryDbPath)(env));
            const key = (0, bundle_1.signingKey)(home);
            if (key.created)
                io.err(`created this install's signing key: ${key.path} (private; it never goes in a bundle)`);
            const bundle = (0, bundle_1.buildBundle)({
                profile: fs.existsSync(profile_1.PROFILE_PATH) ? fs.readFileSync(profile_1.PROFILE_PATH, 'utf8') : null,
                guardrails: g.state === 'ok' ? g.guardrails : null,
                notes: rows.notes,
                values: rows.values,
                withheld: rows.withheld,
            }, key.key);
            fs.writeFileSync(a.file, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600, flag: a.force ? 'w' : 'wx' });
            if (a.json)
                io.out(JSON.stringify({ file: a.file, ...summary(bundle) }, null, 2));
            else {
                io.out([`exported ${a.file}`, ...summaryLines(bundle), '', `On the other machine: trustshell bundle import ${a.file} --signer ${bundle.signer.fingerprint}`].join('\n'));
            }
            io.err('This file holds your profile and memory in plain text. Keep it out of git and shared folders.');
            return 0;
        }
        const text = fs.readFileSync(a.file, 'utf8');
        const v = (0, bundle_1.verifyBundle)(text, { ownFingerprint: (0, bundle_1.ownFingerprint)(home), signer: a.signer });
        if (a.verb === 'context') {
            io.out((0, bundle_1.brainContext)(v.bundle.payload));
            return 0;
        }
        if (a.verb === 'verify') {
            io.out(a.json ? JSON.stringify({ verified: true, trusted_as: v.trusted_as, ...summary(v.bundle) }, null, 2) : [`VERIFIED signature good, signer trusted as ${v.trusted_as}`, ...summaryLines(v.bundle)].join('\n'));
            return 0;
        }
        // import: every conflict is found before anything is written.
        const p = v.bundle.payload;
        const conflicts = [];
        const profileHere = fs.existsSync(profile_1.PROFILE_PATH) ? fs.readFileSync(profile_1.PROFILE_PATH, 'utf8') : null;
        const writeProfile = p.profile !== null && profileHere !== p.profile;
        if (writeProfile && profileHere !== null && !a.force)
            conflicts.push(`${profile_1.PROFILE_PATH} differs from the bundle's`);
        const gHere = (0, guardrails_1.loadGuardrails)(home);
        const nextG = p.guardrails ? (0, guardrails_1.renderGuardrails)(p.guardrails) : null;
        const writeGuardrails = nextG !== null && !(gHere.state === 'ok' && (0, guardrails_1.renderGuardrails)(gHere.guardrails) === nextG);
        if (writeGuardrails && gHere.state !== 'absent' && !a.force)
            conflicts.push(`${gHere.path} differs from the bundle's`);
        if (conflicts.length) {
            io.err(`NOT_CHECKED nothing was imported: ${conflicts.join('; ')}. --force replaces them.`);
            return 2;
        }
        const mem = (0, local_store_1.importRows)((0, local_store_1.memoryDbPath)(env), p.memory, { replace: a.force, env });
        if (!mem.applied) {
            io.err(`NOT_CHECKED nothing was imported: these keys hold a different value here: ${mem.conflicts.join(', ')}. --force replaces them.`);
            return 2;
        }
        // ponytail: memory commits first, then the two files; a crash between them leaves memory imported
        // and the files not. Re-running the import is safe (duplicates are skipped).
        if (writeProfile) {
            fs.mkdirSync(init_1.TRUSTSHELL_DIR, { recursive: true });
            fs.writeFileSync(profile_1.PROFILE_PATH, p.profile, 'utf8');
        }
        if (writeGuardrails && p.guardrails) {
            for (const w of (0, bundle_1.widenings)(gHere.state === 'ok' ? gHere.guardrails : null, p.guardrails))
                io.err(`guardrails WIDEN: ${w}`);
            fs.mkdirSync(home, { recursive: true, mode: 0o700 });
            fs.writeFileSync((0, node_path_1.join)(home, guardrails_1.GUARDRAILS_FILE), nextG, { mode: 0o600 });
        }
        const result = {
            imported: true,
            trusted_as: v.trusted_as,
            profile: writeProfile ? 'written' : p.profile === null ? 'none in bundle' : 'unchanged',
            guardrails: writeGuardrails ? 'written' : p.guardrails === null ? 'none in bundle' : 'unchanged',
            notes_added: mem.added_notes,
            notes_already_here: mem.duplicate_notes,
            values_added: mem.added_values,
            values_replaced: mem.replaced_values,
            values_already_here: mem.same_values,
        };
        io.out(a.json ? JSON.stringify(result, null, 2) : Object.entries(result).map(([k, x]) => `${k.padEnd(20)}${String(x)}`).join('\n'));
        return 0;
    }
    catch (e) {
        if (e instanceof bundle_1.BundleError) {
            io.err(e.message);
            return e.exit;
        }
        io.err(`bundle ${a.verb} failed: ${e?.message ?? String(e)}`);
        return 3;
    }
}
