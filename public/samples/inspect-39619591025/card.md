## TrustShell · claims checked against a GitHub Actions run

- **Run** `DealAppSeo/trustshell` · run 39619591025 · attempt 1 · commit `392797a69b6a3e57406cef210a8471585667e3af`
- **Workflow** `check` · `.github/workflows/check.yml`
- **GitHub reports** status `completed` · conclusion `success` · check verdict **COMPLETE**
- **Jobs** 1 of 1 read (HTTP 200): 1 success
- **Observed** 2026-10-22T05:14:10.035Z from api.github.com (LIVE at that time)
- **Evidence class** PLATFORM_REPORTED: GitHub describing its own run. A platform record, not an independent grade.

### Claims: 3 supported · 1 contradicted · 1 not checked

- **CONTRADICTED** `commit 5d1c5e3f57e1`
  - **In** `The check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.`
  - **Template** `git.head_sha`
  - **Why** The claim cites commit 5d1c5e3f57e1; the inspected run is on 392797a69b6a.
  - **Scope** Commit identity only: whether the commit this claim cites is the one the inspected run ran on. A SHA is matched as a prefix, and a match supports only at 12 or more hex characters. Not what the commit changes or fixes.
  - **Fields** `/observation/head_sha`
- **SUPPORTED** `The check workflow succeeded`
  - **In** `The check workflow succeeded, run 39619591025.`
  - **Template** `gha.run_succeeded`
  - **Why** GitHub reports conclusion "success" for run 39619591025 (attempt 1, commit 392797a69b6a); 1 of 1 job concluded success. The line cites this run.
  - **Scope** Whether workflow run 39619591025 (attempt 1, commit 392797a69b6a) concluded success with every job read. Not which tests it ran, not any other workflow or check on the commit, and not whether the change works.
  - **Fields** `/observation/status`, `/observation/conclusion`, `/observation/check/verdict`, `/observation/jobs`
- **SUPPORTED** `run 39619591025`
  - **In** `The check workflow succeeded, run 39619591025.`
  - **Template** `gha.run_id`
  - **Why** The cited run is the inspected run, 39619591025.
  - **Scope** Run identity only: whether the run this claim cites is the inspected run. Not what the run shows.
  - **Fields** `/observation/owner`, `/observation/repo`, `/observation/run_id`
- **SUPPORTED** `run 39619591025`
  - **In** `The check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.`
  - **Template** `gha.run_id`
  - **Why** The cited run is the inspected run, 39619591025.
  - **Scope** Run identity only: whether the run this claim cites is the inspected run. Not what the run shows.
  - **Fields** `/observation/owner`, `/observation/repo`, `/observation/run_id`

### Not checked: 1 claim, and cryptographic integrity (none of these is a pass)

- **This workflow run succeeding: not checked.** `The check workflow succeeded` This sentence cites a commit, run or attempt that is not, or could not be matched to, the inspected run, so its outcome claims are not compared with this run. In: `The check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.`
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

Record `dev.trustshell.action-evidence/0.1-draft` · sha-256 `e45fa23ae111f775c10438d94b56f228cd09cc8f90b10713412029b0aa92bb35` over RFC 8785 canonical JSON · built by trustshell check --claims from api.github.com only; nothing uploaded
