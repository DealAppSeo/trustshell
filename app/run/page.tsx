'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { localDb, Agent } from '@/lib/db';

// Landing page for the /run nav link. The scoring surface lives at
// /run/[agentId]; this index lets the user pick which agent to run.
export default function RunIndexPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    localDb.getAgents().then((a) => {
      setAgents(a);
      setLoaded(true);
    });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold text-white">Run an agent</h2>
        <p className="text-[#94a3b8] max-w-2xl leading-relaxed">
          Send a prompt to one of your agents. Every response is{' '}
          <span className="text-white font-medium">HAL-scored</span> for hallucination in real time, and honest
          answers earn portable <span className="text-white font-medium">RepID</span>. Pick an agent below, or{' '}
          <Link href="/agents" className="text-amber-500 hover:underline">
            create one
          </Link>
          .
        </p>
      </div>

      {!loaded ? (
        <div className="p-8 text-center text-[#94a3b8] border border-dashed border-[#334155] rounded-xl">
          Loading your agents…
        </div>
      ) : agents.length === 0 ? (
        <div className="p-8 text-center text-[#94a3b8] border border-dashed border-[#334155] rounded-xl">
          No agents yet.{' '}
          <Link href="/agents" className="text-amber-500 hover:underline">
            Create your first agent
          </Link>{' '}
          — takes 30 seconds.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {agents.map((a) => (
            <Link
              key={a.id}
              href={`/run/${a.id}`}
              className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] hover:border-amber-600/50 transition-colors block"
            >
              <h4 className="font-bold text-lg text-white">{a.name}</h4>
              <p className="text-sm text-[#94a3b8]">{a.description || 'No description'}</p>
              <p className="text-xs text-[#475569] mt-3 font-mono">{a.id}</p>
              <p className="text-xs text-[#475569] mt-1">Prompts: {a.totalPrompts}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
