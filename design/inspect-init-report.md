# Design — `inspect`, `init`, `report`

Status: **BUILT.** All three shipped in #111 and are in the CLI's `Command` union
alongside `verify` / `repid` / `proof` / `badge` / `check`. This file is kept as
the design record — why each verdict is worded the way it is, what was decided
rather than inferred — not as the reference. **The user-facing reference is
[`docs/api-reference.md`](../docs/api-reference.md).**

Two decisions were taken by Sean rather than inferred, and they shape everything
below:

1. `.trustshell/profile.md` carries **all three** kinds of content — identity,
   agent context, and trust settings — switchable per section, **defaulting to
   the most private setting**.
2. `inspect` uses **TrustShell's own chained format, plus adapters** for logs
   written by other tools.

## Why this file stayed in `design/`

The first draft sat in `docs/`, and `tests/docs.test.ts` failed it immediately —
it named `trustshell init`, `inspect` and `report`, none of which existed then.

That guard is right, and the precedent is nearly word for word: it was written
because `docs/api-reference.md` once documented four CLI commands that had never
shipped in any build — one of them called `init` — and those docs render publicly
at `trustshell.dev/docs`. A stranger could follow them and find nothing.

A proposal for unbuilt commands is not documentation, so it did not belong on the
surface that promises the reader things exist. `design/` is outside the scanned
set.

**The commands are real now, so the user-facing half moved into
`docs/api-reference.md` and the guard is checking a true claim.** What stayed
here is the reasoning, which a reference page should not carry. The move also
surfaced the quieter half of the same defect: `badge` and `check` had shipped
and were documented on that page nowhere at all. `tests/docs.test.ts` now asserts
the union in **both** directions — no documented command that does not exist, and
no shipped command that is not documented.

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
| `NO_LOG` | no log, or an empty one — **NOT CHECKED** | 3 |

**`NO_LOG` was not in this design, and leaving it out was a defect the security
review caught.** As specified, an absent or empty log has no broken links, so
`breaks.length === 0` was vacuously true and `inspect` answered `INTACT` exit 0 —
and `report` then read that as `CONFIRMED`. Nothing distinguished "the chain
holds" from "there was nothing to check", which is the single failure this whole
product exists to name. A three-outcome design still collapses to two if one of
the outcomes can be reached by measuring nothing.

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

## Build order — 1-4 DONE, 5 open

1. ~~`lib/profile.ts` + `init`~~ — **shipped.**
2. ~~`inspect` native format + `nextEntry`, which derives the next line from the
   file's own last line~~ — **shipped.**
3. ~~`report`~~ — **shipped.**
4. ~~The `claude-code` adapter~~ — **shipped** as `readClaudeCode`, and it can only
   ever return `UNCHAINED`, as specified.
5. The OpenClaw seam, once the plugin's interface is known. **Still open.**

`nextEntry` is a pure helper. Nothing calls it from inside an agent's loop yet,
so the native log is a format the CLI can verify rather than one anything
currently writes — which is the open question immediately below, not a gap in
these three commands.

## Open, and needing Sean rather than a guess

- **The OpenClaw plugin interface.** Blocking step 5 only.
- **A trust anchor for the chain.** Every `INTACT` and every `CONFIRMED` says out
  loud that the hashes are unkeyed and reproducible by anyone who can write the
  file. An HMAC key or a pinned head hash would change that from a caveat into a
  property — and it is a design decision (where the key lives, who holds it),
  not a cleanup.
- **Who writes `session.jsonl`.** The recorder has to be *in* the agent's loop.
  Whether that is the OpenClaw plugin, a Claude Code hook, or an SDK call the
  agent makes is a real fork, and it decides how much of this is usable outside
  the OpenClaw shell.
