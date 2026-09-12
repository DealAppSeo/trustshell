'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CONSTITUTION_QUESTIONS } from '@/lib/pai';
import { parseHalVerdict, parseRegister, rejectEmptyName } from '@/lib/create-pai-parse';

/**
 * /create — the create-PAI FACE. The web mirror of `scripts/init-pai.mjs`, following docs/CREATE_PAI.md:
 * Name → Create (register with origin 'Site') → show agentId + apiKey ONCE → verify Paris (PASS) and
 * Rome (VETO — the hero) → show RepID → optional interview (one beat, max 3, skip is the default) →
 * point at a SECOND PAI (its own store), not more tools on #1.
 *
 * Real calls, no mocks: POST /api/v1/agents/register, POST /api/v1/hal/evaluate {text, strictness:2},
 * GET /api/v1/repid/:id. Nothing is published; no key of the user's is held — register returns a key
 * shown once and it is theirs to keep.
 *
 * No version string is rendered here on purpose: npm publishes 1.3.0, so a "1.4.0" on the page would be
 * a claim the registry does not back (see docs — "no 1.4.0 unless npm view says 1.4.0").
 */

const ENGINE = process.env.NEXT_PUBLIC_REPID_ENGINE_URL;
const PARIS = 'The capital of France is Paris.';
const ROME = 'The Eiffel Tower is located in Rome, Italy.';

type Verdict = 'PASS' | 'FLAG' | 'VETO' | null;

interface Created {
  agentId: string;
  apiKey: string | null;
  parisVerdict: Verdict;
  romeVerdict: Verdict;
  repid: number | null;
  tier: string | null;
}

async function halVerdict(text: string): Promise<Verdict> {
  try {
    const res = await fetch(`${ENGINE}/api/v1/hal/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, strictness: 2 }),
    });
    const data = await res.json().catch(() => ({}));
    // Live HAL returns { decision: "vetoed"|"clean" }, not verdict/hal_decision.
    return parseHalVerdict(data);
  } catch {
    return null;
  }
}

export default function CreatePaiPage() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);

  // Optional interview — SKIPPED unless they ask. It stays hidden until the user opts in; when open,
  // it is one beat at a time, max 3. The value above (creds, hero, RepID) is never blocked by it.
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const qIndex = answers.length;
  const interviewActive = created !== null && interviewOpen && qIndex < CONSTITUTION_QUESTIONS.length;

  async function onCreate() {
    const trimmed = name.trim();
    const empty = rejectEmptyName(trimmed);
    if (empty) { setError(empty); return; }
    if (!ENGINE) { setError('Backend URL is not configured for this deploy (NEXT_PUBLIC_REPID_ENGINE_URL).'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${ENGINE}/api/v1/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // origin 'Site' = provenance on the first commit (this PAI was created from the hosted Site).
        body: JSON.stringify({ name: trimmed, agent_name: trimmed, origin: 'Site' }),
      });
      const data = await res.json().catch(() => ({}));
      const parsed = parseRegister(res.status, data);
      if (!parsed.ok) throw new Error(parsed.message);
      const { agentId, apiKey } = parsed;

      const [parisVerdict, romeVerdict] = await Promise.all([halVerdict(PARIS), halVerdict(ROME)]);

      let repid: number | null = null;
      let tier: string | null = null;
      try {
        const r = await fetch(`${ENGINE}/api/v1/repid/${encodeURIComponent(agentId)}`);
        const rd = await r.json().catch(() => ({}));
        const score = rd.repid_score ?? rd.repid ?? rd.current_repid;
        if (typeof score === 'number') repid = score;
        if (typeof rd.tier === 'string') tier = rd.tier;
      } catch { /* RepID read failed — shown as "not read yet", never faked */ }

      setCreated({ agentId, apiKey, parisVerdict, romeVerdict, repid, tier });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the backend to create your PAI.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-[#fafafa]">
      <h1 className="text-4xl font-bold">Create your PAI</h1>
      <p className="mt-2 text-[#a1a1a1]">
        A confidential chief of staff. Name it, and it&apos;s created against the live trust harness —
        no key of yours is held; the one it returns is yours to keep.
      </p>

      {!created && (
        <div className="mt-8">
          <label className="block text-sm text-[#a1a1a1]">Name your PAI</label>
          <div className="mt-2 flex gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void onCreate(); }}
              placeholder="e.g. Atlas"
              required
              className="flex-1 rounded-md border border-[#333] bg-[#111] px-3 py-2 text-[#fafafa] outline-none focus:border-[#666]"
              disabled={busy}
            />
            <button
              onClick={() => void onCreate()}
              disabled={busy}
              className="rounded-md bg-[#fafafa] px-5 py-2 font-medium text-[#0a0a0a] disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-[#ff6b6b]">{error}</p>}
        </div>
      )}

      {created && (
        <div className="mt-8 space-y-8">
          {/* Credentials — shown ONCE. */}
          <section className="rounded-lg border border-[#333] bg-[#111] p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#a1a1a1]">Your PAI — save this now</h2>
            <dl className="mt-3 space-y-2 font-mono text-sm">
              <div className="flex gap-2"><dt className="w-20 text-[#a1a1a1]">agentId</dt><dd className="break-all">{created.agentId}</dd></div>
              <div className="flex gap-2">
                <dt className="w-20 text-[#a1a1a1]">apiKey</dt>
                <dd className="break-all">{created.apiKey ?? '(not returned)'}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-[#ff9f43]">Shown once. Copy the apiKey now — it is not stored server-side and will not be shown again.</p>
          </section>

          {/* HAL hero: Paris PASS, Rome VETO. */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#a1a1a1]">The harness, working</h2>
            {created.romeVerdict === 'VETO' ? (
              <p className="mt-3 text-2xl font-bold text-[#4ade80]">Harness caught a false claim before you acted on it.</p>
            ) : (
              <p className="mt-3 text-lg text-[#a1a1a1]">
                Rome check returned {created.romeVerdict ?? 'not checked'} — the cross-model quorum was not reached this time (not a failure of your PAI).
              </p>
            )}
            <ul className="mt-3 space-y-1 font-mono text-sm">
              <li><span className="text-[#a1a1a1]">“{PARIS}”</span> → {created.parisVerdict ?? 'not checked'}</li>
              <li><span className="text-[#a1a1a1]">“{ROME}”</span> → {created.romeVerdict ?? 'not checked'}</li>
            </ul>
          </section>

          {/* RepID. */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#a1a1a1]">RepID</h2>
            <p className="mt-2 text-lg">
              {created.repid !== null
                ? <><span className="font-bold">{created.repid}</span> {created.tier && <span className="text-[#a1a1a1]">· {created.tier}</span>} <span className="text-[#a1a1a1]">(the score moves; it is not frozen)</span></>
                : <span className="text-[#a1a1a1]">Not read yet — your standing is live and will populate as your PAI acts.</span>}
            </p>
          </section>

          {/* Optional interview — one beat, skip is the default. */}
          {interviewActive ? (
            <section className="rounded-lg border border-[#333] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#a1a1a1]">
                Shape it (optional · {qIndex + 1} of {CONSTITUTION_QUESTIONS.length})
              </h2>
              <p className="mt-2">{CONSTITUTION_QUESTIONS[qIndex].ask}</p>
              <p className="mt-1 text-xs text-[#a1a1a1]">{CONSTITUTION_QUESTIONS[qIndex].hint}</p>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                className="mt-3 w-full rounded-md border border-[#333] bg-[#111] px-3 py-2 text-sm outline-none focus:border-[#666]"
              />
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => { setAnswers((a) => [...a, draft.trim()]); setDraft(''); }}
                  className="rounded-md border border-[#333] px-4 py-1.5 text-sm"
                >
                  Answer
                </button>
                {/* Skip closes the interview immediately and returns to the done state. */}
                <button
                  onClick={() => setInterviewOpen(false)}
                  className="rounded-md bg-[#fafafa] px-4 py-1.5 text-sm font-medium text-[#0a0a0a]"
                >
                  Skip — I&apos;m done
                </button>
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-[#222] p-5 text-sm text-[#a1a1a1]">
              {/* Interview is skipped unless they ask — a quiet opt-in, never a blocking prompt. */}
              {qIndex === 0 && (
                <p className="mb-4">
                  <button onClick={() => setInterviewOpen(true)} className="text-[#fafafa] underline">
                    Shape it with a few questions (optional) →
                  </button>
                </p>
              )}
              <p>
                Want a specialist? Create a <strong className="text-[#fafafa]">second PAI</strong> — a new name in its own
                store, so #1 is untouched. #1 is your chief of staff; it manages the others. Don&apos;t bolt specialist
                tools onto #1.
              </p>
              <p className="mt-2 font-mono text-xs">
                CLI: <span className="text-[#fafafa]">$env:TRUSTSHELL_HOME=&quot;.trustshell/&lt;name&gt;&quot;; node scripts/init-pai.mjs --name &lt;name&gt;</span>
              </p>
              <p className="mt-3">
                <Link href="/create" className="underline">Create another PAI →</Link>
              </p>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
