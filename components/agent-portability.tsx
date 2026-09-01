'use client';

import { useEffect, useRef, useState } from 'react';
import { localDb, type Agent } from '@/lib/db';
import {
  buildExport,
  parseImport,
  mergeAgents,
  mergeHistory,
  describeMerge,
  exportFilename,
  PARSE_ERRORS,
} from '@/lib/portable';
import { recoverAgent, RECOVER_ERRORS, type RecoveredAgent } from '@/lib/agent-recovery';

/**
 * THE BACKUP THE PRODUCT HAD BEEN CALLING ITSELF WITHOUT HAVING.
 *
 * Settings has described TrustShell as "the portable agentic trust harness" while agents lived in
 * one browser's IndexedDB with no way out of it. This is the way out, and the copy's whole job is
 * to be specific about what each path can and cannot return — a backup people trust and a backup
 * that works have to be the same backup.
 *
 * RECOVERY IS PRESENTED AS THE LESSER PATH, BELOW A DIVIDER, and the wording says why rather than
 * merely ranking them. Somebody who reads "recover by ID" first will conclude the file does not
 * matter, take no backup, and find out about the unreissuable API key at the moment they need it.
 *
 * NOTHING IS WRITTEN WITHOUT A PREVIEW. An id is 36 characters of nothing-in-particular; mistyping
 * one into a DIFFERENT valid agent is entirely possible, and it is the one error the engine cannot
 * catch. So the card is fetched, shown, and only added on a second, deliberate click.
 */

type Recovering =
  | { phase: 'idle' }
  | { phase: 'looking' }
  | { phase: 'found'; found: RecoveredAgent; alreadyHere: boolean }
  | { phase: 'error'; message: string };

export function AgentPortability() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const [idInput, setIdInput] = useState('');
  const [recovering, setRecovering] = useState<Recovering>({ phase: 'idle' });
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    localDb.getAgents().then((a) => live && setAgents(a));
    return () => {
      live = false;
    };
  }, []);

  function clear() {
    setNote('');
    setProblem('');
  }

  async function refresh() {
    setAgents(await localDb.getAgents());
  }

  async function handleExport() {
    clear();
    const [a, h] = await Promise.all([localDb.getAgents(), localDb.getHistory()]);
    const blob = new Blob([JSON.stringify(buildExport(a, h), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename();
    link.click();
    URL.revokeObjectURL(url);
    setNote(
      `Downloaded ${a.length} agent${a.length === 1 ? '' : 's'} and ${h.length} run${
        h.length === 1 ? '' : 's'
      }. Keep it somewhere private — it contains your API keys.`,
    );
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires a change event — otherwise a
    // retry after a failed import silently does nothing.
    e.target.value = '';
    if (!file) return;
    clear();

    const parsed = parseImport(await file.text());
    if (!parsed.ok) {
      setProblem(PARSE_ERRORS[parsed.reason]);
      return;
    }

    const [localAgents, localHistory] = await Promise.all([
      localDb.getAgents(),
      localDb.getHistory(),
    ]);
    const merged = mergeAgents(localAgents, parsed.file.agents);
    const history = mergeHistory(localHistory, parsed.file.history);

    await localDb.putAgents(merged.agents);
    if (history.added > 0) await localDb.putHistory(history.history);

    await refresh();
    setNote(describeMerge(merged, history.added));
  }

  async function handleLookup() {
    clear();
    setRecovering({ phase: 'looking' });
    const result = await recoverAgent(idInput);
    if (!result.ok) {
      setRecovering({ phase: 'error', message: RECOVER_ERRORS[result.reason] });
      return;
    }
    const here = await localDb.getAgents();
    setRecovering({
      phase: 'found',
      found: result.recovered,
      alreadyHere: here.some((a) => a.id === result.recovered.agent.id),
    });
  }

  async function handleAddRecovered(found: RecoveredAgent) {
    clear();
    const local = await localDb.getAgents();
    // Through the same merge as an import, so a recovered card can never overwrite a stored key.
    const merged = mergeAgents(local, [found.agent]);
    await localDb.putAgents(merged.agents);
    await refresh();
    setRecovering({ phase: 'idle' });
    setIdInput('');
    setNote(
      `${found.agent.name} is back in this browser. It can answer prompts, but it can't earn ` +
        `RepID until you recreate it — the API key was shown once at registration and can't be reissued.`,
    );
  }

  const count = agents?.length ?? 0;

  return (
    <div className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b] space-y-6">
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-white">Your agents</h3>
        <p className="text-[#94a3b8] text-sm leading-relaxed">
          {agents === null
            ? 'Reading this browser…'
            : count === 0
              ? 'No agents in this browser yet. Create one on Agents, then back it up here.'
              : `${count} agent${count === 1 ? '' : 's'} live in this browser's storage and nowhere else. ` +
                `Clearing site data, or opening TrustShell on another device, loses ${
                  count === 1 ? 'it' : 'them'
                } from this list.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <button
          onClick={handleExport}
          disabled={count === 0}
          className="px-6 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded disabled:opacity-50 disabled:hover:bg-[#1e293b]"
        >
          Back up agents
        </button>

        <button
          onClick={() => fileInput.current?.click()}
          className="px-6 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded"
        >
          Restore from a backup
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      <p className="text-xs text-[#94a3b8] leading-relaxed">
        The backup is a plain JSON file holding your agents, their run history, and{' '}
        <span className="text-white">their API keys in readable text</span> — anyone with the file
        can post score events as these agents, so store it like a password. Restoring{' '}
        <span className="text-white">merges</span>: nothing already in this browser is removed, and
        a key stored here is never replaced by a missing one.
      </p>

      <div className="pt-6 border-t border-[#1e293b] space-y-4">
        <div>
          <h4 className="text-white font-bold">Lost the backup too?</h4>
          <p className="text-xs text-[#94a3b8] mt-1 leading-relaxed max-w-2xl">
            An agent&apos;s public profile can be looked up by its ID, which rebuilds its name,
            description and run count here. Two things cannot come back this way: the{' '}
            <span className="text-white">API key</span>, which the engine issues once and cannot
            reissue, so the agent will answer but not earn until you recreate it; and the{' '}
            <span className="text-white">constitution</span>, which is never public and has to be
            retyped. The ID is the UUID under an agent&apos;s name on its run page.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={idInput}
            onChange={(e) => {
              setIdInput(e.target.value);
              if (recovering.phase !== 'idle') setRecovering({ phase: 'idle' });
            }}
            placeholder="00000000-0000-0000-0000-000000000000"
            spellCheck={false}
            // A UUID is 36 monospace characters and the whole point is comparing it against the
            // one on the run page, so all 36 have to be visible at once. It takes the full width
            // on a phone, shares the row only once there is space for the button too, and drops
            // to 11px with tighter padding at 320px, which is where it otherwise scrolls.
            className="w-full sm:w-auto sm:flex-1 sm:min-w-[20rem] bg-[#0a0f1a] border border-[#334155] rounded px-2 py-3 sm:px-3 text-white font-mono text-[11px] sm:text-sm placeholder:text-[#64748b]"
          />
          <button
            onClick={handleLookup}
            disabled={!idInput.trim() || recovering.phase === 'looking'}
            className="px-6 py-2 bg-[#1e293b] hover:bg-[#334155] text-white font-bold rounded disabled:opacity-50 disabled:hover:bg-[#1e293b]"
          >
            {recovering.phase === 'looking' ? 'Looking up…' : 'Look it up'}
          </button>
        </div>

        {recovering.phase === 'error' && (
          <p className="text-sm text-amber-400/90 leading-relaxed">{recovering.message}</p>
        )}

        {recovering.phase === 'found' && (
          <div className="bg-[#0a0f1a] border border-[#334155] rounded p-4 space-y-3">
            <div>
              <div className="text-white font-bold">{recovering.found.agent.name}</div>
              <div className="text-sm text-[#94a3b8]">
                {recovering.found.agent.description || 'No description'}
              </div>
              <div className="text-xs text-[#94a3b8] mt-2">
                {recovering.found.agent.totalPrompts} scored decision
                {recovering.found.agent.totalPrompts === 1 ? '' : 's'}
                {recovering.found.repid !== null && ` · RepID ${recovering.found.repid.toFixed(2)}`}
              </div>
            </div>
            <p className="text-xs text-[#94a3b8] leading-relaxed">
              {recovering.alreadyHere
                ? 'This agent is already in this browser. Adding it again updates its public details and leaves its stored API key alone.'
                : 'Check this is the agent you meant before adding it — an ID one character off can be a different real agent. It arrives without its API key, so scoring stays off until you recreate it.'}
            </p>
            <button
              onClick={() => handleAddRecovered(recovering.found)}
              className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded"
            >
              {recovering.alreadyHere ? 'Update it here' : 'Add to this browser'}
            </button>
          </div>
        )}
      </div>

      {note && (
        <p className="text-sm text-[#94a3b8] leading-relaxed border-t border-[#1e293b] pt-4">
          {note}
        </p>
      )}
      {problem && (
        <p className="text-sm text-amber-400/90 leading-relaxed border-t border-[#1e293b] pt-4">
          {problem}
        </p>
      )}
    </div>
  );
}
