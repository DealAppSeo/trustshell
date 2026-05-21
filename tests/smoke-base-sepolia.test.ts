/**
 * End-to-end smoke test: mint on first verified action against Base Sepolia.
 *
 * REQUIREMENTS to run (all via env):
 *   SMOKE_TEST_WALLET   0x... Base Sepolia wallet that will own the minted token.
 *                       The wallet needs Base Sepolia testnet ETH for the mint tx.
 *   SMOKE_TEST_API_URL  (optional) override the gateway URL; defaults to the
 *                       repid-engine production endpoint baked into the SDK.
 *
 * This test is SKIPPED automatically when SMOKE_TEST_WALLET is unset, so it is
 * inert in CI and on developer machines without a funded testnet wallet.
 *
 * It hits the live gateway and a real testnet, so it is allowed up to 120s for
 * Base Sepolia block confirmation.
 *
 * Runner: works under jest or vitest (both inject the `test`/`expect` globals).
 * Install a runner + ts transform before running, e.g.
 *   npm i -D vitest   (then: npx vitest run tests/smoke-base-sepolia.test.ts)
 */
import { TrustShell } from '../src';

const hasWallet = !!process.env.SMOKE_TEST_WALLET;

// Skip cleanly when no funded wallet is configured.
const maybeTest: typeof test = (hasWallet ? test : test.skip) as typeof test;

maybeTest(
  'end-to-end mint on first verified action (Base Sepolia)',
  async () => {
    const trust = new TrustShell({
      agentName: `smoke-test-bot-${Date.now()}`,
      wallet: process.env.SMOKE_TEST_WALLET as string,
      apiUrl: process.env.SMOKE_TEST_API_URL,
      testMode: false, // real Base Sepolia mint
    });

    // State 1: registered locally, not on-chain, no gas spent.
    const reg = await trust.register();
    expect(reg.state).toBe(1);
    expect(reg.agentId).toBeTruthy();
    expect(trust.agentStatus.onChain).toBe(false);
    expect(trust.agentStatus.tokenId).toBeNull();

    // First verified action: HAL approves -> SDK mints ERC-8004 -> State 2.
    const result = await trust.verifyOutput({
      task: 'What is 2 + 2?',
      output: 'The sum of 2 and 2 is 4.',
    });

    expect(result.approved).toBe(true);
    expect(result.mintedThisCall).toBe(true);
    expect(typeof result.tokenId).toBe('number');
    expect(result.tokenId as number).toBeGreaterThan(0);

    // Cached lifecycle status reflects the graduation.
    expect(trust.agentStatus.onChain).toBe(true);
    expect(trust.agentStatus.tokenId).toBe(result.tokenId);
    expect(trust.agentStatus.tier).toBe('PROBATIONARY');
  },
  120_000,
);
