/**
 * examples/external-agent: both cases are run as a stranger would run them, against the PUBLISHED
 * packages pinned in the example's own package.json (not this checkout's source).
 *
 * The example has its own node_modules. When it is missing (CI, a fresh clone) this installs it from
 * the example's lockfile with scripts off. That install is the only network use: run.mjs itself
 * refuses any request that is not to 127.0.0.1.
 *
 * What would make this fail: the stub's verdict not arriving as PASS, the output being withheld in the
 * default mode, a NOT_CHECKED turning into a pass or into exit 0, fail-closed handing the output over,
 * or a version range creeping into the example's package.json.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.setTimeout(300000);

const DIR = join(__dirname, '..', 'examples', 'external-agent');

/** The JSON objects run.mjs prints, in order (each starts at a line that is exactly "{"). */
function printed(stdout: string): any[] {
  return stdout
    .split(/^(?=\{$)/m)
    .filter((part) => part.startsWith('{'))
    .map((part) => JSON.parse(part.slice(0, part.lastIndexOf('}') + 1)));
}

function run(which: string) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of ['OFFLINE', 'TRUSTSHELL_LOCAL_ONLY', 'TRUSTSHELL_API_URL', 'REPID_API_KEY']) delete env[k];
  const r = spawnSync(process.execPath, ['run.mjs', which], { cwd: DIR, env, encoding: 'utf8' });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr, records: printed(r.stdout) };
}

beforeAll(() => {
  if (existsSync(join(DIR, 'node_modules', '@hyperdag', 'trustshell', 'package.json'))) return;
  const r = spawnSync('npm ci --ignore-scripts --no-audit --no-fund', { cwd: DIR, shell: true, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`npm ci failed in examples/external-agent:\n${r.stderr}`);
});

test('the example pins exact published versions', () => {
  const deps = JSON.parse(readFileSync(join(DIR, 'package.json'), 'utf8')).dependencies;
  expect(deps).toEqual({ '@hyperdag/trustshell': '1.9.3', 'eliza-as-promised': '0.0.2' });
});

test('supported: the external agent runs, the local stub says PASS, the output is released', () => {
  const r = run('supported');
  expect(r.exit).toBe(0);
  expect(r.records).toHaveLength(1);
  expect(r.records[0]).toMatchObject({
    verdict: 'PASS',
    checked: true,
    blocked: false,
    disposition: 'released',
    output: 'What would it mean to you if you got some help ?',
  });
  // The SDK says out loud that it is not talking to the default backend.
  expect(r.stderr).toMatch(/WARNING: TrustShell is using the backend http:\/\/127\.0\.0\.1:\d+/);
});

test('unavailable: NOT_CHECKED is not a pass; the default releases, fail-closed withholds, exit 3', () => {
  const r = run('unavailable');
  expect(r.exit).toBe(3);
  expect(r.records).toHaveLength(2);
  const [byDefault, failClosed] = r.records;
  expect(byDefault).toMatchObject({ verdict: 'NOT_CHECKED', checked: false, blocked: false, disposition: 'released' });
  expect(typeof byDefault.output).toBe('string');
  expect(failClosed).toMatchObject({ verdict: 'NOT_CHECKED', checked: false, blocked: true, disposition: 'withheld' });
  expect('output' in failClosed).toBe(false);
});
