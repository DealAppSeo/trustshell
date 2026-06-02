import { ExternalLink } from 'lucide-react';

const footerLinks = {
  project: [
    { name: 'GitHub', href: 'https://github.com/DealAppSeo/trustshell' },
    { name: 'Documentation', href: 'https://github.com/DealAppSeo/trustshell/blob/main/docs/getting-started.md' },
    { name: 'npm', href: 'https://www.npmjs.com/package/@hyperdag/trustshell' },
    { name: 'License: Apache 2.0', href: 'https://github.com/DealAppSeo/trustshell/blob/main/LICENSE' },
  ],
  ecosystem: [
    { name: 'TrustShell.dev', href: '/', internal: true },
    { name: 'TrustRepID.dev', href: 'https://trustrepid.dev' },
    { name: 'TrustChat.dev', href: 'https://trustchat.dev' },
    { name: 'HyperDAG Protocol', href: 'https://github.com/DealAppSeo/hyperdag-protocol' },
  ],
  standards: [
    { name: 'ERC-8004', href: 'https://eips.ethereum.org/EIPS/eip-8004' },
    { name: 'x402 Protocol', href: 'https://x402.org' },
    { name: 'Ethereum Magicians', href: 'https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098' },
  ],
  onChain: [
    { name: 'IdentityRegistry', href: 'https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e' },
    { name: 'ReputationRegistry', href: 'https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713' },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-slate-900 py-12 mt-16 bg-slate-950 w-full text-center">
      <div className="max-w-4xl mx-auto px-6 flex flex-col items-center gap-6">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-widest font-mono">
          ━━━ HyperDAG Trust Layer ━━━
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-[13px] text-slate-400 font-semibold">
          <a href="https://trustchat.dev" className="hover:text-indigo-400 transition-colors duration-200">TrustChat</a>
          <span className="text-slate-800">&middot;</span>
          <a href="/" className="hover:text-indigo-400 transition-colors duration-200">TrustShell</a>
          <span className="text-slate-800">&middot;</span>
          <a href="https://trustrepid.dev" className="hover:text-indigo-400 transition-colors duration-200">TrustRepID</a>
          <span className="text-slate-800">&middot;</span>
          <a href="https://trustchat.dev/leaderboard" className="hover:text-indigo-400 transition-colors duration-200">Leaderboard</a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 font-medium">
          <span>Coming Soon:</span>
          <a href="https://trustrails.dev" className="hover:text-slate-400 transition-colors">TrustRails</a>
          <span>&middot;</span>
          <a href="https://trustmarket.dev" className="hover:text-slate-400 transition-colors">TrustMarket</a>
          <span>&middot;</span>
          <a href="https://trustcre.dev" className="hover:text-slate-400 transition-colors">TrustCRE</a>
          <span>&middot;</span>
          <a href="https://hyperdag.org" className="hover:text-slate-400 transition-colors">HyperDAG.org</a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 font-mono">
          <span>Powered by HAL &middot; ERC-8004 &middot; Apache-2.0</span>
          <span>&middot;</span>
          <a href="https://github.com/DealAppSeo" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">github.com/DealAppSeo</a>
          <span>&middot;</span>
          <span className="italic">Micah 6:8</span>
        </div>
      </div>
    </footer>
  );
}
