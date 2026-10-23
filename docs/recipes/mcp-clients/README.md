# TrustShell MCP server in Claude Desktop, Cursor and Claude Code

The server is the `trustshell-mcp` command inside `@hyperdag/trustshell`. The older standalone `@hyperdag/trustshell-mcp` package is superseded (it predates `check_claim`); do not use it.

**Verified:** this exact launch, `npx -y -p @hyperdag/trustshell@latest trustshell-mcp`, starts server 1.8.0 and lists 20 tools (2026-10-23, Windows, `npx.cmd`). The same launch on 1.8.0-rc.0 listed 20 tools from two different MCP clients (LangChain adapters and smolagents) on Windows, through both `npx` and `npx.cmd`.
**Not verified:** the three apps below were not opened for this note. If one does not start the server, send us its log.

## Claude Code
```bash
claude mcp add trustshell -- npx -y -p @hyperdag/trustshell@latest trustshell-mcp
```

## Claude Desktop (`claude_desktop_config.json`) and Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "trustshell": {
      "command": "npx",
      "args": ["-y", "-p", "@hyperdag/trustshell@latest", "trustshell-mcp"]
    }
  }
}
```
On Windows, if the app cannot find `npx`, use `"command": "npx.cmd"`.

## What the server can and cannot do
- It exposes 20 tools. **Local, no network, no key:** `ground_quote`, `remember`, `recall`, `quarantine_list`. **Talk to the hosted engine:** `check_claim` (labels one sentence pass / veto / not-checked through the public classify endpoint, a model quorum), `verify_output` (the live HAL fact-check quorum), `get_repid` (a public RepID read; keyless). `kernel_receipt` needs `REPID_API_KEY`.
- **Inspect, the check of a claim against a GitHub Actions run, is a CLI command, not an MCP tool.** `check_claim` is a different thing: it is model-based and hosted. Do not describe one as the other.
- A note written over MCP is stored **untrusted and quarantined**; there is no release tool over MCP.
- The MCP server is **outside the owner policy**. That policy is Guard, merged into main but not in a release yet, which covers `trustshell run` and the CLI only. Do not treat the server as a sandbox.
