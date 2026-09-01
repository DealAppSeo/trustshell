'use client';

import { useEffect, useState } from 'react';
import { fetchFaucetInfo, type FaucetInfo } from '@/lib/repid-engine';

/**
 * Where to get testnet ETH.
 *
 * THE ANSWER EXISTED AND THE PRODUCT NEVER ASKED THE QUESTION. `GET /api/v1/faucet/info`
 * has been live and unusually honest — it says plainly that we do not dispense, names the
 * chain, gives the minimum and suggested amounts, and lists three public faucets. The word
 * "faucet" appeared nowhere in this app, so somebody who needed funds had to already know
 * where to look.
 *
 * IT LEADS WITH WHAT WE DO NOT DO. The engine's own first fact is `dispenses: false`, and
 * this renders that before the links: a section headed "get testnet ETH" that quietly
 * implied we hand it out would be a promise nothing keeps.
 *
 * A FAILED FETCH SAYS SO. There is no hardcoded fallback list, deliberately — a remembered
 * faucet URL goes stale silently and turns into a dead link at the exact moment somebody
 * needs funds. Three outcomes, not two: we show the list, or we say we could not reach it.
 *
 * Collapsed by default. Most visitors are on the simulated path and need none of this.
 */
export function FaucetHelp() {
  const [info, setInfo] = useState<FaucetInfo | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unreachable'>('loading');

  useEffect(() => {
    let ignore = false;
    fetchFaucetInfo().then((f) => {
      if (ignore) return;
      setInfo(f);
      setState(f ? 'ready' : 'unreachable');
    });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <details className="rounded-lg border border-[#1e293b] bg-[#0f172a] px-5 py-4">
      <summary className="cursor-pointer list-none text-sm font-medium text-white">
        Need testnet ETH to stake for real?
      </summary>

      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[#94a3b8]">
        {state === 'loading' && (
          <div className="h-16 animate-pulse rounded bg-[#1e293b]" aria-hidden />
        )}

        {state === 'unreachable' && (
          <p>
            Couldn&apos;t reach the engine for the current faucet list, so there is nothing
            reliable to show you here. Rather than guess at links that may have moved, try
            again in a moment.
          </p>
        )}

        {state === 'ready' && info && (
          <>
            <p>
              <span className="text-white">{info.message}</span>
            </p>
            <p>
              You need <span className="font-mono text-white">{info.staking_min_eth}</span> ETH
              at minimum on {info.network} (chain{' '}
              <span className="font-mono">{info.chain_id}</span>) — around{' '}
              <span className="font-mono text-white">{info.staking_suggested_eth}</span> is more
              comfortable. It costs nothing: testnet ETH has no monetary value.
            </p>

            <ul className="space-y-2 pt-1">
              {info.faucets.map((f) => (
                <li key={f.url}>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-500 underline underline-offset-2 hover:text-amber-400"
                  >
                    {f.name}
                  </a>
                  <span className="ml-2 font-mono text-xs text-[#64748b]">
                    {f.assets.join(' · ')}
                  </span>
                  {f.note && <span className="block text-xs text-[#64748b]">{f.note}</span>}
                </li>
              ))}
            </ul>

            <p className="text-xs text-[#64748b]">
              These are third-party faucets. We don&apos;t run them and can&apos;t vouch for
              their uptime or their terms.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
