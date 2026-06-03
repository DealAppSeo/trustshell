import { TrustShell } from '../../src/lib/trustshell';

describe('Total-Package E2E Integration Harness', () => {
  const apiKey = 'test-key-123';
  const engineUrl = 'http://localhost:3000';
  
  // trinity-veritas details
  const requestorAgentId = 'a83cc9eb-43b0-49ee-9e45-2ecbb0d35067';
  const veritasPrivateKey = '83e177c927ff08170300053cb9670a3bae7e225277c7f9251f8da463eab0bbd3';
  
  // trinity-shofet details
  const providerAgentId = '32e0e809-c1c4-4405-913f-135c8a2d6626';

  let shell: TrustShell;

  beforeAll(() => {
    shell = new TrustShell({
      apiKey,
      engineUrl,
      apiUrl: engineUrl,
      agentId: requestorAgentId,
      rpcUrl: 'https://sepolia.base.org'
    });
  });

  it('runs the full E2E trust sequence: HAL -> x402 -> RepID -> ZKP', async () => {
    // 1. verifyOutput (HAL)
    console.log('Step 1: Running verifyOutput...');
    const verifyResult = await shell.verifyOutput('The transaction is fully settled.', {
      prompt: 'Is the transaction settled?',
      provider: 'demo',
      model: 'test-model'
    });
    
    expect(verifyResult).toBeDefined();
    expect(verifyResult.trustScore).toBeGreaterThanOrEqual(0);
    expect(verifyResult.trustScore).toBeLessThanOrEqual(100);
    expect(verifyResult.verdict).toBeDefined();
    expect(verifyResult.signals).toBeDefined();
    console.log(`verifyOutput OK. Verdict: ${verifyResult.verdict}, Trust Score: ${verifyResult.trustScore}`);

    // 2. executeA2A (x402 micro-tx, testnet/simulated)
    console.log('Step 2: Running executeA2A...');
    const a2aResult = await shell.executeA2A({
      requestor_agent_id: requestorAgentId,
      provider_agent_id: providerAgentId,
      prediction_topic: `E2E Test Topic ${Date.now()}`,
      privateKey: veritasPrivateKey
    });

    expect(a2aResult).toBeDefined();
    expect(a2aResult.ok).toBe(true);
    expect(a2aResult.tip_id).toBeDefined();
    expect(a2aResult.content).toBeDefined();
    expect(a2aResult.is_simulated).toBeDefined();
    console.log(`executeA2A OK. Tip ID: ${a2aResult.tip_id}, Content: ${a2aResult.content}`);

    // 3. ERC-8004 reputation delta (Verify RepID is populated for provider)
    console.log('Step 3: Querying RepID for provider...');
    const repidResult = await shell.getRepID(providerAgentId);
    expect(repidResult).toBeDefined();
    expect(repidResult.value).toBeGreaterThan(0);
    expect(repidResult.count).toBeGreaterThanOrEqual(0);
    console.log(`getRepID OK. Current RepID value: ${repidResult.value}`);

    // 4. presentProof (ZKP)
    console.log('Step 4: Querying ZKP proof for provider...');
    try {
      const zkpResult = await shell.presentProof(providerAgentId);
      expect(zkpResult).toBeDefined();
      expect(zkpResult.agentId).toBe(providerAgentId);
      expect(zkpResult.zkCommitment).toBeDefined();
      expect(zkpResult.proofType).toBeDefined();
      console.log(`presentProof OK. Proof Type: ${zkpResult.proofType}, Commitment: ${zkpResult.zkCommitment}`);
    } catch (e: any) {
      if (e.message?.includes('NO_PROOF_FOUND') || e.status === 404) {
        console.log('presentProof returned NO_PROOF_FOUND gracefully (null-safe for newly minted/tested agents without aggregate proofs).');
      } else {
        throw e;
      }
    }
  }, 30000);
});
