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
          Send a prompt to one of the test agents you created here. The answer comes from a model the TrustShell
          engine calls (with your own model key if you connected one), not from an agent you run elsewhere, and is then sent to a{' '}
          <span className="text-white font-medium">HAL</span> hallucination check. A conversational answer is not a
          verified deliverable, so do not expect it to raise <span className="text-white font-medium">RepID</span>.
          A new agent&apos;s RepID is held off-chain and it has no on-chain identity. Pick an agent below, or{' '}
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
              <p className="text-xs text-[#475569] mt-1">Runs in this browser: {a.totalPrompts}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
