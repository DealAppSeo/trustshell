# Action evidence record (`dev.trustshell.action-evidence/0.1-draft`)

`trustshell check <runUrl> --claims <file|text>` reads a public GitHub Actions run from
api.github.com, then compares what an agent *said* (a "done" message, a PR description) with what
the run *reports*. The output is one record plus a card drawn from it.

**The rule it is built to keep: never claim more than the evidence proves.** Each claim is split
into atomic parts, and each part gets its own verdict. One successful workflow run supports "this
workflow run succeeded", and nothing wider.

**Status: draft.** The schema id ends in `-draft` and may change. Nothing here is signed.

## Command

```bash
trustshell check https://github.com/OWNER/REPO/actions/runs/RUN_ID --claims pr-body.md
```

| Option | Effect |
|---|---|
| `--claims <file\|text>` | An existing file is read (256 KiB limit). Any other value is the claim text itself. A value shaped like a file name that does not exist is a usage error. |
| `--json` | Print `{ record, digest }` instead of the Markdown card. |
| `--out <dir>` | Also write `record.json`, `card.md` and `card.html` into `<dir>`. |
| `--demo` | Add a fixed DEMO banner to both cards. |

**Egress:** api.github.com only, the same two requests as `check <runUrl>`. No model, no
TrustShell backend. `OFFLINE=1` sends nothing and prints NOT_CHECKED (exit 2).
`scripts/check-egress.cjs` runs the command with the network stubbed to hold this.

**Exit codes:** 0 when every claim is SUPPORTED on a COMPLETE run; 1 when a claim is CONTRADICTED
or the run FAILED or is INCONSISTENT; 3 when anything is NOT_CHECKED. Text with nothing checkable
in it exits 3, not 0.

## The record

Exactly five top-level members:

| Member | Contents |
|---|---|
| `schema` | `dev.trustshell.action-evidence/0.1-draft` |
| `observation` | What `check` read: `owner`, `repo`, `run_id`, `run_attempt`, `workflow {name, path}`, `head_sha`, `status`, `conclusion`, `check {verdict, results}` (check's own verdict and rows), `jobs {http_status, total, items}`, `fetchedAt`, `freshness: "LIVE"`, plus `platform`, `host` and the canonical run `url`. |
| `claims[]` | One entry per atomic claim: `claim` (the exact span a template matched), `sentence` (where it came from), `template`, `status`, `evidence_fields` (RFC 6901 pointers into the observation), `scope`, `reason`. |
| `assurance` | `cryptographic_integrity: "NOT_CHECKED"` (no attestation is read; the type allows nothing else) and `observation: "PLATFORM_REPORTED"`. |
| `does_not_prove[]` | The sentences a reader must not lose. |

**Digest.** `digest.value` is the SHA-256 of the UTF-8 bytes of the record's RFC 8785 (JCS)
canonical form (`src/lib/jcs.ts`, tested against the RFC's own vectors). It shows whether the
record changed after it was made. It does not show who made it.

**Why `PLATFORM_REPORTED`.** Every observed fact is GitHub's API describing GitHub's own run. That
is a platform record. It is never presented as an independent grade.

## Statuses

| Status | Meaning |
|---|---|
| `SUPPORTED` | The run's record establishes this atomic claim **within the `scope` written next to it**. Nothing broader. |
| `CONTRADICTED` | The record conflicts with the claim: it cites another commit, run or attempt, or says this run (or a check) succeeded when it did not. The `reason` names both values. |
| `NOT_CHECKED` | The record cannot decide it, the evidence was missing, or nothing ties the claim to this run. Never a pass. |

## Atomic claims and templates

A sentence is split into the parts templates recognise, and each part gets its own verdict.
"All tests pass and CI is green on 5cd68edc (run 39290226738, attempt 2)" is five claims:
`All tests pass`, `CI is green`, `on 5cd68edc`, `run 39290226738`, `attempt 2`. Whatever is left of
a sentence once the recognised parts are taken out is one more claim, `unmapped` and NOT_CHECKED,
if it has a word that says something. So "CI is not green on b8a17cfb" lists the commit citation
**and** "CI is not green", rather than one green verdict and nothing else.

**Citations** say which run a claim is about:

| Template | Reads | SUPPORTED when | Otherwise |
|---|---|---|---|
| `git.head_sha` | "commit abc1234", "on abc1234", "fixed in abc1234", `` `abc1234` ``, a `/commit/` link | `head_sha` begins with the cited SHA | CONTRADICTED |
| `gha.run_id` | "run 123456", a run link | same run id and repository | CONTRADICTED |
| `gha.run_attempt` | "attempt N", `/attempts/N` in a run link | `run_attempt` equals N | CONTRADICTED |

**Outcomes** are compared only when the text ties them to the inspected run: the sentence cites
this run's commit or run id and nothing that does not match, or, for a sentence that cites
nothing, the text as a whole does. Untied, an outcome is NOT_CHECKED with the reason. A green run
is never evidence for a sentence about another commit.

| Template | Reads | SUPPORTED | CONTRADICTED | NOT_CHECKED |
|---|---|---|---|---|
| `gha.run_succeeded` | "the workflow passed", "the `check` workflow succeeded", "run 123456 passed" | conclusion `success`, every job read, at least one job ran, all on this commit and attempt | the run finished with any other conclusion | the run is unfinished; jobs missing, unreadable, truncated, all skipped or on another commit; a success run with a failed job (the record disagrees with itself) |
| `ci.all_checks_pass` | "all checks pass", "CI is green", "everything is green" | **never**: one run is not every check | the run concluded `failure`, `timed_out` or `startup_failure`, or one of its jobs did: a failing check is a counterexample | otherwise, including every green run |
| `ci.tests_pass` | "all tests pass", "the unit tests are green" | **never**: a run record does not say which tests ran | **never**: a failed run does not say a test failed (it may have been lint) | always |
| `ci.build_unscoped` | "the build passes" | never: names no workflow or check | never | always |

A negated, failing or partial phrasing anywhere in the sentence ("most tests pass", "… but lint
fails") leaves its outcome claims NOT_CHECKED. A local run ("tests pass locally") is not this run.

**Exclusions** are named and always NOT_CHECKED, with the reason: completion ("done"), security,
absence of bugs, readiness, whether a fix works, local runs, test counts, coverage, deployment,
performance, review.

What is not read as a claim: HTML comments, headings, fenced code and unticked task-list items
(`- [ ] …`). A ticked item (`- [x] …`) is read. After 200 sentences the rest are not read, and
one NOT_CHECKED entry says how many.

## Untrusted input

- **Linear time.** Every pattern runs over text a stranger wrote. CodeQL flagged
  `js/polynomial-redos` on an earlier HTML-comment pattern. It, and three more patterns of the same
  shape found by timing them, were replaced. `tests/action-evidence.test.ts` times every template
  against 50,000-character hostile input.
- **Normalised text.** Control characters, bidirectional overrides and zero-width characters are
  removed, whitespace is collapsed, and a stored sentence is cut at 300 characters.
- **Inert on the card.** Text from outside (claims, and workflow or job names from someone else's
  repository) is never spliced into generated sentences. On the card it appears only in code spans
  (Markdown) or entity-escaped (HTML, which also has a CSP of `default-src 'none'`).
- **No re-pointing.** A run URL that names an attempt (`…/attempts/N`) is refused when GitHub's
  run endpoint answers for a different, later attempt.
