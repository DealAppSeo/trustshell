'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { localDb, Agent } from '@/lib/db';
import {
  depositStake,
  fetchAuthority,
  fetchStakePositions,
  fetchStakeSignMessage,
  rawToUsdc,
  usdcToRaw,
  STAKE_AUTH_ERRORS,
  AuthoritySnapshot,
  StakePosition,
} from '@/lib/repid-engine';
import { repidToTier } from '@/lib/onchain-repid';
import { getAccount, accountHeader, Account } from '@/lib/account';
import { GateModal } from '@/components/gate-modal';

/**
 * Staking, with the ask sized to what is at stake.
 *
 * This page used to open with a blank "builder address (0x…)" field and no
 * account behind it, because there was no account to have — the engine took the
 * address from the request body and credited whatever it was told. That is now
 * closed server-side, and the page reflects the ladder instead of a text box:
 *
 *   not signed in   one emailed code. Nothing else is asked for.
 *   signed in       the address is YOURS and already known, so a testnet stake
 *                   is a single click — no address to copy, mistype, or borrow.
 *   real USDC       a wallet signature over that exact deposit. Asked for only
 *                   here, because only here is real value being credited.
 *
 * An emailed account's address is derived from the email (`0xEMAIL…`), not a
 * wallet, so it cannot sign. We say that plainly rather than presenting a
 * prompt that can only fail.
 */

const EMAIL_DERIVED_PREFIX = '0xemail';

export default function StakePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [amount, setAmount] = useState('100');

  const [account, setAccount] = useState<Account | null>(null);
  const [showGate, setShowGate] = useState(false);

  const [authority, setAuthority] = useState<AuthoritySnapshot | null>(null);
  const [positions, setPositions] = useState<{ total_active_usdc: number; positions: StakePosition[] } | null>(null);
  const [repid, setRepid] = useState<number | null>(null);

  const [realMode, setRealMode] = useState(false);
  const [txHash, setTxHash] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setAccount(getAccount());
    localDb.getAgents().then((a) => {
      setAgents(a);
      if (a.length > 0 && a[0]) setSelectedAgentId(a[0].id);
      setAgentsLoaded(true);
    });
  }, []);

  // When an agent is picked, load its current RepID + authority snapshot.
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

  const isEmailDerived = !!account?.builder_address?.toLowerCase().startsWith(EMAIL_DERIVED_PREFIX);

  /** Ask the connected wallet to sign the server's exact deposit message. */
  const signRealDeposit = useCallback(
    async (amountRaw: string, tx: string): Promise<{ signature?: string; error?: string }> => {
      const eth = (globalThis as any).window?.ethereum;
      if (!eth) {
        return { error: 'No wallet detected in this browser. Install one, or stake on testnet instead.' };
      }
      const message = await fetchStakeSignMessage({
        builder_address: account!.builder_address,
        amount_raw: amountRaw,
        tx_hash: tx,
      });
      if (!message) {
        return { error: "Couldn't reach the server for the message to sign. Try again in a moment." };
      }
      try {
        const { BrowserProvider } = await import('ethers');
        const provider = new BrowserProvider(eth);
        const signer = await provider.getSigner();
        const addr = (await signer.getAddress()).toLowerCase();
        if (addr !== account!.builder_address.toLowerCase()) {
          return {
            error: `Your wallet is on ${addr.slice(0, 10)}… but this account is ${account!.builder_address.slice(0, 10)}…. Switch accounts and try again.`,
          };
        }
        return { signature: await signer.signMessage(message) };
      } catch (e: any) {
        // A declined prompt is a decision, not a fault. Say so without alarm.
        if (e?.code === 4001 || /reject|denied/i.test(e?.message ?? '')) {
          return { error: 'Signature declined — nothing was staked.' };
        }
        return { error: 'The wallet could not sign that. Try again.' };
      }
    },
    [account],
  );

  const handleStake = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!account) {
      setShowGate(true);
      return;
    }
    const usdc = Number(amount);
    if (!Number.isFinite(usdc) || usdc <= 0) {
      setError('Enter a positive USDC amount.');
      return;
    }

    let signature: string | undefined;
    const tx = realMode ? txHash.trim() : '';
    if (realMode) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) {
        setError('Paste the transaction hash of your on-chain USDC transfer (0x… , 64 hex characters).');
        return;
      }
      setSubmitting(true);
      // The signature must cover exactly what the server will credit, including
      // the demo path's "100" → 100000000 coercion.
      const amountRaw = usdc === 100 ? '100000000' : usdcToRaw(usdc);
      const signed = await signRealDeposit(amountRaw, tx);
      if (signed.error) {
        setError(signed.error);
        setSubmitting(false);
        return;
      }
      signature = signed.signature;
    }

    setSubmitting(true);
    try {
      const r = await depositStake({
        builder_address: account.builder_address,
        amount_usdc: usdc,
        ...(realMode ? { tx_hash: tx, signature } : {}),
        authHeaders: accountHeader(),
      });
      if (!r.ok) {
        const code = typeof r.error === 'string' ? r.error : '';
        setError(STAKE_AUTH_ERRORS[code] ?? (r.message as string) ?? r.error ?? 'Stake failed.');
        if (code === 'invalid_session' || code === 'no_credential') setShowGate(true);
      } else {
        setSuccess(
          realMode
            ? `Verified on-chain and staked ${usdc} USDC. Your authority ceiling is recalculating.`
            : `Staked ${usdc} testnet USDC. Your authority ceiling is recalculating.`,
        );
        setTxHash('');
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
      {showGate && (
        <GateModal
          onVerified={() => {
            setShowGate(false);
            setAccount(getAccount());
            setError('');
          }}
          onClose={() => setShowGate(false)}
        />
      )}

      <header className="space-y-2">
        <h2 className="text-3xl font-bold text-white">Stake USDC to raise authority</h2>
        <p className="text-[#94a3b8] max-w-2xl leading-relaxed">
          Escrow USDC to back an agent&apos;s reputation. Higher stake raises the agent&apos;s{' '}
          <span className="text-white font-medium">authority ceiling</span> — the maximum economic
          action it can take before requiring peer verification.
        </p>
        <p className="text-sm text-[#64748b] max-w-2xl leading-relaxed">
          Part of the <span className="text-[#94a3b8]">Earn</span> stage. Testnet stake is a single
          click once you&apos;re signed in; a real on-chain deposit asks for a wallet signature,
          because that one credits real value.
        </p>
      </header>

      {/* Who you are — the address is never typed by hand */}
      <section className="bg-[#0f172a] p-5 rounded-xl border border-[#1e293b]">
        {account ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[#94a3b8] uppercase tracking-wider">Staking as</p>
              <p className="text-white font-mono text-sm mt-0.5 break-all">{account.builder_address}</p>
              {account.email && <p className="text-xs text-[#64748b] mt-0.5">{account.email}</p>}
            </div>
            <span className="text-xs px-2 py-1 rounded bg-green-900/30 text-green-400 border border-green-900">
              Signed in
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-white font-medium">Verify your email to stake</p>
              <p className="text-sm text-[#94a3b8] mt-0.5">
                One code. It creates the account the stake credits — no password, no wallet needed
                for testnet.
              </p>
            </div>
            <button
              onClick={() => setShowGate(true)}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded"
            >
              Verify email
            </button>
          </div>
        )}
      </section>

      {!agentsLoaded ? (
        <div className="p-8 text-center text-[#94a3b8] border border-dashed border-[#334155] rounded-xl">
          Loading your agents…
        </div>
      ) : agents.length === 0 ? (
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
              <Stat label="Staked (USDC)" value={stakeTotal != null ? `$${stakeTotal.toFixed(2)}` : '—'} />
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
              <div className="p-3 bg-red-900/20 border border-red-900 text-red-400 rounded text-sm space-y-0.5">
                <p className="font-semibold">Couldn&apos;t complete this stake</p>
                <p className="text-red-400/90">{error}</p>
              </div>
            )}
            {success && (
              <div className="p-3 bg-green-900/20 border border-green-900 text-green-400 rounded text-sm">
                {success}
              </div>
            )}
            <form onSubmit={handleStake} className="space-y-4">
              <div>
                <label className="block text-sm text-[#94a3b8] mb-1">Amount (USDC)</label>
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white"
                />
              </div>

              {/* The higher rung, opt-in and clearly labelled */}
              <div className="border-t border-[#1e293b] pt-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={realMode}
                    onChange={(e) => {
                      setRealMode(e.target.checked);
                      setError('');
                    }}
                    className="mt-1"
                    disabled={!account}
                  />
                  <span className="text-sm">
                    <span className="text-white font-medium">
                      I already sent real USDC on-chain
                    </span>
                    <span className="block text-[#64748b] mt-0.5">
                      Verified against Base Sepolia before it counts, and signed by the wallet that
                      sent it. Leave this off for a testnet stake.
                    </span>
                  </span>
                </label>

                {realMode && isEmailDerived && (
                  <div className="p-3 bg-amber-900/15 border border-amber-900/50 text-amber-300/90 rounded text-sm">
                    This account&apos;s address was derived from your email, so it isn&apos;t a
                    wallet and can&apos;t sign. Real deposits need an account whose address is a
                    wallet you control — testnet staking above works either way.
                  </div>
                )}

                {realMode && !isEmailDerived && (
                  <div>
                    <label className="block text-sm text-[#94a3b8] mb-1">Transaction hash</label>
                    <input
                      type="text"
                      placeholder="0x…"
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white font-mono text-sm"
                    />
                    <p className="text-xs text-[#475569] mt-1">
                      Your wallet will ask you to sign a message naming this exact deposit. It moves
                      no funds — that transfer already happened.
                    </p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || (realMode && isEmailDerived)}
                className="px-8 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold rounded"
              >
                {submitting
                  ? 'Staking…'
                  : !account
                    ? 'Verify email to stake'
                    : realMode
                      ? `Sign & stake ${amount || '0'} USDC`
                      : `Stake ${amount || '0'} testnet USDC`}
              </button>
            </form>
            {!realMode && (
              <p className="text-xs text-[#475569]">
                Testnet stake — no real funds move. It still credits authority, which is why it is
                tied to your account.
              </p>
            )}
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
                {/* DO NOT NAME A CAUSE HERE. This branch is reached on any failure — refused,
                    server error, unreachable — and the client collapses all of them to null, so
                    the reason is not knowable from this component.

                    It previously read "still being finalized on the backend", which was FALSE:
                    the endpoint exists, is mounted and answers; it was returning 401 because the
                    read sat behind auth (repid-engine#504 opens it). A page that invents a cause
                    is the failure this product is built to refuse, and it was doing it in the
                    one place a user checks their own collateral. */}
                Stake positions could not be read. This is not the same as having none — nothing
                was measured either way, so no total is shown rather than a zero.
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
