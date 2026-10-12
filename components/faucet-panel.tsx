'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchFaucetInfo, type FaucetInfo } from '@/lib/repid-engine';
import { BALANCE_NOT_CHECKED_WHY, fetchFaucetBalance, safeFaucetLinks, type FaucetBalance } from '@/lib/faucet';
import { useWallet } from '@/components/bind/use-wallet';

/**
 * The faucet screen, for a stranger. It does three things and refuses a fourth:
 *
 *   1. POINTS at public Base Sepolia faucets (test ETH for gas, test USDC to stake), taken from the
 *      engine's own list rather than copied here, so a moved faucet is not a dead link.
 *   2. READS BACK the balance of an address the person gives (or the wallet they already connected)
 *      through the engine, so they can see whether the faucet worked.
 *   3. LEADS on, in order, to the practice stake and the spending limit.
 *   NEVER dispenses. TrustShell does not hand out tokens, and this page says so before it lists
 *   anything. Nothing on it asks for a key or a signature.
 *
 * Faucet info is fetched on load; the balance is fetched only on a click, because the address is the
 * person's and goes to the engine only when they ask.
 */
export function FaucetPanel() {
  const wallet = useWallet();
  const [info, setInfo] = useState<FaucetInfo | null>(null);
  const [infoState, setInfoState] = useState<'loading' | 'ready' | 'not_checked'>('loading');
  const [address, setAddress] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<FaucetBalance | null>(null);

  useEffect(() => {
    let live = true;
    fetchFaucetInfo().then((f) => {
      if (!live) return;
      setInfo(f);
      // dispenses must be exactly false. Anything else is not the answer this page is built on.
      setInfoState(f && f.dispenses === false ? 'ready' : 'not_checked');
    });
    return () => {
      live = false;
    };
  }, []);

  // A wallet the person already connected can fill the box. It never overwrites what they typed.
  useEffect(() => {
    if (wallet.address && !touched) setAddress(wallet.address);
  }, [wallet.address, touched]);

  const links = infoState === 'ready' ? safeFaucetLinks(info) : [];

  async function read(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setBalance(null);
    setBalance(await fetchFaucetBalance(address));
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="faucet-how" className="space-y-2 rounded-xl border border-amber-500/30 bg-[#0f172a] p-5">
        <h2 id="faucet-how" className="text-lg font-bold text-white">
          We do not hand out tokens
        </h2>
        <p className="text-sm leading-relaxed text-[#cbd5e1]" data-testid="faucet-no-dispense">
          TrustShell does not send you test tokens and never will. A public faucet does. Use one below, then paste your wallet
          address here and we read the balance back, so you can see it worked before you stake.
        </p>
        <p className="text-sm leading-relaxed text-[#94a3b8]">
          Test tokens have no value. You need two things on the Base Sepolia test network: a little test ETH for the network fee,
          and test USDC to stake.
        </p>
      </section>

      <section aria-labelledby="faucet-list" className="space-y-3">
        <h2 id="faucet-list" className="text-lg font-bold text-white">
          1. Get test tokens from a public faucet
        </h2>
        {infoState === 'loading' && <div className="h-16 animate-pulse rounded bg-[#1e293b]" aria-hidden />}
        {infoState === 'not_checked' && (
          <p data-testid="faucet-list-not-checked" className="rounded-lg border border-dashed border-[#334155] p-4 text-sm text-[#94a3b8]">
            Not checked: the engine did not give a faucet list this page can stand behind. Rather than guess at links that may have
            moved, try again in a moment.
          </p>
        )}
        {infoState === 'ready' && info && (
          <>
            <p className="text-sm text-[#94a3b8]">
              You need at least <span className="font-mono text-white">{info.staking_min_eth}</span> test ETH on {info.network}{' '}
              (chain <span className="font-mono">{info.chain_id}</span>), and about{' '}
              <span className="font-mono text-white">{info.staking_suggested_eth}</span> is more comfortable.
            </p>
            {links.length === 0 ? (
              <p className="text-sm text-[#94a3b8]">The engine listed no faucet links this page could safely show.</p>
            ) : (
              <ul className="space-y-3" data-testid="faucet-links">
                {links.map((f) => (
                  <li key={f.url} className="min-w-0 rounded-lg border border-[#1e293b] bg-[#0f172a] p-3">
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-amber-500 underline underline-offset-2 hover:text-amber-400"
                    >
                      {f.name}
                    </a>
                    <span className="ml-2 font-mono text-xs text-[#94a3b8]">{f.assets.join(' · ')}</span>
                    {f.note && <span className="mt-1 block text-xs text-[#64748b]">{f.note}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-[#64748b]">
              These are third-party sites. We do not run them and cannot vouch for their uptime or their terms. A faucet that lists
              only ETH will not give you USDC.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="faucet-read" className="space-y-3 rounded-xl border border-[#1e293b] bg-[#0f172a] p-5">
        <h2 id="faucet-read" className="text-lg font-bold text-white">
          2. Check it arrived
        </h2>
        <form onSubmit={read} className="space-y-2">
          <label className="block text-sm">
            <span className="font-medium text-white">Your wallet address</span>
            <input
              data-testid="faucet-address"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={address}
              onChange={(e) => {
                setTouched(true);
                setAddress(e.target.value);
              }}
              placeholder="0x…"
              className="mt-1 w-full rounded border border-[#334155] bg-[#0a0f1a] p-3 font-mono text-sm text-white"
            />
          </label>
          <p className="text-xs text-[#64748b]">
            The address goes to our engine so it can read the public balance. A wallet address is already public on the chain. We
            never ask for a key or a signature here.
          </p>
          <button
            type="submit"
            data-testid="faucet-read"
            disabled={busy || !address.trim()}
            className="rounded bg-amber-600 px-5 py-2.5 font-bold text-white hover:bg-amber-500 disabled:opacity-60"
          >
            {busy ? 'Reading…' : 'Read my balance'}
          </button>
        </form>

        {balance && balance.state === 'NOT_CHECKED' && (
          <p role="status" data-testid="faucet-balance-not-checked" className="text-sm text-[#cbd5e1]">
            Not checked. {BALANCE_NOT_CHECKED_WHY[balance.reason]}
          </p>
        )}
        {balance && balance.state === 'READ' && (
          <div role="status" data-testid="faucet-balance" className="space-y-1 text-sm">
            <p className="text-white">
              <span className="font-mono" data-testid="faucet-eth">
                {balance.eth}
              </span>{' '}
              ETH · <span className="font-mono" data-testid="faucet-usdc">{balance.usdc}</span> USDC
            </p>
            <p className="text-[#cbd5e1]" data-testid="faucet-verdict">
              {balance.enoughToStake
                ? 'Enough to stake.'
                : balance.enoughForGas
                  ? 'Enough for the network fee, but not yet enough to stake.'
                  : 'Not enough test ETH yet.'}
            </p>
            {balance.nextStep && !balance.enoughToStake && <p className="text-xs text-[#94a3b8]">{balance.nextStep}</p>}
          </div>
        )}
      </section>

      <section aria-labelledby="faucet-next" className="space-y-2">
        <h2 id="faucet-next" className="text-lg font-bold text-white">
          3. Then
        </h2>
        <p className="flex flex-wrap gap-3">
          <Link href="/stake" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500">
            Practice stake
          </Link>
          <Link href="/spend" className="rounded-lg border border-[#334155] px-4 py-2 text-sm font-medium text-[#cbd5e1] hover:text-white">
            Set a limit
          </Link>
          <Link href="/wallet" className="rounded-lg border border-[#334155] px-4 py-2 text-sm font-medium text-[#cbd5e1] hover:text-white">
            Help with my wallet
          </Link>
        </p>
      </section>
    </div>
  );
}
