'use client';
import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { localDb, Agent, HistoryRow } from '@/lib/db';
import { vault } from '@/lib/vault';
import { tokenHeader, fetchGateStatus, getGateEmail } from '@/lib/agent-gate';
import { GateModal } from '@/components/gate-modal';

export default function RunPage({ params }: { params: Promise<{ agentId: string }> }) {
  const unwrappedParams = use(params);
  const agentId = unwrappedParams.agentId;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [repid, setRepid] = useState<number>(0);
  const [prompt, setPrompt] = useState('');
  const [tierPref, setTierPref] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([]);
  // Real-time RepID delta toast: set to the last non-zero delta so the change
  // is visible on the card. Cleared after the animation window.
  const [deltaToast, setDeltaToast] = useState<{ id: number; delta: number } | null>(null);
  const [scorePulse, setScorePulse] = useState(false);
  // T0.5 gate: free anonymous taste of hosted runs, email-verified cap after.
  const [showGate, setShowGate] = useState(false);
  const [gateInfo, setGateInfo] = useState<{ verified: boolean; remaining: number; limit: number } | null>(null);

  const refreshGate = () => {
    fetchGateStatus().then((s) => {
      if (s && s.enabled) setGateInfo({ verified: s.verified, remaining: s.remaining, limit: s.limit });
    });
  };
  useEffect(refreshGate, []);

  useEffect(() => {
    if (!deltaToast) return;
    const t = setTimeout(() => setDeltaToast(null), 3200);
    return () => clearTimeout(t);
  }, [deltaToast]);

  const flashDelta = (delta: number) => {
    if (!delta) return;
    setDeltaToast({ id: Date.now(), delta });
    setScorePulse(true);
    setTimeout(() => setScorePulse(false), 700);
  };

  useEffect(() => {
    localDb.getAgents().then(agents => {
      setAgent(agents.find(a => a.id === agentId) || null);
      setAgentsLoaded(true);
    });
    localDb.getHistory().then(h => setHistory(h.filter(row => row.agentId === agentId)));
    fetch(`${process.env.NEXT_PUBLIC_REPID_ENGINE_URL}/api/v1/agents/${agentId}`)
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.repid_score === 'number') {
          setRepid(data.repid_score);
        }
      })
      .catch(() => {});
  }, [agentId]);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');

    let user_paid_keys = {};
    if (tierPref === 'tier1_only' || tierPref === 'auto') {
      const keys = vault.getKeys();
      if (!keys && tierPref === 'tier1_only') {
        setError('Paid only requires an unlocked vault. Connect keys in /connect.');
        setLoading(false);
        return;
      }
      user_paid_keys = keys || {};
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_REPID_ENGINE_URL}/api/v1/llm/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...tokenHeader() },
        body: JSON.stringify({
          prompt,
          tier_preference: tierPref === 'auto' ? 'tier0_first' : tierPref,
          user_paid_keys
        })
      });
      const data = await res.json();

      const tasteRemaining = res.headers.get('x-taste-remaining');
      if (tasteRemaining !== null && gateInfo) {
        setGateInfo({ ...gateInfo, remaining: Number(tasteRemaining) });
      }

      if (!res.ok) {
        if (data.error === 'verification_required') {
          setShowGate(true);
        } else if (data.error === 'daily_cap') {
          setError(data.message || "You've reached today's run limit — it resets tomorrow.");
        } else if (data.error === 'Max routing attempts reached') {
          // DO NOT name a cause here. The backend sends this when it tried its
          // providers and every one failed -- for ANY reason. It does not say why.
          //
          // This branch used to read "Free tier exhausted. Add a paid key in
          // /connect or wait a minute." On 2026-08-21 a user hit it on their FIRST
          // run of the day and all three claims were false: seven days of call logs
          // held no quota error at all, the real cause was two providers configured
          // with model ids their vendors had retired, and no amount of waiting was
          // ever going to clear that.
          //
          // Inventing a specific, confident cause is worse than admitting we do not
          // have one -- it sends the user to fix something that is not broken, and
          // it is precisely the failure mode this product exists to argue against.
          //
          // The /connect suggestion SURVIVES, because it is independently true:
          // bringing your own key routes to the paid tier and goes around whatever
          // failed here. It is offered as a workaround now, not as a diagnosis.
          setError(
            data.message ||
              'Couldn’t reach a working model. Every provider we tried failed — that’s on our side, not a limit on your account. Adding your own key on /connect routes around it, or try again shortly.',
          );
        } else {
          setError(data.error || 'Request failed');
        }
        setLoading(false);
        return;
      }

      // HAL scoring — the Track-A decision-event contract (agents-external.ts
      // requires llm_provider/certainty/decision_text/outcome/task_domain and
      // Bearer auth with the agent's own key; supplying `prompt` engages the
      // cross-LLM agreement path). The old {prompt, response} body 400'd and
      // the catch swallowed it, rendering a fake "Δ 0.00" on every run.
      let repidDelta = 0;
      let halDecision: string | null = null;
      let purposeSuppressed = false;
      let earnNote: string | null = null;
      let scoreError: string | null = null;
      if (!agent?.apiKey) {
        scoreError =
          'This agent has no stored API key (created before scoring auth landed) — recreate it on /agents to enable RepID scoring.';
      } else {
        try {
          const scoreRes = await fetch(`${process.env.NEXT_PUBLIC_REPID_ENGINE_URL}/api/v1/agents/${agentId}/score-event`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${agent.apiKey}`,
            },
            body: JSON.stringify({
              llm_provider: data.provider ?? 'unknown',
              llm_model: data.model ?? null,
              certainty: 0.85,
              decision_text: data.answer,
              outcome: 'success',
              task_domain: 'general',
              prompt,
            })
          });
          const scoreData = await scoreRes.json();
          if (scoreRes.ok) {
            if (typeof scoreData.delta === 'number') repidDelta = scoreData.delta;
            halDecision = scoreData.hal_decision ?? null;
            // Honest earning: a conversational answer is not a verified deliverable, so it
            // earns nothing. `purpose_suppressed` = the gate zeroed it (enforced); when the
            // gate is still in shadow, `earn_gate.would_suppress` says it WOULD, without lying
            // about the delta that actually applied this run.
            purposeSuppressed = scoreData.purpose_suppressed === true;
            earnNote = purposeSuppressed
              ? '0 earned — conversational, not a deliverable'
              : scoreData.earn_gate?.would_suppress === true
                ? "conversational — won't earn once honest-scoring is enabled"
                : null;
            setRepid(prev => prev + repidDelta);
            flashDelta(repidDelta);
          } else if (scoreRes.status === 403 && scoreData.error === 'Constitutional block') {
            // HAL vetoed the response — that's the product working, show it.
            halDecision = 'vetoed';
          } else {
            scoreError = scoreData.error || `scoring failed (${scoreRes.status})`;
          }
        } catch (e) {
          scoreError = 'scoring unreachable — this run was NOT scored';
          console.error('Score event failed', e);
        }
      }

      const row: HistoryRow = {
        id: crypto.randomUUID(),
        agentId,
        prompt,
        answer: data.answer,
        provider: data.provider,
        tier: data.tier,
        tokensIn: data.tokens_in,
        tokensOut: data.tokens_out,
        latencyMs: data.latency_ms,
        cost: data.cost_estimate_usd,
        timestamp: Date.now(),
        repidDelta,
        halDecision,
        purposeSuppressed,
        earnNote,
        scoreError
      };

      await localDb.saveHistory(row);
      if (agent) {
        await localDb.updateAgent(agentId, { totalPrompts: agent.totalPrompts + 1, lastUsedAt: Date.now() });
      }
      setHistory(prev => [row, ...prev]);
      setPrompt('');
    } catch (e) {
      setError('Backend unavailable. Try again in a moment.');
    }
    setLoading(false);
  };

  if (!agentsLoaded) {
    return (
      <div className="text-center mt-20 text-[#94a3b8]">Loading agent…</div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-3">
        <p className="text-[#94a3b8]">
          No agent with this ID in this browser — it may have been created on another device.
        </p>
        <Link href="/run" className="text-amber-500 hover:underline">
          ← Back to your agents
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {showGate && (
        <GateModal
          onVerified={() => {
            setShowGate(false);
            setError('');
            refreshGate();
          }}
          onClose={() => setShowGate(false)}
        />
      )}

      {/* Run-allowance strip: honest, benefit-framed, never a surprise wall. */}
      {gateInfo && !gateInfo.verified && (
        <p className="text-xs text-[#64748b]">
          {gateInfo.remaining > 0
            ? `${gateInfo.remaining} of ${gateInfo.limit} free anonymous runs left today — add an email any time to save your agent and raise the limit.`
            : `Today's free anonymous runs are used. Save your progress with an email to keep going free.`}{' '}
          <button type="button" onClick={() => setShowGate(true)} className="underline decoration-dotted hover:text-[#94a3b8]">
            Save my progress
          </button>
        </p>
      )}
      {gateInfo && gateInfo.verified && (
        <p className="text-xs text-[#64748b]">
          Progress saved{getGateEmail() ? ` for ${getGateEmail()}` : ''} · {gateInfo.remaining} runs left today.
        </p>
      )}
      {agent && !agent.apiKey && (
        <p className="text-xs text-amber-400/90">
          ⚠ This agent predates scoring auth and has no stored API key — runs will answer but can&apos;t
          earn RepID. Recreate it on <Link href="/agents" className="underline">/agents</Link> (takes 30s)
          to enable scoring.
        </p>
      )}

      <div className="flex justify-between items-center bg-[#0f172a] p-6 rounded-xl border border-[#1e293b]">
        <div>
          <h2 className="text-3xl font-bold text-white">{agent.name}</h2>
          <p className="text-[#94a3b8] font-mono mt-1 text-sm">{agentId}</p>
        </div>
        <div className="text-right relative">
          <div className="text-sm text-[#94a3b8] font-bold uppercase tracking-wider">RepID Score</div>
          <div
            className={`text-4xl font-bold text-amber-500 transition-transform duration-300 ${
              scorePulse ? 'scale-110' : 'scale-100'
            }`}
          >
            {(repid || 0).toFixed(2)}
          </div>

          {/* Real-time RepID delta toast — rises + fades on each scoring event. */}
          {deltaToast && (
            <div
              key={deltaToast.id}
              className={`repid-delta-toast absolute -top-5 right-0 text-lg font-bold ${
                deltaToast.delta >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {deltaToast.delta > 0 ? '+' : ''}
              {deltaToast.delta.toFixed(2)} RepID
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleRun} className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-4">
        {error && (
          <div className="p-4 bg-red-900/20 border border-red-900 rounded space-y-1">
            <p className="text-sm font-semibold text-red-400">Couldn&apos;t run this prompt</p>
            <p className="text-sm text-red-400/90">{error}</p>
          </div>
        )}
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Enter prompt here..."
          className="w-full bg-[#0a0f1a] border border-[#334155] rounded-xl p-4 h-32 font-mono text-white resize-none"
        />
        <div className="flex justify-between items-center">
          <select 
            value={tierPref} 
            onChange={e => setTierPref(e.target.value)}
            className="bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white"
          >
            <option value="auto">Auto (Free first, fallback to paid)</option>
            <option value="tier0_only">Free only (No vault needed)</option>
            <option value="tier1_only">Paid only (Requires unlocked vault)</option>
          </select>
          <button type="submit" disabled={loading} className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded">
            {loading ? 'Running…' : 'Run prompt'}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <h3 className="text-xl font-bold text-white">Recent decisions</h3>
        {history.length === 0 ? (
          <div className="p-8 text-center text-[#94a3b8] border border-dashed border-[#334155] rounded-xl">
            No runs yet — run a prompt above to see HAL score it.
          </div>
        ) : (
          history.slice(0, 20).map(h => (
            <div key={h.id} className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-4">
              <div className="flex justify-between text-sm text-[#94a3b8] font-mono">
                <span>{new Date(h.timestamp).toLocaleString()}</span>
                <span className="flex gap-4">
                  <span>Provider: {h.provider} (Tier {h.tier})</span>
                  <span>{h.latencyMs}ms</span>
                  <span>Tokens: {h.tokensIn} in / {h.tokensOut} out</span>
                  {h.halDecision && (
                    <span>
                      HAL:{' '}
                      <span className={h.halDecision === 'vetoed' ? 'text-red-500' : h.halDecision === 'flagged' ? 'text-amber-400' : 'text-green-500'}>
                        {h.halDecision.toUpperCase()}
                      </span>
                    </span>
                  )}
                  {!h.scoreError && (
                    h.purposeSuppressed ? (
                      <span className="text-gray-400" title="RepID is earned on verified deliverables, not conversation.">{h.earnNote}</span>
                    ) : (
                      <span>RepID Δ: <span className={h.repidDelta >= 0 ? "text-green-500" : "text-red-500"}>{h.repidDelta > 0 ? '+' : ''}{h.repidDelta.toFixed(2)}</span>
                        {h.earnNote && <span className="text-gray-500"> · {h.earnNote}</span>}
                      </span>
                    )
                  )}
                </span>
              </div>
              {h.scoreError && (
                <p className="text-xs text-amber-400/90">⚠ Not scored: {h.scoreError}</p>
              )}
              <div className="font-mono text-sm bg-[#0a0f1a] p-4 rounded text-gray-300">
                {h.prompt}
              </div>
              <div className="prose prose-invert max-w-none text-white whitespace-pre-wrap">
                {h.answer}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
