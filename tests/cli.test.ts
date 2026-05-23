import { Command } from 'commander';
import { registerVerify } from '../src/cli/commands/verify';
import { registerWhois } from '../src/cli/commands/whois';
import { registerAttestation } from '../src/cli/commands/attestation';
import { registerInit } from '../src/cli/commands/init';
import { registerPay } from '../src/cli/commands/pay';
import * as fs from 'fs';
import * as path from 'path';
import * as reputation from '../src/reputation';
import * as client from '../src/x402/client';

jest.mock('../src/reputation');
jest.mock('../src/x402/client');

describe('TrustShell CLI Commands', () => {
  let mockExit: jest.SpyInstance;
  let mockLog: jest.SpyInstance;
  let mockError: jest.SpyInstance;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`Process exited with code: ${code}`);
    });
    mockLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockError = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.REPID_API_KEY;
    global.fetch = originalFetch;
    mockExit.mockRestore();
    mockLog.mockRestore();
    mockError.mockRestore();
  });

  describe('init command', () => {
    const configPath = path.join(process.cwd(), '.trustshell.json');

    afterEach(() => {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    });

    it('creates .trustshell.json if not present', async () => {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }

      const program = new Command();
      registerInit(program);

      await program.parseAsync(['node', 'cli', 'init']);

      expect(fs.existsSync(configPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.network).toBe('base-sepolia');
      expect(config.contracts.reputationRegistry).toBe('0x8004B663056A597Dffe9eCcC1965A193B7388713');
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Created: .trustshell.json'));
    });

    it('does not overwrite .trustshell.json if already present', async () => {
      fs.writeFileSync(configPath, JSON.stringify({ custom: true }), 'utf8');

      const program = new Command();
      registerInit(program);

      await program.parseAsync(['node', 'cli', 'init']);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.custom).toBe(true);
      expect(config.network).toBeUndefined();
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('TrustShell already initialized'));
    });
  });

  describe('verify command', () => {
    it('requires API key', async () => {
      const program = new Command();
      registerVerify(program);

      await expect(program.parseAsync(['node', 'cli', 'verify', 'Paris is in France']))
        .rejects.toThrow('Process exited with code: 1');

      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('API key required'));
    });

    it('successfully calls evaluate and displays clean decision', async () => {
      process.env.REPID_API_KEY = 'test-api-key';

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          decision: 'clean',
          hal_score: 0.9542,
          providers_used: 3,
          providers_attempted: 3
        })
      }) as any;

      const program = new Command();
      registerVerify(program);

      await program.parseAsync(['node', 'cli', 'verify', 'Paris is in France']);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/hal/evaluate'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Decision: clean ✓'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Score: 0.95'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Providers: 3/3'));
    });

    it('displays vetoed decision on false content', async () => {
      process.env.REPID_API_KEY = 'test-api-key';

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          decision: 'vetoed',
          hal_score: 0.0512,
          providers_used: 3,
          providers_attempted: 3
        })
      }) as any;

      const program = new Command();
      registerVerify(program);

      await program.parseAsync(['node', 'cli', 'verify', 'Paris is in Japan']);

      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Decision: vetoed ✗'));
    });

    it('handles 404 with specific HAL evaluate not available warning', async () => {
      process.env.REPID_API_KEY = 'test-api-key';

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404
      }) as any;

      const program = new Command();
      registerVerify(program);

      await expect(program.parseAsync(['node', 'cli', 'verify', 'Paris is in France']))
        .rejects.toThrow('Process exited with code: 1');

      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('HAL endpoint not available'));
    });
  });

  describe('whois command', () => {
    it('calls getRepID and prints agent info', async () => {
      const mockResolvedId = 5863n;
      (reputation.resolveAgentId as jest.Mock).mockResolvedValue(mockResolvedId);
      (reputation.getRepID as jest.Mock).mockResolvedValue({
        count: 12,
        value: 1200n,
        decimals: 0
      });

      const program = new Command();
      registerWhois(program);

      await program.parseAsync(['node', 'cli', 'whois', '0xAgentAddress']);

      expect(reputation.resolveAgentId).toHaveBeenCalledWith('0xAgentAddress', expect.any(Object), expect.any(Object));
      expect(reputation.getRepID).toHaveBeenCalledWith(mockResolvedId, expect.any(Object));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Token ID: 5863'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Recent attestations: 12'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Average score: 12 / 100'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Tier: ESTABLISHED'));
    });
  });

  describe('attestation command', () => {
    it('calls getAttestation and prints log details', async () => {
      (reputation.getAttestation as jest.Mock).mockResolvedValue({
        blockNumber: 41875622,
        clientAddress: '0xClientAddress',
        agentId: '5863',
        value: 95n,
        tag1: 'verification',
        tag2: 'base-sepolia',
        feedbackURI: 'ipfs://mockHash'
      });

      const program = new Command();
      registerAttestation(program);

      await program.parseAsync(['node', 'cli', 'attestation', '0xTxHash']);

      expect(reputation.getAttestation).toHaveBeenCalledWith('0xTxHash', expect.any(Object));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Block: 41875622'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('From client: 0xClientAddress'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('To agent ID: 5863'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Score: 95'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Tags: verification, base-sepolia'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Feedback URI: ipfs://mockHash'));
    });
  });

  describe('pay command', () => {
    it('requires private key', async () => {
      const program = new Command();
      registerPay(program);

      await expect(program.parseAsync(['node', 'cli', 'pay', 'contract-123']))
        .rejects.toThrow('Process exited with code: 1');

      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Wallet key required'));
    });

    it('executes escrowWithPaymentFlow and prints status details', async () => {
      (client.escrowWithPaymentFlow as jest.Mock).mockResolvedValue({
        x402_payment_id: 'settlement-uuid-1',
        status: 'escrowed'
      });

      const program = new Command();
      registerPay(program);

      await program.parseAsync(['node', 'cli', 'pay', 'contract-123', '--key', '0xmockkey']);

      expect(client.escrowWithPaymentFlow).toHaveBeenCalledWith(expect.objectContaining({
        contractId: 'contract-123',
        privateKey: '0xmockkey'
      }));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Settlement ID: settlement-uuid-1'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Status: escrowed'));
    });
  });
});
