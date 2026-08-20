'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { localDb, Agent } from '@/lib/db';
import { tokenHeader, fetchGateStatus } from '@/lib/agent-gate';
import {
  CONSTITUTION_QUESTIONS,
  composeConstitution,
  relevantKernelRead,
  type ConstitutionAnswers,
  type KernelRead,
} from '@/lib/pai';
import { founderMode, FOUNDER_EVENT_LABEL, type FounderEventKind } from '@/lib/founder-mode';
import { FounderPanel } from '@/components/founder-panel';
import { TrustBadge } from '@/components/trust-state';

/**
 * The PAI: one conversation in front of the trust kernel.
 *
 * Everything below the chrome is machinery that already exists and is already live —
 * `POST /api/v1/agents/register` (the same call `/agents` makes), `POST /api/v1/llm/complete`
 * on the free tier-0 pool, and `POST /api/v1/agents/:id/score-event` for HAL scoring and the
 * RepID delta. Nothing here is a mock, and nothing here is a second copy of Passport,
 * Authority, Grants or Activity — it links to them when they are what you actually asked
 * about.
 *
 * Honest about failure: a run that could not be scored says so on the message. It never
 * renders a "Δ 0.00" it did not measure — that exact fake-zero is a bug this codebase has
 * already shipped once (see the note in `/run/[agentId]`).
 */

const PAI_AGENT_KEY = 'trustshell_pai_agent_id';
const ENGINE = process.env.NEXT_PUBLIC_REPID_ENGINE_URL;

type Phase = 'loading' | 'interview' | 'registering' | 'ready';

interface Msg {
  id: string;
  role: 'pai' | 'you';
  text: string;
  /** Set on a PAI answer that went through scoring. */
  repidDelta?: number;
  halDecision?: string | null;
  /** Set when scoring genuinely could not run — shown, never silently swallowed. */
  scoreError?: string | null;
  /** A kernel page worth opening for what was just discussed. */
  kernelRead?: KernelRead | null;
}

let msgSeq = 0;
const mkMsg = (role: Msg['role'], text: string, extra: Partial<Msg> = {}): Msg => ({
  id: `m${++msgSeq}`,
  role,
  text,
  ...extra,
});

export default function PaiPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [answers, setAnswers] = useState<ConstitutionAnswers>({});
  const [qIndex, setQIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [founderOn, setFounderOn] = useState(false);
  const [runsLeft, setRunsLeft] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  // Boot: resume an existing PAI, or open the interview.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const on = await founderMode.isOn();
      if (!cancelled) setFounderOn(on);

      fetchGateStatus()
        .then((s) => {
          if (!cancelled && s?.enabled) setRunsLeft(s.remaining);
        })
        .catch(() => {});

      const savedId =
        typeof window === 'undefined' ? null : localStorage.getItem(PAI_AGENT_KEY);
      const existing = savedId
        ? (await localDb.getAgents()).find((a) => a.id === savedId) ?? null
        : null;

      if (cancelled) return;

      if (existing) {
        setAgent(existing);
        setPhase('ready');
        setMsgs([
          mkMsg(
            'pai',
            `Welcome back. I'm ${existing.name}, working under the constitution you wrote. Ask me something, or ask me what I can back.`,
          ),
        ]);
      } else {
        setPhase('interview');
        setMsgs([
          mkMsg(
            'pai',
            "I'm your agent. Before I do anything on your behalf, you write the rules I work under — three questions, then we're done. You can change any of it later.",
          ),
          mkMsg('pai', CONSTITUTION_QUESTIONS[0].ask),
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFounder = async () => {
    const next = !founderOn;
    await founderMode.set(next);
    setFounderOn(next);
  };

  const fileFounderNote = async (kind: FounderEventKind) => {
    const note = input.trim();
    if (!note) {
      setError('Type the note in the box first, then file it.');
      return;
    }
    const ev = await founderMode.record({
      kind,
      surface: '/pai',
      note,
      agentId: agent?.id,
    });
    setInput('');
    setError('');
    setMsgs((m) => [
      ...m,
      mkMsg(
        'pai',
        ev
          ? `Filed as ${FOUNDER_EVENT_LABEL[kind]} — founder signal, kept out of end-user telemetry. Stored on this device only; there is no durable backend for founder events yet.`
          : 'Founder Mode is off, so nothing was filed.',
      ),
    ]);
  };

  // --- interview -----------------------------------------------------------

  const submitInterview = async (text: string) => {
    const q = CONSTITUTION_QUESTIONS[qIndex];
    const nextAnswers = { ...answers, [q.id]: text };
    setAnswers(nextAnswers);
    setMsgs((m) => [...m, mkMsg('you', text)]);

    const next = qIndex + 1;
    if (next < CONSTITUTION_QUESTIONS.length) {
      setQIndex(next);
      setMsgs((m) => [...m, mkMsg('pai', CONSTITUTION_QUESTIONS[next].ask)]);
      return;
    }

    // Last answer in — register a real agent with the composed constitution.
    setPhase('registering');
    setMsgs((m) => [
      ...m,
      mkMsg('pai', "That's my constitution. Registering me against the live backend now…"),
    ]);

    try {
      const res = await fetch(`${ENGINE}/api/v1/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'My PAI',
          description: 'Personal agent created through the PAI conversation.',
          constitution_text: composeConstitution(nextAnswers),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.agent_id) {
        throw new Error(data.error || `register failed (${res.status})`);
      }

      const created: Agent = {
        id: data.agent_id,
        name: 'My PAI',
        description: 'Personal agent created through the PAI conversation.',
        constitution: composeConstitution(nextAnswers),
        createdAt: Date.now(),
        totalPrompts: 0,
        lastUsedAt: Date.now(),
        // Returned once by the backend; without it score events can't authenticate.
        apiKey: typeof data.api_key === 'string' ? data.api_key : undefined,
      };
      await localDb.saveAgent(created);
      localStorage.setItem(PAI_AGENT_KEY, created.id);
      setAgent(created);
      setPhase('ready');
      setMsgs((m) => [
        ...m,
        mkMsg(
          'pai',
          `Done — I have a real identity now, and a Passport you can read. I hold no keys of yours: I run on the free shared pool, and anything beyond that needs a grant you issue explicitly. Ask me anything.`,
          { kernelRead: relevantKernelRead('passport') },
        ),
      ]);
    } catch (e) {
      setPhase('interview');
      setError(
        e instanceof Error
          ? `Couldn't register: ${e.message}`
          : "Couldn't reach the backend to register.",
      );
    }
  };

  // --- chat ----------------------------------------------------------------

  const sendChat = async (text: string) => {
    setMsgs((m) => [...m, mkMsg('you', text)]);
    setBusy(true);
    setError('');

    try {
      // Tier-0 only, and NO `user_paid_keys` — the PAI never receives your provider keys.
      const res = await fetch(`${ENGINE}/api/v1/llm/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...tokenHeader() },
        body: JSON.stringify({ prompt: text, tier_preference: 'tier0_first' }),
      });
      const data = await res.json();

      const remaining = res.headers.get('x-taste-remaining');
      if (remaining !== null) setRunsLeft(Number(remaining));

      if (!res.ok) {
        setError(
          data.error === 'daily_cap'
            ? data.message || "That's today's free runs used — it resets tomorrow."
            : data.error || `Request failed (${res.status})`,
        );
        setBusy(false);
        return;
      }

      // Score it for real. A failure here is reported, never rendered as a zero delta.
      let repidDelta: number | undefined;
      let halDecision: string | null = null;
      let scoreError: string | null = null;

      if (!agent?.apiKey) {
        scoreError =
          'this agent has no stored API key, so the run could not be scored (start a new PAI to fix)';
      } else {
        try {
          const scoreRes = await fetch(`${ENGINE}/api/v1/agents/${agent.id}/score-event`, {
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
              prompt: text,
            }),
          });
          const scoreData = await scoreRes.json();
          if (scoreRes.ok) {
            if (typeof scoreData.delta === 'number') repidDelta = scoreData.delta;
            halDecision = scoreData.hal_decision ?? null;
          } else if (scoreRes.status === 403 && scoreData.error === 'Constitutional block') {
            halDecision = 'vetoed';
          } else {
            scoreError = scoreData.error || `scoring failed (${scoreRes.status})`;
          }
        } catch {
          scoreError = 'scoring was unreachable — this run was NOT scored';
        }
      }

      setMsgs((m) => [
        ...m,
        mkMsg('pai', data.answer, {
          repidDelta,
          halDecision,
          scoreError,
          kernelRead: relevantKernelRead(text),
        }),
      ]);

      if (agent) {
        await localDb.updateAgent(agent.id, {
          totalPrompts: agent.totalPrompts + 1,
          lastUsedAt: Date.now(),
        });
      }
    } catch {
      setError('Backend unavailable. Try again in a moment.');
    }
    setBusy(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    if (phase === 'interview') void submitInterview(text);
    else if (phase === 'ready') void sendChat(text);
  };

  // --- render --------------------------------------------------------------

  if (phase === 'loading') {
    return <div className="mt-20 text-center text-[#94a3b8]">Waking your agent…</div>;
  }

  const q = phase === 'interview' ? CONSTITUTION_QUESTIONS[qIndex] : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {agent ? agent.name : 'Your PAI'}
          </h1>
          {/*
            The keyless promise, stated once and only once. Repeating a guarantee reads as
            reassurance rather than fact — and this one is structural, not aspirational: this
            module never imports the vault, so there is no code path by which the agent could
            receive a provider key.
          */}
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-[#a8b3c2]">
            Agents don&apos;t hold your keys. They only act inside grants you can revoke.
          </p>
        </div>

        <button
          type="button"
          onClick={toggleFounder}
          aria-pressed={founderOn}
          className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            founderOn
              ? 'border-amber-500/60 bg-amber-600/15 text-amber-400'
              : 'border-[#1e293b] text-[#64748b] hover:text-[#94a3b8]'
          }`}
        >
          Founder Mode {founderOn ? 'ON' : 'off'}
        </button>
      </header>

      {/*
        The banner stays above the fold because it changes what every subsequent action MEANS —
        you need to know your clicks are being tagged before you make them. The panel itself
        goes below the conversation: it is a control and reference surface, and on a phone,
        putting it here pushed the chat past fourteen role-pack cards. The answer is the
        primary object on this screen; the tools are not.
      */}
      {founderOn && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-600/5 px-4 py-3 text-xs leading-relaxed text-amber-200/80">
          Founder Mode is on. Everything you file is tagged <strong>actor=founder</strong> and
          stays out of end-user telemetry — so testing your own product never gets counted as
          adoption of it. It grants no keys and bypasses nothing: every gate that fails closed
          still fails closed. Stored on this device only; the durable event contract is still
          being specified.
        </p>
      )}

      <div className="space-y-4 rounded-xl border border-[#1e293b] bg-[#0f172a] p-5">
        {msgs.map((m) => (
          <div key={m.id} className={m.role === 'you' ? 'text-right' : ''}>
            <div
              className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'you'
                  ? 'bg-[#1e293b] text-[#e2e8f0]'
                  : 'bg-[#0a0f1a] text-white'
              }`}
            >
              {m.text}
            </div>

            {/*
              Two different axes, deliberately not merged into one indicator: the badge says
              whether this answer was scored AT ALL, and the HAL word says what the scoring
              found. Collapsing them is how "we did not look" becomes "it passed" — the exact
              two-outcome failure the three-state discipline exists to prevent.
            */}
            {m.role === 'pai' && (m.scoreError || typeof m.repidDelta === 'number' || m.halDecision) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {m.scoreError ? (
                  <TrustBadge state="NOT_CHECKED" detail={m.scoreError} />
                ) : (
                  <TrustBadge
                    state={m.halDecision === 'vetoed' ? 'FAILED' : 'MEASURED'}
                    detail={
                      m.halDecision === 'vetoed'
                        ? 'HAL vetoed this answer — it was not allowed to stand'
                        : m.halDecision === 'flagged'
                          ? 'HAL flagged something worth checking'
                          : 'HAL found nothing to flag'
                    }
                  />
                )}

                {typeof m.repidDelta === 'number' && (
                  <span className="font-mono text-[11px] tabular-nums text-[#8b97a8]">
                    RepID{' '}
                    <span className={m.repidDelta >= 0 ? 'text-[#5eead4]' : 'text-[#fda4af]'}>
                      {m.repidDelta > 0 ? '+' : ''}
                      {m.repidDelta.toFixed(2)}
                    </span>
                  </span>
                )}
              </div>
            )}

            {m.kernelRead && (
              <Link
                href={m.kernelRead.href}
                className="mt-2 flex items-start gap-3 rounded-lg border border-[#1e293b] bg-[#0a0f1a] px-4 py-3 text-left text-xs transition-colors hover:border-amber-600/50"
              >
                <span className="font-semibold text-amber-500">{m.kernelRead.label} →</span>
                <span className="text-[#94a3b8]">{m.kernelRead.answers}</span>
              </Link>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            phase === 'interview' ? 'Your answer…' : busy ? 'Thinking…' : 'Ask your agent…'
          }
          rows={3}
          className="w-full resize-none rounded-xl border border-[#334155] bg-[#0a0f1a] p-4 text-white"
        />
        {q && <p className="text-xs text-[#64748b]">{q.hint}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {founderOn &&
              (Object.keys(FOUNDER_EVENT_LABEL) as FounderEventKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => void fileFounderNote(kind)}
                  className="rounded-lg border border-amber-600/40 px-3 py-1.5 text-xs font-medium text-amber-400/90 hover:bg-amber-600/10"
                >
                  {FOUNDER_EVENT_LABEL[kind]}
                </button>
              ))}
          </div>

          <button
            type="submit"
            disabled={busy || phase === 'registering'}
            className="rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {phase === 'registering' ? 'Registering…' : busy ? 'Running…' : 'Send'}
          </button>
        </div>
      </form>

      <p className="text-xs text-[#64748b]">
        Runs on the free shared pool{runsLeft !== null ? ` · ${runsLeft} left today` : ''}.
      </p>

      {founderOn && (
        <FounderPanel onFiled={(msg) => setMsgs((m) => [...m, mkMsg('pai', msg)])} />
      )}
    </div>
  );
}
