/**
 * The public landing is one screen. Product nav and the measured leaks stay off it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { linksForLanding } from '../lib/landing-nav';

const ROOT = join(__dirname, '..');
const page = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');
const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
const source = `${page}\n${hero}`;

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
  'Wallet and stake',
  'HAL 2 answering',
  'registry addresses',
  'x402',
  '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  '0x8004B663056A597Dffe9eCcC1965A193B7388713',
];

describe('public landing source', () => {
  it('keeps the one screen and none of the measured leaks', () => {
    expect(hero).toContain('AI lies. Now it has to show its work.');
    expect(hero).toContain('Check any claim. Get a receipt. Your keys stay yours.');
    expect(hero).toContain('No signup. No wallet. Leave whenever you want.');
    expect(hero).toContain('npm i -g @hyperdag/trustshell@1.4.0');
    expect(hero).toContain('trustshell status');
    expect(hero).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
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
