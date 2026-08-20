'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { revokeGrant } from '@/lib/repid-engine';

type Phase = 'idle' | 'confirm' | 'working' | 'error';

/**
 * G6: the grantor may always revoke, and only the grantor. This button only ever renders on a
 * grant where the principal being viewed IS that grant's grantor (see [principal]/page.tsx) —
 * so `requestedBy` is exactly who the page already established as "you", not asked twice.
 */
export function RevokeButton({ grantId, requestedBy }: { grantId: string; requestedBy: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const router = useRouter();

  const confirmRevoke = async () => {
    setPhase('working');
    setError('');
    const result = await revokeGrant(grantId, requestedBy);
    if (!result.ok) {
      setError(result.error);
      setPhase('error');
      return;
    }
    // Re-fetch the server component so liveness reflects the revoke immediately — no stale
    // "still live" reading after an action that just changed it.
    router.refresh();
    setPhase('idle');
  };

  if (phase === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setPhase('confirm')}
        className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-950/60"
      >
        Revoke
      </button>
    );
  }

  if (phase === 'confirm') {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="text-neutral-400">Revoke now — cannot be undone?</span>
        <button
          type="button"
          onClick={confirmRevoke}
          className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-500"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setPhase('idle')}
          className="rounded-md border border-neutral-700 px-2 py-1 text-neutral-400 hover:text-neutral-200"
        >
          Cancel
        </button>
      </span>
    );
  }

  if (phase === 'working') {
    return <span className="text-xs text-neutral-500">Revoking…</span>;
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-red-400">{error}</span>
      <button
        type="button"
        onClick={() => setPhase('confirm')}
        className="rounded-md border border-neutral-700 px-2 py-1 text-neutral-400 hover:text-neutral-200"
      >
        Retry
      </button>
    </span>
  );
}
