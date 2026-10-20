# Action evidence record (`dev.trustshell.action-evidence/0.1-draft`)

`trustshell check <runUrl> --claims "<text>"` (or `--claims-file <path>`) reads a public GitHub
Actions run from api.github.com, then compares what an agent *said* (a "done" message, a PR
description) with what the run *reports*. The output is one record plus a card drawn from it.

**The rule it is built to keep: never claim more than the evidence proves.**
- Each claim is split into atomic parts, and each part gets its own verdict.
- One successful workflow run supports "this workflow run succeeded", and nothing wider.
- Deny by default: a verdict is given only when every line is a plain claim line the templates
  read end to end. Markdown is not rendered, so a Markdown PR description is NOT_CHECKED as a whole.

**Status: draft.** The schema id ends in `-draft` and may change. Nothing here is signed.

## Command

```bash
trustshell check https://github.com/OWNER/REPO/actions/runs/RUN_ID --claims-file pr-body.md
```

| Option | Effect |
|---|---|
| `--claims "<text>"` | The claim text. **Always text, never a path.** |
| `--claims-file <path>` | Read the claim text from a file (256 KiB limit). This is the only way a file is read. |
| `--json` | Print `{ record, digest }` instead of the Markdown card. |
| `--out <dir>` | Also write `record.json`, `card.md` and `card.html` into `<dir>`. |
| `--demo` | Add a fixed DEMO banner to both cards. |

**Why two flags.** An earlier draft read `--claims <file|text>` as a file whenever the value named
one. Automation that passed untrusted text, such as `--claims "$PR_BODY"`, then let the author
name `../../.env` instead, and the file's contents landed on a card meant to be posted.

**Egress:** api.github.com only, the same two requests as `check <runUrl>`. No model, no
TrustShell backend. `OFFLINE=1` sends nothing and prints NOT_CHECKED (exit 2).
`scripts/check-egress.cjs` runs the command with the network stubbed to hold this.

**Exit codes:**
- **0:** every claim is SUPPORTED on a COMPLETE run.
- **1:** a claim is CONTRADICTED, or the run FAILED or is INCONSISTENT.
- **3:** anything is NOT_CHECKED. Text with nothing checkable in it exits 3, not 0.

## The record

Exactly five top-level members:

| Member | Contents |
|---|---|
| `schema` | `dev.trustshell.action-evidence/0.1-draft` |
| `observation` | What `check` read. Fields: `owner`, `repo`, `run_id`, `run_attempt`, `workflow {name, path}`, `head_sha`, `status`, `conclusion`, `check {verdict, results}` (check's own verdict and rows), `jobs {http_status, total, items}`, `fetchedAt`, `freshness: "LIVE"`, plus `platform`, `host` and the canonical run `url`. Strings are kept as GitHub sent them, except that an unpaired surrogate becomes U+FFFD. |
| `claims[]` | One entry per atomic claim: `claim` (the exact span a template matched), `sentence` (where it came from), `template`, `status`, `evidence_fields` (RFC 6901 pointers into the observation), `scope`, `reason`. |
| `assurance` | `cryptographic_integrity: "NOT_CHECKED"` (no attestation is read, and the type allows nothing else) and `observation: "PLATFORM_REPORTED"`. |
| `does_not_prove[]` | The sentences a reader must not lose. |

**Digest.** `digest.value` is the SHA-256 of the UTF-8 bytes of the record's RFC 8785 (JCS)
canonical form, computed by `src/lib/jcs.ts` and tested against the RFC's own vectors. It shows
whether the record changed after it was made. It does not show who made it.

**Why `PLATFORM_REPORTED`.** Every observed fact is GitHub's API describing GitHub's own run. That
is a platform record. It is never presented as an independent grade.

## Statuses

| Status | Meaning |
|---|---|
| `SUPPORTED` | The run's record establishes this atomic claim **within the `scope` written next to it**, and nothing broader. |
| `CONTRADICTED` | The record conflicts with the claim: it cites another commit, run or attempt, or says this workflow run, or a check on this commit, succeeded when it did not. The `reason` names both values. |
| `NOT_CHECKED` | The record cannot decide it, the evidence was missing, nothing ties the claim to this run, or its sentence was not read end to end. Never a pass. |

## How the claim text is read: deny by default

Nothing is rendered or normalised before a decision. A verdict is given only for **plain claim
lines**. A line is plain when it:
- is printable ASCII only: no control character, no tab, nothing that would need normalising;
- starts with a letter, so it is not a list marker, heading, quote, number or indented line;
- holds none of `< > \` [ ] ( ) | * _ # ~ \ $ & { } ?`, that is, no Markdown, HTML, escape, math or
  entity syntax, and no question mark;
- is one sentence (no `. `, `! ` or `; ` followed by more text);
- is at most 200 characters;
- is its own paragraph: a blank line before and after it. GitHub joins consecutive lines into one
  paragraph, so "Locally" on the line above a claim, or "locally." on the line below, changes what
  the claim says. Two non-blank lines with no blank line between them block the text.

A line holding only spaces or tabs is blank. A line holding a no-break space, or any other
invisible character, is not blank: it is a non-ASCII line, and it blocks the text. The one
exception is a single byte-order mark at the very start of a `--claims-file`, which is dropped:
Windows PowerShell 5.1 writes one for `Out-File` and `Set-Content -Encoding utf8`.

Any other line is listed exactly as written (cleaned of control and invisible characters for
display) as `excluded.markup`, NOT_CHECKED, with its line number and the reason.

**One line that is not a plain claim the templates read end to end blocks every verdict in the
text.** That covers a Markdown line, a line with words no template reads ("That is false.", a
cross mark), and a line that opens with an auxiliary verb ("Has the check workflow passed …").
Nothing here can tell what such a line does to the others, so nothing is SUPPORTED or
CONTRADICTED. Everything is still listed, and the reason names the first blocking line.

**Why.** Four adversarial review rounds found Markdown that an earlier hand-written renderer got
wrong, in ways that hid visible text or certified an example: comments, code, link definitions,
soft line breaks, normalisation order. The count of bypasses did not converge. So this version
does not render Markdown at all. A PR description written in Markdown comes out NOT_CHECKED as a
whole. To have claims checked, write them as plain lines:

```
The check workflow passed on 5cd68edc782f, run 39290226738, attempt 1.

All tests pass on 5cd68edc782f.
```

**Within a readable text:**
- **Every part of a line is listed.** Templates match spans, and whatever a line says outside them
  becomes its own `unmapped` NOT_CHECKED claim, which blocks the text.
- **Unread content is judged by an allow-list.** A leftover says nothing only if it holds no more
  than spaces, `. , ; : ' " ! -`, and a short list of filler words (articles, plain prepositions,
  and the copulas the templates already read around). Possessives ("my checks") count as unread.
- **Ties are per line.** A line's own citations decide which run it is about. A citation on one line
  says nothing about the next. An attempt number never ties anything; it can only break a tie, when
  it does not match.

## Templates

**Citations** say which run a claim is about:

| Template | Reads | SUPPORTED when | Otherwise |
|---|---|---|---|
| `git.head_sha` | "commit abc1234abcd", "on abc1234abcd", "fixed in abc1234abcd", a `/commit/` link on `github.com` | `head_sha` begins with the cited SHA **and** the citation is at least 12 hex characters | CONTRADICTED when `head_sha` does not begin with it, at any length. NOT_CHECKED when it matches with fewer than 12: a 7-character prefix is 28 bits, and a commit with that prefix can be made on purpose |
| `gha.run_id` | "run 123456", a run link on `github.com` or `www.github.com` (not `agithub.com`, not a subdomain) | same run id and repository | CONTRADICTED |
| `gha.run_attempt` | "attempt N", `/attempts/N` in a run link | `run_attempt` equals N | CONTRADICTED |

**Outcomes** are compared only when the line cites this run's commit or run id and nothing that
does not match:

| Template | Reads | SUPPORTED | CONTRADICTED | NOT_CHECKED |
|---|---|---|---|---|
| `gha.run_succeeded` | "the workflow passed", "the check workflow succeeded", "run 123456 passed" | conclusion `success`, every job read, at least one job ran, all on this commit and attempt; **and** the line cites the run id (a workflow name, if the line gives one, must be this workflow's) | the run finished with another conclusion (same identification required) | the run is unfinished, or has no readable conclusion; jobs missing, unreadable, truncated, all skipped, or on another commit (or with no commit); a success run with a failed job; a commit cited without the run id, even with the workflow named (a commit has many workflow runs, and two workflow files can share one display name); another workflow named |
| `ci.all_checks_pass` | "all checks pass", "CI is green", "everything is green" | **never**: one run is not every check | the run concluded `failure`, `timed_out` or `startup_failure`, or one of its jobs did | otherwise, including every green run |
| `ci.tests_pass` | "all tests pass", "the unit tests are green" | **never**: a run record does not say which tests ran | **never**: a failed run does not say a test failed | always |
| `ci.build_unscoped` | "the build passes" | never: names no workflow or check | never | always |

**Exclusions** are named and always NOT_CHECKED, with the reason: completion ("done"), security,
absence of bugs, readiness, whether a fix works, local runs, test counts, coverage, deployment,
performance, review.

## Guided mode: `--guided` (EXPERIMENTAL)

```
trustshell check <runUrl> --claims "All checks pass." --guided
```

Guided mode is for the case where **whoever runs the check names the run** and types the claims.
That is the guided form tested in the CLAIMS-v1 experiment. It changes two things, and nothing else:

1. **A claim line that cites nothing is read as being about this run.** It is bound to the run, but
   only when nothing in the text points elsewhere:
   - every citation in the text is SUPPORTED (no other commit, run or attempt);
   - no line names something a run cannot show (a local run, a deployment, "production ready");
   - every line was read.

   Otherwise, nothing is bound.
2. **Every check on the run's commit is read**, so "All checks pass." / "CI is green." can be
   decided. That covers:
   - the latest run of each check run, and every earlier attempt;
   - commit statuses and check suites;
   - the base branch's required checks (rulesets);
   - whether the change edits `.github/workflows`.

   The base branch and the change come from the pull request whose head is that commit. A commit
   with none, such as a push, uses the default branch and the commit's own files.

**"All checks pass." is SUPPORTED only when every one of these holds:**
- the whole list was returned;
- every check run concluded `success` and every status is `success` (skipped, neutral and cancelled checks did not pass);
- no GitHub Actions suite, and no suite that has runs, is still pending;
- every required check reported and passed;
- the inspected run concluded success, with each of its jobs in the list;
- no check failed on an earlier attempt and was re-run until green;
- the change does not edit its own workflows.

**It is CONTRADICTED when any check failed.** Anything else is NOT_CHECKED, and the reason says which
condition stopped it. A queued suite with no runs, from an installed app that never acts on the
repository, is ignored: every commit we measured had eight or more.

**Known consequence.** In a repository whose required checks run only on pull requests, a push
commit never has them. So "All checks pass." about a push is NOT_CHECKED (for example `5cd68edc` in
the tests).

**What it costs.** More requests to api.github.com, and nothing else: about eight for a commit with
one pull request. Anonymous reads are limited to 60 an hour; `GITHUB_TOKEN`, if set, only raises
that, exactly as for `check`. `OFFLINE=1` still sends nothing.

**The record.** `observation.commit_checks` holds what was read, with every API path and its HTTP
status. A record is guided exactly when that member is present, so its claims can be re-derived
from the record alone. `does_not_prove` drops "only this one workflow run was read", and adds that
binding is an interpretation of the text and that checks can change after they are read. The card
shows "Guided mode (experimental)" and counts the checks, but does not print their names.

**How it was tested before it existed here.** The same logic ran in shadow (CLAIMS-v1):
- **Dev set:** 30 real PRs of this repository. Guided "All checks pass." went from 0/30 decided to
  21 SUPPORTED, 1 CONTRADICTED (a real failed check) and 8 NOT_CHECKED, each for a named reason.
- **Adversarial:** 0 false approvals on XC1's 61-input corpus and its 21 stage-2 items.
- **The pre-registered held-back evaluation** is reported in the PR that adds this flag.

## Untrusted input

- **Linear time.** Every pattern runs over text a stranger wrote. CodeQL flagged
  `js/polynomial-redos` on an earlier HTML-comment pattern. That pattern, and four more of the
  quadratic kind found by timing (three citation patterns and a test-count pattern), were replaced.
  `tests/action-evidence.test.ts` times every template against hostile input of 50,000+ characters.
- **Inert on the card and in `--json`.** Every string the card shows passes through the same control and
  invisible-character filter, so a workflow name holding a terminal escape reaches neither card.
  Text from outside (claims, workflow and job names) appears only in code spans in Markdown, or
  entity-escaped in HTML, which also has a CSP of `default-src 'none'`. Generated sentences never
  splice that text in. `--json` and `record.json` write C1 controls, bidi and invisible characters
  as JSON unicode escapes: the same JSON value, so the same digest.
- **No re-pointing.** A run URL that names an attempt (`…/attempts/N`) is refused when GitHub's
  run endpoint answers for a different, later attempt.
