#!/usr/bin/env node
//
// wrapper-reach-preflight.mjs — is the engine reachable FROM HERE, before we judge it?
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// `wrapper-readiness.test.ts` drives the real SDK against the live engine, and its own header
// is explicit that a surface it cannot exercise is "SKIPPED and REPORTED ... rather than faked
// into a pass". It applies that to the auth-gated case and not to reachability, where it says
// the opposite:
//
//     "If the backend is unreachable this is a REAL failure, not a skip — the whole wrapper
//      promise depends on it. Surface it loudly."
//
// That is right about a backend that is down and wrong about a sandbox that will not dial. Run
// from an agent session on 2026-09-02 the suite reported SEVEN FAILURES, every one of them a
// network policy refusing to open a socket. Nothing about the product was measured. This
// repository's central rule is that those are different outcomes — VERIFIED / NOT_CHECKED /
// FAILED, never two — and the collapse costs most when it points at a product that is fine.
//
// ── THE DISCRIMINATOR, WHICH IS THE WHOLE TRICK ─────────────────────────────
//
// A sandbox denial does NOT look like a network error to Node. `curl` reports
// `(56) CONNECT tunnel failed, response 403`, but `fetch` RESOLVES — with an ordinary HTTP 403
// synthesised by the proxy, carrying a header the origin server never sets
// [MEASURED 2026-09-02 against repid-engine-production]:
//
//     status 403
//     x-deny-reason: host_not_allowed
//     body: "Host not in allowlist: repid-engine-production.up.railway.app. …"
//
// Code that only checks `res.ok` cannot tell that from the engine itself returning 403, which
// is exactly how the suite came to report a policy decision as a product failure. The header is
// the discriminator, and treating its ABSENCE as reachable is the safe direction: an unfamiliar
// proxy that does not set it degrades to a real FAILED, which is loud, rather than to a silent
// skip, which is not.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
//
// It does not downgrade a genuine outage. Any answer that came from the SERVER — 500, 503, a
// timeout mid-response — is reachability, and the suite runs and fails honestly. Only the proxy
// refusing to connect at all is NOT_CHECKED. If this ever starts hiding real breakage, it will
// be because that line moved.
//
// Exit codes carry the verdict, per CLAUDE.md: 0 VERIFIED (run the suite), 2 NOT_CHECKED (the
// sandbox blocked us), anything else FAILED.

const URL_UNDER_TEST =
  process.env.TRUSTSHELL_API_URL || 'https://repid-engine-production.up.railway.app';

/** The header a sandbox proxy sets when it refuses to open the tunnel. */
const DENY_HEADER = 'x-deny-reason';

const OK = 0;
const NOT_CHECKED = 2;

async function main() {
  const target = `${URL_UNDER_TEST.replace(/\/+$/, '')}/health`;

  let res;
  try {
    res = await fetch(target, { signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    // A thrown fetch is DNS, TLS, refusal or timeout — every one of them a real statement about
    // the host, none of them a policy decision we can identify. Let the suite run and fail
    // honestly rather than inventing a skip from an error we cannot attribute.
    console.log(`preflight: ${target} threw (${err?.name ?? 'Error'}: ${err?.message ?? ''})`);
    console.log('preflight — RUNNING the suite. A thrown request is about the host, not the sandbox.');
    return OK;
  }

  const deny = res.headers.get(DENY_HEADER);
  if (deny) {
    console.log(`preflight: ${target} → ${res.status}, ${DENY_HEADER}: ${deny}`);
    console.log('');
    console.log('check:wrapper-readiness — NOT_CHECKED');
    console.log('  The sandbox proxy refused to connect, so nothing about the engine or the');
    console.log('  wrapper was measured. This is NOT a product failure and must not be reported');
    console.log('  as one. Re-run from an environment whose network policy allows the host, or');
    console.log('  ask this session which hosts it can reach:');
    console.log('    curl -sS "$HTTPS_PROXY/__agentproxy/status"');
    return NOT_CHECKED;
  }

  // Any status without the deny header came from the server — including 5xx. That is
  // reachability, and a broken engine is a REAL failure the suite should surface loudly.
  console.log(`preflight: ${target} → ${res.status} (answered by the server, not the proxy)`);
  console.log('preflight — RUNNING the suite.');
  return OK;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // The preflight itself broke. That is neither a skip nor a product verdict.
    console.error('preflight — FAILED (the preflight itself errored):', err);
    process.exit(1);
  });
