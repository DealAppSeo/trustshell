import { getRepID, getReputationHistory, getAttestation } from '../src/reputation';
import { ethers } from 'ethers';

describe('Reputation Read Helpers - Integration Tests', () => {
  const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
  const agentId = 5863n; // trinity-shofet
  const validTxHash = '0xa6938437b084c84998d16914eaa3168042428cdf61aba96c7e1a04ee1901e632';

  it('queries real RepID from Base Sepolia ReputationRegistry', async () => {
    const summary = await getRepID(agentId, { provider });
    expect(summary.count).toBeGreaterThan(0);
    expect(summary.value).toBeGreaterThan(0n);
    expect(summary.decimals).toBe(0);
  });

  it('queries real reputation history from Base Sepolia ReputationRegistry', async () => {
    const history = await getReputationHistory(agentId, { provider });
    expect(history.length).toBeGreaterThan(0);
    
    // Check first item fields
    const firstItem = history[0];
    expect(firstItem.clientAddress).toBeDefined();
    expect(firstItem.feedbackIndex).toBeGreaterThan(0);
    expect(firstItem.value).toBeDefined();
    expect(firstItem.tag1).toBe('hyperdag_repid');
  });

  it('looks up specific attestation by transaction hash', async () => {
    const attestation = await getAttestation(validTxHash, { provider });
    expect(attestation.txHash).toBe(validTxHash);
    expect(attestation.blockNumber).toBe(41871628);
    expect(attestation.agentId).toBe('5863');
    expect(attestation.clientAddress.toLowerCase()).toBe('0xf6ee1768868c3266868edca78bc41c50309cb22a');
    expect(attestation.feedbackIndex).toBe(1);
    expect(attestation.value).toBe(2675n);
    expect(attestation.tag1).toBe('hyperdag_repid');
    expect(attestation.tag2).toBe('tier:ESTABLISHED');
  });
});
