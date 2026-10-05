# Cursor

Cursor 3.23.12 is installed. The user `mcp.json` under `.cursor` was absent. The server was not loaded in Cursor.

## Install

```
npm i -g @hyperdag/trustshell@1.6.0
```

## Config

Paste this into the user `mcp.json` or a project `.cursor/mcp.json`. It is the same command Claude Code accepted. It was not loaded here.

```json
{
  "mcpServers": {
    "trustshell": {
      "command": "trustshell-mcp"
    }
  }
}
```

Outside Cursor, that `trustshell-mcp` from `@hyperdag/trustshell@1.5.0` printed `trustshell-mcp: ready (stdio)` and answered initialize as server trustshell 1.5.0. <!-- doc-version: historical — measured with 1.5.0 on 2026-10-05 -->
