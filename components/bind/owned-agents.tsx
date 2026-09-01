'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  explainBindError,
  listMyAgents,
  revokeBinding,
  shortAddress,
  type OwnedAgent,
} from '@/lib/human-bind';
import { useWallet } from './use-wallet';
import { Rule } from './marks';

/**
 * Everything this wallet owns, and the way to stop owning it.
 *
 * READING THE LIST COSTS A SIGNATURE. `GET /human/agents` is authenticated, so
 * the list cannot load on mount without opening a wallet prompt nobody asked
 * for. The person asks for it. That is a real cost and the copy says so rather
 * than pretending the button is free.
 *
 * REVOCATION IS OFFERED AS PLAINLY AS CLAIMING. A binding you cannot leave is
 * not ownership, it is capture — so revoke is a first-class control here, not
 * buried behind a settings page.
 */
export function OwnedAgents() {
  const wallet = useWallet();
  const [agents, setAgents] = useState<OwnedAgent[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  // A different wallet owns different agents; showing the previous one's list
  // under a new address would be a quiet lie.
  useEffect(() => {
    // Nothing to do on the way in; on the way out, drop the previous wallet's
    // list so it can never appear under a different address.
    return () => {
      setAgents(null);
      setError(null);
      setConfirming(null);
    };
  }, [wallet.address]);

  const load = useCallback(async () => {
    if (!wallet.address) return;
    setLoading(true);
    setError(null);
    const result = await listMyAgents({ wallet: wallet.address, sign: wallet.sign });
    setLoading(false);
    if (!result.ok) {
      setError(explainBindError(result.reason, result.detail));
      return;
    }
    setEnabled(result.enabled);
    setAgents(result.agents);
  }, [wallet.address, wallet.sign]);

  const revoke = useCallback(
    async (agentId: string) => {
      if (!wallet.address) return;
      setRevoking(agentId);
      setError(null);
      const result = await revokeBinding({ wallet: wallet.address, agentId, sign: wallet.sign });
      setRevoking(null);
      setConfirming(null);
      if (!result.ok) {
        setError(explainBindError(result.reason, result.detail));
        return;
      }
      setAgents((prev) => (prev ?? []).filter((a) => a.id !== agentId));
    },
    [wallet.address, wallet.sign],
  );

  if (!wallet.ready || !wallet.available || !wallet.address) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-xl font-semibold text-[#fafafa]">What you own</h2>
        <span className="font-mono text-[13px] text-[#a1a1aa]">
          {shortAddress(wallet.address)}
        </span>
      </div>

      {agents === null ? (
        <div className="space-y-3 rounded-lg border border-[#27272a] bg-[#131315] px-6 py-5">
          <p className="max-w-[62ch] text-sm leading-relaxed text-[#a1a1aa]">
            This list is private, so the engine will not hand it over without proof you hold the
            key. Your wallet will ask for one signature. Nothing is spent.
          </p>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-md border border-[#3f3f46] px-4 py-2 text-sm font-medium text-[#fafafa] transition-colors hover:border-[#52525b] hover:bg-[#1c1c1f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Waiting for your wallet…' : 'Show what I own'}
          </button>
        </div>
      ) : !enabled ? (
        <p className="rounded-lg border border-dashed border-[#3f3f46] px-6 py-5 text-sm text-[#a1a1aa]">
          Ownership binding is switched off on this deployment, so this list is empty for a
          reason that has nothing to do with your wallet.
        </p>
      ) : agents.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed border-[#3f3f46] px-6 py-5">
          <p className="text-sm text-[#a1a1aa]">
            This wallet does not own any agents yet.
          </p>
          <p className="text-sm text-[#a1a1aa]">
            Claiming one is the last step — and the first that asks anything of you.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#1f1f23] overflow-hidden rounded-lg border border-[#27272a]">
          {agents.map((a) => (
            <li key={a.id} className="space-y-3 bg-[#131315] px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-[#fafafa]">
                    {a.agent_name || 'Unnamed agent'}
                  </p>
                  <p className="break-all font-mono text-[12px] text-[#a1a1aa]">{a.id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-sm">
                  <Link
                    href={`/passport/${a.id}`}
                    className="text-[#a1a1aa] underline underline-offset-2 transition-colors hover:text-[#fafafa]"
                  >
                    Passport
                  </Link>
                  {confirming === a.id ? null : (
                    <button
                      type="button"
                      onClick={() => setConfirming(a.id)}
                      className="text-[#a1a1aa] underline underline-offset-2 transition-colors hover:text-[#fda4af]"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>

              {confirming === a.id && (
                <div className="space-y-3 rounded-md border border-[#3f3f46] bg-[#0d0d0f] px-4 py-3">
                  <p className="max-w-[58ch] text-sm leading-relaxed text-[#a1a1aa]">
                    Revoking removes your proof of ownership. The agent keeps working and keeps
                    its RepID — you simply stop being the one who owns it, and anyone else can
                    then claim it.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => revoke(a.id)}
                      disabled={revoking === a.id}
                      className="rounded-md border border-[#fb7185]/50 px-4 py-1.5 text-sm font-medium text-[#fda4af] transition-colors hover:bg-[#fb7185]/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {revoking === a.id ? 'Waiting for your wallet…' : 'Revoke ownership'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="text-sm text-[#a1a1aa] underline underline-offset-2 transition-colors hover:text-[#fafafa]"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-[#fda4af]">
          {error}
        </p>
      )}

      {agents !== null && (
        <>
          <Rule />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-sm text-[#a1a1aa] underline underline-offset-2 transition-colors hover:text-[#a1a1aa] disabled:opacity-60"
          >
            {loading ? 'Refreshing…' : 'Refresh (signs again)'}
          </button>
        </>
      )}
    </section>
  );
}
