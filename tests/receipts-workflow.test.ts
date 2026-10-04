/**
 * The receipts workflow must not cancel the PR's own receipt run.
 *
 * Every PR used to show `receipt: cancelled` and read `unstable`. The pull_request run waits up to
 * 10 minutes for the other checks, so it was still running when `check` finished; that finish
 * started the workflow_run refresh, which shared the PR run's concurrency group with
 * cancel-in-progress and cancelled it. The refresh ran against the default branch's commit, so its
 * success never showed on the PR (measured on trustshell #441: both receipt runs on fd2e97e
 * cancelled).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const wf = readFileSync(join(__dirname, '..', '.github', 'workflows', 'receipts.yml'), 'utf8');

function block(name: string): string {
  const start = wf.search(new RegExp(`^${name}:`, 'm'));
  if (start < 0) return '';
  const rest = wf.slice(start);
  const body = rest.indexOf('\n') + 1; // the block's lines start after the key's own line
  const next = rest.slice(body).search(/^\S/m);
  return next < 0 ? rest : rest.slice(0, body + next);
}

describe('receipts workflow concurrency', () => {
  const concurrency = block('concurrency');

  it('keeps the refresh and the PR run in different groups', () => {
    expect(concurrency).toMatch(/group:\s*receipts-\$\{\{\s*github\.event_name\s*\}\}-/);
  });

  it('cancels an in-progress run only for a refresh or a new commit, never a same-commit edit', () => {
    const line = concurrency.split('\n').find((l) => l.includes('cancel-in-progress')) ?? '';
    expect(line).not.toMatch(/cancel-in-progress:\s*true\s*$/);
    expect(line).toContain("github.event_name == 'workflow_run'");
    expect(line).toContain("github.event.action == 'synchronize'");
  });
});

describe('the refresh steps aside while the PR run is going', () => {
  it('asks the Actions API for unfinished pull_request runs on the same commit', () => {
    expect(block('permissions')).toMatch(/actions:\s*read/);
    expect(wf).toMatch(/id:\s*busy\n\s*if:\s*github\.event_name == 'workflow_run'/);
    expect(wf).toContain('runs?event=pull_request&head_sha=$HEAD_SHA');
    expect(wf).toContain('select(.status != "completed")');
  });

  it('gates the checkout and the action on it', () => {
    expect(wf).toMatch(/- if: steps\.busy\.outputs\.busy != 'true'\n\s*uses: actions\/checkout@v4/);
    expect(wf).toMatch(/- if: steps\.busy\.outputs\.busy != 'true' && hashFiles\('receipts\/action\.yml'\) != ''\n\s*uses: \.\/receipts/);
  });
});
