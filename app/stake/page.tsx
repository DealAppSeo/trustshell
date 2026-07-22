'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { localDb, Agent } from '@/lib/db';
import {
  depositStake,
  fetchAuthority,
  fetchStakePositions,
  rawToUsdc,
  AuthoritySnapshot,
  StakePosition,
} from '@/lib/repid-engine';
import { repidToTier } from '@/lib/onchain-repid';

export default function StakePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [builderAddress, setBuilderAddress] = useState('');
  const [amount, setAmount] = useState('100');

  const [authority, setAuthority] = useState<AuthoritySnapshot | null>(null);
  const [positions, setPositions] = useState<{ total_active_usdc: number; positions: StakePosition[] } | null>(null);
  const [repid, setRepid] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    localDb.getAgents().then((a) => {
      setAgents(a);
      if (a.length > 0 && a[0]) setSelectedAgentId(a[0].id);
    });
  }, []);

  // When an agent is picked, load its current RepID + authority snapshot.
  // Resets happen inside the async resolutions (guarded by `ignore`) rather
  // than synchronously in the effect body, to avoid cascading renders.
  useEffect(() => {
    if (!selectedAgentId) return;
    let ignore = false;

    fetch(`${process.env.NEXT_PUBLIC_REPID_ENGINE_URL}/api/v1/agents/${selectedAgentId}`)
      .then((r) => r.json())
      .then((d) => {
        if (ignore) return;
        setRepid(d && typeof d.repid_score === 'number' ? d.repid_score : null);
      })
      .catch(() => {
        if (!ignore) setRepid(null);
      });

    fetchAuthority(selectedAgentId).then((a) => {
      if (!ignore) setAuthority(a);
    });
    fetchStakePositions(selectedAgentId).then((p) => {
      if (!ignore) setPositions(p);
    });

    return () => {
      ignore = true;
    };
  }, [selectedAgentId]);

  const handleStake = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const usdc = Number(amount);
    if (!Number.isFinite(usdc) || usdc <= 0) {
      setError('Enter a positive USDC amount.');
      return;
    }
    if (!builderAddress.trim()) {
      setError('Enter the builder address (0x…) that receives the authority credit.');
      return;
    }
    setSubmitting(true);
    try {
      const r = await depositStake({
        builder_address: builderAddress.trim(),
        amount_usdc: usdc,
        // TODO(review): depends on backend endpoint X — on-chain USDC transfer +
        // tx_hash is expected once the x402 escrow flow is wired. For testnet the
        // backend accepts a deposit without a real transfer.
      });
      if (!r.ok) {
        setError(r.error || 'Stake failed.');
      } else {
        setSuccess(`Staked ${usdc} testnet USDC toward ${builderAddress.slice(0, 10)}…`);
        // Refresh the authority ceiling after a successful stake.
        fetchAuthority(selectedAgentId).then(setAuthority);
        fetchStakePositions(selectedAgentId).then(setPositions);
      }
    } catch {
      setError('Backend unavailable. Try again in a moment.');
    }
    setSubmitting(false);
  };

  const tier = repid != null ? repidToTier(repid) : null;
  const authorityCeiling = authority ? rawToUsdc(authority.authority) : null;
  const stakeTotal = authority ? rawToUsdc(authority.stake_total) : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
      <header className="space-y-2">
        <h2 className="text-3xl font-bold text-white">Stake USDC to raise authority</h2>
        <p className="text-[#94a3b8] max-w-2xl leading-relaxed">
          Escrow testnet USDC to back an agent&apos;s reputation. Higher stake raises the
          agent&apos;s <span className="text-white font-medium">authority ceiling</span> — the maximum
          economic action it can take before requiring peer verification.
        </p>
        <p className="text-sm text-[#64748b] max-w-2xl leading-relaxed">
          Part of the <span className="text-[#94a3b8]">Earn</span> stage · staking signals confidence in an agent
          and is <span className="text-[#94a3b8]">testnet-only</span>, so no real funds move. You&apos;ll need an
          agent first.
        </p>
      </header>

      {agents.length === 0 ? (
        <div className="p-8 text-center text-[#94a3b8] border border-dashed border-[#334155] rounded-xl">
          You need an agent first.{' '}
          <Link href="/agents" className="text-amber-500 hover:underline">
            Create one
          </Link>
          .
        </div>
      ) : (
        <>
          {/* Agent selector + current standing */}
          <section className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <label className="flex-1">
                <span className="block text-sm text-[#94a3b8] mb-1">Agent</span>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id.slice(0, 8)}…)
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-[#1e293b]">
              <Stat label="RepID" value={repid != null ? repid.toFixed(0) : '—'} />
              <Stat label="Tier" value={tier ?? '—'} accent />
              <Stat
                label="Staked (USDC)"
                value={stakeTotal != null ? `$${stakeTotal.toFixed(2)}` : '—'}
              />
              <Stat
                label="Authority ceiling"
                value={authorityCeiling != null ? `$${authorityCeiling.toFixed(2)}` : '—'}
                accent
              />
            </div>
            {authority && (
              <p className="text-xs text-[#475569]">
                Basis: <span className="font-mono">{authority.basis}</span>
              </p>
            )}
          </section>

          {/* Stake form */}
          <section className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-4">
            <h3 className="text-xl font-bold text-white">Deposit stake</h3>
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-900 text-red-400 rounded text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 bg-green-900/20 border border-green-900 text-green-400 rounded text-sm">
                {success}
              </div>
            )}
            <form onSubmit={handleStake} className="space-y-4">
              <div>
                <label className="block text-sm text-[#94a3b8] mb-1">Builder address</label>
                <input
                  type="text"
                  placeholder="0x…"
                  value={builderAddress}
                  onChange={(e) => setBuilderAddress(e.target.value)}
                  className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-[#94a3b8] mb-1">Amount (testnet USDC)</label>
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold rounded"
              >
                {submitting ? 'Staking…' : `Stake ${amount || '0'} USDC`}
              </button>
            </form>
            <p className="text-xs text-[#475569]">
              Testnet only. On-chain USDC transfer + escrow settlement lands with the x402 flow.
            </p>
          </section>

          {/* Your stakes / earned rewards */}
          <section className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xl font-bold text-white">Your stakes &amp; rewards</h3>
              {positions && (
                <span className="text-sm text-[#94a3b8]">
                  ${positions.total_active_usdc.toFixed(2)} active
                </span>
              )}
            </div>
            {positions == null ? (
              <div className="p-6 text-center text-[#94a3b8] border border-dashed border-[#334155] rounded-xl text-sm">
                {/* TODO(review): canonical read endpoint not finalized — see fetchStakePositions. */}
                Stake positions unavailable. The per-agent read surface is still being finalized on the backend.
              </div>
            ) : positions.positions.length === 0 ? (
              <div className="p-6 text-center text-[#94a3b8] border border-dashed border-[#334155] rounded-xl text-sm">
                No active stakes yet. Your first deposit will appear here.
              </div>
            ) : (
              <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[#1e293b] text-[#94a3b8]">
                      <th className="p-4 font-medium">Staked</th>
                      <th className="p-4 font-medium">Amount</th>
                      <th className="p-4 font-medium">Status</th>
                      <th className="p-4 font-medium">Earned rewards</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e293b]">
                    {positions.positions.map((p) => (
                      <tr key={p.id} className="text-white">
                        <td className="p-4 whitespace-nowrap text-[#94a3b8]">
                          {p.staked_at ? new Date(p.staked_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="p-4">${p.amount_usdc.toFixed(2)}</td>
                        <td className="p-4 capitalize">{p.status}</td>
                        <td className="p-4">
                          {p.earned_rewards_usdc != null ? (
                            <span className="text-green-400">
                              +${p.earned_rewards_usdc.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-[#475569]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[#94a3b8] uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${accent ? 'text-amber-500' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}
