# @hyperdag/trustshell-mcp

**Add real trust to your AI agent in a couple of clicks — no terminal, no code, no `npm` by hand.**

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that wraps the
[`@hyperdag/trustshell`](https://www.npmjs.com/package/@hyperdag/trustshell) SDK. Once you add it to
Claude Desktop, Cursor, or Windsurf, your AI can call these trust tools directly:

| Tool | What it does | Needs a key? |
|------|--------------|--------------|
| `verify_output` | Real cross-LLM **HAL fact-check** of any text → verdict (PASS / FLAG / VETO), a 0–100 trust score, and per-provider evidence | **No** ✅ |
| `get_repid` | An agent's live **RepID** (reputation score) + tier | **No** ✅ |
| `present_proof` | A client-verifiable **ZK RepID proof** (real Plonky3 STARK) | **No** ✅ |
| `verify_proof` | Verify a proof **offline** with the bundled WASM verifier (trust the math, not the server) | **No** ✅ |
| `list_services` | The A2A **marketplace catalog** | Yes — `REPID_API_KEY` |
| `buy_service` | Buy a service **agent-to-agent** via x402 payment | Yes — key **+** funded wallet |

The four keyless tools work with **zero configuration**. The two keyed tools are always shown, but if
you haven't added credentials they return a clear "needs credentials" message — a purchase is **never
faked**.

---

## Add it to Claude Desktop (mouse-only)

1. Open Claude Desktop → **Settings** → **Developer** → **Edit Config**.
   (Or open the file directly — see the path below.)
2. Paste the block below into the `mcpServers` section. If the file is empty, paste the whole thing.
3. **Save the file and fully quit + reopen Claude Desktop.**
4. Start a chat and ask: *"Use verify_output to fact-check: The Eiffel Tower is in Berlin."*
   You should see a **VETO** verdict with evidence.

**Where the config file lives:**

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
  (paste `%APPDATA%\Claude` into the File Explorer address bar to get there)
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Copy-paste this (keyless — works immediately):**

```json
{
  "mcpServers": {
    "trustshell": {
      "command": "npx",
      "args": ["-y", "@hyperdag/trustshell-mcp"]
    }
  }
}
```

`npx -y` downloads and runs the server for you the first time — **you don't need to install anything by
hand.** (You do need [Node.js](https://nodejs.org) ≥ 20.9 installed once; the Claude Desktop installer's
recommended setup includes it.)

**Optional — unlock the marketplace tools** by adding an `env` block with your key (and, for buying, a
funded Base Sepolia wallet key):

```json
{
  "mcpServers": {
    "trustshell": {
      "command": "npx",
      "args": ["-y", "@hyperdag/trustshell-mcp"],
      "env": {
        "REPID_API_KEY": "your_repid_api_key_here",
        "TRUSTSHELL_WALLET_KEY": "0xYOUR_FUNDED_BASE_SEPOLIA_PRIVATE_KEY"
      }
    }
  }
}
```

---

## Add it to Cursor (mouse-only)

**Option A — the settings UI:**
Open **Cursor → Settings → MCP → Add new MCP server**, then fill in:
- **Name:** `trustshell`
- **Type / Command:** `npx`
- **Args:** `-y @hyperdag/trustshell-mcp`

**Option B — the config file.** Create (or edit) `.cursor/mcp.json` in your project folder — or
`~/.cursor/mcp.json` for all projects — and paste:

```json
{
  "mcpServers": {
    "trustshell": {
      "command": "npx",
      "args": ["-y", "@hyperdag/trustshell-mcp"]
    }
  }
}
```

Add the same optional `"env"` block shown above to enable `list_services` / `buy_service`.

---

## Add it to Windsurf (mouse-only)

Open **Windsurf → Settings → Cascade → MCP Servers → Add Server → Add custom server**, which opens
`~/.codeium/windsurf/mcp_config.json`. Paste the same block:

```json
{
  "mcpServers": {
    "trustshell": {
      "command": "npx",
      "args": ["-y", "@hyperdag/trustshell-mcp"]
    }
  }
}
```

Then click **Refresh** in the MCP panel.

---

## Environment variables (only for the two keyed tools)

| Variable | Enables | Notes |
|----------|---------|-------|
| `REPID_API_KEY` | `list_services`, `buy_service` | Your repid-engine API key. Without it, those tools return a "needs credentials" message. |
| `TRUSTSHELL_WALLET_KEY` | the payment leg of `buy_service` | A `0x`-prefixed private key holding **Base Sepolia USDC**. Used only to sign the x402 payment **locally** — it is never logged and never leaves your machine. |
| `TRUSTSHELL_API_URL` | (advanced) override the backend | Defaults to the live HyperDAG backend. Leave unset. |

> **Honesty note.** The keyless tools hit the live HyperDAG backend (or the bundled offline verifier)
> for real. The keyed tools never fabricate a catalog or a purchase — if credentials are missing they
> tell you exactly what to add. The free HAL fact-check path is rate-limited per IP; if you hit the
> daily limit, `verify_output` says so plainly (add `REPID_API_KEY` for higher limits).

---

## Try it once it's connected

Ask your AI things like:

- *"Fact-check this with verify_output: 'The Great Wall of China is visible from the Moon with the naked eye.'"*
- *"What's sophia's RepID? Use get_repid."*
- *"Get sophia's ZK proof with present_proof and verify it."*

---

## For developers

```bash
cd mcp
npm install
npm run build      # tsc → dist/
npm run smoke      # spawns the server over stdio, lists tools, calls a keyless tool live
```

Built on `@modelcontextprotocol/sdk` over stdio. Depends on `@hyperdag/trustshell@^1.0.0`.

Apache-2.0 · part of the HyperDAG Protocol Trust\* ecosystem (`trustshell.dev`).
