> **DEMO.** Sample output for review, generated from a real public GitHub Actions run. Not an official TrustShell result.

## TrustShell · claims checked against a GitHub Actions run

- **Run** `DealAppSeo/trustshell` · run 39290226738 · attempt 1 · commit `5cd68edc782fb2dd74e343e9335d3a8bcb04d5e5`
- **Workflow** `check` · `.github/workflows/check.yml`
- **GitHub reports** status `completed` · conclusion `success` · check verdict **COMPLETE**
- **Jobs** 1 of 1 read (HTTP 200): 1 success
- **Observed** 2026-10-20T00:52:20.903Z from api.github.com (LIVE at that time)
- **Evidence class** PLATFORM_REPORTED: GitHub describing its own run. A platform record, not an independent grade.

### Claims: 3 supported · 1 contradicted · 5 not checked

- **CONTRADICTED** `attempt 2`
  - **In** `CI passed on attempt 2.`
  - **Template** `gha.run_attempt`
  - **Why** The claim cites attempt 2; GitHub's record for run 39290226738 is attempt 1, its latest.
  - **Scope** Attempt identity only: whether the attempt this claim cites is the one GitHub's record describes. Not what that attempt shows.
  - **Fields** `/observation/run_attempt`
- **SUPPORTED** `The check workflow passed`
  - **In** `The check workflow passed on 5cd68edc (run 39290226738).`
  - **Template** `gha.run_succeeded`
  - **Why** GitHub reports conclusion "success" for run 39290226738 (attempt 1, commit 5cd68edc782f); 1 of 1 job concluded success. The sentence cites this run.
  - **Scope** Whether workflow run 39290226738 (attempt 1, commit 5cd68edc782f) concluded success with every job read. Not which tests it ran, not any other workflow or check on the commit, and not whether the change works.
  - **Fields** `/observation/status`, `/observation/conclusion`, `/observation/check/verdict`, `/observation/jobs`
- **SUPPORTED** `on 5cd68edc`
  - **In** `The check workflow passed on 5cd68edc (run 39290226738).`
  - **Template** `git.head_sha`
  - **Why** The inspected run's head_sha 5cd68edc782f begins with 5cd68edc.
  - **Scope** Commit identity only: whether the commit this claim cites is the one the inspected run ran on. A short SHA is matched as a prefix. Not what the commit changes or fixes.
  - **Fields** `/observation/head_sha`
- **SUPPORTED** `run 39290226738`
  - **In** `The check workflow passed on 5cd68edc (run 39290226738).`
  - **Template** `gha.run_id`
  - **Why** The cited run is the inspected run, 39290226738.
  - **Scope** Run identity only: whether the run this claim cites is the inspected run. Not what the run shows.
  - **Fields** `/observation/owner`, `/observation/repo`, `/observation/run_id`

### Not checked: 5 claims, and cryptographic integrity (none of these is a pass)

- **Task completion: not checked.** `Done` "Done" is not a fact a workflow run records. Only the narrower claims mapped from the same text are compared. In: `Done.`
- **All checks on the commit passing: not checked.** `CI passed` This sentence cites a commit, run or attempt that is not, or could not be matched to, the inspected run, so its outcome claims are not compared with this run. In: `CI passed on attempt 2.`
- **Tests passing: not checked.** `All tests pass` This sentence cites neither this run's commit nor its run id, so nothing ties the claim to run 39290226738 (attempt 1, commit 5cd68edc782f). In: `All tests pass.`
- **Production readiness: not checked.** `production ready` Readiness is a judgement, not something a workflow run reports. In: `It is production ready and fully secure.`
- **Broader security: not checked.** `fully secure` A CI run conclusion is not a security review, and no security result is mapped. In: `It is production ready and fully secure.`
- **Cryptographic integrity: not checked.** No signed attestation was present or verified. This version does not read attestations.

### What this does not prove

- This is what GitHub can confirm. It is not a judgement about whether the code is correct.
- It cannot show work done outside this repository, or on a branch that was never pushed.
- A passing test suite proves the tests that exist passed — not that the right tests exist.
- It does not establish who or what authored the change.
- SUPPORTED means the platform record matches the narrow scope written next to the claim. It is not a finding that the claim is true in any broader sense.
- A successful workflow run shows that run succeeded. It does not show which tests ran, that all tests or all checks passed, or that a change works.
- Only this one workflow run was read. Other workflows, check suites and status checks on the same commit were not.
- Every observed fact is GitHub reporting on its own run (PLATFORM_REPORTED). Nothing was re-run or independently observed.
- Broader security: not checked. A CI conclusion is not a security review.
- The record is not signed. Its SHA-256 shows whether the record changed after it was made, not who made it.

---

Record `dev.trustshell.action-evidence/0.1-draft` · sha-256 `b63eee19798554d0b7a40508fd3e3dd507542bc579495c55e943207d74be9275` over RFC 8785 canonical JSON · built by trustshell check --claims from api.github.com only; nothing uploaded
