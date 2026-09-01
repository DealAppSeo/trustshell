'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { isDeclined, type SignFn } from '@/lib/human-bind';

/**
 * The browser wallet, and nothing else.
 *
 * WHY THIS IS A COMPONENT-LAYER HOOK RATHER THAN A lib/ MODULE. `lib/` stays
 * dependency-free so it can be imported anywhere; obtaining a signature needs
 * `window.ethereum` and a dynamic `ethers` import, which belongs to the layer
 * that owns the prompt. Same split as the stake page.
 *
 * IT DOES NOT AUTO-CONNECT. `eth_requestAccounts` opens a wallet popup, and a
 * popup nobody asked for is how a page teaches people to dismiss popups. On
 * mount we only read accounts already granted (`eth_accounts`, silent); the
 * user connects deliberately.
 */

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function provider(): Eip1193 | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { ethereum?: Eip1193 }).ethereum) ?? null;
}

export type WalletState = {
  /** null until the first silent read resolves — lets the UI avoid a flash. */
  ready: boolean;
  /** No wallet extension in this browser at all. */
  available: boolean;
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  sign: SignFn;
};

/** Whether a wallet exists is a fact about the browser, not React state. */
function subscribeToProvider() {
  return () => {};
}

export function useWallet(): WalletState {
  // useSyncExternalStore is the sanctioned way to read a browser-only value:
  // it returns the server snapshot during SSR and the real one after hydration,
  // with no effect mirroring an external fact into state.
  const available = useSyncExternalStore(
    subscribeToProvider,
    () => !!provider(),
    () => false,
  );
  const [probed, setProbed] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // With no wallet there is nothing to probe, so readiness is immediate.
  const ready = !available || probed;

  useEffect(() => {
    const eth = provider();
    if (!eth) return;

    let live = true;
    eth
      .request({ method: 'eth_accounts' })
      .then((accts) => {
        if (!live) return;
        const list = Array.isArray(accts) ? (accts as string[]) : [];
        setAddress(list[0] ?? null);
      })
      .catch(() => {})
      .finally(() => live && setProbed(true));

    // Switching accounts mid-flow would otherwise sign as one address and
    // submit as another, which the engine rejects with an error the person
    // cannot act on. Track it instead.
    const onAccounts = (...args: unknown[]) => {
      const list = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      setAddress(list[0] ?? null);
    };
    eth.on?.('accountsChanged', onAccounts);
    return () => {
      live = false;
      eth.removeListener?.('accountsChanged', onAccounts);
    };
  }, [available]);

  const connect = useCallback(async () => {
    const eth = provider();
    if (!eth) return;
    setConnecting(true);
    setError(null);
    try {
      const accts = await eth.request({ method: 'eth_requestAccounts' });
      const list = Array.isArray(accts) ? (accts as string[]) : [];
      setAddress(list[0] ?? null);
    } catch (e) {
      setError(
        isDeclined(e)
          ? 'Connection declined — nothing happened.'
          : 'That wallet could not connect. Try again.',
      );
    } finally {
      setConnecting(false);
    }
  }, []);

  const sign = useCallback<SignFn>(async (message: string) => {
    const eth = provider();
    if (!eth) throw new Error('no wallet');
    const { BrowserProvider } = await import('ethers');
    const signer = await new BrowserProvider(eth as never).getSigner();
    return signer.signMessage(message);
  }, []);

  return { ready, available, address, connecting, error, connect, sign };
}
