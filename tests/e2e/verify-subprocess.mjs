#!/usr/bin/env node
/**
 * verify-subprocess.mjs — verify a Plonky3 proof as a genuinely EXTERNAL caller.
 *
 * Run as a separate process, not imported. Two reasons, and the second is the
 * important one:
 *
 *   1. `@hyperdag/proof-verifier` is ESM; the jest suite is CJS via ts-jest, so
 *      an in-process import fails with "Unexpected token 'export'".
 *   2. More importantly, a subprocess IS the integration being claimed. An
 *      integrator does not share our module system, our transpiler, or our
 *      config. If verification only works inside our own jest process, the
 *      claim "an external caller can verify this" is untested.
 *
 * Reads a JSON job on argv[2]: { proof_bytes, statement }
 * Writes the verifier's raw result as JSON to stdout. Exit 0 on a completed
 * verification (verified true OR false — both are answers); exit 1 only when
 * verification could not be attempted, so a caller can distinguish "the proof
 * is bad" from "we could not check".
 */
import { verify } from '@hyperdag/proof-verifier';

try {
  const job = JSON.parse(process.argv[2] ?? '{}');
  if (typeof job.proof_bytes !== 'string' || !job.statement) {
    throw new Error('job needs { proof_bytes: base64 string, statement: object }');
  }
  const t0 = Date.now();
  const result = await verify(job.proof_bytes, job.statement);
  process.stdout.write(JSON.stringify({ ...result, elapsed_ms: Date.now() - t0 }));
  process.exit(0);
} catch (e) {
  process.stdout.write(JSON.stringify({ verified: false, error: `HARNESS: ${e?.message ?? e}`, harness_failure: true }));
  process.exit(1);
}
