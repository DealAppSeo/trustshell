# DEMO: claims checked against a GitHub Actions run

This folder is a **demo**, not an official TrustShell result. It shows what
`trustshell check <runUrl> --claims-file <path>` produces. Sean picks the official sample run later.

- **The run is real.** It is trustshell's own `check` workflow, run
  [39290226738](https://github.com/DealAppSeo/trustshell/actions/runs/39290226738), on commit
  `5cd68edc`. It was read live from api.github.com with no account and no token (`fetchedAt` in
  `record.json`).
- **The claims are illustrative.** `claims.txt` was written for this demo. It is not a real
  agent's message. It cites attempt 2 on purpose, so that all three statuses appear.

| File | What it is |
|---|---|
| `claims.txt` | The input text: what an agent might say when it reports the job done. |
| `record.json` | The record (`dev.trustshell.action-evidence/0.1-draft`) and its SHA-256 over RFC 8785 canonical JSON. |
| `card.md`, `card.html` | The card, rendered from `record.json` alone. |

## How it was made

From the repository root, after `npm run sdk:build`:

```bash
node dist/cli/index.js check https://github.com/DealAppSeo/trustshell/actions/runs/39290226738 --claims-file examples/action-evidence-demo/claims.txt --out examples/action-evidence-demo --demo
```

It exited 1, because one claim is CONTRADICTED. Running it again gives a new `fetchedAt`, and so a
new hash. The statuses stay the same for as long as GitHub's answer for this run does.

## What the card says, claim by claim

- **SUPPORTED:** `The check workflow passed`, `on 5cd68edc` and `run 39290226738`. The run
  concluded success with its one job. The sentence names this workflow and cites this run, and
  every word of it was read.
- **CONTRADICTED:** `attempt 2`. GitHub's record for this run is attempt 1.
- **NOT_CHECKED:**
  - `Done`.
  - `CI passed`. Its sentence cites attempt 2, which is not this run's, and one run never
    establishes that all checks pass anyway.
  - `All tests pass`. It cites no run, and a run record never establishes which tests passed.
  - `production ready`.
  - `fully secure`.
  - Cryptographic integrity, because no signed attestation is read.

The card's "What this does not prove" list is part of the output, not a caption added here.
