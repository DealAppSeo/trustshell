/**
 * The builder trap set. Each statement is one that was actually sent, not a paraphrase of the
 * abridged table: the home page's cards, the three samples the 2026-10-05 home page carried (kept
 * here as Not checked examples for builders), and the two headline sentences the assumption tests
 * pin (Monty Hall "always switch", Tuesday boy 13/27). Expected labels are the stranger words.
 * The script compares a classify body to that label and names a row only when both checkers
 * agreed on a different pass or veto.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HOME_SAMPLES } from '../lib/home-samples';

const ROOT = join(__dirname, '..');
const SWITCH =
  'After you pick a door and the host opens another door showing a goat, you should always switch.';
const TUESDAY =
  'If a parent has two children and at least one is a boy born on a Tuesday, the probability that both are boys is 13/27.';

type Row = { statement: string; expected: string };

/** Measured on the 2026-10-05 home page and kept for builders when the cards replaced them. */
const KEPT = [
  'Three guests paid $9 each, $27 in total, and the bellhop kept $2, so one dollar of the original $30 is missing.',
  'If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 40 mph.',
  'Pizza is the best food.',
];

function rows(): Row[] {
  const text = readFileSync(join(ROOT, 'examples/traps/traps.jsonl'), 'utf8').replace(/\r/g, '');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Row);
}

function expectedFor(sample: (typeof HOME_SAMPLES)[number]): string {
  if (sample.why?.when === 'veto') return 'Caught';
  if (sample.why?.when === 'pass') return 'Checks out';
  return 'Not checked';
}

function runScript(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ['scripts/traps.mjs', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('examples/traps/traps.jsonl', () => {
  it('opens on the two headline rows, both expected Not checked', () => {
    const all = rows();
    expect(all[0]).toEqual({ statement: SWITCH, expected: 'Not checked' });
    expect(all[1]).toEqual({ statement: TUESDAY, expected: 'Not checked' });
  });

  it('carries each measured home sample with the label from that table', () => {
    const byText = new Map(rows().map((row) => [row.statement, row.expected]));
    for (const sample of HOME_SAMPLES) {
      expect(byText.get(sample.text)).toBe(expectedFor(sample));
    }
  });

  it('uses only the three stranger labels, once each statement', () => {
    const seen = new Set<string>();
    for (const row of rows()) {
      expect(['Checks out', 'Caught', 'Not checked']).toContain(row.expected);
      expect(row.statement.length).toBeGreaterThan(10);
      expect(seen.has(row.statement)).toBe(false);
      seen.add(row.statement);
    }
    expect(seen.size).toBe(HOME_SAMPLES.length + KEPT.length + 2);
    for (const statement of KEPT) expect(seen.has(statement)).toBe(true);
  });
});

describe('scripts/traps.mjs', () => {
  const bothPass = { label: 'pass', by: 'votes', voters: ['groq', 'cerebras'] };
  const bothVeto = { label: 'veto', by: 'votes', voters: ['groq', 'cerebras'] };

  function replay(fileRows: Row[], bodies: unknown[]): { status: number | null; stdout: string } {
    const dir = mkdtempSync(join(tmpdir(), 'traps-'));
    const file = join(dir, 'rows.jsonl');
    const responses = join(dir, 'bodies.jsonl');
    writeFileSync(file, fileRows.map((row) => JSON.stringify(row)).join('\n') + '\n');
    writeFileSync(responses, bodies.map((body) => JSON.stringify(body)).join('\n') + '\n');
    return runScript(['--file', file, '--replay', responses]);
  }

  it('names a row only when both checkers agreed on the wrong pass or veto', () => {
    const fileRows: Row[] = [
      { statement: SWITCH, expected: 'Not checked' },
      { statement: 'A true average.', expected: 'Checks out' },
      { statement: 'One voter did not parse.', expected: 'Caught' },
      { statement: 'Exact arithmetic, no model.', expected: 'Checks out' },
    ];
    const out = replay(fileRows, [
      bothPass,
      bothVeto,
      { label: 'not-checked', by: 'votes', voters: ['groq'] },
      { label: 'veto', by: 'arithmetic' },
    ]);
    expect(out.status).toBe(1);
    expect(out.stdout).toContain('both checkers agreed on the wrong answer: 2');
    expect(out.stdout).toContain(SWITCH);
    expect(out.stdout).toContain('expected Not checked, got pass, voters groq, cerebras');
    expect(out.stdout).toContain('A true average.');
    expect(out.stdout).toContain('expected Checks out, got veto, voters groq, cerebras');
    expect(out.stdout).not.toContain('One voter did not parse.');
    expect(out.stdout).not.toContain('Exact arithmetic');
  });

  it('exits 0 when both checkers agreed on the expected label', () => {
    const out = replay([{ statement: 'Matched.', expected: 'Caught' }], [bothVeto]);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('both checkers agreed on the wrong answer: 0');
    expect(out.stdout).not.toContain('Matched.');
  });

  it('paces a live run at 15 seconds between calls, and a replay does not wait', () => {
    const probe = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { PACE_MS, runRows } from './scripts/traps.mjs';
         const sleeps = [];
         await runRows(
           [{ statement: 'a', expected: 'Not checked' }, { statement: 'b', expected: 'Caught' }],
           { paceMs: PACE_MS, sleep: async (ms) => { sleeps.push(ms); }, post: async () => ({ label: 'pass', by: 'votes', voters: ['groq', 'cerebras'] }) },
         );
         console.log(JSON.stringify({ pace: PACE_MS, sleeps }));`,
      ],
      { cwd: ROOT, encoding: 'utf8', timeout: 5000 },
    );
    expect(probe.status).toBe(0);
    expect(JSON.parse(probe.stdout)).toEqual({ pace: 15000, sleeps: [15000] });
  });

  it('posts the statement to /api/v1/classify and honours TRUSTSHELL_API_URL', () => {
    const probe = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { classifyRequest } from './scripts/traps.mjs';
         const req = classifyRequest('A sentence.', {});
         const over = classifyRequest('A sentence.', { TRUSTSHELL_API_URL: 'http://127.0.0.1:9/' });
         console.log(JSON.stringify({ req, over }));`,
      ],
      { cwd: ROOT, encoding: 'utf8', timeout: 5000 },
    );
    expect(probe.status).toBe(0);
    const parsed = JSON.parse(probe.stdout) as {
      req: { url: string; body: { text: string; labels: string[] } };
      over: { url: string };
    };
    expect(parsed.req.url).toBe('https://repid-engine-production.up.railway.app/api/v1/classify');
    expect(parsed.req.body).toEqual({ text: 'A sentence.', labels: ['pass', 'veto', 'not-checked'] });
    expect(parsed.over.url).toBe('http://127.0.0.1:9/api/v1/classify');
  });

  it('a replay that is not a classify body exits 2', () => {
    const out = replay([{ statement: 'Broken body.', expected: 'Caught' }], ['not-json-wait']);
    // 'not-json-wait' is valid JSON (a string). The body is not an object answer.
    expect(out.status).toBe(2);
    expect(out.stdout).toContain('NOT_CHECKED');
  });
});
