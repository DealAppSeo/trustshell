/**
 * The SDK import contract: what actually happens when a developer installs
 * `@hyperdag/trustshell` and imports it — the "installation phase", verified.
 *
 * WHY THIS EXISTS. An independent install-phase audit (2026-09-02) found a real,
 * reproducible interop gap: the published types declare a `default` export equal
 * to the `TrustShell` class, but the package is a CommonJS build, and Node's
 * NATIVE ESM loader resolves a default import of a CJS module to `module.exports`
 * (the namespace object), not the class. So:
 *
 *     import TrustShell from '@hyperdag/trustshell';
 *     new TrustShell();   // ← throws "TrustShell is not a constructor" in native ESM
 *
 * while the README's documented NAMED import works everywhere:
 *
 *     import { TrustShell } from '@hyperdag/trustshell';   // ← the class, always
 *
 * This suite locks the blessed path (require + named ESM must always yield a
 * usable class and the pure helpers must run) and PINS the current default-ESM
 * behaviour so the gap cannot silently widen — and so that when the proper fix
 * lands (a dual ESM+CJS build; see docs/KNOWN-LIMITS.md), the pin flips loudly
 * from "namespace" to "class" and this file is the thing that records it.
 *
 * Builds the SDK first (the dist is what ships); run via `npm run test:sdk-import`.
 * Three-outcome discipline: a real assertion that fails is FAILED, not a warning.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist/lib/index.js');
const require = createRequire(import.meta.url);

let failures = 0;
const ok = (msg) => console.log(`OK   ${msg}`);
const fail = (msg) => { console.error(`FAIL ${msg}`); failures++; };
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

// ── 1. CJS require — the class must be reachable both as `.TrustShell` and `.default`
const cjs = require(DIST);
assert(typeof cjs.TrustShell === 'function', 'require(): named TrustShell is a constructor');
assert(typeof cjs.default === 'function', 'require(): default is a constructor');
assert(cjs.__esModule === true, 'require(): __esModule marker is present');
try { new cjs.TrustShell(); ok('require(): new TrustShell() constructs'); }
catch (e) { fail(`require(): new TrustShell() threw — ${e.message}`); }

// ── 2. Native ESM — the DOCUMENTED path (named import) must yield a usable class
const esm = await import(pathToFileURL(DIST).href);
assert(typeof esm.TrustShell === 'function', 'native ESM: named { TrustShell } is a constructor');
try { new esm.TrustShell(); ok('native ESM: new TrustShell() (named import) constructs — the README path'); }
catch (e) { fail(`native ESM: new TrustShell() (named import) threw — ${e.message}`); }

// ── 3. PIN the known interop gap: native-ESM default import is the namespace, NOT the class.
//     This is EXPECTED today and documented in KNOWN-LIMITS.md. When the dual build
//     lands, `esm.default` becomes the class and this assertion must be updated to
//     `=== 'function'` — that update is the signal the fix shipped.
assert(typeof esm.default === 'object', 'native ESM: default import is the namespace object (documented CJS interop gap — see KNOWN-LIMITS.md)');
assert(typeof esm.default?.TrustShell === 'function', 'native ESM: the default namespace still carries .TrustShell (so `import * as` recovers the class)');

// ── 4. The module's real, pure logic loads and behaves — proves this is not an empty shell.
assert(Array.isArray(esm.HAL_VERDICT_ORDER) && esm.HAL_VERDICT_ORDER.join(',') === 'PASS,FLAG,VETO',
  'export HAL_VERDICT_ORDER === [PASS, FLAG, VETO]');
assert(esm.meetsThreshold('VETO', 'FLAG') === true && esm.meetsThreshold('PASS', 'FLAG') === false,
  'export meetsThreshold enforces the verdict ordering');
assert(typeof esm.proofBadgeStatus === 'function' && typeof esm.verify === 'function',
  'the honesty helpers (proofBadgeStatus) and the WASM proof verifier (verify) are exported');

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: SDK import contract — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
