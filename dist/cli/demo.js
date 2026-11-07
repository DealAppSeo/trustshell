"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDemo = runDemo;
/**
 * `trustshell demo` — the five-minute first run, offline, no account, no keys, no network.
 *
 * It drives the REAL commands a user would type (it spawns this same CLI as subprocesses in a throwaway
 * TRUSTSHELL_HOME), so what it shows is what the tool actually does — nothing is re-implemented or faked here.
 * The journey:
 *   1. guard init                     an owner policy, fail-closed: every limit 0, local commands only
 *   2. guard allow / limit / sign     configure it, then sign it with this install's key
 *   3. run (ALLOWED)                  a pinned task runs and writes an observable file
 *   4. run (DENIED, capability)       an un-allowed command is refused BEFORE it starts — nothing runs
 *   5. run (DENIED, spend cap)        an over-cap spend is refused — nothing runs
 *   6. guard show                     the decision ledger, chain INTACT (tamper-evident)
 *   7. tamper + guard show            one flipped byte -> chain BROKEN (the negative control), then restored
 *   8. verify-receipt (a signed receipt)   integrity VERIFIED, and the read claims NOT_CHECKED from a file
 *   9. verify-receipt (tampered)      integrity FAILED
 *
 * The honest seam it names at the end: steps 1-7 are the LOCAL enforcement plane (guard-receipts.jsonl, its own
 * hash chain); step 8-9 verify an ENGINE kernel-receipt/2 (the six-claim plane). A local `run` does not yet emit
 * an engine-signed six-claim receipt a stranger verifies offline — that join is future work, not shown here.
 *
 * EGRESS: none. Everything happens in an OS temp dir that is deleted at the end.
 */
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
/** This CLI's own entry, resolved from dist/cli/demo.js -> dist/cli/index.js. */
const CLI = (0, node_path_1.join)(__dirname, 'index.js');
/** The shipped sample engine receipt (package-root/examples), from dist/cli -> ../../examples. */
const SAMPLE_RECEIPT = (0, node_path_1.join)(__dirname, '..', '..', 'examples', 'trust-receipt.sample.json');
/**
 * The trusted root is pinned HERE, out of band — never read out of the receipt being verified (Strix CWE-807, #679):
 * a receipt that names its own signer proves nothing, and pinning the key it carries would make every self-signed
 * forgery read VERIFIED. This is the published sealing key of the shipped sample receipt.
 */
const SAMPLE_RECEIPT_ROOT = '0x58bb94348b39e316810d6a050d5ef5a499ae6479ab42e30dbebc4bdb2685d197';
function trustshell(args, env) {
    const r = (0, node_child_process_1.spawnSync)(process.execPath, [CLI, ...args], { encoding: 'utf8', env });
    return { ok: true, status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
/** The task a pinned, ALLOWED run executes: it writes one observable file so "it really ran" is checkable. */
const TASK_JS = "const fs=require('node:fs');const o=process.env.DEMO_ARTIFACT;" +
    "fs.writeFileSync(o,'authorized task ran at '+new Date().toISOString()+'\\n');" +
    "console.log('[task] wrote '+o);";
function runDemo(io, env = process.env) {
    const home = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'trustshell-demo-'));
    const taskPath = (0, node_path_1.join)(home, 'task.js');
    const artifact = (0, node_path_1.join)(home, 'artifact.txt');
    (0, node_fs_1.writeFileSync)(taskPath, TASK_JS);
    const sub = { ...env, TRUSTSHELL_HOME: home, DEMO_ARTIFACT: artifact };
    delete sub.TRUSTSHELL_REQUIRE_POLICY; // a policy exists in `home`; don't let an inherited flag change the story
    // A relying party verifies a receipt with NO owner policy of their own, so the offline-verify steps run in a
    // fresh, policy-free home. (The owner-policy gate covers every trustshell subcommand as tool:<command>; by
    // default it allows the offline `inspect` but not the equally-offline `verify-receipt` — noted as a finding.)
    const verifyHome = (0, node_path_1.join)(home, 'relying-party');
    (0, node_fs_1.mkdirSync)(verifyHome);
    const verifyEnv = { ...env, TRUSTSHELL_HOME: verifyHome };
    delete verifyEnv.TRUSTSHELL_REQUIRE_POLICY;
    const fails = [];
    let n = 0;
    // Run one real command, show a short slice of what it printed, and check the one thing that must hold.
    const step = (title, args, want, note = '', stepEnv = sub) => {
        n += 1;
        const r = trustshell(args, stepEnv);
        const okExit = want.exit === undefined || r.status === want.exit;
        const okHas = !want.has || want.has.test(r.out);
        const ok = okExit && okHas;
        if (!ok)
            fails.push(`step ${n} (${title}): exit ${r.status}${want.exit !== undefined ? ` (wanted ${want.exit})` : ''}${want.has && !okHas ? `, missing ${want.has}` : ''}`);
        io.out('');
        io.out(`${ok ? '✓' : '✗'} ${n}. ${title}`);
        io.out(`    $ trustshell ${args.join(' ')}`);
        for (const line of r.out.trim().split('\n').slice(0, 10))
            io.out(`      ${line}`);
        if (note)
            io.out(`    → ${note}`);
        return r;
    };
    io.out('trustshell demo — a five-minute first run. No account, no keys, no network.');
    io.out(`Working in a throwaway owner-policy home (deleted at the end):\n  ${home}`);
    try {
        step('Create an owner policy — fail-closed: every limit 0, local commands only', ['guard', 'init', '--days', '30'], { exit: 0, has: /wrote/ });
        step('Allow one task: the node script we just wrote, pinned by its sha256', ['guard', 'allow', 'tool:node', '--script', taskPath], { exit: 0 }, 'an interpreter runs ONLY a script the policy pinned — swap the file and the pin no longer matches');
        step('Allow spending, capped at 1000 (smallest units) per transaction', ['guard', 'allow', 'spend'], { exit: 0 });
        step('Set the per-transaction cap', ['guard', 'limit', 'per-tx', '1000'], { exit: 0 });
        step('Set the daily cap', ['guard', 'limit', 'daily', '1000000'], { exit: 0 });
        step('Set the total cap', ['guard', 'limit', 'total', '1000000'], { exit: 0 });
        step('Sign the policy with this install’s key (the owner signature a bundle carries)', ['guard', 'sign'], { exit: 0, has: /signed/ });
        step('Show the policy and the decision ledger (chain INTACT = untampered)', ['guard', 'show'], { exit: 0, has: /chain INTACT/ });
        const allowed = step('ALLOWED run: the pinned task starts and does its work', ['run', '--tool', 'node', '--', 'node', taskPath], { exit: 0 });
        const ran = (0, node_fs_1.existsSync)(artifact);
        if (!ran)
            fails.push('the ALLOWED run did not produce its observable artifact');
        io.out(`    → observable result: ${ran ? `wrote ${artifact}` : 'ARTIFACT MISSING'}`);
        void allowed;
        step('DENIED run (capability): a command the policy never allowed — refused before it can start', ['run', '--tool', 'rm', '--', 'rm', '-rf', (0, node_path_1.join)(home, 'nope')], { exit: 5, has: /DENIED/ }, 'rm is not an allowed tool, so nothing ran — the decision is recorded BEFORE any command starts');
        step('DENIED run (spend cap): an allowed tool, but an amount over the 1000 cap — refused', ['run', '--tool', 'node', '--class', 'spend', '--amount', '5000', '--', 'node', taskPath], { exit: 5, has: /DENIED/ }, 'ALLOW on the tool is not a blank cheque: the cap still refuses the amount');
        step('Show again: three more decisions, chain still INTACT', ['guard', 'show'], { exit: 0, has: /chain INTACT/ });
        // Negative control: flip one byte in the ledger -> the chain must read BROKEN, never silently "clean".
        const ledgerPath = (0, node_path_1.join)(home, 'guard-receipts.jsonl');
        const original = (0, node_fs_1.readFileSync)(ledgerPath, 'utf8');
        const tampered = original.replace('policy-change', 'policy-chang3');
        if (tampered === original)
            fails.push('could not tamper the ledger (expected a policy-change record)');
        (0, node_fs_1.writeFileSync)(ledgerPath, tampered);
        step('Tamper one byte in the ledger, then show: the chain catches it (BROKEN)', ['guard', 'show'], { exit: 1, has: /chain BROKEN/ }, 'a tamper-evident log: no amount is allowed while the chain is BROKEN');
        (0, node_fs_1.writeFileSync)(ledgerPath, original); // restore; the demo leaves nothing broken behind
        // The engine six-claim plane: an independently-verifiable signed receipt (shipped sample). Offline
        // verification needs no owner policy, so these run as a relying party (a policy-free home). It needs no
        // optional peer either — keccak256 is bundled (@noble/hashes), so a bare `npm install` verifies out of
        // the box. Integrity here MUST read VERIFIED; anything else is a real regression, not a soft degradation.
        // The pin comes from the code above, not from the artifact: assert the shipped sample's signer IS that key, so a
        // swapped sample fails loudly here instead of silently re-pinning the check to whatever key the file carries.
        const sample = JSON.parse((0, node_fs_1.readFileSync)(SAMPLE_RECEIPT, 'utf8'));
        if (sample.public_key.toLowerCase() !== SAMPLE_RECEIPT_ROOT.toLowerCase()) {
            fails.push(`the shipped sample receipt is signed by ${sample.public_key}, not the out-of-band pinned root ${SAMPLE_RECEIPT_ROOT}`);
        }
        step('Verify a signed receipt OFFLINE under a pinned key', ['verify-receipt', SAMPLE_RECEIPT, '--root', SAMPLE_RECEIPT_ROOT], { exit: 0, has: /Integrity\s+VERIFIED/ }, '', verifyEnv);
        io.out('    → integrity VERIFIED here by cryptography (hash + a root pinned in the demo, NOT read from the');
        io.out('      receipt); authorization reads');
        io.out('      NOT_CHECKED from a file — the six-claim envelope is not covered by the receipt signature,');
        io.out('      so it is READ, not re-derived. NOT_CHECKED is never a pass.');
        const badPath = (0, node_path_1.join)(home, 'tampered-receipt.json');
        // Change a byte INSIDE the receipt the verifier hashes (not the ignored decide_response preview), so the
        // recomputed hash no longer matches header.receipt_hash.
        const bad = JSON.parse((0, node_fs_1.readFileSync)(SAMPLE_RECEIPT, 'utf8'));
        bad.receipt_response.receipt.subject.agent.agent_name = 'tampered-agent';
        (0, node_fs_1.writeFileSync)(badPath, JSON.stringify(bad));
        step('Verify a tampered copy: integrity FAILED (the hash no longer matches)', ['verify-receipt', badPath, '--root', SAMPLE_RECEIPT_ROOT], { exit: 1, has: /FAILED/ }, '', verifyEnv);
    }
    finally {
        try {
            (0, node_fs_1.rmSync)(home, { recursive: true, force: true });
        }
        catch { /* best effort */ }
    }
    io.out('');
    io.out('What you just saw, kept apart:');
    io.out('  • VERIFIED      established here by cryptography (the receipt hash + the pinned signature)');
    io.out('  • NOT_CHECKED   read, not re-derived here — NEVER a pass (the envelope’s own attestations from a file)');
    io.out('  • FAILED        a check that ran and did not hold (a tampered receipt, a BROKEN ledger)');
    io.out('  • NOT_APPLICABLE  a claim this call never made (e.g. content correctness on a payment)');
    io.out('');
    io.out('The honest seam (not yet joined):');
    io.out('  Steps 1–7 are the LOCAL enforcement plane: a hash-chained guard-receipts.jsonl, checked by `guard show`.');
    io.out('  Steps 8–9 verify an ENGINE kernel-receipt/2 (the six-claim plane), checked by `trustshell verify-receipt`.');
    io.out('  A local `run` does not yet emit an engine-signed six-claim receipt a stranger verifies offline. That');
    io.out('  join is open work — the demo shows both planes rather than pretending they are one.');
    io.out('');
    if (fails.length) {
        io.err(`demo FAILED (${fails.length}):`);
        for (const f of fails)
            io.err(`  - ${f}`);
        return 1;
    }
    io.out('demo OK — every step did what it said. Re-run any line above yourself; it is the real command.');
    return 0;
}
