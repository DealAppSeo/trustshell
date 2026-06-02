# @hyperdag/trustshell

Add trust scoring to any AI app in 3 lines.

## Quick Start (TypeScript)
```bash
npm install @hyperdag/trustshell
```

```ts
import { TrustShell } from '@hyperdag/trustshell';
const shell = new TrustShell();
const result = await shell.score("The capital of France is Paris.");
console.log(result.trustScore); // e.g. 87
console.log(result.verdict);    // "PASS"
```

## Methods
- `score(response, options?)` — HAL 5-signal evaluation, returns inverted trustScore 0-100 + signals + verdict.
- `verify(agentId)` — Look up RepID + tier + provenance.
- `audit(table?)` — Verify hash-chain integrity (VALID or CHAIN_BREAK).

## Error Handling
```ts
try {
  await shell.score(text);
} catch (e) {
  if (e instanceof TrustShellError) {
    console.error(e.status, e.message);
  }
}
```

## Python Client
See python/ directory (pip install -e . ; from trustshell import TrustShell)

## CLI
```bash
node src/cli.js score "text here"
node src/cli.js verify trinity-veritas
node src/cli.js audit
node src/cli.js leaderboard
```

## Integrations
- LangChain callback: see src/integrations/langchain.ts (stub ready for extension)
- Full spec in S-SDK1.

Built as part of S-BUILD marathon sprint.
