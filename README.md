# @hyperdag/trustshell

The trust gate for the agentic economy.

## Install

```
npm install @hyperdag/trustshell
```

## Usage

```ts
import { gate, score, getAgent, registerHuman } from '@hyperdag/trustshell';

// Gate an x402 payment by RepID tier
const result = await gate('agent-uuid', 500);
if (result.allowed) {
  // proceed with payment
}

// Score a challenge event
const scored = await score({
  agentId: 'agent-uuid',
  eventType: 'CHALLENGE_WIN',
  certaintyAtClaim: 0.85,
});

// Register an anonymous human DBT
const human = await registerHuman();
console.log(human.privateId); // Save this — not recoverable
```

Powered by HyperDAG Protocol.

- trustrepid.dev
- repid.dev
- hyperdag.dev
