/**
 * claims-deeper-pages.test.ts — the claims audit of 2026-10-22 (E:\dev\reports\2026-10-22\CLAIMS_CODE_AUDIT.md,
 * rows F3-F6, F12-F19) found sentences on the deeper pages and docs that the code does not do. Each was
 * narrowed to what is true. Every block below FAILS on the tree before the fix: it asserts the false
 * sentence is gone, the narrower one is there, and, where it is cheap, the fact the new sentence leans on.
 *
 * A green run proves the wording, not the world. The facts behind the wording were read in code or live
 * (GET only) on 2026-10-22; the PR body names each source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TERMS_BY_SLUG } from '../lib/glossary';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
const flat = (rel: string) => read(rel).replace(/\s+/g, ' ');

describe('F3 /earn-trust: x402 is the SDK refusing, with a caller-supplied policy', () => {
  const src = flat('app/earn-trust/page.tsx');
  it('no longer says a signed grant the account enforces', () => {
    expect(src).not.toMatch(/conditioned on a signed grant/);
    expect(src).not.toMatch(/the account itself is built to enforce/);
    expect(src).toContain('The policy is supplied by the calling code, not signed by the owner.');
  });
  it('the fact: the policy is a parameter of the call, and there is no payee, expiry or purpose check', () => {
    const guard = read('src/lib/guarded-payment.ts');
    expect(guard).toContain('policy: SpendPolicy | null | undefined;');
    expect(guard).not.toMatch(/payee|expiry|purpose/i);
  });
});

describe('F4 /earn-trust: nothing blocks a spend or a post on Not checked; earning more is roadmap', () => {
  const src = flat('app/earn-trust/page.tsx');
  it('drops "blocks a post or a spend" and the owner-signed ceiling', () => {
    expect(src).not.toMatch(/it blocks a post or a spend/);
    expect(src).not.toMatch(/inside a ceiling a person already signed/);
    expect(src).not.toMatch(/never raise the cap above what the owner signed/);
    expect(src).toContain('Nothing yet blocks a spend or a post on it.');
    expect(src).toContain('Widening what an agent may do from its record is roadmap.');
  });
});

describe('F5 /earn-trust: the harness is designed to carry, and today memory stays on one machine', () => {
  const src = flat('app/earn-trust/page.tsx');
  it('drops the shipped-harness and stop-everything claims', () => {
    expect(src).not.toMatch(/a harness that carries memory/);
    expect(src).not.toMatch(/the owner can stop everything under a grant at once/);
    expect(src).not.toMatch(/the check, the harness, the kernel/);
    expect(src).toContain('Today memory stays on one machine; carrying it to another machine is on main, unreleased.');
    expect(src).toContain('nothing blocks a tool on it yet');
  });
  it('the fact: a belt grant says of itself that it is not yet a gate', () => {
    expect(flat('lib/belt-grant.ts')).toContain('What a belt grant is NOT yet: a gate.');
  });
});

describe('F6 RepID is the engine score, written as ERC-8004 feedback on Base Sepolia', () => {
  it('/earn-trust drops "anchored on-chain so it belongs to the agent" and "portable because"', () => {
    const src = flat('app/earn-trust/page.tsx');
    expect(src).not.toMatch(/anchored on-chain so it belongs to the agent/);
    expect(src).not.toMatch(/portable because it is anchored/);
    expect(src).toContain('the engine writes it as ERC-8004 feedback on Base Sepolia testnet');
  });
  it('/repid drops "formula is public, weights versioned", "cannot be self-declared", "every line auditable"', () => {
    const src = flat('app/repid/page.tsx');
    expect(src).not.toMatch(/The formula is public\. The weights are versioned\./);
    expect(src).not.toMatch(/The weights are versioned and public/);
    expect(src).not.toMatch(/cannot be assigned, bought, or self-declared/);
    expect(src).not.toMatch(/signed attestations of work/);
    expect(src).not.toMatch(/simulate it on your own corpus/);
    expect(src).not.toMatch(/every line auditable/);
    expect(src).not.toMatch(/survives moving between them/);
    expect(src).toContain('The shape of the formula and the fixed deltas are public. The tuned constants are not.');
    expect(src).toContain('the reference is not yet verified');
    expect(src).toContain('prediction 0 since 2026-10-19');
  });
  it('/vision and /trust-harness drop "portable score" and "published, open by design"', () => {
    expect(flat('app/vision/page.tsx')).not.toMatch(/a portable score for how an agent/);
    const th = flat('app/trust-harness/page.tsx');
    expect(th).not.toMatch(/published, open by design/);
    expect(th).not.toMatch(/everything under that grant stops at once/);
    expect(th).toContain('the tier thresholds and the restore cadence are not published');
  });
});

describe('F7 /vision: two model families, not "independent" ones (both deciders ran on Groq)', () => {
  it('drops "independent model families"', () => {
    const src = flat('app/vision/page.tsx');
    expect(src).not.toMatch(/independent model families/);
    expect(src).toContain('they can run on the same host');
  });
  it('the fact: the recorded hero run had both deciders on groq', () => {
    expect(read('docs/measurements/hero-card-2026-10-16.md')).toContain('"deciders":["groq","groq"]');
  });
});

describe('F12 the RepID proof carries the score as a public input', () => {
  it('/create and CREATE_PAI drop "without revealing" and "no score leaked"', () => {
    expect(flat('app/create/page.tsx')).not.toMatch(/without revealing the number/);
    expect(flat('app/create/page.tsx')).toContain('the proof&apos;s public inputs include the score');
    const doc = flat('docs/CREATE_PAI.md');
    expect(doc).not.toMatch(/without revealing the score/);
    expect(doc).not.toMatch(/no score leaked/);
    expect(doc).not.toMatch(/without doxxing my score/);
    expect(doc).toContain('also carries the exact score');
  });
  it('the fact: the CLI says so in its own badge help', () => {
    expect(flat('src/cli/index.ts')).toContain("the proof's statement still carries it as a public input");
  });
});

describe('F13 /stake, /chess, /market say what moves and what is counted', () => {
  it('/stake: a plain transfer of test USDC, no escrow, not "real USDC"', () => {
    const src = flat('app/stake/page.tsx');
    expect(src).not.toMatch(/Escrow USDC to back/);
    expect(src).not.toMatch(/Send a real USDC stake/);
    expect(src).not.toMatch(/\} real USDC`/);
    expect(src).not.toMatch(/no wallet needed for practice/);
    expect(src).not.toMatch(/It still credits authority/);
    expect(src).toContain('There is no escrow contract, and the funds are not locked.');
    expect(flat('lib/stake-onchain.ts')).toContain('`USDC.transfer(sessionAddress, amount)`');
  });
  it('/chess: nothing records a wager, and a built-in engine plays', () => {
    for (const f of ['app/chess/page.tsx', 'app/chess/layout.tsx']) {
      expect(flat(f)).not.toMatch(/wager is recorded/);
      expect(flat(f)).toContain('it is not recorded and not sent');
    }
    expect(flat('app/chess/page.tsx')).not.toMatch(/Two agents play a game/);
  });
  it('/market: rows are listings, counted apart from agents', () => {
    const src = flat('app/market/page.tsx');
    expect(src).not.toMatch(/\$\{totalProviders\} providers/);
    expect(src).toContain('listings from ${agents} agents');
    expect(src).toContain('.map((r) => r.provider_agent_id)');
  });
});

describe('F14 /leaderboard: fleet standings, no "Scored today" from the request time', () => {
  const src = flat('app/leaderboard/page.tsx');
  it('drops "earn reputation by predicting well" and the request-time freshness', () => {
    expect(src).not.toMatch(/earn reputation by predicting well/);
    expect(src).not.toMatch(/board === 'agents' \? agents\?\.last_updated/);
    expect(src).toContain('Prediction scoring is shadow-only.');
    expect(flat('app/leaderboard/layout.tsx')).not.toMatch(/Live model and agent trust standings/);
  });
});

describe('F15 glossary statuses match what runs', () => {
  it('Stake is not shipped and does not raise spend', () => {
    expect(TERMS_BY_SLUG['stake']?.status).not.toBe('shipped');
    expect(TERMS_BY_SLUG['stake']?.definition).toContain('does not raise what an agent may spend');
  });
  it('PAI is an interview and a router, not an agent that files the work', () => {
    expect(TERMS_BY_SLUG['pai']?.definition).not.toMatch(/files the work, runs the checks/);
  });
  it('Cascade is engine-side and not "exactly once"', () => {
    expect(TERMS_BY_SLUG['cascade']?.status).not.toBe('shipped');
    expect(TERMS_BY_SLUG['cascade']?.definition).not.toMatch(/exactly once/);
  });
  it('Quarantine ships in the latest npm release (the note may carry no digit: glossary-defs)', () => {
    expect(TERMS_BY_SLUG['quarantine']?.note).not.toMatch(/not yet in a published release/);
    expect(TERMS_BY_SLUG['quarantine']?.note).toContain('ships in the current `latest` npm release');
  });
});

describe('F16 getting-started and api-reference match the package', () => {
  it('Node is 22.13+, as package.json engines says', () => {
    const doc = flat('docs/getting-started.md');
    expect(doc).not.toMatch(/`>=18\.0\.0`/);
    const engines = JSON.parse(read('package.json')).engines.node as string;
    expect(doc).toContain(`\`${engines}\``);
  });
  it('REPID_API_KEY: receipt needs it', () => {
    const doc = flat('docs/getting-started.md');
    expect(doc).not.toMatch(/No CLI command or MCP tool needs it/);
    expect(doc).toContain('Only `receipt` (and the MCP `kernel_receipt` tool) needs it.');
    expect(flat('src/cli/index.ts')).toContain('Needs REPID_API_KEY');
  });
  it('api-reference: some commands DO exit 0 on NOT_CHECKED; not a 1.7.0-only page', () => {
    const doc = flat('docs/api-reference.md');
    expect(doc).not.toMatch(/No command exits `0` on NOT CHECKED/);
    expect(doc).not.toMatch(/are the only commands that write to your working directory/);
    expect(doc).not.toMatch(/Reflects the published `@hyperdag\/trustshell` v1\.7\.0 surface/);
    expect(doc).toContain('`traps`, `recall <key>` and `redact <key>` print `NOT_CHECKED` and exit `0`');
  });
});

describe('F17 /settings: HAL scores agent-key prompts; it is not an objective benchmark', () => {
  it('drops "objectively measure trustworthiness"', () => {
    const src = flat('app/settings/page.tsx');
    expect(src).not.toMatch(/objectively measure trustworthiness/);
    expect(src).not.toMatch(/Every prompt and answer is scored by the HAL Benchmark/);
    expect(src).toContain('Prompts run with an agent key are scored by HAL');
  });
});

describe('F18 /bind and /demo: two or three wallet prompts plus the agent key; the agent pays, it does not trade', () => {
  it('drops "Sign once", "a wallet and nothing else", "buy and sell", "the only one that needs a wallet"', () => {
    for (const f of ['app/bind/page.tsx', 'app/demo/page.tsx']) {
      expect(flat(f)).not.toMatch(/Sign once to prove/);
      expect(flat(f)).toContain('Your wallet asks to sign twice (three times for a new account)');
    }
    expect(flat('app/bind/page.tsx')).not.toMatch(/It asks for a wallet and nothing else/);
    const demo = flat('app/demo/page.tsx');
    expect(demo).not.toMatch(/buy and sell/);
    expect(demo).not.toMatch(/which is the only one that needs a wallet/);
    expect(demo).not.toMatch(/Escrow testnet USDC/);
    expect(flat('components/bind/claim-panel.tsx')).toContain('Your wallet will ask twice');
  });
});

describe('F19 staking docs: test network only, not "not live"', () => {
  it.each(['docs/JOIN_KIT.md', 'docs/HUMAN_TESTNET.md', 'docs/FIRST_PASS.md', 'docs/TRUSTKEYS_SHAPE.md'])('%s', (f) => {
    const doc = flat(f);
    expect(doc).not.toMatch(/Staking is not live/);
    expect(doc).toContain('Staking is on the Base Sepolia test network only. No mainnet or real-money stake.');
  });
});
