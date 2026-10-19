> **DEMO.** Sample output for review, generated from a real public GitHub Actions run. Not an official TrustShell result.

## TrustShell · claims checked against a GitHub Actions run

- **Run** `DealAppSeo/trustshell` · run 39290226738 · attempt 1 · commit `5cd68edc782fb2dd74e343e9335d3a8bcb04d5e5`
- **Workflow** `check` · `.github/workflows/check.yml`
- **GitHub reports** status `completed` · conclusion `success` · check verdict **COMPLETE**
- **Jobs** 1 of 1 read (HTTP 200): 1 success
- **Observed** 2026-10-19T22:32:01.512Z from api.github.com (LIVE at that time)
- **Evidence class** PLATFORM_REPORTED: GitHub describing its own run. A platform record, not an independent grade.

### Claims: 2 supported · 1 contradicted · 3 not checked

- **CONTRADICTED** `All tests pass and CI is green on 5cd68edc (run 39290226738, attempt 2).`
  - **Template** `gha.run_id`
  - **Why** The claim names attempt 2; GitHub's record for run 39290226738 is attempt 1, its latest.
  - **Scope** Run identity only: which run and which attempt this record describes. Not what the run proves.
  - **Fields** `/observation/owner`, `/observation/repo`, `/observation/run_id`, `/observation/run_attempt`
- **SUPPORTED** `All tests pass and CI is green on 5cd68edc (run 39290226738, attempt 2).`
  - **Template** `ci.run_passed`
  - **Why** GitHub reports conclusion "success"; 1 of 1 job concluded success, all on this commit and attempt.
  - **Scope** This one workflow run (run 39290226738, attempt 1, commit 5cd68edc782f): the run conclusion and the conclusions of its jobs. Not which tests exist or ran, and not any other workflow on this commit.
  - **Fields** `/observation/status`, `/observation/conclusion`, `/observation/check/verdict`, `/observation/jobs`
- **SUPPORTED** `All tests pass and CI is green on 5cd68edc (run 39290226738, attempt 2).`
  - **Template** `git.head_sha`
  - **Why** The run's head_sha 5cd68edc782f begins with 5cd68edc.
  - **Scope** Commit identity only: which commit this run ran on. A short SHA is matched as a prefix. Not what the commit changes or fixes.
  - **Fields** `/observation/head_sha`

### Not checked (none of these is a pass)

- **Task completion: not checked.** `Done.` "Done" is not a fact a workflow run records. Only the narrower claims mapped from the same text are checked.
- **Broader security: not checked.** `The 1.7.0 release is production ready and fully secure.` A CI run conclusion is not a security review, and no security result is mapped.
- **Production readiness: not checked.** `The 1.7.0 release is production ready and fully secure.` Readiness is a judgement, not something a workflow run reports.
- **Cryptographic integrity: not checked.** No signed attestation was present or verified. This version does not read attestations.

### What this does not prove

- This is what GitHub can confirm. It is not a judgement about whether the code is correct.
- It cannot show work done outside this repository, or on a branch that was never pushed.
- A passing test suite proves the tests that exist passed — not that the right tests exist.
- It does not establish who or what authored the change.
- SUPPORTED means the platform record matches the narrow scope written next to the claim. It is not a finding that the claim is true in any broader sense.
- Only this one workflow run was read. Other workflows, check suites and status checks on the same commit were not.
- Every observed fact is GitHub reporting on its own run (PLATFORM_REPORTED). Nothing was re-run or independently observed.
- Broader security: not checked. A CI conclusion is not a security review.
- The record is not signed. Its SHA-256 shows whether the record changed after it was made, not who made it.

---

Record `dev.trustshell.action-evidence/0.1-draft` · sha-256 `f016d2c22e534fcc0ede452be09e41202014329e50a1564f41f195489493d4be` over RFC 8785 canonical JSON · built by trustshell check --claims from api.github.com only; nothing uploaded
