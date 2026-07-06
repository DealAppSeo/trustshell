'use client';

import { useEffect, useState } from 'react';
import { localDb, Agent } from '@/lib/db';
import { purchaseService, TradeReceipt } from '@/lib/repid-engine';

type Props = {
  serviceType: string;
  serviceName: string;
  feeUsdc: number; // display fee (min price of the service type)
  minRepid: number;
  // TODO(review): the catalog aggregates providers by service_type and does not
  // expose a concrete provider agent id. Until the backend catalog returns a
  // purchasable provider id, we fall back to the service_type as the trade target.
  providerAgentId?: string;
};

type Phase = 'idle' | 'confirm' | 'processing' | 'done' | 'error';

function fmtUsdc(u: number): string {
  return u < 0.01 ? `$${u.toFixed(4)}` : `$${u.toFixed(2)}`;
}

export function PurchaseServiceButton({
  serviceType,
  serviceName,
  feeUsdc,
  minRepid,
  providerAgentId,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [buyerAgentId, setBuyerAgentId] = useState('');
  const [receipt, setReceipt] = useState<TradeReceipt | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (phase === 'confirm' && agents.length === 0) {
      localDb.getAgents().then((a) => {
        setAgents(a);
        if (a.length > 0 && a[0]) setBuyerAgentId(a[0].id);
      });
    }
  }, [phase, agents.length]);

  const close = () => {
    setPhase('idle');
    setReceipt(null);
    setError('');
  };

  const confirmPurchase = async () => {
    if (!buyerAgentId) {
      setError('Pick a buyer agent (create one in /agents first).');
      return;
    }
    setPhase('processing');
    setError('');
    try {
      const r = await purchaseService({
        providerAgentId: providerAgentId || serviceType,
        buyerAgentId,
        serviceType,
      });
      setReceipt(r);
      setPhase(r.ok ? 'done' : 'error');
      if (!r.ok) setError(r.error || 'Purchase failed.');
    } catch {
      setPhase('error');
      setError('Backend unavailable. Try again in a moment.');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setPhase('confirm')}
        className="w-full mt-1 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-sm font-semibold rounded transition-colors"
      >
        Purchase service
      </button>

      {phase !== 'idle' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div
            className="w-full max-w-md bg-card border border-border rounded-xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* CONFIRM: fee confirmation */}
            {phase === 'confirm' && (
              <>
                <h3 className="text-lg font-bold text-foreground">Confirm purchase</h3>
                <div className="rounded-lg border border-border bg-background/40 p-4 space-y-2 text-sm">
                  <Row label="Service" value={serviceName} />
                  <Row label="Type" value={serviceType} mono />
                  <Row label="Fee" value={fmtUsdc(feeUsdc)} strong />
                  <Row label="Settlement" value="x402 · on-chain USDC" />
                  <Row label="Min RepID" value={minRepid ? minRepid.toLocaleString() : '—'} />
                </div>

                <label className="block text-sm">
                  <span className="block text-muted mb-1">Buyer agent</span>
                  {agents.length === 0 ? (
                    <span className="text-xs text-muted">
                      No agents found. Create one in /agents first.
                    </span>
                  ) : (
                    <select
                      value={buyerAgentId}
                      onChange={(e) => setBuyerAgentId(e.target.value)}
                      className="w-full bg-background border border-border rounded p-2 text-foreground"
                    >
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.id.slice(0, 8)}…)
                        </option>
                      ))}
                    </select>
                  )}
                </label>

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    onClick={close}
                    className="px-4 py-2 text-sm text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmPurchase}
                    disabled={agents.length === 0}
                    className="px-5 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-white text-sm font-semibold rounded"
                  >
                    Pay {fmtUsdc(feeUsdc)}
                  </button>
                </div>
              </>
            )}

            {/* PROCESSING */}
            {phase === 'processing' && (
              <div className="py-8 text-center space-y-3">
                <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted">Settling x402 payment on-chain…</p>
              </div>
            )}

            {/* DONE: tx confirmation + receipt */}
            {phase === 'done' && receipt && (
              <>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/15 text-green-500 text-sm">
                    ✓
                  </span>
                  <h3 className="text-lg font-bold text-foreground">Purchase complete</h3>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-4 space-y-2 text-sm">
                  <Row label="Service" value={serviceName} />
                  <Row label="Fee paid" value={fmtUsdc(feeUsdc)} strong />
                  {receipt.receipt_id && <Row label="Receipt" value={String(receipt.receipt_id)} mono />}
                  {typeof receipt.repid_delta === 'number' && (
                    <Row
                      label="RepID Δ"
                      value={`${receipt.repid_delta >= 0 ? '+' : ''}${receipt.repid_delta}`}
                      strong
                    />
                  )}
                  {receipt.tx_hash && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted">Tx</span>
                      {receipt.settlement_url ? (
                        <a
                          href={String(receipt.settlement_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline font-mono text-xs truncate max-w-[180px]"
                        >
                          {String(receipt.tx_hash).slice(0, 18)}…
                        </a>
                      ) : (
                        <span className="font-mono text-xs truncate max-w-[180px]">
                          {String(receipt.tx_hash)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted">
                  {/* TODO(review): depends on backend endpoint POST /api/v1/agent/:agentId/trade */}
                  Receipt fields render whatever the trade endpoint returns; the endpoint is not live yet.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={close}
                    className="px-5 py-2 bg-accent hover:opacity-90 text-white text-sm font-semibold rounded"
                  >
                    Done
                  </button>
                </div>
              </>
            )}

            {/* ERROR */}
            {phase === 'error' && (
              <>
                <h3 className="text-lg font-bold text-foreground">Purchase failed</h3>
                <p className="text-sm text-red-500">{error || 'Something went wrong.'}</p>
                <p className="text-xs text-muted">
                  {/* TODO(review): trade endpoint POST /api/v1/agent/:agentId/trade not yet implemented. */}
                  The marketplace trade endpoint is not live yet — this flow is wired against the agreed contract.
                </p>
                <div className="flex gap-3 justify-end">
                  <button onClick={close} className="px-4 py-2 text-sm text-muted hover:text-foreground">
                    Close
                  </button>
                  <button
                    onClick={() => setPhase('confirm')}
                    className="px-5 py-2 bg-accent hover:opacity-90 text-white text-sm font-semibold rounded"
                  >
                    Retry
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  label,
  value,
  strong,
  mono,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span
        className={`${strong ? 'font-semibold text-foreground' : 'text-foreground'} ${
          mono ? 'font-mono text-xs' : ''
        } truncate max-w-[220px]`}
      >
        {value}
      </span>
    </div>
  );
}
