# Claude Code

Tested with Claude Code 2.1.157.
The package was `@hyperdag/trustshell@1.5.0`. `trustshell --version` printed 1.5.0. The existing global bin was left in place. This copy was installed with npm at that exact version, and its `trustshell-mcp` was put first on PATH for the test.

## Install

```
npm i -g @hyperdag/trustshell@1.5.0
```

That provides `trustshell` and `trustshell-mcp`.

## Config

From the project directory:

```
claude mcp add --scope project trustshell -- trustshell-mcp
```

Claude Code 2.1.157 wrote this `.mcp.json`:

```json
{
  "mcpServers": {
    "trustshell": {
      "type": "stdio",
      "command": "trustshell-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

`claude mcp get trustshell` reported scope project and status Pending approval. This session did not run `claude` to approve it, so no chat was opened.

The same `trustshell-mcp` printed `trustshell-mcp: ready (stdio)` and answered initialize as server trustshell 1.5.0.
