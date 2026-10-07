'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Agent } from '@/lib/db';
import { BELTS, BELT_ROLES, type BeltRole } from '@/lib/belts';
import { BELT_GRANT_DAYS, beltToolsOf, buildBeltGrant } from '@/lib/belt-grant';
import { listGrantsFor, mintGrant, revokeGrant, type ListedGrant } from '@/lib/repid-engine';

/**
 * GIVE AN AGENT A ROLE. The person chooses everything: which of their agents is the PAI that
 * gives the role, which agent gets it, the role, and each tool on its belt. Nothing is assigned
 * for them. The PAI's own API key signs the request, so the engine records the PAI as grantor
 * and refuses it as anyone else.
 *
 * What the result IS: a grant anyone can check, which the PAI can revoke at any time.
 * What it is NOT yet: a gate your AI app consults before each tool. That is said on the page,
 * because a control that reads as enforced and is not is worse than no control.
 */
export function GiveRole({ agents }: { agents: Agent[] }) {
  const keyed = useMemo(() => [...agents].filter((a) => a.apiKey).sort((a, b) => a.createdAt - b.createdAt), [agents]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [role, setRole] = useState<BeltRole>('cto');
  const [tools, setTools] = useState<string[]>(() => BELTS.cto.starter.map((t) => t.id));
  const [days, setDays] = useState<number>(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [given, setGiven] = useState<ListedGrant[] | 'error' | null>(null);

  const from = keyed.find((a) => a.id === fromId) ?? keyed[0];
  const others = agents.filter((a) => a.id !== from?.id);
  const to = others.find((a) => a.id === toId) ?? others[0];
  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? id;

  const refresh = async (pai: Agent | undefined) => {
    if (!pai) return setGiven(null);
    const rows = await listGrantsFor(pai.id);
    setGiven(rows === 'error' ? 'error' : rows.filter((g) => g.grantor_agent_id === pai.id && g.live));
  };

  useEffect(() => {
    void refresh(from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.id]);

  const pickRole = (r: BeltRole) => {
    setRole(r);
    setTools(BELTS[r].starter.map((t) => t.id));
  };

  const toggle = (id: string) => setTools((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const give = async () => {
    setError('');
    if (!from?.apiKey || !to) return;
    const built = buildBeltGrant({ grantorId: from.id, granteeId: to.id, role, toolIds: tools, days, idempotencyKey: crypto.randomUUID() });
    if (!built.ok) return setError(built.reason);
    setBusy(true);
    try {
      const res = await mintGrant({ ...built.request, apiKey: from.apiKey });
      if (!res.ok) setError(`Not given. The engine said: ${res.error}`);
      else await refresh(from);
    } catch {
      setError('Could not reach the backend. Nothing was given.');
    }
    setBusy(false);
  };

  const revoke = async (g: ListedGrant) => {
    if (!from?.apiKey) return;
    if (!window.confirm(`Take the ${(g.role ?? '').toUpperCase()} role away from ${nameOf(g.grantee_agent_id)}? This cannot be undone.`)) return;
    setError('');
    const res = await revokeGrant(g.id, from.id, from.apiKey).catch(() => ({ ok: false as const, error: 'could not reach the backend' }));
    if (!res.ok) setError(`Not revoked. The engine said: ${res.error}`);
    await refresh(from);
  };

  if (agents.length < 2) {
    return (
      <p className="text-sm text-[#94a3b8]">
        To give an agent a role, create a second agent. One of yours gives the role (your PAI), another gets it.
      </p>
    );
  }
  if (!from) {
    return (
      <p className="text-sm text-[#94a3b8]">
        None of your agents in this browser has its key stored, so none can give a role. Create a new agent to use as your PAI.
      </p>
    );
  }

  const belt = BELTS[role];
  return (
    <section aria-labelledby="give-role-h" className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-4">
      <div>
        <h3 id="give-role-h" className="text-xl font-bold">Give an agent a role</h3>
        <p className="text-xs text-[#94a3b8] mt-1">You choose the role and every tool. Read-only tools only. No spending.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-white font-medium">Who gives it (your PAI)</span>
          <select value={from.id} onChange={(e) => setFromId(e.target.value)} className="mt-1 w-full bg-[#0a0f1a] border border-[#334155] rounded p-2 text-white">
            {keyed.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-white font-medium">Who gets it</span>
          <select value={to?.id ?? ''} onChange={(e) => setToId(e.target.value)} className="mt-1 w-full bg-[#0a0f1a] border border-[#334155] rounded p-2 text-white">
            {others.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="text-sm text-white font-medium">Role</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {BELT_ROLES.map((r) => (
            <button key={r} type="button" aria-pressed={role === r} onClick={() => pickRole(r)}
              className={`px-3 py-1.5 rounded border text-sm ${role === r ? 'border-amber-500 text-amber-400' : 'border-[#334155] text-[#94a3b8] hover:text-white'}`}>
              {BELTS[r].title}
            </button>
          ))}
        </div>
        <p className="text-xs text-[#94a3b8] mt-1">{belt.purpose}</p>
      </fieldset>

      <fieldset>
        <legend className="text-sm text-white font-medium">Tools on its belt</legend>
        <ul className="mt-1 space-y-2">
          {belt.starter.map((t) => (
            <li key={t.id}>
              <label className="flex gap-2 items-start text-sm">
                <input type="checkbox" checked={tools.includes(t.id)} onChange={() => toggle(t.id)} className="mt-1" />
                <span>
                  <span className="text-white">{t.name}</span> <span className="text-[#64748b]">· {t.use}</span>
                  <span className="block text-xs text-[#64748b]">Keep it read-only: {t.readOnly}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <label className="block text-sm">
        <span className="text-white font-medium">For how long</span>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 bg-[#0a0f1a] border border-[#334155] rounded p-2 text-white">
          {BELT_GRANT_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}
        </select>
      </label>

      <button type="button" onClick={give} disabled={busy || !to} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold p-3 rounded disabled:opacity-60">
        {busy ? 'Giving…' : `Give ${to?.name ?? 'it'} the ${belt.title} role`}
      </button>
      {error && <p role="alert" className="text-sm text-[#ff6b6b]">{error}</p>}

      <p className="text-xs text-[#94a3b8] leading-relaxed">
        This records which tools the agent may use, and anyone can check it. Your AI app does not ask it before each tool yet, so set each tool up read-only as shown.
      </p>

      <div>
        <h4 className="text-sm font-bold text-white">Roles {from.name} has given</h4>
        {given === null ? null : given === 'error' ? (
          <p className="text-xs text-[#94a3b8] mt-1">Not checked: could not reach the backend.</p>
        ) : given.length === 0 ? (
          <p className="text-xs text-[#94a3b8] mt-1">None yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {given.map((g) => (
              <li key={g.id} className="flex justify-between gap-3 text-sm border-t border-[#1e293b] pt-2">
                <span className="min-w-0">
                  <span className="text-white">{nameOf(g.grantee_agent_id)}</span>{' '}
                  <span className="text-amber-400">{(g.role ?? '').toUpperCase()}</span>
                  <span className="block text-xs text-[#64748b] truncate">{beltToolsOf(g.capabilities).join(', ')} · until {new Date(g.expires_at).toLocaleDateString()}</span>
                </span>
                <button type="button" onClick={() => revoke(g)} className="shrink-0 text-xs text-red-400 hover:text-red-300 underline">Revoke</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
