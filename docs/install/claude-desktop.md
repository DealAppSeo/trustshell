# Claude Desktop

Claude Desktop 2.19675.0.0 is installed. Its config already had railway and github. trustshell was not among them. The live file was not changed, and the server was not loaded in Claude Desktop.

## Install

```
npm i -g @hyperdag/trustshell@1.6.0
```

## Config

Add this entry next to the others. The shape matches the servers already there: a command and an args array.

```json
"trustshell": {
  "command": "trustshell-mcp",
  "args": []
}
```

The file is `claude_desktop_config.json`. This session did not write it.

Outside Claude Desktop, that `trustshell-mcp` from `@hyperdag/trustshell@1.5.0` printed `trustshell-mcp: ready (stdio)` and answered initialize as server trustshell 1.5.0. <!-- doc-version: historical — measured with 1.5.0 on 2026-10-05 -->
