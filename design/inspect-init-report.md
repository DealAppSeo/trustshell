# Design — `inspect`, `init`, `report`

Status: **BUILT 2026-09-08**, except the OpenClaw seam. `init`, `inspect` and
`report` ship as `src/lib/{init,inspect,report}.ts` + `src/lib/profile.ts`, wired
into the CLI and covered by `tests/inspect-init-report.test.ts`. The one thing
still open is step 5 — the OpenClaw plugin interface — and `init` says so out
loud in its own output rather than pretending it wired one.

Two things changed from this design during the build, both recorded because the
design is what the next reader will trust:

- A fourth `inspect` verdict, **`NO_LOG`**, for a file that is not there. The
  design listed three. A missing log is NOT CHECKED, not UNCHAINED, and it exits
  3 with the rest of the NOT-CHECKED family.
- `sectionBody` first used `\Z` to mean end-of-input, which JavaScript does not
  have. Every section silently parsed as empty and the tests caught it. A regex
  that fails by returning `""` rather than throwing is the shape of bug that
  reaches production looking like an empty config.

Originally: **PROPOSED.** Nothing here was built. `check` shipped in 1.4.0; these three
are the rest of the set. Target 1.5.0 (additive; `verify` / `repid` / `proof` /
`badge` / `check` unchanged).

Two decisions were taken by Sean rather than inferred, and they shape everything
below:

1. `.trustshell/profile.md` carries **all three** kinds of content — identity,
   agent context, and trust settings — switchable per section, **defaulting to
   the most private setting**.
2. `inspect` uses **TrustShell's own chained format, plus adapters** for logs
   written by other tools.

## Why this file is in `design/` and not `docs/`

The first draft sat in `docs/`, and `tests/docs.test.ts` failed it immediately —
it names `trustshell init`, `inspect` and `report`, none of which exist.

That guard is right, and the precedent is nearly word for word: it was written
because `docs/api-reference.md` once documented four CLI commands that had never
shipped in any build — one of them called `init` — and those docs render publicly
at `trustshell.dev/docs`. A stranger could follow them and find nothing.

A proposal for unbuilt commands is not documentation, so it does not belong on
the surface that promises the reader things exist. `design/` is outside the
scanned set. When these commands are real, their user-facing docs move into
`docs/` and the guard will then be checking a true claim.

## The one-line thesis these three have to serve

> *"Your AI says it's done. Check it."*

`check` answers that from **outside** evidence — what GitHub can confirm.
`inspect` answers it from **inside** evidence — what the agent actually did.
`report` puts the two side by side and names where they disagree.

## Egress — the whole point, stated first

| command | network |
|---|---|
| `init` | **none** |
| `inspect` | **none** |
| `report` | **none** |
| `check` | `api.github.com` only (shipped 1.4.0) |

Three of the four never open a socket. `report` is explicitly **not** allowed to
fetch: if it wants a GitHub fact it consumes `check --json` output the operator
already produced. That keeps "what left my machine" answerable by reading one
row of a table, and it is the reason the split exists.

---

## `init`

```
trustshell init [--force]
```

Creates `.trustshell/` and writes `profile.md` if absent. Never overwrites
without `--force`. No network, no account, no telemetry.

`.trustshell/` is gitignored (landed in 1.4.0). `lib/profile.js` — the reader,
writer and validator — is committed. **The generator ships; what it generates
does not.**

### `profile.md` — three sections, all off by default

```markdown
---
trustshell_profile: 1
share_identity: false
share_context: false
---

# Identity
<!-- Empty on purpose. `init` does NOT read your git config, hostname,
     username or email. Fill this in only if you want a report to say who
     ran it. Nothing here is transmitted; `report` includes it only when
     share_identity is true. -->

# Context
<!-- Standing notes for an agent working in this project. Read by the
     OpenClaw shell. Never included in a report unless share_context is true. -->

# Trust settings
autonomy: ask_first
confidence_gate: 0.8
hitl_gate: 70
```

**Why blank rather than auto-filled.** The safest default for a file that may be
read by an agent and summarised into a shareable artefact is to contain nothing
the operator did not deliberately write. Auto-detecting a name and email is a
convenience that silently converts a local file into a disclosure the moment
anyone runs `report`. `init` therefore collects **nothing**, and says so in the
file itself.

**The trust-settings values are not invented here.** `autonomy` uses the same
vocabulary as the existing `tool_call_log` (`just_do_it` | `do_then_tell` |
`ask_first`) and the gates are the project's canonical `CONFIDENCE_GATE = 0.8`
and `REPID_HITL_GATE = 70`. The defaults are the most conservative of each:
`ask_first`, not `just_do_it`.

**OpenClaw seam — NOT DESIGNED.** `init` should be able to register the recorder
with the OpenClaw shell. The plugin is not in this repository, so its interface
is unknown and nothing is specified here. `init` will do its local work and print
what remains manual until the plugin's shape is on hand. Inventing that interface
is exactly the failure `AGENTS.md` records.

---

## `inspect`

```
trustshell inspect [--from <format>] [<path>] [--json]
```

Verifies an append-only tool-call log and reports what it can and cannot
establish.

### The native format — `.trustshell/session.jsonl`

One JSON object per line, append-only, hash-chained:

```
{"seq":1,"ts":"…","tool":"Bash","input_sha256":"…","output_sha256":"…","prev":null,"hash":"…"}
```

*(Schema, not a card from a real run. No example verdict output appears in this
document or the README — a rendered card is a claim about a session that
happened.)*

Three properties, each deliberate:

**Outputs are hashed, never stored.** `output_sha256` only. This mirrors the
org's existing `tool_call_log`, which already hashes `tool_output` and never
keeps it raw. A local audit log that quietly accumulates verbatim command output
is a secret-leak waiting to happen; a hash still proves the output has not
changed.

**`seq` is read from the last line. No Map, no sidecar.** To append: read the
final line, parse it, use `seq + 1` and take `prev` from its `hash`. One read
gives both. There is no counter file to fall out of sync, nothing held in memory
across a crash, and no second source of truth about how many entries exist. The
file *is* the state. This is Sean's rule and it is the right one — a sidecar
counter is a second thing that can disagree with the log, which is the defect
this whole product is about.

**The chain is what makes it evidence.** Each line's `prev` is the previous
line's `hash`, so removing or editing a line breaks every line after it.

### Verdicts

| verdict | meaning | exit |
|---|---|---|
| `INTACT` | every line's `prev` matches; nothing removed or edited | 0 |
| `BROKEN` | the chain does not verify — lines were altered or dropped | 1 |
| `UNCHAINED` | a foreign log with no chain — **NOT CHECKED**, not "fine" | 3 |

`UNCHAINED` is not a failure and is not a pass. It is the honest verdict for
every adapter below, and it exits 3 for the same reason `check`'s `INCONCLUSIVE`
does: a script must not read "we could not verify" as "verified".

### Adapters

`--from claude-code <path>` reads Claude Code's own JSONL transcripts,
**read-only**. It can report what the transcript says happened; it cannot report
`INTACT`, because a log we did not chain proves nothing about its own integrity.
Adapters always yield `UNCHAINED` and say why in the card.

**`--from symphony` is deliberately absent.** The Symphony logger writes to
Postgres, not a local file, and pointing `inspect` at it would make a local,
no-account, no-egress command open a database connection. That is a different
product. It is later dogfood, as specified.

---

## `report`

```
trustshell report [--session <path>] [--evidence <check.json>] [--json]
```

Reads a session log and, optionally, saved `check --json` output, then states
what the two together support. **No network.**

### Verdicts

| verdict | meaning | exit |
|---|---|---|
| `CONFIRMED` | the claim is supported by the evidence supplied | 0 |
| `INCONSISTENT` | the log and the external evidence disagree | 1 |
| `UNSUPPORTED` | a claim with no evidence either way | 3 |

The word is **`INCONSISTENT`**, never "contradicted". Two records disagreeing is
a fact about the records. "Contradicted" reads as a finding about the agent's
honesty, which this tool cannot establish and should not imply.

`UNSUPPORTED` exits 3, alongside `check`'s `INCONCLUSIVE` and `inspect`'s
`UNCHAINED`. Across all three commands **exit 3 means NOT CHECKED**, and it is
never 0.

### What a report may not do

- **It may not fetch.** Evidence arrives as a file the operator produced.
- **It may not include identity or context** unless the corresponding
  `share_*` flag in `profile.md` is true. Both default false.
- **It ends with what it does not prove**, as `check` does. A report with no
  limits section is a marketing artefact, not evidence.

---

## Build order

1. `lib/profile.js` + `init` — nothing else can be configured until this exists.
2. `inspect` native format + the writer that appends to it.
3. `report`, once there is a log to report on.
4. The `claude-code` adapter.
5. The OpenClaw seam, once the plugin's interface is known.

## Open, and needing Sean rather than a guess

- **The OpenClaw plugin interface.** Blocking step 5 only.
- **Who writes `session.jsonl`.** The recorder has to be *in* the agent's loop.
  Whether that is the OpenClaw plugin, a Claude Code hook, or an SDK call the
  agent makes is a real fork, and it decides how much of this is usable outside
  the OpenClaw shell.
