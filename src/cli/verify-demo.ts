#!/usr/bin/env node
import { TrustShell } from '../index';
import { verifyProofLocal } from '../local-verify';

const AGENTS: Record<string, string> = {
  SOPHIA: 'f3ef0bf8-5cdc-4fad-bce8-5144f01dc271',
  ATLAS: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', // Placeholder
};

async function main() {
  const args = process.argv.slice(2);
  const agentArg = args.find(a => a.startsWith('--agent'))?.split('=')[1] || args[args.indexOf('--agent') + 1];
  const jobId = args.find(a => a.startsWith('--job'))?.split('=')[1] || args[args.indexOf('--job') + 1];

  if (!agentArg) {
    console.log('Usage: trustshell-verify-demo --agent <NAME|ID> [--job <ID>]');
    process.exit(1);
  }

  const agentId = AGENTS[agentArg.toUpperCase()] || agentArg;
  const shell = new TrustShell({
    agentId,
    apiKey: 'demo', // Public routes don't need real API key
    llmProvider: 'demo'
  });

  console.log(`\n🔍 HyperDAG Trust Verification Demo`);
  console.log(`====================================`);
  console.log(`Agent: ${agentArg} (${agentId})`);

  let finalJobId = jobId;

  if (!finalJobId) {
    console.log(`Fetching latest RepID state...`);
    const state = await shell.getRepID();
    console.log(`Current RepID: ${state.current_repid} (${state.tier})`);
    
    // For demo, we'll use a known good job ID if it's SOPHIA and no job provided
    if (agentArg.toUpperCase() === 'SOPHIA') {
      finalJobId = '3c67625c-214c-482a-be61-d1393545d84a';
    } else {
      console.error('Error: --job <ID> required for non-SOPHIA agents');
      process.exit(1);
    }
  }

  console.log(`Fetching STARK Proof for job: ${finalJobId}...`);
  
  try {
    const proof = await shell.getProof(finalJobId);
    console.log(`Proof received (${Math.round(proof.proof_bytes.length / 1024)} KB)`);
    console.log(`Statement: Score ${proof.statement.repid_score} > ${proof.statement.threshold} (${proof.statement.tier})`);

    console.log(`\n🛠️  Running Local WASM Verification...`);
    const result = await verifyProofLocal(proof);

    if (result.verified) {
      console.log(`\n✅ VERIFIED`);
      console.log(`The mathematical proof is valid.`);
      console.log(`This agent definitively has a RepID of ${proof.statement.repid_score}.`);
    } else {
      console.log(`\n❌ FAILED`);
      console.log(`Verification error: ${result.error}`);
    }
    
    console.log(`\nMetrics:`);
    console.log(`- Elapsed: ${result.elapsed_ms}ms`);
    console.log(`- Verifier: v${result.verifier_version}`);
    console.log(`====================================\n`);

  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

main();
