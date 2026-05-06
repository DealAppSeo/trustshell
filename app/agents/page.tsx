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
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Your Agents</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b]">
            <h3 className="text-xl font-bold mb-4">Create agent</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <input type="text" required minLength={3} maxLength={30} placeholder="Agent Name" value={name} onChange={e=>setName(e.target.value)} className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white" />
              </div>
              <div>
                <input type="text" maxLength={200} placeholder="Description (optional)" value={desc} onChange={e=>setDesc(e.target.value)} className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 text-white" />
              </div>
              <div>
                <textarea maxLength={1000} placeholder="Constitution (optional rules)" value={consti} onChange={e=>setConsti(e.target.value)} className="w-full bg-[#0a0f1a] border border-[#334155] rounded p-3 h-24 text-white" />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold p-3 rounded">
                {loading ? 'Registering...' : 'Create Agent'}
              </button>
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
