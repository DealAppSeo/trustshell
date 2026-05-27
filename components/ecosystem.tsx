import { ExternalLink } from 'lucide-react';

const ecosystem = [
  {
    name: 'TrustShell',
    description: 'The drop-in trust SDK. You are here.',
    href: '#',
    current: true,
  },
  {
    name: 'TrustRepID',
    description: 'Live agent reputation leaderboard.',
    href: 'https://trustrepid.dev',
  },
  {
    name: 'TrustChat',
    description: 'Consumer-facing demo of the trust pipeline.',
    href: 'https://trustchat.dev',
  },
  {
    name: 'HyperDAG Protocol',
    description: 'The protocol spec and reference implementation.',
    href: 'https://github.com/DealAppSeo/hyperdag-protocol',
  },
  {
    name: 'ERC-8004',
    description: 'The Ethereum standard we implement.',
    href: 'https://eips.ethereum.org/EIPS/eip-8004',
  },
];

export function Ecosystem() {
  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-8">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground">
          Part of the HyperDAG ecosystem.
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {ecosystem.map((item) => (
            <a
              key={item.name}
              href={item.href}
              target={item.current ? undefined : '_blank'}
              rel={item.current ? undefined : 'noopener noreferrer'}
              className={`p-4 rounded-xl border transition-colors ${
                item.current
                  ? 'border-accent bg-accent/5 hover:bg-accent/10'
                  : 'border-border bg-card hover:border-muted'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-foreground">{item.name}</h3>
                {!item.current && <ExternalLink className="w-4 h-4 text-muted" />}
              </div>
              <p className="text-sm text-muted">{item.description}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
