# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Developers building AI agents who need to check what an agent says it did before they rely on it. Three communities matter now: ERC-8004 builders (agent identity and reputation on-chain), x402 builders (agents paying and being paid per request), and OpenClaw builders (agents that work unattended through tool calls). A second, smaller audience is the general visitor who pastes one AI answer into the hosted check.

## Product Purpose
"Your AI says the job is done. TrustShell checks the evidence. Receipts, not promises." TrustShell sets what an agent said beside what the record shows, says plainly what it could and could not check, and refuses actions its owner did not authorize. Success today: an outside developer runs the five-minute challenge from npm with no account or key, gets the documented result, and reports a limitation or bypass.

## Positioning
Owner-controlled authority, evidence-backed actions, portable context and earned autonomy, as one harness that works with any model. This is shown with a reproducible demo (the pinned-run challenge), never asserted as unique: no comparative research supports "nobody else does this".

## Operating Context
- `npx @hyperdag/trustshell check <run-url> --claims-file <file>` (Inspect): reads one public GitHub Actions run from api.github.com, no account, no key. Developer preview, in npm `latest` (1.8.0).
- trustshell.dev: the hosted sentence check (sends text to the engine), `/inspect` (the challenge), `/docs`.
- Developers arrive from GitHub, npm and their community channels; they evaluate by running a command, not by reading claims.

## Capabilities and Constraints
- Live: Inspect (claims checked against a CI run; SUPPORTED / CONTRADICTED / NOT_CHECKED; exit 0 / 1 / 3); spend refusals before signing (origin, policy, cap); the hosted sentence check.
- Prototype (draft PR, not released): Guard (an owner policy the CLI enforces) and Carry (a signed bundle that moves settings and memory to another model).
- Roadmap: Earn (verified outcomes feeding portable reputation and autonomy ceilings).
- Testnet only: ERC-8004 identity and reputation on Base Sepolia; x402 payment is key-gated (API key plus a funded Base Sepolia wallet). No mainnet.
- Copy rules (TRUE_NORTH Art. 2 and 3, CLAUDE_RULES r22/r31): print only what is VERIFIED; "developer preview" and "help us test", never "launched"; no uniqueness claims; no accuracy number without its ruler; never claim every action is intercepted. New public copy is MAJOR: Sean approves each change.

## Evidence on Hand
- The pinned-run challenge: `docs/challenge.md`, verified from npm on 2026-10-21 (`E:\dev\reports\2026-10-21\trustshell-shareable\npm-challenge-card.md`).
- Red-team results on the release candidate: `E:\dev\reports\2026-10-21\RC_ATTACK_rc3-26e81c13.md` (Lane D).
- Absent, never to be implied: outside users (0 so far), trades between different owners, an evidence-bound ERC-8004 feedback demo (blocked on trustshell #589 leg 2), an OpenClaw adapter, a HAL accuracy figure with its ruler, testimonials, customers.

## Product Principles
- Evidence over claims: every public sentence maps to a file, test, run or source.
- Unknown is an answer: NOT_CHECKED is shown, never rounded up to a pass.
- Invite people to break it: a bug we accept and fix gets a regression test in the repo's own suite.
- One primary action per surface: today it is "Try Inspect".

## Accessibility & Inclusion
WCAG 2 AA on every page (contrast, keyboard focus, no horizontal scroll at 375 px). Instructions for Windows PowerShell beside bash.
