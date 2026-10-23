# Teach-back before the work, and the confidence stake (SHADOW)

Status: **shadow only.** Nothing calls it: there is no `trustshell` command, no MCP tool, no ruler,
no database table, and no path to RepID, reputation or stake. The stake multipliers below are numbers
in a report, never applied. Picking a stake rule or a weight is a MAJOR decision for Sean, made on
measured data (CLAUDE_RULES r23, r31).

Source: `src/learn/teach-back.ts` (record, rules, bridge, report) and `src/learn/confidence-stake.ts`
(the two rules and the honesty check). Built on the pre-action and outcome records of
[precommit-outcome.md](precommit-outcome.md). Tests: `tests/teach-back.test.ts`,
`tests/confidence-stake.test.ts`.

## The method

A teacher asks "do you understand?", and then, whatever the answer, "explain it back to me". If the
explanation is wrong, the teacher explains again in different words, with a new example and the output
wanted, until the student can say it in their own words. Clinicians call this teach-back. Asking "do
you understand?" alone is a poor check.

1. **Self-report first.** The agent answers "do you understand?" (`understands`, and a probability
   `p`) when the teach-back opens, before any restatement exists. It is never evidence.
2. **A round.** The agent writes a `restatement` in its own words, the `expected_output`, and one
   `example` of its own. A person or a deterministic check accepts or rejects it.
3. **On a rejection,** the person's `re_explanation` (different words, a new example, the desired
   output) is stored with the round, and the next round starts.
4. **On acceptance,** the record closes and is hashed. The accepted restatement and expected output
   become the `success_criterion` of the pre-action record, sealed by `precommit.ts` before the work.
5. **After the work,** a person or a deterministic check grades the outcome against that sealed
   criterion (`precommit.ts` outcome record; a model grader is refused there).

## The record

`dev.trustshell.teach-back/0.1-draft`: `task_id`, `agent` (`provider`, `model`, `version`),
`ask_sha256` (the ask itself is not stored), `self_report` (`understands`, `p`, `at`), `rounds`
(each `restatement`, `expected_output`, `example`, `at`, `verdict`, `re_explanation`),
`confirmed_by` (`kind` person or check, `id`), and `accepted_hash`, the RFC 8785 SHA-256 of the rest,
set on acceptance.

| Rule | Refusal |
|---|---|
| A model accepts the restatement | `MODEL_CONFIRMER` |
| The agent accepts its own restatement, under any kind | `SELF_CONFIRMED` |
| The self-report is not strictly earlier than round 1 | `SELF_REPORT_LATE` |
| A round is not later than the round before it | `ROUNDS_OUT_OF_ORDER` |
| The restatement mostly copies the ask, or a re-explanation it was given | `PARROTED` |
| A rejected round has no re-explanation | `NO_RE_EXPLANATION` |
| Anything after acceptance: another round, or an edit to any field | `EDIT_AFTER_ACCEPTANCE` |
| The record is checked against a different ask | `ASK_MISMATCH` |
| A criterion is asked for before any round is accepted | `NOT_ACCEPTED` |
| Two forecasts carry one teach-back's criterion, or two teach-backs name one task | `AMBIGUOUS_LINK` |

**The overlap guard is naive, on purpose.** It is the share of the restatement's distinct words
(function words left out) that also appear in the ask or in any re-explanation. Above 60% is
`PARROTED`. No stemming, no synonyms, no word order: a reordered copy is caught, a copy with a few
synonyms swapped in is not. It stops parroting and says nothing about correctness. 60% is a starting
point to tune on real rounds; it is never a model, because a model judging the paraphrase is the
model grader `precommit.ts` refuses.

**The criterion still has to pass `precommit.ts`.** `successCriterion` joins the two parts as
`<restatement> -- expected output: <expected output>`, and `sealFromTeachBack` hands it to
`sealPreAction` unchanged. That keeps #614's rules: printable ASCII, at most 300 characters, one
atomic statement (no "and", "or", "but", semicolon, question or second sentence). A restatement it
refuses is not yet one checkable criterion; the fix is another round.

## What it measures, and what it does not prove

`teachBackReport` gives, per agent (`provider/model@version`, never pooled):

- **rounds to accept:** how many rounds until the person accepted, as counts per round and a mean;
- **overclaim rate:** said "I understand", and round 1 was rejected;
- **self-report calibration:** the Brier score of `self_report.p` against "round 1 was accepted".
  It is calibrated and logged; it is **never staked**;
- **does understanding predict delivery:** the pass rate when round 1 was accepted against the pass
  rate when it took more rounds. UNKNOWN outcomes are censored and counted beside the rate;
- **the would-be RepID multiplier** under each stake rule below.

Below 20 graded items each figure is "not measured (needs 20, has n)", with the counts still shown.
An outcome is linked to a teach-back only through a forecast for the same task and agent whose sealed
`success_criterion` is exactly the accepted restatement.

**What it does not prove.** A fluent paraphrase is not understanding: models paraphrase well, and an
accepted restatement says the person could not tell the difference. The real test is the outcome,
graded against the sealed expected output. Teach-back is the cheap filter in front of that test,
catching a misread before the compute is spent. If round-1 acceptance turns out to predict a pass,
it becomes a candidate input to RepID; that is a decision for Sean on the measured numbers.

Also not proven: every time and the confirmer are **declared, not signed**, as in `precommit.ts`.
The acceptance hash catches an edit that does not recompute it. The pre-action seal is what fixes the
criterion, and the report links nothing whose seal carries a different one. An agent-to-agent
teach-back (the issuing agent as teacher) is a model judging, and is refused as a confirmer.

## The confidence stake: two rules side by side

The stake is the agent's sealed **`p_success`**, judged by the outcome's `execution`. `p_truth` is
never staked (it forecasts a different thing), and an UNKNOWN or ungraded outcome is never staked,
not even as 1x. Either rule is applied per task as **RepID \*= M^w**, `w` the task's weight.

- **(a) Bucket rule** (Sean's proposal): a claim at or above the threshold (0.9) pays 3x if right
  and 0.333x if wrong; any other claim pays 1x. Threshold and multipliers are parameters.
- **(b) Proper rule:** M = (2 × p_outcome)^b, with p_outcome = p if right and 1 − p if wrong, so a
  claim of 0.5 pays 1x either way. b = ln 3 / ln 1.9 = 1.7116, so 0.95-and-right pays 3x and
  0.95-and-wrong pays 0.019x. At w = 0.05, one confident miss undoes about 3.6 confident hits.

**Why (a) rewards bluffing.** RepID compounds, so an agent maximises its expected **log** multiplier.
Under (a), claiming "very high" is worth (2q − 1) ln 3 per task to an agent that is right with
probability q: positive for every q above one half. Under (b), the expected log is largest when the
claim equals q (the log score is strictly proper). The weight drops out: ln(M^w) = w ln M.

`honestyCheck(rule)` takes true accuracies 0.05 to 0.95, finds the claims (0.01 to 0.99) that
maximise E[ln M], and lists the accuracies where the truth is not among them:

| True accuracy | (a) best claim | (a) gain over the truth, E[ln M] | (b) best claim |
|---|---|---|---|
| 0.05 – 0.45 | anything below 0.9 (flat) | 0 | = the accuracy |
| 0.50 | anything (flat) | 0 | 0.50 |
| 0.55 | 0.90 – 0.99 | 0.110 | 0.55 |
| 0.60 | 0.90 – 0.99 | 0.220 | 0.60 |
| 0.65 | 0.90 – 0.99 | 0.330 | 0.65 |
| 0.70 | 0.90 – 0.99 | 0.439 | 0.70 |
| 0.75 | 0.90 – 0.99 | 0.549 | 0.75 |
| 0.80 | 0.90 – 0.99 | 0.659 | 0.80 |
| 0.85 | 0.90 – 0.99 | 0.769 | 0.85 |
| 0.90, 0.95 | 0.90 – 0.99 (truth included) | 0 | = the accuracy |

So (a) has a bluffing band from 0.55 to 0.85: every agent in it does better claiming "very high"
than telling the truth. At a threshold of 0.95 the band reaches 0.90. (b) has none. Below one half,
(a) is flat: the truth is among the best claims, but so is nearly every other claim, so it does not
reward honesty either.

Two more readings of (a), from the design notes: by the arithmetic mean, a 30%-sure agent expects
1.13x by claiming "very high", and the break-even is 25%.

**(b) is honest only because the stake compounds.** Its arithmetic mean still pays an overclaim (a
60% agent expects 1.81x claiming 0.95 against 1.09x claiming 0.6). Applied as RepID \*= M^w, what
matters is the log, and there the truth wins. Added to RepID instead of multiplied, (b) would not be
honest. A claim of exactly 1.0 that is wrong makes M = 0; a live version would cap claims (say at
0.99). Both are for Sean to decide with the rule, not here.
