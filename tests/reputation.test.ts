import { getRepID, getReputationHistory, getAttestation, resolveAgentId } from '../src/reputation';
import { ethers } from 'ethers';

describe('Reputation Read Helpers - Unit Tests', () => {
  let mockProvider: any;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockProvider = {
      getTransactionReceipt: jest.fn()
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('resolveAgentId', () => {
    it('resolves numeric agentId directly', async () => {
      const id = await resolveAgentId(1234, mockProvider);
      expect(id).toBe(1234n);

      const idStr = await resolveAgentId('5678', mockProvider);
      expect(idStr).toBe(5678n);
    });

    it('resolves hex address or UUID via backend API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          {
            id: 'agent-uuid-1',
            erc8004_address: '0x1111111111111111111111111111111111111111',
            erc8004_token_id: '5863'
          }
        ])
      }) as any;

      const idFromAddress = await resolveAgentId('0x1111111111111111111111111111111111111111', mockProvider);
      expect(idFromAddress).toBe(5863n);

      const idFromUuid = await resolveAgentId('agent-uuid-1', mockProvider);
      expect(idFromUuid).toBe(5863n);
    });
  });

  describe('getRepID', () => {
    it('queries summary for target agent', async () => {
      const mockContract = {
        getClients: jest.fn().mockResolvedValue(['0xClientAddress']),
        getSummary: jest.fn().mockResolvedValue([2n, 8500n, 0n])
      };

      jest.spyOn(ethers, 'Contract').mockImplementation(() => mockContract as any);

      const result = await getRepID(5863n, { provider: mockProvider });
      expect(result.count).toBe(2);
      expect(result.value).toBe(8500n);
      expect(result.decimals).toBe(0);
      expect(mockContract.getClients).toHaveBeenCalledWith(5863n);
      expect(mockContract.getSummary).toHaveBeenCalledWith(5863n, ['0xClientAddress'], 'hyperdag_repid', '');
    });

    it('returns zeros if no clients have written feedback yet', async () => {
      const mockContract = {
        getClients: jest.fn().mockResolvedValue([])
      };

      jest.spyOn(ethers, 'Contract').mockImplementation(() => mockContract as any);

      const result = await getRepID(5863n, { provider: mockProvider });
      expect(result.count).toBe(0);
      expect(result.value).toBe(0n);
    });
  });

  describe('getReputationHistory', () => {
    it('queries and returns all feedback items', async () => {
      const mockContract = {
        readAllFeedback: jest.fn().mockResolvedValue([
          ['0xClient1', '0xClient2'],
          [1n, 2n],
          [8000n, 9000n],
          [0n, 0n],
          ['hyperdag_repid', 'hyperdag_repid'],
          ['tier:ESTABLISHED', 'tier:AUTONOMOUS'],
          [false, false]
        ])
      };

      jest.spyOn(ethers, 'Contract').mockImplementation(() => mockContract as any);

      const history = await getReputationHistory(5863n, { provider: mockProvider });
      expect(history.length).toBe(2);
      expect(history[0]).toEqual({
        clientAddress: '0xClient1',
        feedbackIndex: 1,
        value: 8000n,
        decimals: 0,
        tag1: 'hyperdag_repid',
        tag2: 'tier:ESTABLISHED',
        isRevoked: false
      });
    });
  });

  describe('getAttestation', () => {
    it('parses transaction receipt and decodes NewFeedback event', async () => {
      const mockReceipt = {
        blockNumber: 12345,
        logs: [
          {
            topics: [
              '0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc', // NewFeedback topic
              ethers.zeroPadValue('0x16e7', 32), // agentId = 5863
              ethers.zeroPadValue('0x2222222222222222222222222222222222222222', 32), // clientAddress
              ethers.id('hyperdag_repid') // indexedTag1
            ],
            data: ethers.AbiCoder.defaultAbiCoder().encode(
              ['uint64', 'int128', 'uint8', 'string', 'string', 'string', 'string', 'bytes32'],
              [
                1n, // feedbackIndex
                8500n, // value
                0n, // valueDecimals
                'hyperdag_repid', // tag1
                'tier:AUTONOMOUS', // tag2
                'https://api.repid.dev/endpoint', // endpoint
                'https://repid.dev/agents/5863/payload.json', // feedbackURI
                ethers.ZeroHash // feedbackHash
              ]
            )
          }
        ]
      };

      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const attestation = await getAttestation('0xmockTxHash', { provider: mockProvider });
      expect(attestation.agentId).toBe('5863');
      expect(attestation.clientAddress.toLowerCase()).toBe('0x2222222222222222222222222222222222222222');
      expect(attestation.value).toBe(8500n);
      expect(attestation.tag1).toBe('hyperdag_repid');
      expect(attestation.tag2).toBe('tier:AUTONOMOUS');
      expect(attestation.feedbackURI).toBe('https://repid.dev/agents/5863/payload.json');
    });

    it('throws if NewFeedback event is not present in logs', async () => {
      const mockReceipt = {
        blockNumber: 12345,
        logs: []
      };

      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

      await expect(getAttestation('0xmockTxHash', { provider: mockProvider }))
        .rejects.toThrow('NewFeedback event not found in transaction');
    });
  });
});
