# Degraded red-team batches (do not count these when comparing passes)

The ledgers (`runs.jsonl`, `batches.jsonl`) are append-only history and were not edited. This file says which batches to exclude from trends, calibration and the D-022 tally.

| batch_id | started (UTC) | what happened | what is still valid |
|---|---|---|---|
| `dbc487e8` | 2026-10-23T00:11:43Z | A first version of `devnet.mjs` piped hardhat's output to the loop. Stage 3 runs the runner with `spawnSync`, which froze the loop's event loop, nobody drained the pipe, hardhat blocked on its own write and stopped answering. 43 of the 56 NOT_CHECKED rows are `harness error: ... http://127.0.0.1:<port>/` ("request took too long" / "HTTP request failed"). The other NOT_CHECKED rows are model-side (8 nemotron HTTP 404, 4 invalid variants). | The 9 `PASS` rows were graded by the frozen oracle before the devnet wedged; no row carries a false verdict (a harness error is NOT_CHECKED by design). Exclude the batch from "variants graded per pass" comparisons: it graded 9 of 65 for a reason that is not the models'. |

Cause fixed in `<ops>/ops\loop\devnet.mjs` (hardhat's output now goes to a file, never a pipe). Regression test: `devnet.check.mjs`, "DEADLOCK REGRESSION" (fails on the piped version, passes on the file version).
