# RC attack — 1.8.0-dry — 2026-10-23T00-10-12-628Z

Candidate: `@hyperdag/trustshell@1.8.0` · tarball sha256 `52669e3c31cc0c27855a03ffa63ea0ac0b12ca72ed63831a7e21160714a527bf` · integrity `sha512-tkaDaVUYgOe7YVDe2YPBrmn8BsS9pIZAdGlcf+VTLRt7q8KbJ47HViiHGPiGcaCUw68K40xzWx2M2o8GMxsdsw==`

PASS 61 · FAIL 0 · INFO 21 · NOT_CHECKED 6 · new findings 0

PASS = the attack failed or the limit is disclosed. FAIL = a bypass worked or a limit is not disclosed. INFO = a measurement or a documented boundary. A missing receipt never proves no action happened.

| area | attack | outcome | evidence |
|---|---|---|---|
| identity | candidate-identity | **INFO** | (not published here) |
| install | cold-install | **INFO** | (not published here) |
| install | version-and-engines | **INFO** | (not published here) |
| latency | cli --version | **INFO** | (not published here) |
| latency | cli --help | **INFO** | (not published here) |
| latency | cli inspect (4-entry log) | **INFO** | (not published here) |
| latency | inspect-50k-entries | **INFO** | (not published here) |
| inspect | genuine | **PASS** | verdict INTACT, exit 0 — control |
| inspect | forged-wholesale | **PASS** | verdict INTACT, exit 0 — a fabricated log with a valid chain must say it proves nothing about authenticity |
| inspect | edited-entry-hash-kept | **PASS** | verdict BROKEN, exit 1 |
| inspect | deleted-middle | **PASS** | verdict BROKEN, exit 1 |
| inspect | tail-truncated | **PASS** | verdict INTACT, exit 0 — dropping the newest entries is undetectable; it must say so |
| inspect | reordered | **PASS** | verdict BROKEN, exit 1 |
| inspect | duplicate-line | **PASS** | verdict BROKEN, exit 1 |
| inspect | two-chains-concatenated | **PASS** | verdict BROKEN, exit 1 |
| inspect | seq-is-float | **PASS** | verdict BROKEN, exit 1 |
| inspect | seq-is-string | **PASS** | verdict BROKEN, exit 1 |
| inspect | seq-is-negative | **PASS** | verdict BROKEN, exit 1 |
| inspect | empty-file | **PASS** | verdict NO_LOG, exit 3 |
| inspect | bom-prefixed | **PASS** | verdict BROKEN, exit 1 |
| inspect | prototype-pollution-line | **PASS** | verdict BROKEN, exit 1 |
| inspect | terminal-escape-in-tool-name | **PASS** | verdict INTACT, exit 0 — the card must not replay control bytes into the reader's terminal |
| inspect | bidi-override-in-tool-name | **PASS** | verdict INTACT, exit 0 — the card must not replay bidi controls |
| inspect | foreign-adapter-never-intact | **PASS** | --from claude-code on a chained log: exit 3, UNCHAINED |
| report | handwritten-evidence-confirmed | **PASS** | a hand-written evidence file (no GitHub involved) gave CONFIRMED, exit 0; the card says the file is unauthenticated; reason line: "The local log verifies intact and the evidence file says the external run completed successfully. The two rec…" |
| report | control-bytes-in-evidence-fields | **PASS** | owner/repo/sha scrubbed; verdict field scrubbed |
| evidence-card | control-true-claim | **PASS** | true claim SUPPORTED, exit 0 (SUPPORTED:gha.run_id, SUPPORTED:gha.run_succeeded, SUPPORTED:git.head_sha) |
| evidence-card | cites-another-run | **PASS** | exit 1, CONTRADICTED:gha.run_id, NOT_CHECKED:gha.run_succeeded |
| evidence-card | wrong-commit | **PASS** | exit 1, SUPPORTED:gha.run_id, NOT_CHECKED:gha.run_succeeded, CONTRADICTED:git.head_sha |
| evidence-card | failed-run-claimed-success | **PASS** | exit 1, SUPPORTED:gha.run_id, CONTRADICTED:gha.run_succeeded, SUPPORTED:git.head_sha |
| evidence-card | nonexistent-run | **PASS** | exit 3 (3 = INCONCLUSIVE) |
| evidence-card | non-github-host | **PASS** | exit 2, check failed: need https://github.com/owner/repo/actions/runs/123 |
| evidence-card | control-bytes-in-claim | **PASS** | no raw escape or bidi control reached the output |
| evidence-card | five-megabyte-claims-file | **PASS** | exit 2, 885 ms, peak RSS 58 MB, statuses |
| evidence-card | fullwidth-digit-run-id | **PASS** | exit 3, NOT_CHECKED:excluded.markup |
| latency | cli check <runUrl> --claims-file (network, unauthenticated) | **INFO** | (not published here) |
| latency | cli check "2 + 2 = 5" (engine, no model by design) | **INFO** | (not published here) |
| latency | cli check "<sentence>" (engine, model quorum) | **INFO** | (not published here) |
| friction | kernel-client-without-ethers | **INFO** | (not published here) |
| kernel-client | control-valid-allow | **PASS** | allowed=true |
| kernel-client | args-hash-differs | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | other-tool-name | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | other-tool-class | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | other-agent | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | other-amount | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | amount-spelled-100.0 | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | amount-spelled-0100 | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | executed-true-preview | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | check-not-checked | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | check-fail | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | no-checks | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | receipt-says-blocking | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | receipt-schema-v2 | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | body-edited-after-hash | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | hash-malformed | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | receipt-missing | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | verdict-vs-decision-disagree | **PASS** | allowed=false (inconsistent_response) |
| kernel-client | lowercase-allow | **PASS** | allowed=false (unreadable_response) |
| kernel-client | http-204 | **PASS** | allowed=false (http_204) |
| kernel-client | http-302 | **PASS** | allowed=false (http_302) |
| kernel-client | http-500-with-allow-body | **PASS** | allowed=false (http_500) |
| kernel-client | http-200-not-json | **PASS** | allowed=false (unreadable_response) |
| kernel-client | fetch-throws | **PASS** | allowed=false (network_error) |
| kernel-client | never-answers-timeout | **PASS** | allowed=false (timeout) |
| kernel-client | plain-http-remote-origin | **PASS** | allowed=false (api_url_refused) |
| kernel-client | extra-input-field-smuggled | **PASS** | allowed=false (malformed_input) |
| kernel-client | amount-missing-on-spend | **PASS** | allowed=false (allow_not_bound_to_request) |
| kernel-client | requireKernelAllow-throws-on-refusal | **PASS** | allowed=false (KernelRefusedError) |
| kernel-client | kernel-allow-is-unsigned | **INFO** | (not published here) |
| action-coverage | P0 direct call, harness not used | **INFO** | (not published here) |
| action-coverage | P1 wrapExecute record-only (VETO) | **INFO** | (not published here) |
| action-coverage | P2 wrapExecute blocking (VETO) | **INFO** | (not published here) |
| action-coverage | P3 requireKernelAllow, kernel says DENY | **INFO** | (not published here) |
| action-coverage | P4 requireKernelAllow, kernel unreachable | **INFO** | (not published here) |
| action-coverage | P5 requireKernelAllow, kernel ALLOW | **INFO** | (not published here) |
| action-coverage | P6 caller catches the refusal and acts anyway | **INFO** | (not published here) |
| action-coverage | P7 effect in a spawned process | **INFO** | (not published here) |
| action-coverage | note | **INFO** | (not published here) |
| action-coverage | refusal-prevents-effect-when-honoured | **PASS** | P3: 0 effect(s); P4: 0 effect(s) |
| bundle | model-swap-weakens-guardrails | **NOT_CHECKED** | no signed bundle / import command exists in this candidate (Lane B's bundle has not reached it); re-run when it does |
| contrib | (withheld) | **NOT_CHECKED** | (withheld; verdict INVALID) |
| contrib | (withheld) | **NOT_CHECKED** | (withheld; verdict INVALID) |
| contrib | (withheld) | **NOT_CHECKED** | (withheld; verdict INVALID) |
| contrib | (withheld) | **NOT_CHECKED** | (withheld; verdict INVALID) |
| contrib | (withheld) | **NOT_CHECKED** | (withheld; verdict INVALID) |
| contrib | (withheld) | **PASS** | (withheld; verdict NOT_REPRODUCED) |
| contrib | (withheld) | **PASS** | (withheld; verdict NOT_REPRODUCED) |
| contrib | (withheld) | **PASS** | (withheld; verdict NOT_REPRODUCED) |