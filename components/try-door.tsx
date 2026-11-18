'use client';

import { useState } from 'react';
import type { TryResult, VerifyResult } from '@/lib/try-door';
import { TRY_SAMPLES } from '@/lib/try-samples';
import { TryResultView } from '@/components/try-result-view';

const API = '/api/lab/try';

async function post<T>(body: unknown): Promise<T | null> {
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const NO_ANSWER = 'Not checked: the check service did not answer. This is not a pass.';

export function TryDoor() {
  const [url, setUrl] = useState('');
  const [claim, setClaim] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);

  async function run(u: string, c: string) {
    setBusy(true);
    setVerify(null);
    // A backend failure is NOT_CHECKED with the reason, never a pass.
    const r = await post<TryResult>({ url: u, claim: c });
    setResult(r ?? { verdict: 'NOT_CHECKED', evidence: NO_ANSWER, timestamp: new Date().toISOString() });
    setBusy(false);
  }

  async function doVerify() {
    if (!result?.record || !result.digest) return;
    setBusy(true);
    const v = await post<VerifyResult>({ action: 'verify', record: result.record, digest: result.digest });
    setVerify(v ?? { outcome: 'NOT_CHECKED', lines: [NO_ANSWER], timestamp: new Date().toISOString() });
    setBusy(false);
  }

  return (
    <section aria-label="Check one claim" data-testid="try-door" className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(url, claim);
        }}
      >
        <label className="block space-y-1 text-sm text-slate-300">
          GitHub Actions run URL
          <input data-testid="try-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/actions/runs/123" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-white" />
        </label>
        <label className="block space-y-1 text-sm text-slate-300">
          What was said about it (optional)
          <input data-testid="try-claim" value={claim} placeholder="The workflow passed in run 123." onChange={(e) => setClaim(e.target.value)} maxLength={300} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-white" />
        </label>
        <button type="submit" disabled={busy} data-testid="try-submit" className="rounded-lg bg-white px-4 py-2 font-semibold text-black disabled:opacity-60">
          {busy ? 'Checking…' : 'Check'}
        </button>
      </form>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-slate-400">Or try a real public run</p>
        <ul className="flex flex-wrap gap-2">
          {TRY_SAMPLES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                data-testid={`sample-${s.id}`}
                disabled={busy}
                onClick={() => {
                  setUrl(s.url);
                  setClaim(s.claim);
                  void run(s.url, s.claim);
                }}
                className="rounded-lg border border-border px-3 py-2 text-left text-sm text-slate-200 disabled:opacity-60"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-400">Each sample is a real run of this project, read from GitHub live when you press it. Nothing on this page is a saved or made-up answer.</p>
      </div>

      {result && <TryResultView result={result} verify={verify} busy={busy} onVerify={() => void doVerify()} />}
    </section>
  );
}
