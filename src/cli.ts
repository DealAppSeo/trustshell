#!/usr/bin/env node
/**
 * TrustShell CLI (S-BUILD Phase 3 stub)
 * Usage examples:
 *   node src/cli.js score "The earth is flat."
 *   node src/cli.js verify trinity-veritas
 *   node src/cli.js audit
 */

import { TrustShell } from './lib/trustshell';

const args = process.argv.slice(2);
const cmd = args[0];

async function main() {
  const shell = new TrustShell();

  if (cmd === 'score') {
    const text = args[1] || 'The capital of France is Paris.';
    const result = await shell.score(text, { provider: 'demo' });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'verify') {
    const agentId = args[1] || 'trinity-veritas';
    const result = await shell.verify(agentId);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'audit') {
    const result = await shell.audit();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'leaderboard') {
    console.log('Provider Leaderboard (stub):');
    console.log('1. groq-llama-3.1-8b  trust: 92');
    console.log('2. cerebras-llama3.1  trust: 89');
    console.log('(live data would come from /api/v1/llm-trust/leaderboard)');
    return;
  }

  console.log('TrustShell CLI');
  console.log('Commands: score <text>, verify <agentId>, audit, leaderboard');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
