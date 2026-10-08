/**
 * The /wallet guidance helper is NO-KEYS by construction (Sean, 2026-10-08: keys are the
 * TrustKeys product; a helper that holds or signs is the drain surface we must never ship in
 * the browser). This test is the ratchet: it fails if the page ever gains a signing, approval,
 * or transfer call, and it pins the Base Sepolia constants a newcomer is silently handed.
 *
 * It is a SOURCE SCAN on purpose — rendering React is not needed to prove the page cannot sign,
 * and a scan cannot be fooled by a mock. Same shape as repid-engine's prover-pin / no-default-secrets.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, '..', 'app', 'wallet', 'page.tsx'), 'utf8');
// Strip line comments so a word in prose (e.g. "never sign") can't trip the key-guard scan.
const CODE = SRC.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('wallet guidance helper is no-keys by construction', () => {
  // Every way a web page can move funds or sign. None may appear in the helper.
  const FORBIDDEN = [
    'signMessage',
    'signTypedData',
    'personal_sign',
    'eth_sign',
    'eth_signTypedData',
    'eth_sendTransaction',
    'sendTransaction',
    'transferFrom',
    '.transfer(',
    '.approve(',
    'eth_requestAccounts', // connect is delegated to useWallet; the page itself must not prompt-connect raw
    'privateKey',
    'mnemonic',
  ];
  for (const bad of FORBIDDEN) {
    it(`never calls ${bad}`, () => {
      expect(CODE.includes(bad)).toBe(false);
    });
  }

  it('uses only the two non-custodial prompts (switch network, watch asset)', () => {
    expect(CODE).toContain('wallet_switchEthereumChain');
    expect(CODE).toContain('wallet_watchAsset');
  });

  it('pins Base Sepolia (0x14a34 === 84532) and the canonical testnet USDC', () => {
    expect(parseInt('0x14a34', 16)).toBe(84532);
    expect(CODE).toContain('0x14a34');
    expect(CODE).toContain('84532');
    // Canonical Base Sepolia USDC — case-insensitive compare, the address is a constant here.
    expect(CODE.toLowerCase()).toContain('0x036cbd53842c5426634e7929541ec2318f3dcf7e');
  });

  it('reads balances client-side (no engine call — trustshell.dev is not on the engine CORS allow-list)', () => {
    // The page must not fetch the engine for balances; it reads through the wallet RPC via ethers.
    expect(CODE).toContain("import('ethers')");
    expect(CODE).not.toContain('/api/v1/faucet');
  });
});
