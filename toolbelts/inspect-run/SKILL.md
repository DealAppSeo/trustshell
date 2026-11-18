---
name: inspect-run
description: Check what was said about one public GitHub Actions run against GitHub's own record of that run, with no account or key. Use when asked whether a CI run, workflow or job did what an agent or a person said it did.
compatibility: Requires @hyperdag/trustshell 1.9.1 (trustshell or trustshell-mcp) and network access to api.github.com only.
---

# inspect-run

One job: check claims about one GitHub Actions run against GitHub's record of it. Deterministic; no model is called.

## The one call you may make

CLI:

    trustshell check <runUrl> --claims "<one sentence per line>" --json

MCP (`trustshell-mcp`): the `inspect_run` tool, with `run_url` and `claims`.

`<runUrl>` is `https://github.com/<owner>/<repo>/actions/runs/<id>`. Quote the claims.

## What the answer means

| CLI exit | MCP | meaning |
|---|---|---|
| 0 | status all_supported | every claim SUPPORTED, on a finished run that passed |
| 1 | status contradicted | a claim is CONTRADICTED, or the run failed |
| 3 | status not_checked | something could not be checked; never a pass |
| 2 | status refused | the input was refused |
| 5 | isError, text starts DENIED | your grant does not cover this call: stop and say so |

Report each claim's status, the exit code and `digest.value`. Do not rescore a claim.

## Limits

- Your grant allows `tool:check` and nothing else. The harness enforces that, not you: any other trustshell command or tool is refused.
- Do not set GITHUB_TOKEN or pass any key. None is needed.
- A SUPPORTED claim is not permission to merge, deploy or pay.
- The grant expires. After that, or once the owner revokes it, every call is refused.

## Self-test

`trustshell check https://github.com/DealAppSeo/trustshell/actions/runs/42502305639 --claims "The check workflow succeeded, run 42502305639." --json` must exit 1 with that claim CONTRADICTED. Anything else means the belt is not working: stop.
