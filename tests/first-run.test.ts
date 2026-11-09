import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COMMANDS, EXAMPLE_CHECK, EXAMPLE_DEMO, EXIT_MEANING, LAUNCHER, MCP_CONFIG, MCP_CONFIG_WINDOWS, RELEASE, RUNS, SENTENCES, STATUS_MEANING, STATUS_WORDS } from '../lib/first-run';
import { checkSentence, loadSavedRuns, parseSavedRun } from '../lib/first-run-check';
import { PATH_TWO_HOME, inspectCommand } from '../lib/trust-report-view';

const ROOT = join(__dirname, '..');
const saved = (file: string) => readFileSync(join(ROOT, 'public', file), 'utf8');
const observe = (file: string) => {
  const parsed = parseSavedRun(saved(file));
  if (!parsed.ok) throw new Error(`${file} is not a saved run`);
  return parsed.observation;
};

describe('the check on the page is the check in the CLI', () => {
  // Each shipped file is what `trustshell check --out` wrote, so its claims are the CLI's own verdicts.
  it.each([
    ['/examples/run-failed-record.json', 'The check workflow succeeded, run 42502305639.'],
    ['/examples/run-passed-record.json', 'The check workflow succeeded, run 39619591025.'],
  ])('%s: the page reaches the same claims, word for word', (file, sentence) => {
    const cli = JSON.parse(saved(file)).record.claims;
    expect(checkSentence(sentence, observe(file)).record.claims).toEqual(cli);
  });

  it('holds no local path of the machine that made the records', () => {
    for (const r of Object.values(RUNS)) expect(saved(r.file)).not.toMatch(/[A-Za-z]:\\\\|\/Users\/|\/home\//);
  });

  it('gives the three outcomes the page promises', () => {
    const run = (i: number) => {
      const s = SENTENCES[i]!;
      return checkSentence(s.text, observe(RUNS[s.run].file));
    };
    expect(run(0).tally.CONTRADICTED).toBe(1);
    expect(run(0).exit).toBe(1);
    expect(run(1).tally).toEqual({ SUPPORTED: 2, CONTRADICTED: 0, NOT_CHECKED: 0 });
    expect(run(1).exit).toBe(0);
    expect(run(2).record.claims.map((c) => c.status)).toEqual(['NOT_CHECKED']);
    expect(run(2).exit).toBe(3);
  });

  it('never turns words it cannot read into a pass', () => {
    const o = observe(RUNS.passed.file);
    for (const text of ['Looks great to me!', '**Done.**', 'The check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.']) {
      expect(checkSentence(text, o).exit).not.toBe(0);
    }
  });

  it('has a meaning for every exit code a check can give', () => {
    for (const s of SENTENCES) expect(EXIT_MEANING[checkSentence(s.text, observe(RUNS[s.run].file)).exit]).toBeTruthy();
  });

  it.each([
    ['not JSON', '{nope'],
    ['another JSON file', '{"a":1}'],
    ['a record with no observation', '{"record":{"schema":"dev.trustshell.action-evidence/0.1-draft"}}'],
  ])('refuses %s', (_name, text) => {
    expect(parseSavedRun(text).ok).toBe(false);
  });

  it('loads both runs, or neither', async () => {
    const respond = (ok: boolean, body: string) => ({ ok, text: async () => body }) as Response;
    const good = (async (u: string) => respond(true, saved(u))) as unknown as typeof fetch;
    expect(Object.keys((await loadSavedRuns(good))!)).toEqual(['failed', 'passed']);
    const oneMissing = (async (u: string) => (u === RUNS.passed.file ? respond(false, '') : respond(true, saved(u)))) as unknown as typeof fetch;
    expect(await loadSavedRuns(oneMissing)).toBeNull();
    const offline = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await loadSavedRuns(offline)).toBeNull();
  });
});

describe('the words the page shows', () => {
  it('explains every verdict word, and COMMAND_PASSED only as an exit code', () => {
    for (const w of STATUS_WORDS) expect(STATUS_MEANING[w].length).toBeGreaterThan(20);
    expect(STATUS_MEANING.COMMAND_PASSED).toContain('exited 0');
    expect(STATUS_MEANING.COMMAND_PASSED).toContain('all it shows');
    expect(STATUS_MEANING.NOT_CHECKED).toContain('never a pass');
  });

  it('prints the verdicts of the real record in its example', () => {
    for (const c of JSON.parse(saved(RUNS.failed.file)).record.claims) {
      expect(EXAMPLE_CHECK).toContain(`**${c.status}** \`${c.claim}\``);
      expect(EXAMPLE_CHECK).toContain(c.reason);
    }
    expect(EXAMPLE_DEMO).toContain('NOT_CHECKED');
  });
});

describe('the commands the page shows', () => {
  const shown = [...Object.values(COMMANDS).filter((c) => c.startsWith('npx')), inspectCommand(RUNS.failed.url, 'x', LAUNCHER)];

  it('pins every npx command and config to the release that was tested', () => {
    expect(LAUNCHER).toBe(`npx -y @hyperdag/trustshell@${RELEASE}`);
    for (const c of shown) expect(c.startsWith(`${LAUNCHER} `)).toBe(true);
    for (const c of [MCP_CONFIG, MCP_CONFIG_WINDOWS]) expect(c).toContain(`@hyperdag/trustshell@${RELEASE}`);
    expect(JSON.parse(MCP_CONFIG_WINDOWS).mcpServers.trustshell.command).toBe('cmd');
  });

  it('never starts npm or npx through trustshell run', () => {
    for (const c of [...Object.values(COMMANDS), inspectCommand(RUNS.failed.url, 'x', LAUNCHER)]) expect(c).not.toMatch(/trustshell run .*\bnp[mx]\b/);
  });

  it('uses the two setup lines the example guide documents', () => {
    const guide = readFileSync(join(ROOT, 'examples', 'own-agent', 'README.md'), 'utf8');
    expect(guide).toContain(PATH_TWO_HOME.bash);
    expect(guide).toContain(PATH_TWO_HOME.powershell);
  });
});

describe('the preview stays a preview', () => {
  const page = readFileSync(join(ROOT, 'app', 'lab', 'start', 'page.tsx'), 'utf8');

  it('is a 404 on production and not indexed', () => {
    expect(page).toContain("process.env.VERCEL_ENV === 'production') notFound()");
    expect(page).toContain('robots: { index: false, follow: false }');
    expect(page).toContain('Preview. This page is not live');
  });

  it('is linked from nowhere on the site', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mdx?)$/.test(n) ? [p] : [];
      });
    const linking = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'lib'))].filter((f) => readFileSync(f, 'utf8').includes('/lab/start'));
    expect(linking).toEqual([]);
  });
});
