'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { localDb, Agent } from '@/lib/db';
import { FaucetHelp } from '@/components/faucet-help';
import {
  depositStake,
  fetchAuthority,
  fetchStakePositions,
  rawToUsdc,
  authorityCeilingDisplay,
  usdcToRaw,
  STAKE_AUTH_ERRORS,
  AuthoritySnapshot,
  StakePosition,
} from '@/lib/repid-engine';
import {
  fetchAgentSessionAddress,
  sendStakeTransfer,
  confirmStakeReceipt,
  basescanTx,
  type SessionAddress,
} from '@/lib/stake-onchain';
import { repidToTier } from '@/lib/onchain-repid';
import { getAccount, accountHeader, Account } from '@/lib/account';
import { GateModal } from '@/components/gate-modal';
import { PracticeBadge } from '@/components/practice-badge';
import { JourneySteps } from '@/components/journey-steps';
import { fetchAgentOwner, type AgentOwner } from '@/lib/human-bind';

const ENGINE = process.env.NEXT_PUBLIC_REPID_ENGINE_URL || '';

/**
 * Staking, with the ask sized to what is at stake.
 *
 * This page used to open with a blank "builder address (0x…)" field and no account behind it,
 * because there was no account to have. That is now closed, and the page reflects the ladder:
 *
 *   not signed in   one emailed code. Nothing else is asked for.
 *   signed in       the address is YOURS and already known, so a PRACTICE stake is a single click.
 *   real USDC       the person's own wallet BUILDS, SIGNS and SENDS a Base Sepolia test-USDC
 *                   transfer to THE AGENT'S EXISTING SESSION ADDRESS, and the stake counts only
 *                   once that transfer is CONFIRMED on-chain. A database row that says staked is
 *                   not the test.
 *
 * THERE IS NO FLAG AND NO ESCROW ENV. Base Sepolia (chain 84532) is the test, so the real stake
 * just works there. The destination is the agent's session address, which the engine already has
 * (the same wallet the spend path funds) — READ from the engine, NEVER invented. If it cannot be
 * read, the page says so and does not offer a real send; it does not fall back to any address.
 *
 * NO KEY ON DISK, NO SERVER SIGNER. The transfer is signed and sent by the person's wallet
 * (eth_sendTransaction). The agent's own key (browser-local) is used only to READ the session
 * address. Mainnet is off: the only token is Base Sepolia test USDC and the only chain is 84532.
 */

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
  // undefined = still reading; null = could not be read (NOT_CHECKED); else the owner record.
  // `owned: true` is only ever a signature the owner made; a linked account is not ownership.
  const [owner, setOwner] = useState<AgentOwner | null | undefined>(undefined);

  // undefined = not yet resolved; else the result. The real send is offered only on {ok:true}.
  // Read from the engine, never invented — a {ok:false} is a named blocker or a NOT_CHECKED.
  const [session, setSession] = useState<SessionAddress | undefined>(undefined);

  const [realMode, setRealMode] = useState(false);

  // The real on-chain tx, once broadcast. Surfaced with a basescan link so a deposit is never a
  // row the person cannot see.
  const [txHash, setTxHash] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
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

  // When an agent is picked, load its current RepID + authority snapshot + owner.
  useEffect(() => {
    if (!selectedAgentId) return;
    let ignore = false;

    fetch(`${ENGINE}/api/v1/agents/${selectedAgentId}`)
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
    setOwner(undefined);
    setSession(undefined);
    fetchAgentOwner(selectedAgentId).then((o) => {
      if (!ignore) setOwner(o);
    });

    return () => {
      ignore = true;
    };
  }, [selectedAgentId]);

  const bound = owner?.owned === true;
  const bindHold =
    owner === null
      ? 'Not checked: whether this agent is bound could not be read, so the practice stake is held. Try again in a moment.'
      : 'This agent is not bound to a wallet yet. Bind it first, then come back. Nothing was staked.';

  // Resolve the agent's SESSION ADDRESS (its own wallet) from the engine, once it is bound. This
  // is the destination a real stake funds — read, never invented. Probed with the BOUND OWNER's
  // wallet, because the engine returns the session address only to the owner.
  useEffect(() => {
    if (!bound) return;
    const ownerWallet = owner?.owner?.wallet ?? '';
    const apiKey = agents.find((a) => a.id === selectedAgentId)?.apiKey;
    let ignore = false;
    setSession(undefined);
    fetchAgentSessionAddress({ engine: ENGINE, agentId: selectedAgentId, apiKey, ownerWallet }).then((s) => {
      if (!ignore) setSession(s);
    });
    return () => {
      ignore = true;
    };
  }, [bound, owner?.owner?.wallet, selectedAgentId, agents]);

  const sessionReady = session?.ok === true;

  // The real send is only ever offered when a session address was read; close the checkbox if it
  // becomes unavailable so the submit cannot take the real branch.
  useEffect(() => {
    if (!sessionReady && realMode) setRealMode(false);
  }, [sessionReady, realMode]);

  /** Read the address of the wallet the person has connected (the funder/signer). */
  const connectedWallet = useCallback(async (): Promise<{ address?: string; error?: string }> => {
    const eth = (globalThis as any).window?.ethereum;
    if (!eth) return { error: 'No wallet detected in this browser. Install one, or stake on practice instead. Nothing was sent.' };
    try {
      const { BrowserProvider } = await import('ethers');
      const provider = new BrowserProvider(eth);
      const signer = await provider.getSigner();
      return { address: (await signer.getAddress()) };
    } catch {
      return { error: 'Could not read your wallet account. Unlock it and try again. Nothing was sent.' };
    }
  }, []);

  const handleStake = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setProgress('');

    if (!account) {
      setShowGate(true);
      return;
    }
    // The order we ask for: bind the agent first. This page holds the stake until the owner record
    // says owned; an unreadable record holds it too (not checked is not bound).
    if (!bound) {
      setError(bindHold);
      return;
    }
    const usdc = Number(amount);
    if (!Number.isFinite(usdc) || usdc <= 0) {
      setError('Enter a positive USDC amount.');
      return;
    }

    // The amount actually moved on-chain, matching the demo path's "100" → 100000000 coercion.
    const amountRaw = usdc === 100 ? '100000000' : usdcToRaw(usdc);

    // ---- REAL on-chain stake: the person's wallet builds, signs and SENDS it to the session address.
    if (realMode) {
      if (!session || !session.ok) {
        // Belt-and-suspenders: the real UI is only shown when the session address was read, but
        // never take the real branch without it. Fail closed.
        setError(session && !session.ok ? session.reason : 'The agent’s session address is not available, so nothing is sent.');
        return;
      }
      const destination = session.address;
      const eth = (globalThis as any).window?.ethereum;
      if (!eth) {
        setError('No wallet detected in this browser. Install one, or stake on practice instead. Nothing was sent.');
        return;
      }

      setSubmitting(true);
      try {
        setProgress('Reading your wallet…');
        const funder = await connectedWallet();
        if (funder.error || !funder.address) {
          setError(funder.error ?? 'Could not read your wallet. Nothing was sent.');
          setSubmitting(false);
          setProgress('');
          return;
        }

        // 1) Build + send the real transfer to the session address. ensureBaseSepolia (chain gate)
        //    runs inside. The wallet signs and sends; no server key, no key on disk.
        setProgress('Confirm the transfer to your agent’s session address in your wallet…');
        const sent = await sendStakeTransfer(eth, funder.address, destination, amountRaw);
        if (sent.hash) setTxHash(sent.hash);
        if (!sent.ok) {
          setError(sent.pending && sent.hash
            ? `${sent.reason} Transaction: ${sent.hash}. Nothing counts as staked until it confirms.`
            : sent.reason);
          setSubmitting(false);
          setProgress('');
          return;
        }

        // 2) Confirm the receipt actually moved the USDC into the session address BEFORE anything
        //    reads as staked. NOT_CHECKED / FAILED is never "staked".
        setProgress('Confirming the transfer on Base Sepolia…');
        const conf = confirmStakeReceipt(sent.receipt, { destination, amountRaw });
        if (conf.state !== 'VERIFIED') {
          setError(`${conf.reason} Transaction: ${sent.hash}.`);
          setSubmitting(false);
          setProgress('');
          return;
        }

        // Confirmed on-chain. The stake IS this confirmed transfer — not a DB write.
        setSuccess(`Confirmed on-chain: staked ${usdc} test USDC to your agent’s session address ${destination}. Transaction ${sent.hash}.`);
        fetchAuthority(selectedAgentId).then(setAuthority);
        fetchStakePositions(selectedAgentId).then(setPositions);
      } catch {
        setError('Something interrupted the real stake. If your wallet sent the transfer, check it on Basescan — nothing reads as staked unless it confirmed.');
      }
      setSubmitting(false);
      setProgress('');
      return;
    }

    // ---- PRACTICE stake: no real funds move. The account's session is enough. --------------
    setSubmitting(true);
    try {
      const r = await depositStake({
        builder_address: account.builder_address,
        amount_usdc: usdc,
        authHeaders: accountHeader(),
      });
      if (!r.ok) {
        const code = typeof r.error === 'string' ? r.error : '';
        setError(STAKE_AUTH_ERRORS[code] ?? (r.message as string) ?? r.error ?? 'Stake failed.');
        if (code === 'invalid_session' || code === 'no_credential') setShowGate(true);
      } else {
        setSuccess(
          `Staked ${usdc} testnet USDC. It shows in the figure above, but only a real on-chain deposit raises what the agent may actually spend.`,
        );
        fetchAuthority(selectedAgentId).then(setAuthority);
        fetchStakePositions(selectedAgentId).then(setPositions);
      }
    } catch {
      setError('Backend unavailable. Try again in a moment.');
    }
    setSubmitting(false);
  };

  const tier = repid != null ? repidToTier(repid) : null;
  // One tested helper rather than an inline conditional: rawToUsdc(null) returns 0, so the check
  // must happen before the conversion, and that ordering is too easy to lose in a render body.
  const authorityView = authorityCeilingDisplay(authority);
  const authorityCeiling = authorityView.usd;
  const authorityWithheld = authorityView.withheld;
  const stakeTotal = authority ? rawToUsdc(authority.stake_total) : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
      {showGate && (
        <GateModal
          reason="stake"
          onVerified={() => {
            setShowGate(false);
            setAccount(getAccount());
            setError('');
          }}
          onClose={() => setShowGate(false)}
        />
      )}

      <header className="space-y-2">
        <PracticeBadge />
        <h2 className="text-3xl font-bold text-white">Stake USDC to raise authority</h2>
        <p className="text-[#94a3b8] max-w-2xl leading-relaxed">
          Escrow USDC to back an agent&apos;s reputation. Higher stake raises the agent&apos;s{' '}
          <span className="text-white font-medium">authority ceiling</span> — the maximum economic
          action it can take before requiring peer verification. Only a real on-chain deposit
          raises the ceiling the spend gate uses. Testnet stake shows in the figure below, but it
          does not raise what the agent may actually spend.
        </p>
        <p className="text-sm text-[#94a3b8] max-w-2xl leading-relaxed" data-testid="stake-faucet-pointer">
          Need test tokens first? A public faucet gives them away free; we do not.{' '}
          <Link href="/faucet" className="text-amber-500 underline underline-offset-2">
            Get test tokens and check your balance
          </Link>
          . This is practice: it runs on the Base Sepolia test network and only after the agent is bound.
        </p>
        <p className="text-sm text-[#64748b] max-w-2xl leading-relaxed">
          Part of the <span className="text-[#94a3b8]">Earn</span> stage. A testnet stake is a single
          click once you&apos;re signed in. A real stake is sent by your own wallet, on Base Sepolia,
          to the agent&apos;s own session address, and only counts once it confirms on-chain.
        </p>
      </header>

      <JourneySteps current="stake" />

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
                for practice.
              </p>
            </div>
            <button
              onClick={() => setShowGate(true)}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded"
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
                value={
                  authorityCeiling != null
                    ? `$${authorityCeiling.toFixed(2)}`
                    : authorityWithheld
                      ? 'Not established'
                      : '—'
                }
                accent
              />
            </div>
            {authority && authorityView.nonBinding && (
              <p className="text-xs leading-relaxed text-amber-600">
                {authorityView.detail ??
                  (authorityWithheld
                    ? 'No authority ceiling is quoted for this builder: the builder floor was ' +
                      'never applied on its path, so the ceiling that governs real spend ' +
                      'delegation is not established. This is not a ceiling of zero.'
                    : 'Demo figure — not a ceiling the spend gate would honour.')}
              </p>
            )}
            {authority && (
              <p className="text-xs text-[#475569]">
                Basis: <span className="font-mono">{authority.basis}</span>
              </p>
            )}
          </section>

          {/* Stake form */}
          <section className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-4">
            <h3 className="text-xl font-bold text-white">Deposit stake</h3>
            {owner !== undefined && !bound && (
              <div data-testid="stake-bind-first" className="p-3 bg-amber-900/15 border border-amber-900/50 text-amber-300/90 rounded text-sm space-y-1">
                <p>{bindHold}</p>
                <p>
                  <Link href="/bind" className="underline underline-offset-2">
                    Bind this agent
                  </Link>
                </p>
              </div>
            )}
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-900 text-red-400 rounded text-sm space-y-0.5">
                <p className="font-semibold">Couldn&apos;t complete this stake</p>
                <p className="text-red-400/90 break-all">{error}</p>
              </div>
            )}
            {success && (
              <div className="p-3 bg-green-900/20 border border-green-900 text-green-400 rounded text-sm space-y-1">
                <p className="break-all">{success}</p>
                {txHash && (
                  <p>
                    <a
                      href={basescanTx(txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-300 underline underline-offset-2 break-all"
                    >
                      View transaction on Basescan
                    </a>
                  </p>
                )}
              </div>
            )}
            {submitting && progress && (
              <div className="p-3 bg-[#0a0f1a] border border-[#334155] text-[#94a3b8] rounded text-sm">
                {progress}
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

              {/* The higher rung: a REAL on-chain send to the agent's session address, shown only
                  once that address was read from the engine. Opt-in and clearly labelled. */}
              {bound && sessionReady && session?.ok && (
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
                        Send a real USDC stake on-chain
                      </span>
                      <span className="block text-[#64748b] mt-0.5">
                        Your wallet builds, signs and sends a Base Sepolia test-USDC transfer to your
                        agent&apos;s session address. It counts only once the transfer confirms
                        on-chain. Leave this off for a practice stake.
                      </span>
                    </span>
                  </label>

                  {realMode && <FaucetHelp />}

                  {realMode && (
                    <p className="text-xs text-[#475569] break-all" data-testid="stake-session-destination">
                      Destination (your agent&apos;s session address):{' '}
                      <a
                        href={`https://sepolia.basescan.org/address/${session.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[#94a3b8] underline underline-offset-2"
                      >
                        {session.address}
                      </a>
                      . Your wallet will ask you to confirm this transfer; the receipt (transaction
                      hash) is shown when it lands.
                    </p>
                  )}
                </div>
              )}

              {/* A bound agent whose session address could NOT be read — distinctly a blocker or a
                  NOT_CHECKED, never collapsed into practice, and never an invented address. */}
              {bound && session && !session.ok && (
                <div
                  data-testid="stake-real-unavailable"
                  className="border-t border-[#1e293b] pt-4"
                >
                  <div className="p-3 bg-amber-900/15 border border-amber-900/50 text-amber-300/90 rounded text-sm">
                    {session.reason} Practice staking below works meanwhile.
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !bound || (realMode && !sessionReady)}
                className="px-8 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-black font-bold rounded"
              >
                {submitting
                  ? 'Staking…'
                  : !bound
                    ? 'Bind the agent to stake'
                    : !account
                    ? 'Verify email to stake'
                    : realMode
                      ? `Sign & send ${amount || '0'} real USDC`
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
