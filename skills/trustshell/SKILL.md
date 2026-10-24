---
name: trustshell
description: Fact-check a claim, read an agent's live RepID, verify its ZK proof, or print after-create and Honesty A by shelling out to the published bins. Use when the user asks to verify a claim, look up a RepID, check a proof, see can_verify, or attach the local trustshell MCP server.
metadata: {"openclaw":{"emoji":"🛡️","requires":{"bins":["trustshell","trustshell-mcp"]},"install":[{"id":"npm","kind":"node","package":"@hyperdag/trustshell@1.8.0","bins":["trustshell","trustshell-mcp","hal"],"label":"Install @hyperdag/trustshell@1.8.0"}]}}
---

# Trustshell

## Prerequisite

The bins must already be on PATH:

```bash
npm i -g @hyperdag/trustshell@1.8.0
```

That install provides `trustshell`, `hal`, and `trustshell-mcp`. If `trustshell` is not on PATH, stop and say so. Do not install another package and do not start a server.

## Commands

These four shells call the hosted engine. Quote the claim so the shell does not split it. Report the command's stdout and exit code. Do not rescore the claim, edit HAL, or change the quorum.

```bash
trustshell verify "<claim>"
trustshell repid <id>
trustshell proof <id> --verify
trustshell status
```

## Local notes

When `trustshell --help` lists these three, they stay on this machine. They do not call a vendor. `trustshell remember` refuses a value that contains `sb_secret_`, `postgresql://`, or `eyJ` and writes nothing.

```bash
trustshell remember KEY VALUE
trustshell recall KEY
trustshell redact KEY
```

`trustshell recall KEY` prints `NOT_CHECKED` when the key is missing. `trustshell redact KEY` deletes that row.

## When to call status

After an agent is created, run `trustshell status`. It prints the after-create cells, including `can_verify`, and one Honesty A line. Report that stdout. `NOT_CHECKED` is not a pass.

- `trustshell verify "<claim>"` exits 0 on PASS or FLAG, 1 on VETO, 2 when HAL did not decide (NOT_CHECKED, never a pass), 3 on a network or backend error, and 4 (ASK) only when `TRUSTSHELL_LAYA` is set and a person has to answer. Report the verdict, trust score, and evidence the CLI printed.
- `trustshell repid <id>` prints the live score and tier. The number moves. Do not treat an example score as the current value.
- `trustshell proof <id> --verify` fetches the proof and verifies it with the bundled verifier. Report the CLI result.

## MCP

When the user wants tools instead of a one-shot shell, the stdio server is the local bin:

```json
{ "mcpServers": { "trustshell": { "command": "trustshell-mcp" } } }
```

Do not wrap that bin in `npx`. Do not add a second MCP package.

## On trustshell.dev

The homepage is install-first (2026-10-24): `Check what your AI agent did, not what it says it did.` It shows one command that checks a pinned public run with `--claims` and catches a claim that names the wrong commit, the real output of that command, and `Install it where you work` with three tabs: Terminal, Coding agent (a rules-file snippet so an agent checks itself before it says CI passed) and MCP. Nothing is sent on load. The one-sentence check moved to `/check`, where you paste one sentence and get Checks out, Caught or Not checked.

Other ways in:

- In Chrome: the extension stamps replies on ChatGPT, Claude, Gemini, Grok and DeepSeek.
- In Claude Desktop, Cursor or Claude Code: an MCP paste. It runs `trustshell-mcp` from `@hyperdag/trustshell@1.8.0` through `npx -y -p`, for someone without the global install. With the prerequisite above, use the block under MCP instead. The ChatGPT and Grok apps do not load MCP servers yet; on their websites the Chrome extension stamps replies.
- In your terminal: one `check` of a sample sentence through `npx`. It exits 0 when it checks out, 1 when caught, 2 when not checked. To keep it installed:

```bash
npm i -g @hyperdag/trustshell@1.8.0
```

After that, `Want an agent you can trust?` leads to /pai: three questions make an agent, and the same six-step bar as /bind shows the rest of the path (claim, fund, stake, trade, earn).

## Limits

Leave `TRUSTSHELL_API_URL` unset unless the user already set it. Do not invent an HTTP API or a new route. HAL stays as the CLI left it. Record-grounded fact checks are the case it handles, and paraphrases are weaker. Report the CLI verdict.
