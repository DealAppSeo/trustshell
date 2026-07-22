'use client';
import { useState, useEffect } from 'react';
import { localDb, Agent } from '@/lib/db';
import { useRouter } from 'next/navigation';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [consti, setConsti] = useState('');
  const [loading, setLoading] = useState(false);
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
          lastUsedAt: Date.now()
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
    <div className="max-w-5xl mx-auto space-y-12">
      <div className="space-y-4">
        <h2 className="text-3xl font-bold">Your Agents</h2>
        <p className="text-[#94a3b8] max-w-2xl leading-relaxed">
          An <span className="text-white font-medium">agent</span> is a named identity you wrap with TrustShell.
          Every response it produces is <span className="text-white font-medium">HAL-scored</span> for hallucination,
          and its honest behavior earns portable, on-chain <span className="text-white font-medium">RepID</span>.
          Create one below to see it work end-to-end.
        </p>

        {/* Expectation-setting: the 4-step journey, so a first-timer knows where this leads */}
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {[
            { n: 1, t: 'Create an agent', d: 'Name it + optional rules. You are here.', here: true },
            { n: 2, t: 'Connect a model', d: 'Bring your own key on the Connect page.' },
            { n: 3, t: 'Run prompts', d: 'HAL scores every response in real time.' },
            { n: 4, t: 'Earn RepID', d: 'Honest agents climb the Leaderboard.' },
          ].map((s) => (
            <li
              key={s.n}
              className={`p-4 rounded-xl border ${s.here ? 'border-amber-600/50 bg-amber-600/10' : 'border-[#1e293b] bg-[#0f172a]'}`}
            >
              <div className={`text-xs font-mono ${s.here ? 'text-amber-400' : 'text-[#475569]'}`}>STEP {s.n}</div>
              <div className="font-semibold text-white mt-1">{s.t}</div>
              <div className="text-xs text-[#94a3b8] mt-1 leading-snug">{s.d}</div>
            </li>
          ))}
        </ol>

        <p className="text-xs text-[#64748b] pt-1">
          Free · no email, no wallet · agents are stored locally in <span className="text-[#94a3b8]">this browser</span> until you choose to publish on-chain.
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
              <div key={a.id} className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-lg text-white">{a.name}</h4>
                  <p className="text-sm text-[#94a3b8]">{a.description || 'No description'}</p>
                  <p className="text-xs text-[#475569] mt-2">Prompts: {a.totalPrompts}</p>
                </div>
                <button onClick={() => router.push(`/run/${a.id}`)} className="px-6 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded">
                  Use
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
