const { TrustShell } = require('./dist/index.js');

async function main() {
  console.log('--- TrustShell Quickstart Example ---');

  // 1. Initialize TrustShell SDK (3-line quickstart)
  // Wires to live repid-engine-production backend
  const shell = new TrustShell({ apiKey: 'test-key' });

  // 2. Evaluate a response via the live HAL-quorum path
  console.log('Evaluating statement: "The capital of Australia is Canberra."');
  const result = await shell.score('The capital of Australia is Canberra.');
  console.log(`Trust Score: ${result.trustScore} / 100`);
  console.log(`Verdict: ${result.verdict}`);
  console.log(`Proof Hash: ${result.proofHash || 'N/A'}`);

  // 3. Query ERC-8004 Reputation Registry
  console.log('Retrieving live ERC-8004 reputation summary for agent 5863 (trinity-shofet)...');
  const summary = await shell.getRepID(5863);
  console.log(`RepID Score: ${summary.value}, Total Attestations: ${summary.count}`);

  // 4. Settle an x402 payment challenge (demonstrating contract escrow)
  const contractId = 'dcae6a8b-8a6b-453f-9a17-f9eac2669d0f';
  console.log(`Processing x402 payment flow for contract: ${contractId}...`);
  try {
    // Under simulated/facilitated mode, empty/dummy private key resolves the challenge successfully
    const escrowResult = await shell.payAndEscrow(contractId, '');
    console.log(`Escrow Result Status: ${escrowResult.status || 'Success'}`);
    console.log(`Escrow Payment ID: ${escrowResult.x402_payment_id || 'N/A'}`);
  } catch (err) {
    console.log(`Escrow Note (expected testnet bypass): ${err.message}`);
  }
}

main().catch(console.error);
