'use client';
import { useState, useEffect } from 'react';
import { localDb, Agent } from '@/lib/db';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AgentRepId } from '@/components/agent-repid';
import { AgentsStanding } from '@/components/agents-standing';
import { parseRegister } from '@/lib/create-pai-parse';
import { OWNED_GLASS } from '@/components/after-agent';
import { GiveRole } from '@/components/give-role';
import { StrangerRail } from '@/components/stranger-rail';
import { JourneySteps } from '@/components/journey-steps';

/**
 * Read at MODULE SCOPE as a literal `process.env.NAME`, which is the only form
 * `next build` inlines. `process.env[name]` is not inlined and is `undefined` in the
 * browser — so a computed read here would make the guard below fire on every deploy.
 */
const ENGINE = process.env.NEXT_PUBLIC_REPID_ENGINE_URL;

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [consti, setConsti] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    localDb.getAgents().then(setAgents);
  }, []);

  /**
   * A FAILED CREATE MUST SAY SO. This handler used to swallow every failure:
   * an unset engine URL, a 429 on a taken name, a 500, an unparseable body —
   * all of them landed in `console.error` or in a falsy `data.agent_id`, the
   * spinner stopped, and the page looked exactly as it does when nothing was
   * clicked. The one surface the top nav and the hero button once both pointed at was
   * the one that could fail invisibly.
   *
   * Two things make it honest now, and neither is new code in this repo:
   *
   *   * The `!ENGINE` guard `/create` has had all along. Unset, the old template
   *     literal POSTed to the string `"undefined/api/v1/agents/register"`, which
   *     resolves against this origin, 404s as HTML, and throws in `res.json()`.
   *   * `parseRegister`, the shared, tested reader `/create` uses. Rolling our own
   *     `if (data.agent_id)` here is what lost the 429 "name is taken" message and
   *     the camelCase `agentId` shape: two surfaces, one endpoint, two opinions
   *     about what its response means.
   */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ENGINE) {
      setError('Backend URL is not configured for this deploy (NEXT_PUBLIC_REPID_ENGINE_URL). Nothing was created.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${ENGINE}/api/v1/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc, constitution_text: consti })
      });
      const data = await res.json().catch(() => ({}));
      const parsed = parseRegister(res.status, data);
      if (!parsed.ok) throw new Error(parsed.message);
      const newAgent = {
        id: parsed.agentId,
        name,
        description: desc,
        constitution: consti,
        createdAt: Date.now(),
        totalPrompts: 0,
        lastUsedAt: Date.now(),
        // Shown ONCE by the backend — dropping it (the pre-2026-07-30
        // behavior) left every browser agent unable to authenticate its
        // score events, so HAL scoring silently failed as "Δ 0.00".
        apiKey: parsed.apiKey ?? undefined
      };
      await localDb.saveAgent(newAgent);
      setAgents(await localDb.getAgents());
      setName(''); setDesc(''); setConsti('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the backend. Nothing was created.');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 px-4">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold">Your Agents</h2>
        <p className="text-[#94a3b8] max-w-2xl leading-relaxed">
          An <span className="text-white font-medium">agent</span> is a named identity you wrap with TrustShell.
          Every response is <span className="text-white font-medium">HAL-scored</span> for hallucination detection, and its
          honest behavior earns portable, on-chain <span className="text-white font-medium">RepID</span>. Create one below.
        </p>
      </div>

      {/* Screen 1 of the four: the tutorial sits ON the create form, not in a tour. */}
      <StrangerRail step="name" />

      {/* `min-w-0` on both columns: a grid item defaults to min-width:auto, so the agent card's
          one-line ID (`truncate` is nowrap) set the column's minimum and the whole page scrolled
          sideways on a phone once one agent existed (MEASURED 2026-10-07: 401px in a 390 viewport). */}
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6 min-w-0">
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
                <p className="text-xs text-[#64748b] mt-1">Plain-English rules for your agent. They are sent with every question you ask it on its page, where you can edit them and teach it corrections.</p>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold p-3 rounded disabled:opacity-60">
                {loading ? 'Registering…' : 'Create Agent'}
              </button>
              {/* role="alert" so the failure reaches a screen reader too — the whole
                  defect was a state change nobody was told about. */}
              {error && <p role="alert" className="text-sm text-[#ff6b6b]">{error}</p>}
              <p className="text-xs text-[#94a3b8] text-center">Registers a cryptographic identity, then take it to <span className="text-white">Connect</span> to run it with your own model key.</p>
            </form>
          </div>

          {/* This page names the leaderboard twice in its own copy — "how it appears on
              the leaderboard", "honest agents climb the Leaderboard" — and until now
              offered no link to it and no standings. So the one page that introduces
              RepID was the one that gave the number no reference frame: a new agent
              reads 200 and nothing on screen said whether that is good. */}
          <AgentsStanding agents={agents} />
        </div>

        <div className="space-y-4 min-w-0">
          {agents.length === 0 ? (
            <div className="p-8 text-center text-[#94a3b8] border border-dashed border-[#334155] rounded-xl">
              Create your first agent. Takes 30 seconds. No email needed.
            </div>
          ) : (
            <>
            <p className="text-sm text-[#94a3b8] leading-relaxed">{OWNED_GLASS}</p>
            {agents.map(a => (
              <div key={a.id} className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <h4 className="font-bold text-lg text-white truncate">{a.name}</h4>
                  <p className="text-sm text-[#94a3b8] truncate">{a.description || 'No description'}</p>
                  {/* The local counter is runs IN THIS BROWSER — it is not the score, and
                      labelling it plainly keeps it from being read as one. The engine's figure
                      sits below it with the reason it can be believed. */}
                  <p className="text-xs text-[#94a3b8] mt-2">Runs in this browser: {a.totalPrompts}</p>
                  <AgentRepId agent={a} />
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
                {/* Claiming was reachable only by finding the nav item and coming back here
                    to copy the id, even though HUMAN_AGENT_BIND_ENABLED is on and the id is
                    printed directly above. Secondary to Use on purpose: running the agent is
                    what this page is for, and claiming asks for a wallet. No id is passed —
                    /bind reads this browser's agents and auto-selects when there is one, and
                    choosing deliberately is the right default for an action that signs an
                    ownership claim. */}
                <div className="shrink-0 flex flex-col items-stretch gap-2">
                  <button onClick={() => router.push(`/run/${a.id}`)} className="px-6 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded">
                    Use
                  </button>
                  <Link
                    href="/bind"
                    className="px-6 py-1.5 text-center text-xs text-[#94a3b8] hover:text-white underline underline-offset-2"
                  >
                    Claim it
                  </Link>
                </div>
              </div>
            ))}
            </>
          )}
        </div>
      </div>

      {/* Roles and tool belts: the person picks which agent is their PAI, which agent gets a role,
          and every tool on its belt. Nothing is assigned for them. */}
      <GiveRole agents={agents} />

      {/* The agent path, the same "where you are" bar as /bind, /faucet, /stake and /spend (2026-10-16).
          It replaced this page's own five-step strip, which told the same story in different words and a
          different count, so a visitor met two maps of one path. What the old strip said is still on this
          page: HAL scoring and RepID in the intro, and Connect under the Create button. */}
      <JourneySteps current="create" />

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
