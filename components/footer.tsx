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
    { name: 'Mission', href: '/mission', internal: true },
    { name: 'Glossary', href: '/glossary', internal: true },
    { name: 'TrustRepID.dev', href: 'https://trustrepid.dev' },
    { name: 'TrustChat.dev', href: 'https://trustchat.dev' },
    { name: 'HyperDAG Protocol', href: 'https://github.com/DealAppSeo/hyperdag-protocol' },
    { name: 'HyperDAG glossary', href: 'https://www.hyperdag.org/more' },
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
  community: [
    { name: 'Trust Commons', href: 'https://github.com/DealAppSeo/trust-commons' },
    { name: 'Shape the RepID formula', href: '/repid', internal: true },
    { name: 'What makes a good reputation?', href: '/earned-trust', internal: true },
  ],
};

export function Footer() {
  return (
    <footer className="px-4 py-16 md:py-20 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Mission line */}
        <div className="text-center">
          <p className="text-muted italic">
            &quot;Help people help people — the last, the lost, and the least.&quot;
          </p>
          <p className="text-sm text-muted/60 mt-1">Micah 6:8</p>
        </div>

        {/* Link grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Project</h3>
            <ul className="space-y-2">
              {footerLinks.project.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
                  >
                    {link.name}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Ecosystem</h3>
            <ul className="space-y-2">
              {footerLinks.ecosystem.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    target={link.internal ? undefined : '_blank'}
                    rel={link.internal ? undefined : 'noopener noreferrer'}
                    className="text-sm text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
                  >
                    {link.name}
                    {!link.internal && <ExternalLink className="w-3 h-3" />}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Standards</h3>
            <ul className="space-y-2">
              {footerLinks.standards.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
                  >
                    {link.name}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">On-chain</h3>
            <ul className="space-y-2">
              {footerLinks.onChain.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
                  >
                    {link.name}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Community</h3>
            <ul className="space-y-2">
              {footerLinks.community.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    target={link.internal ? undefined : '_blank'}
                    rel={link.internal ? undefined : 'noopener noreferrer'}
                    className="text-sm text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
                  >
                    {link.name}
                    {!link.internal && <ExternalLink className="w-3 h-3" />}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom line */}
        <div className="text-center">
          <p className="text-xs text-muted/60">
            &copy; 2026 HyperDAG. Built on ERC-8004 + x402. Apache 2.0 licensed.
          </p>
        </div>
      </div>
    </footer>
  );
}
