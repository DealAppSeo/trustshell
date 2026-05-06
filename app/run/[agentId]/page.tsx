'use client';
import { useState, useEffect, use } from 'react';
import { localDb, Agent, HistoryRow } from '@/lib/db';
import { vault } from '@/lib/vault';

export default function RunPage({ params }: { params: Promise<{ agentId: string }> }) {
  const unwrappedParams = use(params);
  const agentId = unwrappedParams.agentId;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [repid, setRepid] = useState<number>(0);
  const [prompt, setPrompt] = useState('');
  const [tierPref, setTierPref] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    localDb.getAgents().then(agents => setAgent(agents.find(a => a.id === agentId) || null));
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          tier_preference: tierPref === 'auto' ? 'tier0_first' : tierPref,
          user_paid_keys
        })
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (data.error === 'Max routing attempts reached') {
          setError('Free tier exhausted. Add a paid key in /connect or wait a minute.');
        } else {
          setError(data.error || 'Request failed');
        }
        setLoading(false);
        return;
      }

      let repidDelta = 0;
      try {
        const scoreRes = await fetch(`${process.env.NEXT_PUBLIC_REPID_ENGINE_URL}/api/v1/agents/${agentId}/score-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, response: data.answer })
        });
        const scoreData = await scoreRes.json();
        if (scoreData.delta) repidDelta = scoreData.delta;
        setRepid(prev => prev + repidDelta);
      } catch (e) {
        console.error('Score event failed', e);
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
        repidDelta
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

  if (!agent) return <div className="text-center mt-20">Agent not found</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex justify-between items-center bg-[#0f172a] p-6 rounded-xl border border-[#1e293b]">
        <div>
          <h2 className="text-3xl font-bold text-white">{agent.name}</h2>
          <p className="text-[#94a3b8] font-mono mt-1 text-sm">{agentId}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-[#94a3b8] font-bold uppercase tracking-wider">RepID Score</div>
          <div className="text-4xl font-bold text-amber-500">{(repid || 0).toFixed(2)}</div>
        </div>
      </div>

      <form onSubmit={handleRun} className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-4">
        {error && <div className="p-4 bg-red-900/20 border border-red-900 text-red-500 rounded">{error}</div>}
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
            {loading ? 'Running...' : 'Run Prompt'}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <h3 className="text-xl font-bold text-white">Recent Decisions</h3>
        {history.length === 0 ? (
          <div className="p-8 text-center text-[#94a3b8] border border-dashed border-[#334155] rounded-xl">
            Run your first prompt to see decisions here.
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
                  <span>RepID Δ: <span className={h.repidDelta >= 0 ? "text-green-500" : "text-red-500"}>{h.repidDelta > 0 ? '+' : ''}{h.repidDelta.toFixed(2)}</span></span>
                </span>
              </div>
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
