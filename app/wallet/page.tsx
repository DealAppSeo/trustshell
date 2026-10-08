'use client';

/**
 * /wallet — "Your wallet, set up for you."
 *
 * The friction this removes (measured on a real person, 2026-10-08): "I can't tell which
 * MetaMask account is which, which network I'm on, or where my money is." That confusion is
 * the #1 reason wallets don't convert. This page does the tee-up: it points at the exact
 * account, checks the network and switches it in one click, makes the testnet USDC visible,
 * and deep-links the next action — with plain directions and no jargon wall.
 *
 * HARD RULE: this page holds, reads, and asks for NO private key and NO signature. Real key
 * custody / MFA is the TrustKeys product. Everything here is read-only wallet state plus two
 * standard, non-custodial wallet prompts the user approves themselves:
 *   - wallet_switchEthereumChain / wallet_addEthereumChain  (change network)
 *   - wallet_watchAsset                                     (show a token they already hold)
 * Neither moves funds, neither signs anything, neither needs a key from us. The test
 * (tests/wallet-helper.test.ts) fails if this file ever gains a signing/approve/transfer call.
 */

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@/components/bind/use-wallet';
import { JourneySteps } from '@/components/journey-steps';

// Base Sepolia — the one testnet this product runs on. Kept local and explicit on purpose:
// a newcomer is never asked to "add a network" by hand; the button below carries these.
const BASE_SEPOLIA = {
  chainIdHex: '0x14a34', // 84532
  chainIdDec: 84532,
  chainName: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org'],
};
const USDC = { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', symbol: 'USDC', decimals: 6 };
const PUBLIC_FAUCET = 'https://portal.cdp.coinbase.com/products/faucet'; // Base Sepolia ETH

type Eth = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (e: string, h: (...a: unknown[]) => void) => void;
  removeListener?: (e: string, h: (...a: unknown[]) => void) => void;
};
function eth(): Eth | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { ethereum?: Eth }).ethereum ?? null;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function WalletHelperPage() {
  const { ready, available, address, connecting, connect } = useWallet();
  const [chainId, setChainId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [eth4, setEth4] = useState<string | null>(null); // ETH balance, 4dp string, or null = not read
  const [usdc, setUsdc] = useState<string | null>(null);
  const [balErr, setBalErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [watched, setWatched] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const onBaseSepolia = chainId === BASE_SEPOLIA.chainIdHex;

  // Track the current chain. Read once, then follow chainChanged.
  useEffect(() => {
    const e = eth();
    if (!e) return;
    let live = true;
    e.request({ method: 'eth_chainId' }).then((c) => live && setChainId(String(c))).catch(() => {});
    const onChain = (...a: unknown[]) => setChainId(typeof a[0] === 'string' ? a[0] : null);
    e.on?.('chainChanged', onChain);
    return () => {
      live = false;
      e.removeListener?.('chainChanged', onChain);
    };
  }, [available]);

  // Read balances client-side through the wallet's own RPC — no server call, no CORS, no key.
  const readBalances = useCallback(async () => {
    const e = eth();
    if (!e || !address || !onBaseSepolia) return;
    setBalErr(false);
    try {
      const { BrowserProvider, Contract, formatEther, formatUnits } = await import('ethers');
      const provider = new BrowserProvider(e as never);
      const wei = await provider.getBalance(address);
      setEth4(Number(formatEther(wei)).toFixed(4));
      try {
        const token = new Contract(USDC.address, ['function balanceOf(address) view returns (uint256)'], provider);
        const raw = (await token.balanceOf(address)) as bigint;
        setUsdc(Number(formatUnits(raw, USDC.decimals)).toFixed(2));
      } catch {
        setUsdc(null); // token read reverted — honest null, not 0
      }
    } catch {
      setBalErr(true); // could not read — say so, never invent a balance
    }
  }, [address, onBaseSepolia]);

  useEffect(() => {
    void readBalances();
  }, [readBalances]);

  const switchNetwork = useCallback(async () => {
    const e = eth();
    if (!e) return;
    setSwitching(true);
    setNote(null);
    try {
      await e.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_SEPOLIA.chainIdHex }] });
    } catch (err) {
      // 4902 = chain not added yet; add it (still just a network, no key, no funds).
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        try {
          await e.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: BASE_SEPOLIA.chainIdHex,
              chainName: BASE_SEPOLIA.chainName,
              nativeCurrency: BASE_SEPOLIA.nativeCurrency,
              rpcUrls: BASE_SEPOLIA.rpcUrls,
              blockExplorerUrls: BASE_SEPOLIA.blockExplorerUrls,
            }],
          });
        } catch {
          setNote('Your wallet declined the network change — nothing happened. You can add Base Sepolia by hand in your wallet.');
        }
      } else {
        setNote('Your wallet declined the network change — nothing happened.');
      }
    } finally {
      setSwitching(false);
    }
  }, []);

  const showUsdc = useCallback(async () => {
    const e = eth();
    if (!e) return;
    try {
      await e.request({
        method: 'wallet_watchAsset',
        params: [{ type: 'ERC20', options: { address: USDC.address, symbol: USDC.symbol, decimals: USDC.decimals } }] as unknown[],
      });
      setWatched(true);
    } catch {
      setNote('Your wallet declined showing the token — nothing happened.');
    }
  }, []);

  const copy = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the address is shown in full below regardless */
    }
  }, [address]);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Your wallet, set up for you</h1>
        <p className="text-[#94a3b8] leading-relaxed">
          No keys, no jargon. We point; you click. Everything here is testnet — play money — so nothing
          you do can cost you anything. <span className="text-[#64748b]">(Your actual keys stay in your
          own wallet; we never see or hold them.)</span>
        </p>
      </header>

      <JourneySteps current="fund" />

      {!ready ? null : !available ? (
        <Card>
          <h2 className="text-lg font-bold mb-1">First you need a browser wallet</h2>
          <p className="text-sm text-[#94a3b8] leading-relaxed mb-4">
            A wallet is just a browser extension that holds your testnet play-money and signs when you
            approve. MetaMask is the common one. Install it, make a wallet, then come back to this page.
          </p>
          <a href="https://metamask.io/download/" target="_blank" rel="noreferrer"
             className="inline-block px-5 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded">
            Get MetaMask →
          </a>
        </Card>
      ) : !address ? (
        <Card>
          <h2 className="text-lg font-bold mb-1">Connect your wallet</h2>
          <p className="text-sm text-[#94a3b8] leading-relaxed mb-4">
            This only lets us <span className="text-white">read</span> which account and network you&apos;re on
            so we can point you at the right one. It cannot move anything.
          </p>
          <button onClick={connect} disabled={connecting}
                  className="px-5 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold rounded">
            {connecting ? 'Connecting…' : 'Connect wallet'}
          </button>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* 1. Which account */}
          <Row ok title="This is the account you're using">
            <div className="flex items-center gap-3 flex-wrap">
              <code className="text-white text-sm bg-[#0a0f1a] border border-[#334155] rounded px-2 py-1">{short(address)}</code>
              <button onClick={copy} className="text-xs px-3 py-1 bg-[#1e293b] hover:bg-[#334155] rounded text-white">
                {copied ? 'Copied ✓' : 'Copy full address'}
              </button>
            </div>
            <p className="text-xs text-[#64748b] mt-2 break-all">{address}</p>
            <Tip>Not the account you meant? Switch accounts inside your wallet, then it updates here. Tip: rename it in your wallet to something like &quot;TrustShell&quot; so you never hunt again.</Tip>
          </Row>

          {/* 2. Network */}
          <Row ok={onBaseSepolia} title={onBaseSepolia ? "You're on Base Sepolia" : "Wrong network"}>
            {onBaseSepolia ? (
              <p className="text-sm text-[#94a3b8]">The testnet this product runs on. You&apos;re good.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#94a3b8]">
                  You&apos;re on {chainName(chainId)}. You need <span className="text-white">Base Sepolia</span> (the testnet).
                </p>
                <button onClick={switchNetwork} disabled={switching}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold rounded text-sm">
                  {switching ? 'Switching…' : 'Switch to Base Sepolia'}
                </button>
              </div>
            )}
            <Tip>A &quot;network&quot; is just which chain your wallet is pointed at. Switching is free and changes nothing you hold.</Tip>
          </Row>

          {/* 3. Funds */}
          <Row ok={onBaseSepolia && !balErr && (eth4 !== null)} title="Your testnet funds">
            {!onBaseSepolia ? (
              <p className="text-sm text-[#94a3b8]">Switch to Base Sepolia first, then your balances show here.</p>
            ) : balErr ? (
              <p className="text-sm text-amber-400">Couldn&apos;t read your balance just now — not zero, just not read. Try reconnecting.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-white">
                  <span className="font-mono">{eth4 ?? '…'}</span> ETH <span className="text-[#64748b]">(for gas)</span>
                  {'   ·   '}
                  <span className="font-mono">{usdc ?? '—'}</span> USDC
                </p>
                {usdc === null && (
                  <button onClick={showUsdc} className="text-xs px-3 py-1 bg-[#1e293b] hover:bg-[#334155] rounded text-white">
                    {watched ? 'Added ✓' : 'Show my USDC in the wallet'}
                  </button>
                )}
                {eth4 !== null && Number(eth4) === 0 && (
                  <p className="text-sm text-amber-400">
                    No gas yet. Grab a little free Base Sepolia ETH:{' '}
                    <a className="underline" href={PUBLIC_FAUCET} target="_blank" rel="noreferrer">faucet →</a>
                  </p>
                )}
                <Tip>&quot;Gas&quot; is the tiny network fee for any action — paid in testnet ETH, worth nothing real. USDC is the testnet dollar you&apos;ll stake and spend.</Tip>
              </div>
            )}
          </Row>

          {note && <p className="text-sm text-amber-400 bg-amber-900/10 border border-amber-900/40 rounded p-3">{note}</p>}

          {/* Next action */}
          <div className="pt-2 flex flex-wrap gap-3">
            <a href="/bind"
               className={`px-5 py-3 font-bold rounded ${onBaseSepolia ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-[#1e293b] text-[#64748b] pointer-events-none'}`}>
              Next: bind your agent →
            </a>
            <a href="/start" className="px-5 py-3 font-medium rounded border border-[#334155] text-[#94a3b8] hover:text-white">
              Back to start
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="max-w-xl p-6 bg-[#0f172a] rounded-xl border border-[#1e293b]">{children}</div>;
}

function Row({ ok, title, children }: { ok: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 bg-[#0f172a] p-5 rounded-xl border border-[#1e293b]">
      <div className={`flex-none w-7 h-7 rounded-full grid place-items-center text-sm font-bold ${ok ? 'bg-emerald-600/20 text-emerald-400' : 'bg-amber-600/20 text-amber-400'}`}>
        {ok ? '✓' : '!'}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-white">{title}</h2>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-2 text-xs text-[#64748b]">
      <summary className="cursor-pointer hover:text-[#94a3b8] select-none">what&apos;s this?</summary>
      <p className="mt-1 leading-relaxed">{children}</p>
    </details>
  );
}

function chainName(id: string | null): string {
  if (!id) return 'another network';
  const map: Record<string, string> = {
    '0x1': 'Ethereum Mainnet',
    '0xaa36a7': 'Sepolia',
    '0x2105': 'Base Mainnet',
    '0x14a34': 'Base Sepolia',
  };
  return map[id] ?? `chain ${parseInt(id, 16) || id}`;
}
