---
name: trustshell
description: Fact-check a claim, read an agent's live RepID, or verify its ZK proof by shelling out to the trustshell bins. Use when the user asks to verify a claim, look up a RepID, check a proof, or attach the local trustshell MCP server.
metadata: {"openclaw":{"emoji":"🛡️","requires":{"bins":["trustshell","trustshell-mcp"]},"install":[{"id":"npm","kind":"node","package":"@hyperdag/trustshell@1.4.0","bins":["trustshell","trustshell-mcp","hal"],"label":"Install @hyperdag/trustshell@1.4.0"}]}}
---

# Trustshell

## Prerequisite

The bins must already be on PATH:

```bash
npm i -g @hyperdag/trustshell@1.4.0
```

That install provides `trustshell`, `hal`, and `trustshell-mcp`. If `trustshell` is not on PATH, stop and say so. Do not install another package and do not start a server.

## Commands

These three shells are the whole skill. Quote the claim so the shell does not split it. Report the command's stdout and exit code. Do not rescore the claim, edit HAL, or change the quorum.

```bash
trustshell verify "<claim>"
trustshell repid <id>
trustshell proof <id> --verify
```

- `trustshell verify "<claim>"` exits 0 on PASS or FLAG and 1 on VETO. Report the verdict, trust score, and evidence the CLI printed.
- `trustshell repid <id>` prints the live score and tier. The number moves. Do not treat an example score as the current value.
- `trustshell proof <id> --verify` fetches the proof and verifies it with the bundled verifier. Report the CLI result.

## MCP

When the user wants tools instead of a one-shot shell, the stdio server is the local bin:

```json
{ "mcpServers": { "trustshell": { "command": "trustshell-mcp" } } }
```

Do not wrap that bin in `npx`. Do not add a second MCP package.

## Limits

Leave `TRUSTSHELL_API_URL` unset unless the user already set it. Do not invent an HTTP API or a new route. HAL stays as the CLI left it. Record-grounded fact checks are the case it handles, and paraphrases are weaker. Report the CLI verdict.
