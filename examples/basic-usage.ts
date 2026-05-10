import { TrustShell, TrustShellAuthError } from '../src/index';

/**
 * Basic Usage Example
 * 
 * Demonstrates how to initialize the shell and evaluate a decision.
 */
async function run() {
  const shell = new TrustShell({
    agentId: 'your-agent-id',
    apiKey: 'your-api-key',
    llmProvider: 'anthropic'
  });

  try {
    const result = await shell.evaluate('Trade 0.5 ETH for USDC', 0.95);
    console.log(`HAL approved: ${result.approved}`);
    console.log(`RepID delta: ${result.repid_delta}`);
    console.log(`New score: ${result.new_score}`);
  } catch (e) {
    if (e instanceof TrustShellAuthError) {
      console.error('Check your credentials!');
    } else {
      console.error('Something went wrong:', e);
    }
  }
}

run();
