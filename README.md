# @hyperdag/trustshell

The trust gate for the agentic economy.

Powered by HyperDAG Protocol · ZKP-verified · ERC-8004 · EAS

## Install

```
npm install @hyperdag/trustshell
```

## Usage

```ts
import {
  gate, score, getAgent, registerHuman,
  callMCP, getBadges, getCardUrl,
} from '@hyperdag/trustshell';

// Gate an x402 payment by RepID tier
const result = await gate('agent-uuid', 500);
if (result.allowed) {
  // proceed — agent has sufficient RepID tier
} else {
  console.log('Blocked:', result.reason, '| Tier:', result.tier);
}

// Score a challenge event
await score({ agentId: 'uuid', eventType: 'CHALLENGE_WIN', certaintyAtClaim: 0.85 });

// Register an anonymous human DBT
const human = await registerHuman();
// ⚠️ Save human.privateId immediately — not recoverable

// Call an MCP tool with constitutional guardrails
const mcp = await callMCP('agent-uuid', 'github', { action: 'propose_pr' });
if (mcp.allowed) { /* tool call cleared constitutional audit */ }

// Get shareable ZKP score card URL
const cardUrl = getCardUrl('agent-uuid');
```

## Docs

- trustrepid.dev
- repid.dev
- hyperdag.dev

## License

Apache-2.0
