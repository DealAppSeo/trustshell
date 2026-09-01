'use client';
import { useState, useEffect } from 'react';
import { localDb, Agent } from '@/lib/db';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [consti, setConsti] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    localDb.getAgents().then(setAgents);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_REPID_ENGINE_URL}/api/v1/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc, constitution_text: consti })
      });
      const data = await res.json();
      if (data.agent_id) {
        const newAgent = {
          id: data.agent_id,
          name,
          description: desc,
          constitution: consti,
          createdAt: Date.now(),
          totalPrompts: 0,
          lastUsedAt: Date.now(),
          // Shown ONCE by the backend — dropping it (the pre-2026-07-30
          // behavior) left every browser agent unable to authenticate its
          // score events, so HAL scoring silently failed as "Δ 0.00".
          apiKey: typeof data.api_key === 'string' ? data.api_key : undefined
        };
        await localDb.saveAgent(newAgent);
        setAgents(await localDb.getAgents());
        setName(''); setDesc(''); setConsti('');
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold">Your Agents</h2>
        <p className="text-[#94a3b8] max-w-2xl leading-relaxed">
          An <span className="text-white font-medium">agent</span> is a named identity you wrap with TrustShell.
          Every response is <span className="text-white font-medium">HAL-scored</span> for hallucination detection, and its
          honest behavior earns portable, on-chain <span className="text-white font-medium">RepID</span>. Create one below.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b]">
            <h3 className="text-xl font-bold mb-1">Create agent</h3>
            <p className="text-xs text-[#94a3b8] mb-4">Takes ~30 seconds. Only a name is required.</p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1">Agent name</label>
                <input type="text" required minLength={3} maxLength={30} placeholder="e.g. Support Copilot" value={name} onChange={e=>setName(e.target.value)} className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white" />
                <p className="text-xs text-[#64748b] mt-1">How it appears on the leaderboard. 3–30 characters.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">Description <span className="text-[#64748b] font-normal">(optional)</span></label>
                <input type="text" maxLength={200} placeholder="What this agent does" value={desc} onChange={e=>setDesc(e.target.value)} className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">Constitution <span className="text-[#64748b] font-normal">(optional)</span></label>
                <textarea maxLength={1000} placeholder="e.g. Never give financial advice. Always cite a source. Refuse harmful requests." value={consti} onChange={e=>setConsti(e.target.value)} className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 h-24 text-white" />
                <p className="text-xs text-[#64748b] mt-1">Plain-English rules your agent must follow. HAL flags violations, and they affect the agent’s RepID. You can edit this later.</p>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold p-3 rounded disabled:opacity-60">
                {loading ? 'Registering…' : 'Create Agent'}
              </button>
              <p className="text-xs text-[#64748b] text-center">Registers a cryptographic identity, then take it to <span className="text-[#94a3b8]">Connect</span> to run it.</p>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          {agents.length === 0 ? (
            <div className="p-8 text-center text-[#94a3b8] border border-dashed border-[#334155] rounded-xl">
              Create your first agent. Takes 30 seconds. No email needed.
            </div>
          ) : (
            agents.map(a => (
              <div key={a.id} className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <h4 className="font-bold text-lg text-white truncate">{a.name}</h4>
                  <p className="text-sm text-[#94a3b8] truncate">{a.description || 'No description'}</p>
                  <p className="text-xs text-[#94a3b8] mt-2">Prompts: {a.totalPrompts}</p>
                  {/* The ID was shown nowhere on this page, which made it the one thing you could
                      not write down before losing the browser that held it. Recovery in Settings
                      takes exactly this string. */}
                  <button
                    onClick={() => { void navigator.clipboard?.writeText(a.id); setCopied(a.id); }}
                    title="Copy this agent's ID"
                    className="mt-1 font-mono text-xs text-[#94a3b8] hover:text-white truncate max-w-full block text-left"
                  >
                    {copied === a.id ? 'ID copied' : a.id}
                  </button>
                </div>
                <button onClick={() => router.push(`/run/${a.id}`)} className="shrink-0 px-6 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded">
                  Use
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* The 4-step journey — CONTEXT below the form, not a control. Horizontal swipe strip
          on phones, a row on desktop. The current step is a left-accent + label, never an
          amber-filled card that could be mistaken for the Create button. */}
      <div className="pt-1">
        <div className="text-xs font-mono text-[#475569] mb-2">HOW IT WORKS</div>
        {/* The `-mx-1 px-1` pair that used to be here made this element 8px wider than its
            container and shifted it 4px left, so its right edge sat 4px past the page and
            sideways-scrolled /agents at every phone width (MEASURED 2026-09-01: ol width 328
            in a 320 viewport). The two cancelled out visually — the padding put the cards
            back where the margin had taken them — so removing both leaves the layout
            identical and costs only 8px of scroll viewport. */}
        <ol className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible">
          {[
            { n: 1, t: 'Create an agent', d: 'Name it + optional rules.', here: true },
            { n: 2, t: 'Connect a model', d: 'Bring your own key on Connect.' },
            { n: 3, t: 'Run prompts', d: 'HAL scores every response.' },
            { n: 4, t: 'Earn RepID', d: 'Honest agents climb the Leaderboard.' },
          ].map((s) => (
            <li
              key={s.n}
              className={`shrink-0 min-w-[10rem] sm:min-w-0 p-3 rounded-lg bg-[#0f172a] border border-[#1e293b] border-l-2 ${s.here ? 'border-l-amber-500' : 'border-l-[#1e293b]'}`}
            >
              <div className={`text-xs font-mono ${s.here ? 'text-amber-400' : 'text-[#475569]'}`}>STEP {s.n}{s.here ? ' · you are here' : ''}</div>
              <div className="font-medium text-white text-sm mt-1">{s.t}</div>
              <div className="text-xs text-[#94a3b8] mt-0.5 leading-snug">{s.d}</div>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-[#94a3b8] leading-relaxed max-w-2xl">
        Free · no wallet · your first runs need no email — add one later to raise the daily limit.
        Agents are stored in <span className="text-white">this browser only</span>, so clearing site
        data or switching devices loses them from this list. Verifying an email does not save them:{' '}
        <Link href="/settings" className="text-amber-500 hover:underline">back them up in Settings</Link>,
        which is also where an agent can be recovered from its ID.
      </p>
    </div>
  );
}
