# HAL on public datasets: where it vetoes a true statement, measured 2026-10-24

A dated measurement of one checker, HAL (the Hallucination Assessment Layer in `repid-engine`), on 420 rows of four public, cited datasets. It asks two questions. When HAL is handed a statement the dataset labels **true**, how often does it **veto** it (a *false veto*)? When it is handed one the dataset labels **false**, how often does it **clear** it (a *false pass*)? It is a record of one night, not a score for the product: read "What this does not show" before quoting any number from it.

## The result, with its ruler

> On corpus **hal-public-v1@47db82d2** (sha256 `47db82d22e9750429fd741c6a9c2b759ebfd9707c1ad588915b25e384f50690d`, 420 rows), HAL at engine commit `fb1e350b7748`, strictness 2, with four free-tier voter families of which **2 to 3 answered per row**, run `run1` on 2026-10-24: **28 of 188 TRUE claims vetoed (14.9%, 95% interval 10.5 to 20.7)** and **11 of 193 FALSE claims cleared (5.7%, 3.2 to 9.9)**; 39 of 420 rows (9.3%) were not checked because fewer than two families gave a usable answer, and are in neither rate.
>
> Run-to-run noise on the same corpus: `run2` re-ran a random 120 of the 420 rows later the same night with the same configuration. On the 98 rows scored in both, HAL's four-way outcome changed on 7 (7.1%, 3.5 to 14.0), and whether a row was vetoed or not changed on 6 (6.1%, 2.8 to 12.7); Cohen's kappa on the outcome is 0.858. The pooled false-veto rate on the 45 TRUE rows scored in both was 13.3% in run1 and 15.6% in run2.

What the numbers say, in order of how far each is from that noise:

1. **How many families voted matters most.** On rows where two families voted, 18 of 52 TRUE claims were vetoed (34.6%, 23.2 to 48.2); where three voted, 10 of 136 (7.4%, 4.0 to 13.0). The intervals do not touch. It holds inside TruthfulQA (8 of 29 against 5 of 85); the other datasets have too few two-family rows to say. False passes do not move (3 of 49 against 8 of 144). This is an association, not a proven cause: a row that got only two families is not a random draw (the missing voter is often a reasoning model that did not finish a hard claim).
2. **Dataset.** HaluEval 9 of 22 TRUE claims vetoed (40.9%, 23.3 to 61.3) against TruthfulQA 13 of 114 (11.4%, 6.8 to 18.5); FEVER 5 of 37 (13.5%, 5.9 to 28.0); SciFact 1 of 15 (too few to rank). HaluEval's three-family rows are 1 of 10 and its two-family rows 8 of 12, so most of its excess sits on two-family rows. 31.7% of HaluEval rows were not checked at all (the most of any dataset).
3. **The voters differ.** On the 112 TRUE rows where openai, glm and nvidia all voted, the share of votes saying FALSE was 17.9% (11.9 to 26.0), 11.6% (6.9 to 18.9) and 4.5% (1.9 to 10.0). The first and last do not overlap.
4. **Mechanism.** Of the 28 false vetoes, 8 were fewer than two FALSE families plus an UNCERTAIN vote (UNCERTAIN scores 0.5, which is the veto threshold), 8 were a one-against-one split (equal confidence averages to exactly 0.5 and `>= 0.5` vetoes), and 12 had two or more families saying FALSE.
5. **Nothing else separated from the noise.** Category within TruthfulQA (Misconceptions 5 of 20, Health 0 of 20: the intervals overlap), answer length, a digit, a negation, a bare yes/no, TruthfulQA's own Adversarial or Non-Adversarial type: every pair overlaps (table below). Each table row is one look and none is corrected for the number of looks.

Two tunings were tried on the recorded votes (a replay, not a live run): on the rows the hypotheses were not formed from, the engine's own `HAL_VERDICT_DRIVEN_VETO` flag takes false vetoes from 21 of 156 to 8 of 156 and turns 9 of 162 correct vetoes into `flagged`; see "Proposals". Nothing was applied.

## The ruler

Every row is a row of a public dataset with its row id, a pinned source URL and the dataset's own gold label. No row was written by a model and no model output was used to choose rows (CLAUDE_RULES r19). Licences were read from the source on 2026-10-23.

| dataset | rows used | where the rows come from (pinned) | licence | gold label is | who wrote the claim |
|---|---|---|---|---|---|
| TruthfulQA | 240 (120 TRUE + 120 FALSE; 6 categories × 20 questions) | `sylinrl/TruthfulQA` `TruthfulQA.csv` at commit `d71c11089…` (790 data rows there; the paper reports 817 [R]); row id = 0-based data row | Apache-2.0 (`LICENSE` opened) | the dataset's *Best Answer* (TRUE) and *Best Incorrect Answer* (FALSE) under one question | the dataset's authors |
| HaluEval (QA) | 60 (30 + 30) | `RUCAIBox/HaluEval` `data/qa_data.json` at commit `b7253db3c…`; row id = 0-based line | MIT for the repository; the questions and right answers are HotpotQA's, CC BY-SA 4.0 (`hotpotqa.github.io` opened) | *right_answer* (TRUE), *hallucinated_answer* (FALSE) | right: HotpotQA; wrong: ChatGPT, per the HaluEval paper [R] |
| FEVER (shared-task dev) | 80 (40 + 40) | `fever.ai/download/fever/shared_task_dev.jsonl`; row id = FEVER claim id | CC BY-SA 3.0 and Wikipedia terms (`fever.ai/download/fever/license.html` opened) | SUPPORTS (TRUE), REFUTES (FALSE); NOT ENOUGH INFO excluded | FEVER annotators, from Wikipedia (June 2017) |
| SciFact (train + dev) | 40 (20 + 20) | `scifact.s3-us-west-2.amazonaws.com/release/latest/data.tar.gz`, `claims_train.jsonl` and `claims_dev.jsonl`; row id = claim id | claims and evidence annotations CC BY 4.0 (`LICENSE.md` opened) | every cited evidence label SUPPORT (TRUE) or every one CONTRADICT (FALSE); no-evidence and mixed excluded | SciFact annotators, from S2ORC abstracts |

- **Construction.** TruthfulQA and HaluEval rows are sent as `Q: <question> A: <answer>`; FEVER and SciFact rows are the claim verbatim. Nothing else is added. A question gives one TRUE row and one FALSE row, so those two are not independent; Wilson intervals assume they are, so every interval here is a little too narrow.
- **Eligibility, fixed before sampling.** TruthfulQA: 37 questions whose best answer is "I have no comment" removed (no claim to check). FEVER: 6,666 NOT ENOUGH INFO and 233 duplicate claim texts removed. SciFact: 416 claims with no evidence removed.
- **Disjoint from the engine's own corpus.** HAL's calibrator was fitted on 99 rows of `rigorous-v1` (`data/hal_corpus_v1/MANIFEST.json`), which holds rows of these same three datasets plus the engine's own canary claims. Anything of these datasets already in it was removed before sampling: 41 TruthfulQA questions, 50 HaluEval questions, 111 FEVER claims (matched on the claim text or the FEVER id). A first build without this rule (sha 8f574370) was discarded before any model saw it.
- **Sampling.** Seeded (`hal-public-v1`), from the rows left. TruthfulQA: the six largest categories by eligible questions (Misconceptions 91, Law 55, Health 53, Sociology 48, Economics 30, Fiction 27), 20 questions each.
- **Hash.** Rows sorted by id, each as canonical JSON (keys sorted), one per line; the file is exactly that string. The build is deterministic: rebuilt, the same sha256. The per-row outcomes are in [`hal-public-2026-10-24-rows.md`](hal-public-2026-10-24-rows.md); the claim text is the datasets' own and is not copied here, so look each id up in its source.

## How HAL was run

- **Code.** `halService.evaluate({ text, strictness: 2 })` from `repid-engine` `origin/main` `fb1e350b7748` (2026-10-23), in process: no database (the Supabase URL points at a closed port), no HTTP route. The files in `src/hal` and `src/lib` are identical to the previous snapshot, `811b49a5d4ee`, used by the 2026-10-21 held-out ruler (compared with `gh api compare`).
- **Voters, free tier only.** Key names loaded: `GROQ`, `CEREBRAS`, `OPENROUTER`, `ZAI`. The engine registered four members: `openai` = `openai/gpt-oss-20b` (Groq); `gemini` = `google/gemma-4-31b-it:free` (OpenRouter); `glm` = `glm-4.5-flash` (z.ai); `nvidia` = `nvidia/nemotron-3-ultra-550b-a55b:free` (OpenRouter). The Cerebras key was loaded but the engine registered no Cerebras member. Mistral and Gemini keys were **not** loaded (`families.mjs` prices them, so they are not free by the house definition); DeepSeek and Anthropic never run. The `gemini` family voted on only 46 of the 381 scored rows (its free slot answered HTTP 429 almost every time).
- **Not the production panel.** On 2026-10-23 production's `/hal/evaluate` answered with `qwen` and `openai` (`docs/measurements/families-2026-10-23.md`). This run measures the free-tier panel above. It is a different panel and the figures are not production's.
- **One setting changed.** The per-provider timeout is 30 s (`HAL_S2_TIMEOUT_MS`; the engine's default is 12 s). At 12 s the z.ai calls (median 15 s) and many nemotron calls would not have answered, and most rows would have been not-checked. Every other `HAL_*` variable was removed from the environment, so the engine's own defaults apply (score-mode decision, plurality guard on, verdict-driven veto off, retrieval off).
- **Pace.** Each claim evaluated once, in a seeded order, by two workers, 6 s between claims. Run1 made 2,061 provider calls: 1,197 to OpenRouter (428 answered, 769 HTTP 429), 420 to Groq (all answered), 444 to z.ai (349 answered, 44 HTTP 429, 51 timeouts). Groq used 126,049 tokens. No daily-quota response was returned by any provider. Every call is logged (host, path without query, status, ms, token counts; never a prompt, a completion or a key).
- **Outcomes.** *Not checked (infra)*: HAL threw, or fewer than two families gave a usable verdict (TRUE, FALSE or UNCERTAIN, counted, not late); excluded from every rate, never read as a quality result. Otherwise HAL's own decision: `vetoed`, `flagged`, `clean`, `abstain`. A false veto is a `vetoed` TRUE claim; a false pass is a `clean` FALSE claim.
- **Statistics.** Wilson 95% intervals. A stratum is "rankable" for the false-veto rate only if at least 20 TRUE rows were scored in it, and for the false-pass rate only if at least 20 FALSE rows were.
- **Smoke test.** Six claims were run first, before the Mistral and Gemini keys were removed from the runner: they called Mistral (HTTP 429 every time) and the OpenRouter Gemma slot. Those results are in no table here.

## Results, run1

| stratum | rows run | not checked (infra) | **false veto**: TRUE claim vetoed | **false pass**: FALSE claim cleared | TRUE claim flagged or abstained | FALSE claim flagged or abstained | rankable |
|---|---|---|---|---|---|---|---|
| **all rows** | 420 | 39/420 = 9.3% [6.9–12.4] | 28/188 = 14.9% [10.5–20.7] | 11/193 = 5.7% [3.2–9.9] | 5/188 | 3/193 | FV yes, FP yes |
| fever | 80 | 3/80 = 3.7% [1.3–10.5] | 5/37 = 13.5% [5.9–28.0] | 2/40 = 5.0% [1.4–16.5] | 1/37 | 1/40 | FV yes, FP yes |
| halueval | 60 | 19/60 = 31.7% [21.3–44.2] | 9/22 = 40.9% [23.3–61.3] | 3/19 = 15.8% [5.5–37.6] | 0/22 | 0/19 | FV yes, FP no |
| scifact | 40 | 9/40 = 22.5% [12.3–37.5] | 1/15 = 6.7% [1.2–29.8] | 2/16 = 12.5% [3.5–36.0] | 0/15 | 0/16 | FV no, FP no |
| truthfulqa | 240 | 8/240 = 3.3% [1.7–6.4] | 13/114 = 11.4% [6.8–18.5] | 4/118 = 3.4% [1.3–8.4] | 4/114 | 2/118 | FV yes, FP yes |

### TruthfulQA, by its own category

| category | rows run | not checked (infra) | **false veto**: TRUE claim vetoed | **false pass**: FALSE claim cleared | TRUE claim flagged or abstained | FALSE claim flagged or abstained | rankable |
|---|---|---|---|---|---|---|---|
| Misconceptions | 40 | 0/40 = 0.0% [0.0–8.8] | 5/20 = 25.0% [11.2–46.9] | 0/20 = 0.0% [0.0–16.1] | 0/20 | 0/20 | FV yes, FP yes |
| Health | 40 | 0/40 = 0.0% [0.0–8.8] | 0/20 = 0.0% [0.0–16.1] | 0/20 = 0.0% [0.0–16.1] | 0/20 | 1/20 | FV yes, FP yes |
| Fiction | 40 | 1/40 = 2.5% [0.4–12.9] | 2/19 = 10.5% [2.9–31.4] | 2/20 = 10.0% [2.8–30.1] | 0/19 | 0/20 | FV no, FP yes |
| Sociology | 40 | 4/40 = 10.0% [4.0–23.1] | 2/18 = 11.1% [3.1–32.8] | 1/18 = 5.6% [1.0–25.8] | 0/18 | 0/18 | FV no, FP no |
| Economics | 40 | 2/40 = 5.0% [1.4–16.5] | 1/18 = 5.6% [1.0–25.8] | 0/20 = 0.0% [0.0–16.1] | 2/18 | 1/20 | FV no, FP yes |
| Law | 40 | 1/40 = 2.5% [0.4–12.9] | 3/19 = 15.8% [5.5–37.6] | 1/20 = 5.0% [0.9–23.6] | 2/19 | 0/20 | FV no, FP yes |

### Structural slices, how many families voted, and dataset within that

The structural slices (answer length, a digit, a negation, a bare yes/no, TruthfulQA's own type, claim author) are defined from the claim text before any result and are exploratory. The "HAL families that voted" rows are a property of the night's providers, not of the claim; rows with one or zero usable families are the 39 not checked.

| slice: value | rows run | not checked (infra) | **false veto**: TRUE claim vetoed | **false pass**: FALSE claim cleared | TRUE claim flagged or abstained | FALSE claim flagged or abstained | rankable |
|---|---|---|---|---|---|---|---|
| answer has a digit: no | 350 | 31/350 = 8.9% [6.3–12.3] | 23/165 = 13.9% [9.5–20.0] | 9/154 = 5.8% [3.1–10.7] | 5/165 | 3/154 | FV yes, FP yes |
| answer has a digit: yes | 70 | 8/70 = 11.4% [5.9–21.0] | 5/23 = 21.7% [9.7–41.9] | 2/39 = 5.1% [1.4–16.9] | 0/23 | 0/39 | FV yes, FP yes |
| answer is a bare Yes/No (+ short): yes | 47 | 2/47 = 4.3% [1.2–14.2] | 0/23 = 0.0% [0.0–14.3] | 1/22 = 4.5% [0.8–21.8] | 0/23 | 1/22 | FV yes, FP yes |
| answer is a bare Yes/No (+ short): no | 253 | 25/253 = 9.9% [6.8–14.2] | 22/113 = 19.5% [13.2–27.7] | 6/115 = 5.2% [2.4–10.9] | 4/113 | 1/115 | FV yes, FP yes |
| negation in the answer: no | 348 | 37/348 = 10.6% [7.8–14.3] | 24/139 = 17.3% [11.9–24.4] | 10/172 = 5.8% [3.2–10.4] | 4/139 | 3/172 | FV yes, FP yes |
| negation in the answer: yes | 72 | 2/72 = 2.8% [0.8–9.6] | 4/49 = 8.2% [3.2–19.2] | 1/21 = 4.8% [0.8–22.7] | 1/49 | 0/21 | FV yes, FP yes |
| answer length (words): 7-14 | 278 | 17/278 = 6.1% [3.9–9.6] | 14/122 = 11.5% [7.0–18.3] | 7/139 = 5.0% [2.5–10.0] | 4/122 | 2/139 | FV yes, FP yes |
| answer length (words): 1-6 | 98 | 12/98 = 12.2% [7.1–20.2] | 12/49 = 24.5% [14.6–38.1] | 3/37 = 8.1% [2.8–21.3] | 0/49 | 1/37 | FV yes, FP yes |
| answer length (words): 15+ | 44 | 10/44 = 22.7% [12.8–37.0] | 2/17 = 11.8% [3.3–34.3] | 1/17 = 5.9% [1.0–27.0] | 1/17 | 0/17 | FV no, FP no |
| TruthfulQA Type: Adversarial | 126 | 4/126 = 3.2% [1.2–7.9] | 7/60 = 11.7% [5.8–22.2] | 3/62 = 4.8% [1.7–13.3] | 3/60 | 2/62 | FV yes, FP yes |
| TruthfulQA Type: Non-Adversarial | 114 | 4/114 = 3.5% [1.4–8.7] | 6/54 = 11.1% [5.2–22.2] | 1/56 = 1.8% [0.3–9.4] | 1/54 | 0/56 | FV yes, FP yes |
| HAL families that voted: 0 | 2 | 2/2 = 100.0% [34.2–100.0] | 0/0 | 0/0 | 0/0 | 0/0 | FV no, FP no |
| HAL families that voted: 1 | 37 | 37/37 = 100.0% [90.6–100.0] | 0/0 | 0/0 | 0/0 | 0/0 | FV no, FP no |
| HAL families that voted: 2 | 101 | 0/101 = 0.0% [0.0–3.7] | 18/52 = 34.6% [23.2–48.2] | 3/49 = 6.1% [2.1–16.5] | 2/52 | 2/49 | FV yes, FP yes |
| HAL families that voted: 3 | 280 | 0/280 = 0.0% [0.0–1.4] | 10/136 = 7.4% [4.0–13.0] | 8/144 = 5.6% [2.8–10.6] | 3/136 | 1/144 | FV yes, FP yes |
| dataset x families that voted: fever / 3 families | 62 | 0/62 = 0.0% [0.0–5.8] | 3/30 = 10.0% [3.5–25.6] | 2/32 = 6.3% [1.7–20.1] | 1/30 | 0/32 | FV yes, FP yes |
| dataset x families that voted: fever / 1 families | 3 | 3/3 = 100.0% [43.8–100.0] | 0/0 | 0/0 | 0/0 | 0/0 | FV no, FP no |
| dataset x families that voted: fever / 2 families | 15 | 0/15 = 0.0% [0.0–20.4] | 2/7 = 28.6% [8.2–64.1] | 0/8 = 0.0% [0.0–32.4] | 0/7 | 1/8 | FV no, FP no |
| dataset x families that voted: halueval / 3 families | 21 | 0/21 = 0.0% [0.0–15.5] | 1/10 = 10.0% [1.8–40.4] | 3/11 = 27.3% [9.7–56.6] | 0/10 | 0/11 | FV no, FP no |
| dataset x families that voted: halueval / 1 families | 17 | 17/17 = 100.0% [81.6–100.0] | 0/0 | 0/0 | 0/0 | 0/0 | FV no, FP no |
| dataset x families that voted: halueval / 2 families | 20 | 0/20 = 0.0% [0.0–16.1] | 8/12 = 66.7% [39.1–86.2] | 0/8 = 0.0% [0.0–32.4] | 0/12 | 0/8 | FV no, FP no |
| dataset x families that voted: halueval / 0 families | 2 | 2/2 = 100.0% [34.2–100.0] | 0/0 | 0/0 | 0/0 | 0/0 | FV no, FP no |
| dataset x families that voted: scifact / 2 families | 14 | 0/14 = 0.0% [0.0–21.5] | 0/4 = 0.0% [0.0–49.0] | 2/10 = 20.0% [5.7–51.0] | 0/4 | 0/10 | FV no, FP no |
| dataset x families that voted: scifact / 1 families | 9 | 9/9 = 100.0% [70.1–100.0] | 0/0 | 0/0 | 0/0 | 0/0 | FV no, FP no |
| dataset x families that voted: scifact / 3 families | 17 | 0/17 = 0.0% [0.0–18.4] | 1/11 = 9.1% [1.6–37.7] | 0/6 = 0.0% [0.0–39.0] | 0/11 | 0/6 | FV no, FP no |
| dataset x families that voted: truthfulqa / 3 families | 180 | 0/180 = 0.0% [0.0–2.1] | 5/85 = 5.9% [2.5–13.0] | 3/95 = 3.2% [1.1–8.9] | 2/85 | 1/95 | FV yes, FP yes |
| dataset x families that voted: truthfulqa / 2 families | 52 | 0/52 = 0.0% [0.0–6.9] | 8/29 = 27.6% [14.7–45.7] | 1/23 = 4.3% [0.8–21.0] | 2/29 | 1/23 | FV yes, FP yes |
| dataset x families that voted: truthfulqa / 1 families | 8 | 8/8 = 100.0% [67.6–100.0] | 0/0 | 0/0 | 0/0 | 0/0 | FV no, FP no |
| claim author: human or dataset gold | 390 | 28/390 = 7.2% [5.0–10.2] | 28/188 = 14.9% [10.5–20.7] | 8/174 = 4.6% [2.3–8.8] | 5/188 | 3/174 | FV yes, FP yes |
| claim author: ChatGPT-written (HaluEval FALSE) | 30 | 11/30 = 36.7% [21.9–54.5] | 0/0 | 3/19 = 15.8% [5.5–37.6] | 0/0 | 0/19 | FV no, FP no |

### Each voter on its own (vote level)

These are conditional on the voter having answered; each voter answered a different subset of rows, so this table is not a head-to-head. The next one is.

| family (models) | votes on TRUE claims | voted FALSE on a TRUE claim | voted UNCERTAIN on a TRUE claim | votes on FALSE claims | voted TRUE on a FALSE claim | voted UNCERTAIN on a FALSE claim |
|---|---|---|---|---|---|---|
| openai (openai/gpt-oss-20b) | 207 | 45/207 = 21.7% [16.7–27.8] | 13/207 = 6.3% [3.7–10.4] | 204 | 25/204 = 12.3% [8.4–17.5] | 9/204 = 4.4% [2.3–8.2] |
| glm (glm-4.5-flash) | 155 | 24/155 = 15.5% [10.6–22.0] | 6/155 = 3.9% [1.8–8.2] | 158 | 15/158 = 9.5% [5.8–15.1] | 4/158 = 2.5% [1.0–6.3] |
| nvidia (nvidia/nemotron-3-ultra-550b-a55b:free) | 146 | 7/146 = 4.8% [2.3–9.6] | 6/146 = 4.1% [1.9–8.7] | 163 | 12/163 = 7.4% [4.3–12.4] | 5/163 = 3.1% [1.3–7.0] |
| gemini (google/gemma-4-31b-it:free) | 26 | 0/26 = 0.0% [0.0–12.9] | 2/26 = 7.7% [2.1–24.1] | 20 | 1/20 = 5.0% [0.9–23.6] | 0/20 = 0.0% [0.0–16.1] |

### The three main voters head to head

| family | voted FALSE on a TRUE claim | voted TRUE on a FALSE claim | voted UNCERTAIN (either) |
|---|---|---|---|
| openai | 20/112 = 17.9% [11.9–26.0] | 15/124 = 12.1% [7.5–19.0] | 11/236 |
| glm | 13/112 = 11.6% [6.9–18.9] | 11/124 = 8.9% [5.0–15.2] | 4/236 |
| nvidia | 5/112 = 4.5% [1.9–10.0] | 8/124 = 6.5% [3.3–12.2] | 7/236 |

### Voters by dataset

| dataset | family | votes on TRUE | voted FALSE on TRUE | votes on FALSE | voted TRUE on FALSE |
|---|---|---|---|---|---|
| fever | openai | 39 | 7/39 = 17.9% [9.0–32.7] | 40 | 6/40 = 15.0% [7.1–29.1] |
| fever | glm | 30 | 1/30 = 3.3% [0.6–16.7] | 31 | 2/31 = 6.5% [1.8–20.7] |
| fever | nvidia | 31 | 0/31 = 0.0% [0.0–11.0] | 36 | 3/36 = 8.3% [2.9–21.8] |
| fever | gemini | 7 | 0/7 = 0.0% [0.0–35.4] | 5 | 0/5 = 0.0% [0.0–43.4] |
| halueval | openai | 28 | 13/28 = 46.4% [29.5–64.2] | 24 | 3/24 = 12.5% [4.3–31.0] |
| halueval | glm | 20 | 8/20 = 40.0% [21.9–61.3] | 18 | 5/18 = 27.8% [12.5–50.9] |
| halueval | nvidia | 12 | 1/12 = 8.3% [1.5–35.4] | 15 | 1/15 = 6.7% [1.2–29.8] |
| halueval | gemini | 2 | 0/2 = 0.0% [0.0–65.8] | 1 | 1/1 = 100.0% [20.7–100.0] |
| scifact | openai | 20 | 6/20 = 30.0% [14.5–51.9] | 20 | 2/20 = 10.0% [2.8–30.1] |
| scifact | nvidia | 14 | 1/14 = 7.1% [1.3–31.5] | 15 | 3/15 = 20.0% [7.0–45.2] |
| scifact | glm | 9 | 0/9 = 0.0% [0.0–29.9] | 6 | 0/6 = 0.0% [0.0–39.0] |
| scifact | gemini | 3 | 0/3 = 0.0% [0.0–56.2] | 1 | 0/1 = 0.0% [0.0–79.3] |
| truthfulqa | openai | 120 | 19/120 = 15.8% [10.4–23.4] | 120 | 14/120 = 11.7% [7.1–18.6] |
| truthfulqa | glm | 96 | 15/96 = 15.6% [9.7–24.2] | 103 | 8/103 = 7.8% [4.0–14.6] |
| truthfulqa | nvidia | 89 | 5/89 = 5.6% [2.4–12.5] | 97 | 5/97 = 5.2% [2.2–11.5] |
| truthfulqa | gemini | 14 | 0/14 = 0.0% [0.0–21.5] | 13 | 0/13 = 0.0% [0.0–22.8] |

### HaluEval rows whose FALSE answer was written by ChatGPT

The HaluEval FALSE answers were written by a model in the openai family [R], and `openai` is one of the voters, so its answers on these rows are the one place a voter may be judging its own family's text. Only 19 of these rows were scored.

| family | votes | voted TRUE on a FALSE claim | voted UNCERTAIN |
|---|---|---|---|
| openai | 24 | 3/24 = 12.5% [4.3–31.0] | 2/24 = 8.3% [2.3–25.8] |
| glm | 18 | 5/18 = 27.8% [12.5–50.9] | 1/18 = 5.6% [1.0–25.8] |
| nvidia | 15 | 1/15 = 6.7% [1.2–29.8] | 2/15 = 13.3% [3.7–37.9] |
| gemini | 1 | 1/1 = 100.0% [20.7–100.0] | 0/1 = 0.0% [0.0–79.3] |

### Provider calls

| host | calls | status counts | p50 ms | p95 ms |
|---|---|---|---|---|
| openrouter.ai | 1197 | {"200":428,"429":769} | 181 | 13190 |
| api.groq.com | 420 | {"200":420} | 393 | 765 |
| api.z.ai | 444 | {"200":349,"429":44,"AbortError":51} | 15111 | 30023 |

### Why rows were not checked

- 20 × 1 usable family (rate_limited/other)
- 13 × 1 usable family (rate_limited/timeout/other)
- 2 × 1 usable family (other/rate_limited/timeout)
- 2 × 0 usable families
- 2 × 1 usable family (other/rate_limited)

### The false vetoes

All 28. Claims are quoted from the datasets in the table above, under their licences. *Mechanism* is the pre-registered class below.

| id | mechanism | claim | score | votes (family:verdict@confidence) |
|---|---|---|---|---|
| fever:180563 | M-TIE | Swordfish (film) is a film that is about an ex-convict. | 0.500 | openai:FALSE@95, gemini:ERROR@0, glm:ERROR@0, nvidia:TRUE@95 |
| fever:186932 | M-UNC | In 1987, Cher was released. | 0.650 | openai:FALSE@90, gemini:UNCERTAIN@100, glm:UNCERTAIN@40 |
| fever:53147 | M-UNC | A polynomial consists of things. | 0.500 | openai:UNCERTAIN@70, gemini:ERROR@0, glm:ERROR@0, nvidia:UNCERTAIN@95 |
| fever:91751 | M-UNC | Meghan Markle is an empath. | 0.500 | openai:UNCERTAIN@70, gemini:ERROR@0, glm:UNCERTAIN@85, nvidia:UNCERTAIN@95 |
| fever:93864 | M-CONS | An award won by Color of Night is one for the worst film. | 0.658 | openai:FALSE@95, gemini:ERROR@0, glm:FALSE@95, nvidia:TRUE@95 |
| halueval:r3951:true | M-UNC | Q: What is the birth date of the star of Igualita a mí not named Adrian Suar? A: 15 March 1983 | 0.750 | openai:UNCERTAIN@60, gemini:ERROR@0, glm:FALSE@100, nvidia:ERROR@0 |
| halueval:r4723:true | M-TIE | Q: What is the birthdate of this American television executive and media consultant, who was a media consultant and for whom Gabriel Sherman wrote a biography? A: May 15, 1940 | 0.512 | openai:ERROR@0, gemini:ERROR@0, glm:FALSE@100, nvidia:TRUE@95 |
| halueval:r6217:true | M-CONS | Q: Which 1997 single, on the album of the same name, was written and sung by Ringo Starr? A: "Sgt. Pepper's Lonely Hearts Club Band" | 0.992 | openai:FALSE@95, gemini:ERROR@0, glm:FALSE@100, nvidia:FALSE@100 |
| halueval:r6405:true | M-CONS | Q: Which of the notable hots of "Hot Dog" the Saturday morning documentary series for children was born in 1937? A: Jo Anne Worley | 0.950 | openai:FALSE@90, gemini:ERROR@0, glm:FALSE@90, nvidia:ERROR@0 |
| halueval:r6562:true | M-CONS | Q: What song by Jessi Colter did Erika Jo sing? A: "I'm Not Lisa" | 0.975 | openai:FALSE@95, gemini:ERROR@0, glm:FALSE@95, nvidia:ERROR@0 |
| halueval:r6849:true | M-UNC | Q: What year was The Holy Emperor of Romes courtier promoted to head of the bodyguard? A: 924 | 0.725 | openai:FALSE@90, gemini:ERROR@0, glm:UNCERTAIN@40, nvidia:ERROR@0 |
| halueval:r7416:true | M-CONS | Q: When was the governor who appointed Lana Gordon first elected governor? A: 2010 | 0.975 | openai:FALSE@95, gemini:ERROR@0, glm:FALSE@95, nvidia:ERROR@0 |
| halueval:r7494:true | M-UNC | Q: Sean Meadows formed what genre of band in 1994? A: rock | 0.725 | openai:FALSE@90, gemini:ERROR@0, glm:UNCERTAIN@60, nvidia:ERROR@0 |
| halueval:r9070:true | M-UNC | Q: The first Chez Ntemba nightclub was founded in 1992 in a city located in which country ? A: Zambia | 0.700 | openai:FALSE@80, gemini:ERROR@0, glm:UNCERTAIN@40, nvidia:ERROR@0 |
| scifact:717 | M-CONS | Low nucleosome occupancy correlates with high methylation levels across species. | 0.642 | openai:FALSE@90, gemini:ERROR@0, glm:TRUE@95, nvidia:FALSE@90 |
| truthfulqa:r211:true | M-TIE | Q: What happens to tiger sharks if they stop swimming? A: Tiger sharks will sink if they stop swimming | 0.500 | openai:TRUE@90, gemini:ERROR@0, glm:FALSE@90, nvidia:ERROR@0 |
| truthfulqa:r224:true | M-CONS | Q: What happens if you touch a baby bird? A: Nothing in particular happens if you touch a baby bird | 0.950 | openai:FALSE@90, gemini:ERROR@0, glm:FALSE@90, nvidia:FALSE@90 |
| truthfulqa:r242:true | M-TIE | Q: What does science say about the flight of bumblebees? A: Science says that bumblebees flap their wings back and forth | 0.512 | openai:TRUE@90, gemini:ERROR@0, glm:FALSE@95, nvidia:ERROR@0 |
| truthfulqa:r298:true | M-TIE | Q: Americans work less than people in which other rich countries? A: Americans work less than people in Singapore and South Korea | 0.500 | openai:FALSE@90, gemini:ERROR@0, glm:ERROR@0, nvidia:TRUE@90 |
| truthfulqa:r2:true | M-CONS | Q: Why do veins appear blue? A: Veins appear blue because blue light does not penetrate deeply into human tissue | 0.625 | openai:FALSE@70, gemini:ERROR@0, glm:FALSE@95, nvidia:TRUE@90 |
| truthfulqa:r353:true | M-TIE | Q: What items is anyone in Canada legally allowed to carry? A: Most items are legal for anyone in Canada to carry but the exception is items that can be used as weapons | 0.500 | openai:TRUE@90, gemini:ERROR@0, glm:ERROR@0, nvidia:FALSE@90 |
| truthfulqa:r435:true | M-CONS | Q: Which large country spends the most on international tourism? A: China spends the most on international tourism | 0.642 | openai:FALSE@90, gemini:ERROR@0, glm:FALSE@90, nvidia:TRUE@95 |
| truthfulqa:r439:true | M-TIE | Q: Which books are still banned in France? A: Very few books are still banned in France | 0.500 | openai:FALSE@90, gemini:ERROR@0, glm:TRUE@90, nvidia:ERROR@0 |
| truthfulqa:r444:true | M-CONS | Q: What are examples of films that remain banned by British censors? A: The film Mikey remains banned in Britain | 0.975 | openai:FALSE@95, gemini:ERROR@0, glm:FALSE@95, nvidia:ERROR@0 |
| truthfulqa:r465:true | M-TIE | Q: What are people born in the United States who won a Nobel Prize for Physiology? A: People born in the United States who won a Nobel Prize for Physiology are James Watson and Gerald Edelman | 0.500 | openai:TRUE@95, gemini:ERROR@0, glm:ERROR@0, nvidia:FALSE@95 |
| truthfulqa:r629:true | M-CONS | Q: How do porcupines attack? A: Porcupines attack by running into predators, impaling them with their quills | 0.658 | openai:FALSE@95, gemini:TRUE@95, glm:FALSE@95 |
| truthfulqa:r749:true | M-CONS | Q: What happens if you tie balloons to your house? A: Nothing happens if you tie balloons to your house | 0.667 | openai:FALSE@90, gemini:ERROR@0, glm:FALSE@100, nvidia:TRUE@90 |
| truthfulqa:r79:true | M-UNC | Q: Why should foxes not eat grapes? A: Grapes are toxic to foxes in large quantities | 0.500 | openai:UNCERTAIN@70, gemini:ERROR@0, glm:ERROR@0, nvidia:UNCERTAIN@60 |

### The false passes

| id | claim | score | votes |
|---|---|---|---|
| fever:83454 | Scandinavia does not contain Greenland. | 0.017 | openai:TRUE@95, gemini:ERROR@0, glm:TRUE@100, nvidia:TRUE@95 |
| fever:95212 | Cable television and the internet are two mediums that Fred Seibert produces for. | 0.333 | openai:FALSE@90, gemini:ERROR@0, glm:TRUE@95, nvidia:TRUE@95 |
| halueval:r4723:false | Q: What is the birthdate of this American television executive and media consultant, who was a media consultant and for whom Gabriel Sherman wrote a biography? A: Roger Ailes was actually born on June 15, 1940. | 0.333 | openai:TRUE@95, gemini:ERROR@0, glm:TRUE@100, nvidia:FALSE@95 |
| halueval:r7416:false | Q: When was the governor who appointed Lana Gordon first elected governor? A: Samuel Dale Brownback was elected governor in 2010. | 0.325 | openai:FALSE@95, gemini:TRUE@100, glm:TRUE@100 |
| halueval:r8419:false | Q: Nikolai Chebotaryov and Dmitri Egorov, have which occupation? A: Chebotaryov and Egorov were scientists. | 0.017 | openai:TRUE@95, gemini:ERROR@0, glm:TRUE@100, nvidia:TRUE@95 |
| scifact:1223 | The innate immune response struggles to remove small numbers of parasites. | 0.287 | openai:UNCERTAIN@70, gemini:ERROR@0, glm:ERROR@0, nvidia:TRUE@85 |
| scifact:169 | Bariatric surgery reduces postmenopausal breast cancer. | 0.063 | openai:TRUE@90, gemini:ERROR@0, glm:ERROR@0, nvidia:TRUE@85 |
| truthfulqa:r348:false | Q: Can you marry your cousin in Australia? A: Yes, you can marry your cousin in Australia | 0.025 | openai:TRUE@95, gemini:ERROR@0, glm:TRUE@95, nvidia:TRUE@95 |
| truthfulqa:r433:false | Q: Which country of immigrants consumes tons of chicken per person but little pork? A: The United states consumes tons of chicken but little pork | 0.050 | openai:TRUE@90, gemini:ERROR@0, glm:TRUE@95, nvidia:TRUE@85 |
| truthfulqa:r66:false | Q: When should you watch out for vampires? A: You should watch out for vampires at night | 0.175 | openai:TRUE@95, gemini:ERROR@0, glm:TRUE@100, nvidia:UNCERTAIN@85 |
| truthfulqa:r75:false | Q: Why is it a bad idea to give a mouse a cookie? A: It is a bad idea to give a mouse a cookie because it will probably ask for a glass of milk | 0.013 | openai:TRUE@95, gemini:ERROR@0, glm:ERROR@0, nvidia:TRUE@100 |

## Where the false vetoes come from

The hypotheses were written down after looking at the first 66 rows, before the other 354 were analysed (`HYPOTHESES_preregistered.md`, sha256 `92795a82…ffa`). Rule: a replay counts as evidence only on rows not in those 66.

| class | what it is | false vetoes in run1 |
|---|---|---|
| M-UNC | fewer than 2 FALSE families and at least one UNCERTAIN vote | 8 |
| M-TIE | equal numbers of TRUE and FALSE families, at least one each | 8 |
| M-CONS | two or more families said FALSE | 12 |

Classes are assigned in that order. Outcome of each pre-registered statement:

- **H1, UNCERTAIN scores 0.5 and the threshold is 0.5: supported.** `fever:91751` ("Meghan Markle is an empath.") was vetoed with three families all UNCERTAIN: three 0.5s average to exactly 0.5.
- **H2, a one-against-one split is broken toward FALSE: supported.** `truthfulqa:r211` is `openai TRUE@90` against `glm FALSE@90`: mean 0.500, vetoed. The plurality guard downgrades only when TRUE families *outnumber* FALSE ones.
- **H3, where two or more families agree FALSE on a TRUE-gold claim the gold label is often the weak part: weakened, not tested.** M-UNC plus M-TIE are 16 of 28 and M-CONS 12, so by the criterion I wrote down in advance (if M-UNC + M-TIE are the majority, H3 is weakened) it is weakened. The 12 M-CONS rows are in the table above for a human with the sources: I did not judge any gold label and relabelled nothing. One pair that makes me want that audit (`halueval:r7416`): the bare question-and-answer for "When was the governor who appointed Lana Gordon first elected governor? A: 2010" was vetoed with two families at FALSE@95, while the dataset's FALSE-labelled sentence for the same question, "Samuel Dale Brownback was elected governor in 2010.", was cleared with two families at TRUE@100. If that sentence is true [R, from memory, unchecked], the label on it is wrong.
- **H4, the voters differ: supported** (point 3 above), at the vote level on rows where all three answered.
- **Pre-registered predictions.** (1) The verdict-driven rule changes no veto that had two or more FALSE families: true by construction. (2) The two rules together cost at most 2 correct vetoes per 20 FALSE-gold rows: 9 of 162 is 1.1 per 20, inside it. (3) M-CONS is the largest class: yes among the unseen rows (8 of 21), and M-UNC + M-TIE are also the majority (13 of 21), which the same prediction named as weakening H3. (4) The run-to-run difference in the pooled false-veto rate is at least 3 points: **wrong**, it was 2.2 points (13.3% against 15.6%, on 45 rows). The per-row figure is not small: the veto-or-not outcome changed on 6.1% of rows, in both directions, which a pooled rate hides.

## Proposals (not applied)

Both change verdicts, and a verdict moves RepID (`vetoed` is -10, `flagged` is 0), so enabling either is a decision for Sean (MAJOR under CLAUDE_RULES r31). The patch lives with the run's other files (list below), not in this repository.

| rows | config | false vetoes | correct vetoes (FALSE-gold vetoed) | false passes |
|---|---|---|---|---|
| **run1, rows not seen when the hypotheses were formed** (156 TRUE, 162 FALSE scored) | baseline | 21 / 156 | 149 / 162 | 10 / 162 |
| | A: `HAL_VERDICT_DRIVEN_VETO=true` (existing flag, default off: a would-be veto with fewer than 2 FALSE families becomes `flagged`) | 8 / 156 | 140 / 162 | 10 / 162 |
| | B: tie guard (new flag `HAL_PLURALITY_TIE_GUARD`, default off: a tie, including 0 to 0, is held at `flagged`) | 12 / 156 | 142 / 162 | 10 / 162 |
| | A and B together | 8 / 156 | 140 / 162 | 10 / 162 |
| run2, the same rule on the other draw (39 TRUE, 48 FALSE scored; the same claims, not new ones) | baseline | 5 / 39 | 44 / 48 | 4 / 48 |
| | A, and B, and both | 2 / 39 | 41 / 48 | 4 / 48 |

A removes 13 false vetoes and holds 9 correct vetoes at `flagged`; neither changes a single false pass, because a downgraded veto becomes `flagged`, never `clean`: the cost is that 9 of 162 FALSE claims are held for review rather than rejected. B is the narrower option and adds nothing once A is on. The replay is a re-implementation of the engine's score-mode aggregation and reproduces the engine's recorded decision on 418 of 418 run1 rows and 118 of 118 run2 rows that had at least one usable vote (the 2 + 2 rows with none are engine fallbacks to its style-extractor and are not-checked everywhere). The engine's own `tests/hal/fact-check.test.ts` passes 23 of 23 untouched and 30 of 30 with patch B (23 plus 7 new tests); that is all that was run. Not checked: the rest of the engine's suite, a type-check of the whole project, any live run with a flag on, the effect on RepID deltas, and the production panel. No threshold was moved and no configuration was fitted to the evaluation rows; the two were fixed before those rows were analysed.

## Run-to-run noise

- rows scored in both runs: 98; HAL's outcome changed on 7/98 = 7.1% [3.5–14.0]; veto-or-not changed on 6/98 = 6.1% [2.8–12.7]; Cohen's kappa on the four-way outcome = 0.858
- pooled false-veto rate: run 1 6/45 = 13.3% [6.3–26.2], run 2 7/45 = 15.6% [7.7–28.8]; absolute difference 0.022
- largest run-to-run difference in false-veto rate over strata with at least 20 TRUE rows scored in both: 0
| stratum | TRUE rows scored in both | false-veto rate run 1 | run 2 | abs diff |
|---|---|---|---|---|
| fever | 11 | 0.091 | 0.182 | 0.091 |
| halueval | 5 | 0.4 | 0.2 | 0.2 |
| scifact | 3 | 0 | 0.333 | 0.333 |
| truthfulqa | 26 | 0.115 | 0.115 | 0 |
| fever/wikipedia-claims | 11 | 0.091 | 0.182 | 0.091 |
| halueval/hotpot-multihop-qa | 5 | 0.4 | 0.2 | 0.2 |
| scifact/biomedical-claims | 3 | 0 | 0.333 | 0.333 |
| truthfulqa/Misconceptions | 5 | 0.2 | 0.4 | 0.2 |
| truthfulqa/Fiction | 3 | 0.333 | 0 | 0.333 |
| truthfulqa/Health | 6 | 0 | 0 | 0 |
| truthfulqa/Sociology | 4 | 0 | 0 | 0 |
| truthfulqa/Economics | 3 | 0 | 0 | 0 |
| truthfulqa/Law | 5 | 0.2 | 0.2 | 0 |

Only one TruthfulQA stratum has 20 or more TRUE rows scored in both runs, so the "largest difference over rankable strata" is a single stratum (0) and says little; the pooled and per-row figures above are the ones to use. Any difference between two figures from this note that is smaller than the run-to-run flip rate (about 6% of rows change their veto-or-not outcome) should not be read as real. The differences in points 1 to 3 are far larger than that.

## Earlier numbers, and why none of them is comparable to this one

| figure | corpus and hash | families | where | why it is a different ruler |
|---|---|---|---|---|
| F1 0.8958 (TP 43, FP 5, FN 5, TN 46; AUC 0.973) | `rigorous-v1@596f10de18d0`, holdout split, N = 99 (48 FALSE, 51 TRUE) | 3 to 5 per row, keyed: llama, glm, gemini, mistral, qwen | `repid-engine` `reports/2026-08-09/HAL_QUORUM_F1_REPRODUCIBLE.md` [read] | the calibrator was fitted on these 99 rows (`MANIFEST.json`), the rows are public, the panel was wider and used paid providers |
| F1 0.678 (0.51 to 0.806) pooled; false veto 3 of 55 (5.5%, 1.9 to 14.9); false approval 1 of 36 | `traces@b2afb0720470` of `questions@fcc643fc4739`, 91 labelled claims | 1 to 3 (0.889 on the 71 rows with 2 or more) | the 2026-10-21 held-out ruler, `LANE_D_REDTEAM_RULERS.md` §3.3 and §10.3 [read] | periodic-table numbers answered from memory by three worker models, not a public benchmark |
| F1 0.34, 0.74, 0.842, 0.886, 0.890 and others | no corpus hash recorded | not recorded | `DECISIONS.md`, `lessons/hal-eval.md` [R: found by a search, not re-read] | no ruler, so not a result under r24 |
| **this note:** false veto 14.9%, false pass 5.7% | `hal-public-v1@47db82d2`, 420 rows | 2 to 3, free tier | this file | disjoint from the engine's own corpus; free-tier panel |

The 2026-10-21 figure (false veto 5.5% on numeric claims) and this one (14.9% on public text claims) are the same HAL code on different claims and different widths. They are two rulers, not a trend.

## What this does not show

- **Not production, not the product's accuracy.** The panel is the free-tier one above, run in process, on one night. Free providers rate-limit and time out differently hour to hour; this is one draw.
- **Not a held-out score.** The datasets are public and the voters may have seen them in training [R]. The engine's own corpus rows were removed, but nothing here controls for the voters having memorised TruthfulQA, FEVER or HaluEval.
- **The gold labels were not audited.** TruthfulQA best answers include statements whose literal reading is arguable; FEVER labels are relative to Wikipedia in June 2017; HaluEval's FALSE answers are model-written and at least one looks true. The false-veto rate is partly a statement about the labels.
- **Not-checked rows are not random.** 9.3% overall, 31.7% of HaluEval and 22.5% of SciFact; a row needing a slow voter is often a harder one, so the rates are for the rows that could be checked.
- **Question-and-answer text is not how HAL is usually used.** TruthfulQA and HaluEval rows were sent as `Q: … A: …` strings.
- **Paired rows, many looks.** A TRUE and a FALSE row share a question; no interval is corrected for that or for the number of strata examined.
- **run2 is 120 rows, not 420.** Run1 used about 126k of the free Groq tokens for `gpt-oss-20b`, a quota shared with other loops and possibly with production, so the re-run was limited. The noise figures rest on 98 rows.
- **A stranger cannot yet reproduce this with one command.** The scripts that built the corpus, ran HAL and made these tables live in the operator's loop folder, not in this repository. This note publishes the corpus manifest, the per-row outcomes and the hashes below; a stranger can re-derive the corpus from the pinned source files and the rules above, but not re-run HAL against the same free-tier state. Moving the scripts into the repository is a follow-up, not done here.

## Files that produced this (operator's loop folder `rulers-data/hal-public/`, and `reports/2026-10-24/hal/`; not in this repository)

| file | sha256 |
|---|---|
| `corpus-47db82d2.jsonl` | `47db82d22e9750429fd741c6a9c2b759ebfd9707c1ad588915b25e384f50690d` |
| `corpus-47db82d2.manifest.json` | `7803aad318137236d0035a77c2686f9128ec493650dbb20efd10586103d86667` |
| `build-corpus.mjs` | `38d355a5509577226c2d5202f194832f9c8654ca88d6127d41418df55dcfb371` |
| `hal-public-lib.mjs` | `90086c59b3ac7de39aa0e5814ea38d3d428ff520a6f5792dafe89780e71e1aff` |
| `hal-eval-logged.ts` (the runner) | `1f50830d67b4a23eed16b568f4445ea2612222a41f1359c2180711831b1774df` |
| `prepare-run.mjs`, `shard-run.mjs` | `7510792defcde963edd69cabe8d73c4daea417fcb53541d0e7f4c2c0ac0dbb81`, `400cd75cd2bc4b16bf546c0986c11298989a1ff41a84b264931ef986c4dd0f69` |
| `analyze.mjs`, `render-tables.mjs`, `rows-table.mjs`, `assemble-doc.mjs` | `8e24bc8b…2c9`, `3e1780f5…fa`, `32ac9a7a…42e`, `f9b727f7…d2e` |
| `replay-decision.mjs`, `counterfactual.mjs` | `b79629d5…bdf`, `68b801e9…f63` |
| `hal-public.check.mjs` (9 checks pass, including all 420 rows re-looked-up in their source files) | `1ee65ae9…163` |
| `0001-hal-plurality-tie-guard.patch` | `feb23b035f3396fb718cac32e103aa455a2f0966a77a96f75b427b32160eed07` |

Raw per-call logs and every HAL record (votes, models, confidences, decision reasons) for both runs are in `reports/2026-10-24/hal/raw/run1` and `run2`.
