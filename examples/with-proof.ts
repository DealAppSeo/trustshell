import { TrustShell } from '../src/index';

/**
 * ZKP Proof Example
 * 
 * Demonstrates how to wait for a STARK proof after a decision.
 */
async function run() {
  const shell = new TrustShell({
    agentId: 'your-agent-id',
    apiKey: 'your-api-key',
    llmProvider: 'groq'
  });

  console.log('Evaluating decision...');
  const result = await shell.evaluate('Provide health advice based on symptoms', 0.88);

  if (result.proof_job_id) {
    console.log(`Polling for proof (job: ${result.proof_job_id})...`);
    try {
      const proof = await shell.waitForProof(result.proof_job_id, {
        timeoutMs: 60000,
        intervalMs: 2000
      });
      console.log(`Proof status: ${proof.status}`);
      if (proof.status === 'verified') {
        console.log(`STARK proof available: ${proof.proof?.substring(0, 50)}...`);
      }
    } catch (e) {
      console.error('Proof polling timed out or failed');
    }
  }
}

run();
