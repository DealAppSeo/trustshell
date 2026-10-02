# MERGE_POLICY

Ratified 2026-09-15 by Sean. Agents read this before opening or holding a PR.

## 2026-10-02 — NOBODY MERGES THEIR OWN PR (Sean). This overrides the section below.

- Claude agents (CC1, CC2) merge Grok's PRs. Grok agents (XC1, XC2, XC3) merge Claude's.
- **No agent merges a PR it opened.** Sean may merge any PR.
- The merger checks, on the current head: `check` green, the page does not say conflict,
  the diff does not set `REAL_STAKING`, and the diff does not print a key. Anything else stays open.
- `Strix Security Review` is a required check here. It ignores drafts and does not re-run on push:
  mark the PR ready, and after a fix push comment `@strix-security`.

## Agent MAY squash-merge a draft when all of these are true (superseded above for self-merge)

- Checks green
- No secrets, no prod ids, no `.env`
- No `package.json` version bump
- No "apply this SQL to prod"
- Not `npm publish`

Draft is a review flag, not a hold. After merge, take the next BUS id.
Empty mailbox is not idle.

## Agent MUST NOT

- `npm publish`
- `supabase db push` / apply prod DDL
- Railway env or restart
- Say "MVP launched"
- Open a new PR when a stack branch already exists for that lane

## Still Sean-only

- Publish `@hyperdag/trustshell` / MCP
- Apply `migrations/2026-09-15_kind_custody.sql`
- Railway / prod secrets
- Public launch language

## Stacking

- Engine lane: `feat/xc-2026-09-15-x8-adversarial-harness` (PR #754). Fold extra tests into it.
- TrustShell lane: one stack PR. Do not mint #162+ for the next letter.
