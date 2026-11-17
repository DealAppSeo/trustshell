# Five cases on today's RepID proof

Unpublished. Not linked from any page.

```bash
npm ci --ignore-scripts
```

```bash
node demo/zk-walkthrough/run.mjs --out proof-walkthrough
```

It takes about two minutes on our Windows machine (measured with the test suite running beside it). No network,
no account, no key of yours. Each case gets a folder you can hand to someone else:

| file | what it is |
|---|---|
| `case.mjs` | the presented proof, the gate's policy and the gate, in one file. `node case.mjs` re-checks it offline (exit 0 GRANTED, 1 DENIED) |
| `report/` | a trust report whose Guard record names `case.mjs` by sha256 and says how it exited. `trustshell trust-report verify report --root <key>` re-checks it offline |
| `decision.json` | what `case.mjs` printed: the decision, why, what was proven, what stayed private, what a verified proof does not show |

| case | decision | what it shows |
|---|---|---|
| pass | GRANTED | the proof verifies and the score meets the bar |
| below the bar | DENIED | the gate reads the score from the statement; raising it there makes the proof fail |
| tampered | DENIED | one flipped bit and the proof fails |
| expired | DENIED | the gate's 30-day rule, applied to `created_at` |
| replayed | **GRANTED** | the same old proof with `created_at` changed still verifies: the statement has no time and no verifier challenge |

Today's proof is a validity proof (`src/lib/proof-class.ts`), so nothing stays private: the verifier learns the
exact score. The private eligibility proof will add its own entry to `SCHEMES` in `run.mjs`; the same five
cases then run on it, and `replayed` and "what stayed private" are the lines expected to change.
`tests/proof-walkthrough.test.ts` pins every decision, so that change will be visible.
