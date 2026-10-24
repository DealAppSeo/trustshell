/**
 * The README opens on the credential-free inspector (`check <runUrl> --claims-file`); the hosted
 * sentence check follows it and says it leaves the machine. /start opens on the hosted check.
 *
 * README (2026-10-21): the front door is the V1 inspector, because its tester needs no account and
 * sends nothing to a TrustShell server. The recipe is run for real: the claim line it writes is
 * replayed here against a recorded green run and must come back SUPPORTED with exit 0, so the first
 * example a stranger copies cannot rot into a NOT_CHECKED.
 *
 * Hosted sample: npx @hyperdag/trustshell check "<SPEED_TRAP>" ran 1.6.0 (npm latest) on 2026-10-07 and
 * printed these three lines, exit 1. /start: the 1.5.0 run, two lines, exit 1. /start still opens on the
 * hosted check, a known gap, pinned here so whoever changes app/start/page.tsx has to choose on purpose.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPEED_TRAP } from '../lib/home-samples';
import { claimsExitCode, inspectRunClaims } from '../src/lib/action-evidence';

const ROOT = join(__dirname, '..');
const README_TITLE = 'Your AI says the job is done. TrustShell checks the evidence.';
const SENTENCE = 'Paste something an AI told you and see if it checks out.';
const COMMAND = `npx @hyperdag/trustshell check "${SPEED_TRAP}"`;
const OUTPUT = [
  'veto',
  'The classifier labelled this sentence veto — do not rely on it (755 ms).',
  'Groq and Cerebras both said false.',
].join('\n');
const START_OUTPUT = [
  'veto',
  'The classifier labelled this sentence veto — do not rely on it (356 ms).',
].join('\n');

function text(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
}

describe('README first screen', () => {
  const readme = text('README.md');
  const ALSO = '## Also: check one sentence an AI told you';
  const alsoAt = readme.indexOf(ALSO);
  const first = alsoAt === -1 ? readme : readme.slice(0, alsoAt);
  const FENCE = '`'.repeat(3);
  const bash = first.split(FENCE + 'bash\n')[1]?.split(FENCE)[0] ?? '';
  const powershell = first.split(FENCE + 'powershell\n')[1]?.split(FENCE)[0] ?? '';

  it('opens with the inspector, one recipe in bash and one in PowerShell, and no account or key', () => {
    expect(readme.startsWith(`# ${README_TITLE}\n`)).toBe(true);
    expect(alsoAt).toBeGreaterThan(0);
    expect(first).toMatch(/## Check your own CI run/);
    expect(bash).toContain('npx @hyperdag/trustshell@latest check "$RUN" --claims-file claims.txt');
    expect(powershell).toContain('npx @hyperdag/trustshell@latest check $run --claims-file claims.txt');
    expect(first).toMatch(/no account, no API key, no TrustShell server/);
    expect(bash).not.toMatch(/&&/);
    expect(powershell).not.toMatch(/&&/);
    expect(first).not.toContain(COMMAND);
    expect(first).not.toContain(OUTPUT);
    expect(first).not.toMatch(/E:\\TrustDisk/);
  });

  it('says what the exit codes are, that NOT_CHECKED never exits 0, and where a wrong SUPPORTED goes', () => {
    expect(first).toMatch(/`3` something was NOT_CHECKED\. NOT_CHECKED never exits `0`/);
    expect(first).toMatch(/Write plain sentences, one per paragraph/);
    expect(first).toContain('issues/new?template=wrong-verdict.yml');
    expect(first).toContain('CONTRIBUTING.md');
  });

  it('labels its sample card as an excerpt of one recorded run, with the date and version', () => {
    // Re-recorded on the published 1.8.0, 2026-10-23 (E:\dev\reports\2026-10-23\release-1.8.0\stranger-bash\vite.out).
    expect(first).toMatch(/An excerpt, recorded 2026-10-23 on 1\.8\.0 from npm against a finished public run/);
    expect(first).toContain('PLATFORM_REPORTED');
  });

  it('the claim line the recipe writes is SUPPORTED, exit 0, on a recorded green run', async () => {
    const fx = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/action-evidence/green-run.json'), 'utf8')) as {
      run_url: string;
      responses: Record<string, { status: number; body: unknown }>;
    };
    const runId = fx.run_url.split('/').pop() as string;
    const fmt = /printf '(.*)\\n' /.exec(bash)?.[1] ?? '';
    expect(fmt).toContain('%s');
    expect(powershell).toContain(fmt.replace('%s', '$($run.Split(\'/\')[-1])'));
    (globalThis as { fetch?: unknown }).fetch = async (url: string) => {
      const u = new URL(url);
      const r = fx.responses[u.pathname + u.search];
      if (u.host !== 'api.github.com' || !r) throw new Error(`unrecorded request: ${url}`);
      return { ok: r.status < 300, status: r.status, text: async () => JSON.stringify(r.body) };
    };
    try {
      const { record } = await inspectRunClaims(fx.run_url, fmt.replace('%s', runId) + '\n', { env: {} });
      expect(record.claims.map((c) => `${c.template}:${c.status}`)).toEqual(['gha.run_succeeded:SUPPORTED', 'gha.run_id:SUPPORTED']);
      expect(claimsExitCode(record)).toBe(0);
    } finally {
      delete (globalThis as { fetch?: unknown }).fetch;
    }
  });

  it('the hosted sentence check follows, says it leaves the machine, and keeps its measured sample', () => {
    const rest = readme.slice(alsoAt);
    const fold = rest.indexOf('![How a check works');
    expect(rest).toMatch(/so it leaves your machine/);
    expect(rest).toContain('```powershell\n' + COMMAND + '\n```');
    expect(rest).toContain(OUTPUT);
    expect(rest).not.toMatch(/&&/);
    expect(rest.slice(0, fold)).not.toMatch(/\b(Paris|Rome|Eiffel|Berlin)\b/);
    expect(fold).toBeGreaterThan(rest.indexOf(OUTPUT));
    expect(rest.slice(fold, fold + 400)).toMatch(/\]\(public\/how-a-check-works\.svg\)/);
  });
});

describe('the animated diagram under the first screen', () => {
  const svg = text('public/how-a-check-works.svg');

  it('is readable without animation: a title and a description a screen reader can say', () => {
    expect(svg).toMatch(/<title id="t">How a TrustShell check works<\/title>/);
    expect(svg).toMatch(/<desc id="d">[^<]{200,}<\/desc>/);
    expect(svg).toContain('aria-labelledby="t d"');
  });

  it('stops moving for anyone who asked for reduced motion', () => {
    expect(svg).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*animation: none/);
  });

  it('says the three stranger words and never that a miss passes', () => {
    for (const w of ['Checks out', 'Caught', 'Not checked']) expect(svg).toContain(w);
    expect(svg).toContain('A miss is never a pass.');
    // Nothing to run and nothing to fetch: the only URL is the SVG namespace itself.
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', '')).not.toMatch(/<script|javascript:|https?:\/\/|href=/);
  });
});

describe('/start still opens on the hosted check', () => {
  const page = text('app/start/page.tsx');

  it('shows the same sentence, the same command, and its own recorded run', () => {
    expect(page).toContain(SENTENCE);
    expect(page).toContain(COMMAND);
    expect(page).toContain(START_OUTPUT);
    expect(COMMAND).not.toMatch(/&&/);
    expect(page).not.toMatch(/Get a receipt/);
    expect(page).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
    expect(page).toContain("const QUESTION = 'Where do you already talk to AI?'");
  });
});
