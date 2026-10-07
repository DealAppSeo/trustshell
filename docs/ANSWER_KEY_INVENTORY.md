# Answer-key and holdout inventory (F-2), 2026-10-07

**Why this exists.** Sean decided on 2026-10-07 (BUS S56, step 1) to strip the sentences from
the public answer key, leaving links and hashes. This is the list that has to come before any
strip: every committed file that holds a labelled claim, who reads it, and whether the reader
needs the text. It changes the trade, so the strip waits on **BUS S60**.

**How it was counted.** `git ls-files` in repid-engine and trustshell (and trinity-ecosystem for
comparison). Each holdout sentence was matched exactly against every tracked file after
`json.loads`. Counts are parsed rows. First-public dates come from the GitHub commits API on
`main`, because the local clones are shallow and `git log` stops at the clone depth.
VERIFIED unless marked.

## The finding in one paragraph

The holdout sentences have been public since July 2026, in six files, in git history and in one
fork. Deleting them from `HEAD` unpublishes nothing. Even with the sentences gone, a
`source_id` field gives away the label on 190 of 337 rows, and 290 rows are public benchmark
items anyone can look up from `source_id` and `url`. A holdout that has been public cannot be made
secret again: it has to be **retired and replaced** by one that never enters git.

## 1. Holdouts (secrecy is their whole point): repid-engine

| file | rows | holdout | first public |
|---|---|---|---|
| `data/hal_corpus_v1/rigorous-v1.jsonl` | 331 | 99 | 2026-08-06 |
| `data/hal_corpus_v1/canary-v1.jsonl` | 50 | 15 | 2026-08-06 |
| `eval/rigorous/rigorous-corpus-v1.jsonl` | 337 | 99 of 99 | 2026-07-09 |
| `eval/canary/canary-corpus-v1.jsonl`, `-v1.1.jsonl` | 50, 47 | 15 of 15, 14 of 15 | 2026-07-08 |
| `reports/2026-07-09/rigorous-raw.json` | 337 results | 99 of 99 | 2026-07-09 |
| `reports/2026-07-07/canary-f1-raw-*.json` | 50 results | 15 of 15 | 2026-07-08 |

So the holdout was public a month before it was named one. Three rigorous holdout sentences
also sit in canary-v1's **train** split.

**Readers that need the text:** the frozen-corpus runners in `scripts/hal-eval/`, the rigorous
and canary eval scripts in `scripts/eval/`, the candidate-voter workflow (which sends all 337
sentences to third-party hosts), and three CI tests (`corpus-files`, the offline eval,
`reskin`). **Readers that need only an id:** `backtest-classify.ts`, the candidate-voter test,
and the ledger's scoring. `model-leaderboard.ts` matches by sentence text and could match by id.

## 2. Answer keys

- **repid-engine `eval/answer-key/`** (public since 2026-10-06): 21 of our own claims, as seeds,
  runs, SQL inserts and a README table. The checkers read only each claim's structured `spec`,
  not its sentence, but that `spec` restates the claim (entity, property, expected value). One
  claim is also a canary holdout sentence, and two are homepage copy.
- **trustshell `examples/traps/traps.jsonl`** (public since 2026-10-05): 14 statements with
  their expected answer; 4 are homepage copy. It sits under `examples/`, so it may be public on
  purpose.
- **Other labelled sets in repid-engine:** the HAL ablation corpus (243, 109 of them exported
  from production), the JEV shadow corpus (105), `scripts/hal-eval/corpus.ts` (20), the red-team
  planted answers (23) and the medical-grounding cases (10).

## 3. Test fixtures: keep

Unit tests need their text: `tests/fixtures/hal-regression.json` (61), the sim fixtures (10 and
8), the deception corpus (8), and a few stray one-line quotes in tests and reports.

## 4. Demo copy: public on purpose, do not strip

trustshell's homepage samples, the measured home cards, the `/devs` and `/start` pages, the
README, and the CLI's unlabelled traps fixture (shipped on npm).

## Already in the stripped form (models to copy)

Baseline runs that keep only id and truth; the corpus `MANIFEST.json` (sha256 and counts); the
answer-key `record` (url, sha256, locator); `hal_evaluations.prompt_text_hash`; and canary row
ids, which are already `sha256(claim)[:12]`. The checker ledger already has the switch the
replacement needs: `ledger_items.holdout`, commented "never exported, never in git".

## Smallest change per reader, if the text moves out

Read the sentences from an env-pointed private file or the service-key-only table; when absent,
exit 2 or skip and say NOT_CHECKED, never pass quietly. Four scripts already take the path from
an env var or flag (`RIG_CORPUS`, `CLEAN_CORPUS`, `RESKIN_CORPUS`, `traps.mjs --file`). The
canary script, the frozen-corpus runners and the four CI tests need the switch added.

## NOT CHECKED

- Copies on other branches, open PRs and the fork.
- What the Supabase tables hold today (`ledger_items.claim`, `ak_claims.claim`).
- The date repid-engine became public; the API gives only its creation date, 2026-04-14.
