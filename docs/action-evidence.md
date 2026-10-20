# Action evidence record (`dev.trustshell.action-evidence/0.1-draft`)

`trustshell check <runUrl> --claims "<text>"` (or `--claims-file <path>`) reads a public GitHub
Actions run from api.github.com, then compares what an agent *said* (a "done" message, a PR
description) with what the run *reports*. The output is one record plus a card drawn from it.

**The rule it is built to keep: never claim more than the evidence proves.**
- Each claim is split into atomic parts, and each part gets its own verdict.
- One successful workflow run supports "this workflow run succeeded", and nothing wider.
- A sentence decides nothing unless the templates read every word of it.

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

## How a sentence is read

**1. Structure is read from the raw characters; text is normalised only after that.** GitHub parses
what was written, so a fullwidth `＜！－－` is text, not a comment. Blocks, comments and code spans
are found on the raw lines (line endings `\n`, `\r\n` or `\r`). Each paragraph is then normalised
for the templates and shown in that one form:
- Invisible and reordering characters are removed: zero-width characters, soft hyphen, bidi
  controls, variation selectors and the tag block.
- NFKC is applied, so fullwidth digits become digits.
- Controls become spaces. An unpaired surrogate becomes U+FFFD.

A reader can never see a word the checks did not.

**2. A small part of Markdown is read exactly; anything else is refused.** A hand-written reader
cannot model all of CommonMark, so this one models a subset exactly.

Modelled:
- paragraphs, with consecutive non-blank lines joined as GitHub renders soft line breaks;
- list items and their continuation lines;
- task boxes;
- ATX headings (`#`);
- fences opened at column 0;
- HTML comment blocks that start at column 0 and end a line with `-->`. Only their inside is
  dropped, because GitHub does not show it.

Headings, code lines and unticked to-dos are listed, and decide nothing. So does a paragraph whose
inline code holds more than a single identifier: it is shown as code, an example. Paragraph
continuation follows CommonMark: an ordered item not numbered 1, or an empty item, cannot
interrupt a paragraph, so it continues it.

If the text uses **anything else**, it is refused, and **every line is listed and nothing in the
text is decided**. The reason names the construct and its line. Refused constructs:
- blockquotes;
- any other `<` (HTML, autolinks), and bidirectional control characters;
- images;
- link reference definitions (any `]:`), links with a title, and links that span lines;
- tables (`|`);
- footnotes;
- setext underlines and horizontal rules;
- tab indentation and indented code, including a list marker followed by 5+ spaces or a tab;
- fences inside a list;
- comments that never close, or have text after `-->`.

So a parsing mistake can never hide visible text or certify an example. At worst, it refuses text
it could have read.

**3. Every part is listed.** Templates match spans. Whatever a sentence says outside them becomes
its own `unmapped` NOT_CHECKED claim. Nothing a reader can see is dropped, a lone "?" or a cross
mark included.

**4. A verdict needs its whole paragraph read end to end.** If any sentence in a paragraph has
unread content, or is a question, nothing in that paragraph is decided. So "… (run N). ❌" and a
line break into "is false." both block the verdict.
- **Unread content** is an allow-list. A leftover counts as saying nothing only if it holds no
  more than:
  - whitespace;
  - plain ASCII punctuation (`. , ; : ( ) [ ] ' " ! -`);
  - emphasis and code marks (`* _` and the backtick);
  - a short list of filler words (articles, plain prepositions, and the copulas the templates
    already read around).

  Anything else counts: a content word in any script, `~` (strikethrough is a retraction), any
  symbol or emoji, non-ASCII punctuation, and possessives ("my checks" is not "all checks").
- **A question** has a question mark (including ‽ and ؟), or opens with an auxiliary verb. Leading
  emphasis and connectives are skipped first: "*Has* the …", "And is CI green …".

Each paragraph is judged on its own. A later paragraph that refers back ("the above is false") is
listed as NOT_CHECKED, so the exit is 3, but it does not reach back and un-decide an earlier one.

**5. Ties are per sentence.** A sentence's own citations decide which run it is about. A citation in
one sentence says nothing about the next. An attempt number never ties anything; it can only
break a tie, when it does not match.

## Templates

**Citations** say which run a claim is about:

| Template | Reads | SUPPORTED when | Otherwise |
|---|---|---|---|
| `git.head_sha` | "commit abc1234", "on abc1234", "fixed in abc1234", `` `abc1234` ``, a `/commit/` link | `head_sha` begins with the cited SHA | CONTRADICTED |
| `gha.run_id` | "run 123456", a run link | same run id and repository | CONTRADICTED |
| `gha.run_attempt` | "attempt N", `/attempts/N` in a run link | `run_attempt` equals N | CONTRADICTED |

**Outcomes** are compared only when the sentence cites this run's commit or run id and nothing that
does not match:

| Template | Reads | SUPPORTED | CONTRADICTED | NOT_CHECKED |
|---|---|---|---|---|
| `gha.run_succeeded` | "the workflow passed", "the `check` workflow succeeded", "run 123456 passed" | conclusion `success`, every job read, at least one job ran, all on this commit and attempt; **and** the sentence cites the run id, or names this workflow (display name or file stem) and cites the commit | the run finished with another conclusion (same identification required) | the run is unfinished, or has no readable conclusion; jobs missing, unreadable, truncated, all skipped, or on another commit (or with no commit); a success run with a failed job; a commit cited without naming the workflow (a commit has many workflow runs); another workflow named |
| `ci.all_checks_pass` | "all checks pass", "CI is green", "everything is green" | **never**: one run is not every check | the run concluded `failure`, `timed_out` or `startup_failure`, or one of its jobs did | otherwise, including every green run |
| `ci.tests_pass` | "all tests pass", "the unit tests are green" | **never**: a run record does not say which tests ran | **never**: a failed run does not say a test failed | always |
| `ci.build_unscoped` | "the build passes" | never: names no workflow or check | never | always |

**Exclusions** are named and always NOT_CHECKED, with the reason: completion ("done"), security,
absence of bugs, readiness, whether a fix works, local runs, test counts, coverage, deployment,
performance, review.

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
