# Toolbelts: a proof, not a product

A toolbelt is one task's worth of agent capability that can move between agent runtimes: an
[Agent Skills](https://agentskills.io/specification) folder (`SKILL.md`) plus a small manifest beside it
(`toolbelt.json`: version, the sha256 of each file, the permissions it needs, the hosts it reads, the notes it
references, and a known answer it must reproduce). Nothing here is in the npm package.

There is one belt, [`inspect-run`](inspect-run/SKILL.md): `trustshell check <runUrl> --claims` (CLI) or
`inspect_run` (trustshell-mcp), checking claims about a public GitHub Actions run against GitHub's record.

It adds no grant format. The grant is the Guard owner policy (`trustshell guard`), it travels in the Carry bundle
(`trustshell bundle`, see [docs/guard-carry-demo.md](../docs/guard-carry-demo.md)), and the CLI gate and
trustshell-mcp decide every call against it. The proof's harness only checks that the belt files, the bundle and the
grant in force are the ones the owner signed, and seals a passport and a receipt that name the belt version.

## Run it

From a clone with `npm ci` (dist/ is committed). Node 22.13 or later.

```bash
node scripts/toolbelt-proof.mjs --out toolbelt-proof-out
```

Two runtimes, the CLI and trustshell-mcp, each in its own temporary `TRUSTSHELL_HOME`; about four unauthenticated
reads of api.github.com; it waits about 90 s for the grant to expire. Exit 0 means every property line it prints
held as stated, including the lines that say what is NOT proven.

```bash
npx jest tests/toolbelt-inspect-run.test.ts   # the negative tests, offline
node scripts/toolbelt-mutation.mjs           # removes each protection and requires its test to go red
node scripts/toolbelt-harness.cjs verify toolbelt-proof-out   # re-check a run's receipts from its files
```

## What it does not show

Everything runs as one OS user on one machine, so "two runtimes" and "no credential was copied" are
same-controller results. A copied `policy.json` is honoured (the grant is a file, bound to no runtime). A runtime
with no grant of its own is refused only because the belt sets `TRUSTSHELL_REQUIRE_POLICY`; that refusal leaves no
guard record. `bundle export` cannot carry a grant narrower than `tool:bundle`, because the export is gated by the
policy it exports, so the proof builds the bundle with the same library function. Discovery by a real agent
runtime (Claude Code, OpenClaw) was not run.
