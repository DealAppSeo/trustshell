/**
 * release-hold: the #696 replay, and the cases that must NOT hold.
 *
 * Production change that would make this fail: dropping a hold rule from scripts/ci/release-hold.cjs,
 * mapping NOT_CHECKED to exit 0, or pointing the workflow at the PR's code instead of the base commit's.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { decide, main } = require('../scripts/ci/release-hold.cjs');
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'release-hold', 'pr696.json');
const pr696 = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const clean = (over: object = {}) => ({ number: 1, title: 'fix: a thing', body: 'It fixes the thing.', draft: false, head: { sha: 'abc' }, labels: [], ...over });

describe('release-hold', () => {
  it('replays #696 at its merged head commit: HOLD, for three reasons', () => {
    const pr = pr696();
    expect(pr.head.sha).toBe('22dee78eccdc2c4dd7e90a846091f1a975980d9f');
    expect(pr.draft).toBe(false); // the state it merged in
    const d = decide(pr);
    expect(d.decision).toBe('HOLD');
    expect(d.reasons).toEqual([
      'the title says: do not merge',
      'the body says: Do not merge',
      'CONTRADICTED: the body says the PR is a draft; GitHub says it is not',
    ]);
  });

  it('the same PR with its hold words and draft claim removed is READY (the instrument can say both)', () => {
    const pr = pr696();
    pr.title = pr.title.replace(/\s*\(do not merge\)/i, '');
    pr.body = pr.body.replace(/Do not merge\./i, '').replace(/the PR is a draft/i, 'it is a proof');
    expect(decide(pr)).toEqual({ decision: 'READY', reasons: [] });
  });

  it('an ordinary PR is READY', () => {
    expect(decide(clean()).decision).toBe('READY');
  });

  it('a mention in code or quotes is not a hold', () => {
    const body = 'The gate now reads `do not merge`. #696 said "the PR is a draft" and "do not merge".\n```\nWIP\n```';
    expect(decide(clean({ body })).decision).toBe('READY');
  });

  it.each([
    [{ draft: true }, 'the PR is a draft'],
    [{ title: 'WIP: a thing' }, 'the title says: WIP'],
    [{ labels: [{ name: 'do-not-merge' }] }, 'label: do-not-merge'],
    [{ body: "Don't merge until Friday." }, "the body says: Don't merge"],
  ])('holds on %j', (over, reason) => {
    expect(decide(clean(over))).toEqual({ decision: 'HOLD', reasons: [reason] });
  });

  it('an honest draft that says it is a draft holds once, without a contradiction', () => {
    expect(decide(clean({ draft: true, body: 'This PR is a draft.' })).reasons).toEqual(['the PR is a draft']);
  });

  it('an unreadable event is NOT_CHECKED and never exits 0', () => {
    expect(decide(null).decision).toBe('NOT_CHECKED');
    expect(decide({ title: 'x' }).decision).toBe('NOT_CHECKED');
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(['node', 'x', join(ROOT, 'no-such-file.json')], {})).toBe(3);
    expect(main(['node', 'x', FIXTURE], {})).toBe(1);
    log.mockRestore();
  });

  it('the workflow judges with the base commit and re-runs when a hold is added later', () => {
    const yml = readFileSync(join(ROOT, '.github', 'workflows', 'release-hold.yml'), 'utf8');
    expect(yml).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    for (const t of ['edited', 'labeled', 'converted_to_draft', 'synchronize']) expect(yml).toContain(t);
    expect(yml).not.toMatch(/\|\|\s*true|continue-on-error/); // exit 1 and 3 must reach the check
  });
});
