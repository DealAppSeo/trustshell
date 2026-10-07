'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { localDb, type Agent } from '@/lib/db';
import { useWallet } from '@/components/bind/use-wallet';
import {
  askSpend,
  BASESCAN_ADDRESS,
  BASESCAN_TX,
  parseUsdcInput,
  setCap,
  type Eip1193,
  type SpendReply,
} from '@/lib/agent-spend-client';

const ENGINE = process.env.NEXT_PUBLIC_REPID_ENGINE_URL;
const PROBE = '0.000001';

/**
 * LET AN AGENT SPEND, UP TO A CAP YOU SET ON-CHAIN. Testnet only (Base Sepolia, test USDC).
 *
 * 1. Connect your wallet. 2. Set the cap: your wallet approves the agent's own wallet for N USDC.
 * 3. Have the agent pay: it asks the engine with its own key, which refuses anything over the cap
 * before signing, and the USDC contract refuses it again if not. Setting the cap to 0 stops it.
 */
export default function SpendPage() {
  const wallet = useWallet();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [status, setStatus] = useState<SpendReply | null>(null);
  const [capInput, setCapInput] = useState('5');
  const [capTx, setCapTx] = useState<{ hash: string; note: string } | null>(null);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('1');
  const [reply, setReply] = useState<SpendReply | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    localDb.getAgents().then((all) => setAgents(all.filter((a) => a.apiKey)));
  }, []);
  const agent = useMemo(() => agents.find((a) => a.id === agentId) ?? agents[0], [agents, agentId]);

  const refresh = useCallback(async () => {
    if (!ENGINE || !agent?.apiKey || !wallet.address) return setStatus(null);
    setStatus(await askSpend(ENGINE, { id: agent.id, apiKey: agent.apiKey }, { owner: wallet.address, to: wallet.address, amountUsdc: PROBE, dryRun: true }));
  }, [agent?.id, agent?.apiKey, wallet.address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum;
  const agentWallet = status?.agent_wallet ?? null;

  const applyCap = async (value: string) => {
    setError('');
    const amt = value === '0' ? BigInt(0) : parseUsdcInput(value);
    if (amt === null) return setError('Write the cap as a number of USDC, e.g. 5 or 2.50.');
    const e = eth();
    if (!e || !wallet.address || !agentWallet) return;
    setBusy('cap');
    try {
      const r = await setCap(e, wallet.address, agentWallet, amt);
      setCapTx({ hash: r.hash, note: !r.mined ? 'Sent. Not confirmed yet; check it on Basescan.' : r.ok ? 'Confirmed.' : 'The chain rejected it.' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your wallet did not send it. Nothing changed.');
    }
    setBusy('');
  };

  const pay = async (dryRun: boolean) => {
    setError('');
    setReply(null);
    if (!ENGINE || !agent?.apiKey || !wallet.address) return;
    if (parseUsdcInput(amount) === null) return setError('Write the amount as a number of USDC, e.g. 1 or 0.25.');
    setBusy(dryRun ? 'check' : 'pay');
    setReply(await askSpend(ENGINE, { id: agent.id, apiKey: agent.apiKey }, { owner: wallet.address, to: to.trim(), amountUsdc: amount.trim(), dryRun }));
    setBusy('');
    if (!dryRun) await refresh();
  };

  if (!ENGINE) return <p className="max-w-xl mx-auto mt-16 text-[#94a3b8]">The backend URL is not set for this deploy. Nothing can be checked.</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold">Let an agent spend</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          You set a cap in your own wallet. Your agent can pay up to that much and no more: the USDC contract refuses anything over it. Set the cap to 0 to stop it at once.
        </p>
        <p className="text-xs text-amber-400/90">Test network only: Base Sepolia, with test USDC that has no value.</p>
      </div>

      {agents.length === 0 ? (
        <p className="text-sm text-[#94a3b8]">
          Create an agent first on <Link href="/agents" className="text-amber-500 hover:underline">Agents</Link>. It needs its key stored in this browser.
        </p>
      ) : (
        <label className="block text-sm">
          <span className="text-white font-medium">Which agent</span>
          <select value={agent?.id ?? ''} onChange={(e) => setAgentId(e.target.value)} className="mt-1 w-full bg-[#0a0f1a] border border-[#334155] rounded p-2 text-white">
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}

      <section aria-labelledby="s1" className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-2">
        <h3 id="s1" className="text-lg font-bold">1. Connect your wallet</h3>
        {!wallet.available ? (
          <p className="text-sm text-[#94a3b8]">No wallet in this browser. Install one (for example MetaMask), add Base Sepolia, and come back.</p>
        ) : wallet.address ? (
          <p className="text-sm text-[#94a3b8] break-all">Connected: <span className="font-mono text-white">{wallet.address}</span></p>
        ) : (
          <button type="button" onClick={wallet.connect} disabled={wallet.connecting} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded disabled:opacity-60">
            {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
          </button>
        )}
        {wallet.error && <p role="alert" className="text-sm text-[#ff6b6b]">{wallet.error}</p>}
      </section>

      <section aria-labelledby="s2" className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-3">
        <h3 id="s2" className="text-lg font-bold">2. Set the cap</h3>
        {!wallet.address || !agent ? (
          <p className="text-sm text-[#94a3b8]">Connect your wallet and choose an agent first.</p>
        ) : !status ? (
          <p className="text-sm text-[#94a3b8]" aria-live="polite">Reading the chain…</p>
        ) : !agentWallet ? (
          <p className="text-sm text-[#94a3b8]">Not checked: {status.error ?? 'the engine did not name this agent’s wallet.'}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-[#64748b]">Agent wallet</dt>
              <dd className="font-mono text-white break-all"><a href={`${BASESCAN_ADDRESS}${agentWallet}`} target="_blank" rel="noreferrer noopener" className="hover:underline">{agentWallet}</a></dd>
              <dt className="text-[#64748b]">Cap now</dt>
              <dd className="text-white">{status.reads?.cap_usdc ?? 'not checked'} USDC</dd>
              <dt className="text-[#64748b]">Your test USDC</dt>
              <dd className="text-white">{status.reads?.owner_balance_usdc ?? 'not checked'}</dd>
              <dt className="text-[#64748b]">Agent gas</dt>
              <dd className="text-white">{status.reads ? `${Number(status.reads.agent_eth) / 1e18} ETH` : 'not checked'}</dd>
            </dl>
            {status.reads && status.reads.agent_eth === '0' && (
              <p className="text-xs text-amber-400/90">The agent wallet has no Base Sepolia ETH, so it cannot pay gas yet. Send it a little test ETH from a faucet.</p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="text-white font-medium">Cap (USDC)</span>
                <input value={capInput} onChange={(e) => setCapInput(e.target.value)} inputMode="decimal" className="mt-1 block w-32 bg-[#0a0f1a] border border-[#334155] rounded p-2 text-white" />
              </label>
              <button type="button" onClick={() => applyCap(capInput)} disabled={!!busy} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded disabled:opacity-60">
                {busy === 'cap' ? 'Waiting for your wallet…' : 'Set cap'}
              </button>
              <button type="button" onClick={() => applyCap('0')} disabled={!!busy} className="px-4 py-2 border border-red-900/60 text-red-400 rounded hover:bg-red-950/40 disabled:opacity-60">
                Stop it (cap 0)
              </button>
            </div>
            {capTx && (
              <p className="text-sm text-[#94a3b8]" role="status">
                {capTx.note} <a href={`${BASESCAN_TX}${capTx.hash}`} target="_blank" rel="noreferrer noopener" className="text-amber-500 hover:underline">See it on Basescan</a>
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="s3" className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-3">
        <h3 id="s3" className="text-lg font-bold">3. Have it pay</h3>
        <label className="block text-sm">
          <span className="text-white font-medium">Pay to (address)</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" className="mt-1 w-full bg-[#0a0f1a] border border-[#334155] rounded p-2 text-white font-mono" />
        </label>
        <label className="block text-sm">
          <span className="text-white font-medium">Amount (USDC)</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1 block w-32 bg-[#0a0f1a] border border-[#334155] rounded p-2 text-white" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => pay(true)} disabled={!!busy || !wallet.address || !agent} className="px-4 py-2 border border-[#334155] text-white rounded hover:bg-[#1e293b] disabled:opacity-60">
            {busy === 'check' ? 'Checking…' : 'Check first'}
          </button>
          <button type="button" onClick={() => pay(false)} disabled={!!busy || !wallet.address || !agent} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded disabled:opacity-60">
            {busy === 'pay' ? 'Paying…' : 'Pay'}
          </button>
        </div>
        {reply && (
          reply.tx_hash ? (
            <p className="text-sm text-green-400" role="status">
              Paid {reply.amount_usdc} USDC. Cap left: {reply.cap_after_usdc ?? 'not checked'} USDC.{' '}
              <a href={reply.basescan_url ?? `${BASESCAN_TX}${reply.tx_hash}`} target="_blank" rel="noreferrer noopener" className="text-amber-500 hover:underline">See it on Basescan</a>
            </p>
          ) : reply.dry_run && reply.would_send ? (
            <p className="text-sm text-green-400" role="status">This would go through. Nothing was sent.</p>
          ) : (
            <p className="text-sm text-[#ff6b6b]" role="alert">{reply.dry_run ? 'This would not go through: ' : 'Not paid: '}{reply.error}</p>
          )
        )}
        {error && <p role="alert" className="text-sm text-[#ff6b6b]">{error}</p>}
      </section>
    </div>
  );
}
