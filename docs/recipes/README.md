# TrustShell recipes: use it from the tools you already have

Each recipe uses only what ships today in `@hyperdag/trustshell` (`@next` = 1.8.0-rc.0; the plain name once 1.8.0 is on `latest`). None needs an account, an API key or a model. Each says exactly what was run and what was not.

| Recipe | You use | Status (2026-10-22, Windows 11) | Run it |
|---|---|---|---|
| [`langgraph/recipe.py`](langgraph/recipe.py) | LangChain / LangGraph | **Verified**: 20 TrustShell tools load over MCP; `ground_quote` returns VERIFIED for a real quote and VETO for a misquote. Launches through `npx` and through `npx.cmd`. A LangGraph agent on top of the tools is not verified (needs a model). | `pip install langchain-mcp-adapters langgraph` then `python recipe.py` |
| [`smolagents/recipe.py`](smolagents/recipe.py) | Hugging Face smolagents | **Verified**, with one real gotcha: it needs `"mcp[ws]>=1.30,<2"`. The newest `mcp` 2.x breaks `mcpadapt`; `mcp` 1.x needs the websockets extra. A `CodeAgent` on top is not verified. | `pip install "smolagents[mcp]" "mcp[ws]>=1.30,<2"` then `python recipe.py` |
| [`github-actions/inspect-claim.yml`](github-actions/inspect-claim.yml) | GitHub Actions | **Command verified, workflow not yet run in Actions.** The step's shell block was run locally against a finished public run: exit 0 when the claim names the workflow exactly, exit 3 (NOT_CHECKED) when it does not. | copy the file; `simulate-step.sh` runs the block locally |
| [`mcp-clients/`](mcp-clients/README.md) | Claude Desktop, Cursor, Claude Code | **Launch verified, apps not.** The same stdio launch is exercised by the two recipes above; the three apps were not opened. | paste the config |
| OpenClaw | OpenClaw | The skill (`skills/trustshell/SKILL.md`) and the CLI exist. A hook adapter does **not**: its specification is [starter task 7](../good-first-issues.md#7-the-openclaw-hook-adapter-a-spec-and-a-harness). | n/a |

## What these prove, and what they do not
- `ground_quote` is a **local, deterministic text check**: the quote is, or is not, in the source you gave it. It does not say the quote is true, or that the source is trustworthy.
- The Inspect step (GitHub Actions) reads a **finished** run from api.github.com. SUPPORTED is scoped to the platform record, and a claim with a wrong workflow name is NOT_CHECKED, never SUPPORTED. It is not a code review.
- The MCP server does **not** expose Inspect (the CI-run check). Its `check_claim` tool is a different, model-based, hosted check. Only `ground_quote` and the note tools are local and deterministic.
- Nothing here is sandboxed: MCP servers run code on your machine. Read before you enable.

## Re-verify
`python langgraph/recipe.py` and `python smolagents/recipe.py` should print `20 TrustShell tools loaded` and one `VERIFIED exact_match` and one `VETO quote_not_found` line. If the tool count changes, the server changed: re-read its tool list.
