'use client';

import { useEffect, useState } from 'react';
import { engineCommitDisplay, type EngineCommit } from '@/lib/engine-commit';

const ENGINE =
  process.env.NEXT_PUBLIC_REPID_ENGINE_URL ??
  'https://repid-engine-production.up.railway.app';

/**
 * Live engine /health deployed_commit. Fail-closed: if the fetch fails, say so.
 */
export function EngineCommitLine() {
  const [state, setState] = useState<EngineCommit | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${ENGINE}/health`, {
          signal: AbortSignal.timeout(8000),
          headers: { accept: 'application/json' },
        });
        if (!res.ok) {
          if (!cancelled) setState({ ok: false, reason: `engine HTTP ${res.status}` });
          return;
        }
        const raw: unknown = await res.json();
        if (!cancelled) setState(engineCommitDisplay(raw));
      } catch {
        if (!cancelled) setState({ ok: false, reason: 'engine health unavailable' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) {
    return <p className="text-xs text-muted/60">engine commit…</p>;
  }
  if (!state.ok) {
    return <p className="text-xs text-muted/60">engine commit unavailable — {state.reason}</p>;
  }
  return (
    <p className="text-xs text-muted/60">
      engine{' '}
      <a
        href={`https://github.com/DealAppSeo/repid-engine/commit/${state.commit}`}
        className="underline underline-offset-2 hover:text-accent"
        target="_blank"
        rel="noopener noreferrer"
      >
        {state.short}
      </a>
    </p>
  );
}
