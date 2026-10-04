/**
 * The publish workflow must test on the same Node as the merge gate.
 *
 * publish-sdk.yml ran Node 20 while check.yml ran 22. The local-memory commands use the built-in
 * `node:sqlite` (Node 22.5+) and answer NOT_CHECKED without it, so the suite that is green on every
 * PR failed inside the publish run (run 37235430913: 12 failures, all memory suites), and nothing
 * could be released. Two workflows that run the same tests must agree on the runtime.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function nodeVersion(file: string): string | null {
  const text = readFileSync(join(__dirname, '..', '.github', 'workflows', file), 'utf8');
  const m = text.match(/node-version:\s*['"]?([0-9.x]+)['"]?/);
  return m?.[1] ?? null;
}

describe('publish-sdk runs the tests on the merge gate\'s Node', () => {
  it('check.yml and publish-sdk.yml name the same node-version', () => {
    const gate = nodeVersion('check.yml');
    const publish = nodeVersion('publish-sdk.yml');
    expect(gate).not.toBeNull();
    expect(publish).toBe(gate);
  });
});
