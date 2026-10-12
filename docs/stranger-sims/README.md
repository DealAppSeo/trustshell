# Stranger sims

Four transcripts of a stranger doing the path with no one in the room: **happy**, **refused**, **cold install**, **phone width**.

Run 2026-10-12 from a cloud sandbox. Branch `claude/bold-turing-icz50x-stranger-path` (PR #518).
Outcomes are VERIFIED / NOT_CHECKED / FAILED. Every block below is pasted from a real run; each says which engine it talked to.

## Who the engine was, in every transcript

| label | meaning |
|---|---|
| **LIVE** | the production engine `repid-engine-production.up.railway.app`, called from this sandbox. Read-only calls, plus the anonymous `classify` check. Nothing was registered, staked or spent on production. |
| **STUB** | the browser walk's stub engine on `127.0.0.1`. It proves the pages and their client paths against a known-good response shape, never that production returns that shape. |
| **UNIT** | jest, with `fetch` stubbed. |
| **ENGINE-CI** | the engine's own test suite, run read-only against `repid-engine` `origin/main` (4b4bec84). |

## What these sims did NOT do (NOT_CHECKED)

- No real wallet signed anything and no transaction reached Base Sepolia. The bind and the spend cap run against a fake EIP-1193 wallet and a stub chain.
- No real email code on production (the practice stake asks for one).
- No logged-in check on the five chat sites, and no Chrome Web Store install.
- Whether the engine's score pipeline itself reads PROVISIONAL / SETTLED. The label is on the kernel receipt; this branch only shows what the receipt says.
- A known answer settling a score. The web has no settler: the known-answer table is hash-only and keyed off-repo. The web path therefore shows the score unchanged, and says why.

## Files

- [happy-path.md](happy-path.md): install, name, belt, check, receipt, bind, faucet, practice stake, limit to zero.
- [refused-path.md](refused-path.md): limit zero, a bad signature, a payee off the list, Not checked. Each is a receipt and no spend.
- [cold-install.md](cold-install.md): `npm i @hyperdag/trustshell` into an empty directory.
- [phone-width.md](phone-width.md): the four screens at 390px, with pictures.

Re-run the browser part: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/e2e/stranger-path-walk.mjs` (builds in-suite; `SHOT_DIR=<dir>` also writes the pictures).
