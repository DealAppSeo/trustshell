# Action evidence record (`dev.trustshell.action-evidence/0.1-draft`)

`trustshell check <runUrl> --claims <file|text>` reads a public GitHub Actions run from
api.github.com, then compares what an agent *said* (a "done" message, a PR description) with what
the run *reports*. The output is one record plus a card drawn from it.

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
| `claims[]` | One entry per claim a template read: `text`, `template`, `status`, `evidence_fields` (RFC 6901 pointers into the observation), `scope`, `reason`. |
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
| `SUPPORTED` | The run's record matches the claim **within the `scope` written next to it**. Nothing broader. |
| `CONTRADICTED` | The claim names a value that differs from the record (another SHA, run or attempt), or says tests pass when the run failed. The `reason` names both values. |
| `NOT_CHECKED` | No template could compare it, or the evidence was missing. Never a pass. |

## Templates

Deterministic regular expressions over the claim text, and equality over observation fields.

| Template | Reads | SUPPORTED when | Otherwise |
|---|---|---|---|
| `ci.run_passed` | "tests pass", "CI is green", "all checks pass", "the build passes" | check's verdict is COMPLETE, at least one job concluded success, and every job is on this `head_sha` and attempt | CONTRADICTED on conclusion `failure`, `timed_out` or `startup_failure`, or on a failed job. NOT_CHECKED if the run is unfinished, cancelled or skipped, or its jobs were missing, unreadable, truncated or all skipped. A negated or partial claim ("most tests pass", "… but lint fails") is NOT_CHECKED. |
| `git.head_sha` | "commit abc1234", "fixed in abc1234", `` `abc1234` ``, a `/commit/` link | `head_sha` begins with the named SHA | CONTRADICTED |
| `gha.run_id` | "run 123456", a run link (with `/attempts/N`) | run id, repository and any attempt match | CONTRADICTED |
| `gha.run_attempt` | "attempt N" without a run id | `run_attempt` equals N | CONTRADICTED |
| `excluded.*` | completion ("done"), security, absence of bugs, readiness, whether a fix works, local runs, test counts, coverage, deployment, performance, review | never | always NOT_CHECKED, with the reason |
| `unmapped` | a sentence no template reads | never | NOT_CHECKED |

What is not read as a claim: HTML comments, headings, fenced code and unticked task-list items
(`- [ ] …`). A ticked item (`- [x] …`) is read. After 200 sentences the rest are not read, and
one NOT_CHECKED entry says how many.

Claim text is normalised before it is stored: control characters, bidirectional overrides and
zero-width characters are removed, whitespace is collapsed, and a sentence is cut at 300
characters. Text from outside (claims, and workflow or job names from someone else's repository)
is never spliced into generated sentences; on the card it appears only in code spans (Markdown)
or entity-escaped (HTML).

A run URL that names an attempt (`…/attempts/N`) is refused when GitHub's run endpoint answers
for a different, later attempt: the record would otherwise describe an attempt nobody asked about.
