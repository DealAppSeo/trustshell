<!-- doc-version: historical -->
# Does the harness get harder to break overnight? A frozen attack corpus, before and after (2026-10-24)

A dated record of one night, not a live check and not a security claim. Every number below names its ruler (the corpus hash, the build, the runner). Numbers on different rulers are not compared.

## The method, in four lines

1. Freeze a corpus of attack cases (`trustshell.break-it/1` fixtures: files, CLI steps, a `control` that must hold so the case proves something, and `confirm` assertions that hold only if the tool did the wrong thing). Record the sha256 of the corpus file before anything is measured.
2. Replay it against a pinned build. A **program** decides each case: `CONFIRMED` (every confirm assertion held), `NOT_REPRODUCED`, or `INVALID` (its own control failed, so it proves nothing). No model decides an outcome.
3. For each case that is a real defect: write the failing test first, make the smallest fix, open one small draft PR.
4. Replay the **same** corpus on the fixed build and report both columns.

## Who attacked

- **Three free model families** wrote cases: `openai` (gpt-oss-120b on Groq), `qwen` (qwen-3.8-27b on Cerebras), `llama` (llama3.1:8b, local, CPU). A judge read each case the program called CONFIRMED, and was never the family that wrote it (qwen judged openai and llama, openai judged qwen). A judge's word is a reading, not a certificate.
- **`prior-lane`** cases (8) are the earlier break-it fixtures from the loop's own folder.
- **`reviewer`** cases are not from a model family: they were found by **Claude reading the code and sweeping the commands that print text from a file** (not every command), then written as fixtures *before* the fix. They are kept apart in every table so the families' numbers stay the families'.

## Rulers

| run | corpus (sha256, first 8) | fixtures | build under test (built `dist/`, LF-normalised hash) | reps |
|---|---|---|---|---|
| cycle 1, before | `2a4880e3` | 56 | `main` 6a118b1f, `1.9.0-dev.0`, `9468c7e9a775` | 2 |
| cycle 1, after | `2a4880e3` | 56 | + 2 fixes, `190d3d9e61eb` | 2 |
| cycle 2, before | `a05438a8` | 25 | `190d3d9e61eb` | 2 |
| cycle 2, after | `a05438a8` | 25 | + 3 fixes, `d794f54f35f7` | 2 |
| cycle 3, before | `b3f549d0` | 12 | `d794f54f35f7` | 2 |
| cycle 3, after | `b3f549d0` | 12 | + 1 fix, `bce51b84c3c3` | 2 |
| corpus 1 on the build after cycle 2 | `2a4880e3` | 56 | `d794f54f35f7` | 1 |
| corpus 1 and 2 on the final build | `2a4880e3`, `a05438a8` | 56, 25 | `bce51b84c3c3` | 1 |
| corpus 1 on published npm 1.8.0 | `2a4880e3` | 56 | tarball sha256 `52669e3c31cc0c27855a03ffa63ea0ac0b12ca72ed63831a7e21160714a527bf`, `78fbe676bcc2` | 2 |
| corpus 2 on published npm 1.8.0 | `a05438a8` | 25 | the same tarball (standalone `replay.mjs`) | 1 |

Node 22.17.0, Windows 11. No fixture was UNSTABLE across repetitions in any run (a fixture whose two repetitions disagree would be reported as UNSTABLE). Between the cycle-1 builds, the two `dist/` trees differ in exactly two files (`dist/lib/guardrails.js`, `dist/cli/bundle.js`); between cycle 1 and 2, in exactly three (`dist/cli/bundle.js`, `dist/cli/guard.js`, `dist/cli/profile.js`).

## Result

C / N / I = CONFIRMED / NOT_REPRODUCED / INVALID. "Valid" = C + N, the cases that exercised something.

**Cycle 1, corpus `2a4880e3`** (56 cases)

| origin | cases | before C / N / I | after C / N / I |
|---|---|---|---|
| model: openai | 22 | 2 / 9 / 11 | 2 / 9 / 11 |
| model: qwen | 23 | 1 / 14 / 8 | 1 / 14 / 8 |
| model: llama | 1 | 1 / 0 / 0 | 1 / 0 / 0 |
| prior lane | 8 | 0 / 8 / 0 | 0 / 8 / 0 |
| reviewer | 2 | 2 / 0 / 0 | 0 / 2 / 0 |
| **all** | **56** | **6 / 31 / 19** | **4 / 33 / 19** |

**Cycle 2, corpus `a05438a8`** (25 cases, written against the cycle-1 build)

| origin | cases | before C / N / I | after C / N / I |
|---|---|---|---|
| model: openai | 8 | 3 / 3 / 2 | 3 / 3 / 2 |
| model: qwen | 10 | 0 / 10 / 0 | 0 / 10 / 0 |
| model: llama | 3 | 0 / 0 / 3 | 0 / 0 / 3 |
| reviewer | 4 | 4 / 0 / 0 | 0 / 4 / 0 |
| **all** | **25** | **7 / 13 / 5** | **3 / 17 / 5** |

**Cycle 3, corpus `b3f549d0`** (12 cases, written against the cycle-2 build, aimed at one class: a credential shape the detector does not know). This corpus is **not committed**, and neither is its one reviewer case: the models' fake keys trip gitleaks (4 findings), and the reviewer case's fake key bodies trip GitHub's own push protection (an xAI-shaped key), even though every body is fake and low-entropy. Only its hash is here. The permanent test for the fix (`tests/antifragile-credential-shapes.test.ts`, PR #642) builds the same eight key shapes at runtime from parts, so no secret-shaped literal is in the repository. The cycle-3 numbers below are therefore not replayable from this folder.

| origin | cases | before C / N / I | after C / N / I |
|---|---|---|---|
| model: openai | 5 | 0 / 5 / 0 | 0 / 5 / 0 |
| model: qwen | 6 | 0 / 0 / 6 | 0 / 0 / 6 |
| model: llama | 0 | n/a | n/a |
| reviewer | 1 | 1 / 0 / 0 | 0 / 1 / 0 |
| **all** | **12** | **1 / 5 / 6** | **0 / 6 / 6** |

The local llama round for cycle 3 was still computing at the freeze, so it is not in the corpus; it returned 2 cases afterwards, both INVALID on the pre-fix build.

Only the cases named below changed verdict; in each run every other case has the same verdict before and after. Corpora 1 and 2 replayed on the final build, after all seven fixes, are 4 / 33 / 19 and 3 / 17 / 5, the same as their own "after" columns: the later fixes broke nothing that the earlier cycles had settled.

## What the free models found: nothing that was real

Of the 7 model-written cases the program called CONFIRMED across the three cycles (4 in cycle 1, 3 in cycle 2, none in cycle 3, whose 11 model cases all failed to reproduce or proved nothing), **none is a defect**. I read all seven. Each one's confirm assertion holds on *correct* behaviour:

| case | judge's reading | my reading |
|---|---|---|
| `af-llama-r1-guard-rule-changes-leave-no-receip` | disclosed (qwen) | ill-posed: asserts the policy lists the tool it was told to list |
| `af-openai-r3-guard-check-spend-amount-invalid` | disclosed (qwen) | ill-posed: claims the tool allows a bad amount, asserts it printed DENIED |
| `af-openai-r5-inspect-fake-intact` | **defect** (qwen) | ill-posed: asserts `inspect` says BROKEN for a broken log, which is right |
| `af-qwen-r3-guard-ledger-checkpoint-forgery` | cannot tell (openai) | ill-posed: the "ledger" is a file in the project folder the guard never reads |
| `af-openai-r6-af-qwen-r6-bundle-import-accepts-n` | **defect** (qwen) | ill-posed: asserts the bundle is REFUSED, which is right |
| `af-openai-r6-af-qwen-r8-guard-check-amount-stri` | disclosed (qwen) | ill-posed: asserts DENIED, which is right |
| `af-openai-r7-escape-note-report` | ill-posed (qwen) | ill-posed |

So the judge called an ill-posed case a defect 2 times in 7. That is why a judge never certifies anything here, and why the program, not a model, decides and a person reads. The rest of the model-written cases either failed (`NOT_REPRODUCED`: the defence held) or proved nothing (`INVALID`: 19 of 56 and 5 of 25 across all origins). `INVALID` means the case's own setup check failed, so it proves nothing either way.

## What the reviewer found, and fixed

Seven defects, each with a permanent test written first (it failed on the unfixed source for the stated reason and passes after) and one draft PR. **Five of the seven are in code that is not in the published 1.8.0**: that tarball predates the `guard` and `bundle` commands (`unknown command`), so replaying corpus 1 on it gives 1 / 4 / 51 and corpus 2 gives 1 / 1 / 23, nearly all INVALID because the commands do not exist. **Two are in the published 1.8.0**: the same fixtures are CONFIRMED on that tarball. `profile show` (finding 6) needs hostile text from a profile file the owner did not write, for example a `.trustshell/profile.md` shipped inside a cloned repository. The provider-key shapes (finding 7) need nothing but the user pasting a key.

| # | finding | corpus fixture | test | PR |
|---|---|---|---|---|
| 1 | a guard-ledger line that is valid JSON but not a record (`null`) crashes `guard show`, `guard check`, `guard init --force`, `run` and `bundle` with a TypeError instead of reading BROKEN | `af-review-ledger-null-line-crashes-guard` | `tests/antifragile-ledger-shape.test.ts` | #635 |
| 2 | `bundle verify` / `export` print a carried evidence name raw (needs a signer the reader trusted) | `af-review-bundle-verify-evidence-name-escape` | `tests/antifragile-bundle-verify-scrub.test.ts` | #636 |
| 3 | `bundle verify` / `import` quote an unknown field name or bad `schema` raw in the REFUSED message, **before any signature check**, so an unsigned file from anyone reaches the terminal | `af-review-bundle-verify-unsigned-key-escape` | `tests/antifragile-bundle-error-scrub.test.ts` | #639 |
| 4 | `guard show` prints a policy `subject` raw | `af-review-guard-show-subject-escape` | `tests/antifragile-guard-show-scrub.test.ts` | #638 |
| 5 | `guard show` (and `bundle export`) print an unparseable policy's problem lines, which quote the file's own key text, raw | `af-review-guard-show-invalid-policy-key-escape` | same file | #638 |
| 6 | `profile show` prints the profile and its "problem:" lines raw (**also in published 1.8.0**) | `af-review-profile-show-escape` | `tests/antifragile-profile-show-scrub.test.ts` | #637 |
| 7 | the credential detector (`remember`, `bundle export`, and the redactor on text bound for the hosted engine) does not know a bare Groq, Cerebras, xAI, Perplexity, Fireworks, Supabase, Tavily or Replicate key (**also in published 1.8.0**); the fix also changes the Chrome extension's copy of the redactor | `af-review-remember-accepts-provider-keys` | `tests/antifragile-credential-shapes.test.ts` | #642 |

Findings 2 to 6 are one class (text from a file or bundle reaching the terminal unscrubbed) that `inspect`, `report` and `bundle context` had each been fixed for on 2026-10-21; these were the siblings. Finding 1 came from a shape fuzz of 15 readers (165 runs: `null`, `[]`, `5`, `"x"`, `{}`, … as a whole file or a line), which found no other crash. Finding 7 came from running the detector on the key shapes the loop's own scrubber already knew; the three model families were then pointed straight at that class in a directed round (cycle 3, below) and did not find it.

## What a dead key or a 429 cost

Counted from the driver's own ledger (94 model attempts over the three cycles, 2026-10-24 06:31Z to 09:20Z): **0** dead-key, HTTP 404/410 or auth failures; **1** HTTP 429 (Groq), waited 65 s, retried, succeeded. 17 attempts returned no usable cases, none for a provider reason. By my reading of the ledger: 5 were my driver's own defects (a regex mangled by my shell, 3; a fetch timeout shorter than a CPU-bound local model needs, 2), 7 were a reasoning model spending its output budget thinking (fixed by setting its reasoning effort), 5 were the model emitting malformed JSON (fixed by the provider's JSON mode). None of these is a result about the tool. The two other free models the loop's router lists (nvidia nemotron, minimax on OpenRouter) are marked gone by that loop and were not called.

## What this does not show

- It does not say the harness is secure or hard to break. It counts what these attackers, with these prompts, on these corpora, found. The attackers were weak (free 8B to 27B models, one pass, no adaptive loop against a defender), and from cycle 2 they were told the two classes cycle 1 had found, which makes them more adaptive but also makes cycle 2's yield a poor guide to cycle 1's.
- The corpus is small (56 and 25). A fix flips the cases that name it; it says nothing about cases nobody wrote.
- `CONFIRMED` is a mechanical reading of the assertions, and 7 of 7 model-written ones were not defects. Treat every CONFIRMED as something to read.
- The reviewer's six are one reader's. A different reader, or a model reading the same source, may find others or none of these.
- One platform (Windows 11, Node 22.17.0) and one run per replay setting.
- **The instrument had a weakness, found late.** The loop's runner scores a step that its 30 s clock killed as an ordinary exit code, and on a heavily loaded machine that flipped one case's label once (a single-case check, outside the two corpora). Every corpus run here was repeated (two repetitions; one for the regression and replay checks) and none disagreed with itself, but a timeout that hit both repetitions would not show. `replay.mjs` now reports a killed step as INVALID, not as a result. The published-1.8.0 replay rows were taken before that fix and were re-run after it with the same labels (see the pull request).

## Replay it

Node 22, built-ins only, no network, no key. `--pkg` is a directory that holds `dist/cli/index.js` (an installed `@hyperdag/trustshell`, or this repo after `npm run sdk:build`).

```bash
node docs/measurements/antifragile/replay.mjs --pkg <package dir> --corpus docs/measurements/antifragile/corpus-2a4880e3.jsonl
node docs/measurements/antifragile/replay.mjs --pkg <package dir> --corpus docs/measurements/antifragile/corpus-a05438a8.jsonl
```

It prints one label per case and a `REPLAY {...}` line with the corpus hash it read (sha256 of the file with LF line endings, which is how it was frozen; git on Windows checks the file out with CRLF, so the raw bytes would hash differently). On the pinned builds above it reproduced all 56 and all 25 labels of the loop's runner (checked once each). `replay.mjs` is a trimmed copy of that runner; the loop that wrote the cases and drove the models is not in this repository.

## Records

- `corpus-2a4880e3.jsonl`, `corpus-a05438a8.jsonl`: the frozen corpora, one case per line with its origin, model and (for model cases) round.
- `replay.mjs`: the standalone replay above.
