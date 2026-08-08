# CI Trust Gate — fail your build on a hallucinated claim

Have your CI go **red** when a factual claim in your release notes, docs, or marketing
doesn't survive a live cross-provider fact-check. **No API key, no account, ~5 minutes.**

This is the fail-closed wedge: it doesn't just *score* an output and leave you to decide —
it **refuses**, with an exit code your pipeline already understands.

## Try it locally first (10 seconds, keyless)

```bash
npx -y @hyperdag/trustshell verify "Paris is the capital of France."   # → exit 0 (PASS)
npx -y @hyperdag/trustshell verify "The capital of France is Berlin."  # → exit 1 (VETO)
echo $?   # 1
```

If the second one exits `1`, the gate works — that's the whole mechanism.

## 3-step drop-in

1. Copy [`trust-gate.yml`](./trust-gate.yml) → `.github/workflows/trust-gate.yml` in your repo.
2. Copy [`TRUST_CLAIMS.txt`](./TRUST_CLAIMS.txt) → your repo root and put your real claims in it
   (one per line; blank lines and `#` comments are skipped).
3. Push. A **Trust Gate (HAL)** check appears on your PRs; a VETO fails it.

That's it. Nothing to configure, no secret to add — `verify` is keyless.

## Exit codes (the contract)

| Exit | Meaning | In CI |
|---|---|---|
| `0` | HAL `PASS` (or soft `FLAG`) | build proceeds |
| `1` | HAL `VETO` — the claim did not pass | **build fails** |
| `2` | usage / bad arguments | warning |
| `3` | backend / network / timeout | warning, **not** counted as a veto* |

\* A transient backend outage should not read as "your claim is false." The workflow treats
exit `3` as a non-blocking infra warning by default; set `STRICT: '1'` in the workflow env to
make infra errors fail the build too (fully fail-closed).

## Then: earn a verifiable badge

Once your agent has a RepID, add a portable, client-verified badge to your README — it shows
`RepID ≥ threshold ✓ ZK-verified` and **never reveals the score** (that's what the range proof
attests):

```bash
npx -y @hyperdag/trustshell badge <your-agent-id> --markdown >> README.md
```

The badge renders green **only** when local ZK verification actually returned true — an absent or
failed verifier renders grey/red and exits non-zero, never a false green.

## What's real here, plainly

- `verify` runs against the **live** HyperDAG backend (`repid-engine-production.up.railway.app`)
  through a real cross-provider HAL quorum. Verified keyless: true claim → 0, false claim → 1.
- This is a **thin client** to that hosted backend — it does not run the fact-check on your
  runner. If the backend is unreachable you get exit `3` (handled above), never a silent pass.
