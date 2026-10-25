/**
 * The leaderboard read must go through ONE provider, so ethers can batch a roster's calls into a request or two.
 *
 * Each fetchAgentRepID used to build its own JsonRpcProvider: for 12 agents, 12 chain-id probes plus 24 contract calls
 * as ~36 separate requests against a public RPC that allows 25 a second ("-32007 25/second request limit reached").
 * Live GET /api/agent-leaderboard answered 503 on 4 of 5 tries (found by tests/e2e/site-walk.mjs, 2026-10-24).
 *
 * No network: the provider is a fake runner that counts calls. engineUrl points at a closed port, so the roster is
 * the 4-agent fallback squad.
 */
import { ethers } from 'ethers';
import { fetchLeaderboard, HYPERDAG_REPID_READ_SIGNERS } from '../lib/onchain-repid';

const iface = new ethers.Interface([
  'function getClients(uint256 agentId) view returns (address[])',
  'function getSummary(uint256 agentId, address[] clients, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
]);

function fakeRunner() {
  const calls: string[] = [];
  const runner = {
    provider: null,
    async call(tx: { data?: string }) {
      const fn = iface.getFunction((tx.data ?? '').slice(0, 10));
      if (!fn) throw new Error(`unexpected call ${tx.data}`);
      calls.push(fn.name);
      return fn.name === 'getClients'
        ? iface.encodeFunctionResult('getClients', [[HYPERDAG_REPID_READ_SIGNERS[0]]])
        : iface.encodeFunctionResult('getSummary', [BigInt(3), BigInt(850), 1]);
    },
  };
  return { runner: runner as unknown as ethers.ContractRunner, calls };
}

describe('fetchLeaderboard provider use', () => {
  it('reads every agent through the one provider it is given: two calls per agent, nothing else', async () => {
    const { runner, calls } = fakeRunner();
    const { entries, rosterSource } = await fetchLeaderboard({ provider: runner, engineUrl: 'http://127.0.0.1:9' });
    expect(rosterSource).toBe('fallback-squad');
    expect(entries).toHaveLength(4);
    expect(entries.every((e) => e.source === 'on-chain' && e.repid === 85)).toBe(true);
    expect(calls.filter((c) => c === 'getClients')).toHaveLength(4);
    expect(calls.filter((c) => c === 'getSummary')).toHaveLength(4);
  });
});
