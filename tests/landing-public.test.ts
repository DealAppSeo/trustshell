/**
 * The public landing is one screen. Product nav and the measured leaks stay off it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { linksForLanding } from '../lib/landing-nav';

const ROOT = join(__dirname, '..');
const page = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');
const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
// Screen 3 carries the install steps since the 2026-10-05 home page (the hero keeps the fear and the check).
const agentScreen = readFileSync(join(ROOT, 'components/home-agent.tsx'), 'utf8');
const source = `${page}\n${hero}\n${agentScreen}`;

/** The home page's two check samples, removed so a city named anywhere else still fails. */
function withoutSamples(text: string): string {
  return text.split('The Eiffel Tower is in Berlin.').join('').split('Paris is the capital of France.').join('');
}

const BANNED = [
  'TrustRepID',
  'TrustChat',
  'HyperDAG Protocol',
  'ERC-8004',
  'Get early access',
  'Add me',
  'Demo file is not in the repo',
  'E:\\TrustDisk',
  'Loading live scores',
  'stake now',
  'every transaction earns RepID',
  'Wallet and stake',
  'HAL 2 answering',
  'registry addresses',
  'x402',
  '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  '0x8004B663056A597Dffe9eCcC1965A193B7388713',
];

describe('public landing source', () => {
  it('keeps the one screen and none of the measured leaks', () => {
    expect(hero).toContain('AI lies.');
    expect(hero).toContain('Now it has to answer to other models, so the truth comes out.');
    expect(hero).toContain('No signup. No wallet. Leave whenever you want.');
    expect(agentScreen).toContain('npm i -g @hyperdag/trustshell@1.6.0');
    expect(source).not.toContain('trustshell status');
    // The two check samples are the only sentences that may name a city, and only as a sample.
    expect(withoutSamples(hero)).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
    expect(page).toContain('<Hero');
    expect(page).not.toMatch(/AfterAgent|Footer|Ecosystem|LiveTrustScores|LiveOnChain|StatusStrip|RoadmapV15|BuilderWaitlist|LandingClose/);
    for (const banned of BANNED) {
      expect(source).not.toContain(banned);
    }
    expect(
      linksForLanding('/', [
        { href: 'https://trustrepid.dev', label: 'TrustRepID' },
        { href: 'https://trustchat.dev', label: 'TrustChat' },
        { href: 'https://github.com/DealAppSeo/hyperdag-protocol', label: 'HyperDAG Protocol' },
        { href: 'https://eips.ethereum.org/EIPS/eip-8004', label: 'ERC-8004' },
        { href: '/stake', label: 'Stake' },
      ]),
    ).toEqual([]);
  });
});
