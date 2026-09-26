# First-pass votes and the post-HAL verdict

These are not the same column. This note does not add a column the engine does not return.

## Route

`GET /api/v1/hal/honesty-a`

repid-engine `src/services/honesty-a.ts` reads `family`, `provider`, and `verdict` from `hal_quorum_validator_votes`. One vote has one verdict. TRUE and FALSE stay themselves. UNCERTAIN, ERROR, and a blank verdict are NOT_CHECKED. The payload has no post-HAL field.

A failed read is `status: NOT_CHECKED` and `rows: null`. That is not a count of 0.

Checked 2026-09-26 against the public route. The body was `status: NOT_CHECKED`, `rows: null`, `writer_enabled: false`. The gap said `public.hal_quorum_validator_votes` does not exist. `llm_call_log` has no verdict column. Counts are not taken from latency or from status.

`trustshell status` prints `first-pass NOT_CHECKED` and `post-HAL NOT_CHECKED` for that body. When `status` is `counted` and a row has numeric TRUE, FALSE, and NOT_CHECKED, status prints that row as the first-pass line. post-HAL stays NOT_CHECKED, because this route does not expose it.

`POST /api/v1/hal/evaluate` returns `provider_responses` and `decision` for one check. Those fields are not columns on `GET /api/v1/hal/honesty-a`.

`GET /api/v1/hal/fact-check-count` returns `total`, `by_source`, and `last_updated`. It is not this distinction.

Staking is not live. Wallet and stake stay testnet / shadow.
