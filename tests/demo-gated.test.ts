/**
 * `trustshell demo` is weighed by the owner policy like any other spawning command — it is NOT exempt from the gate.
 *
 * Regression for the Strix CWE-693 finding on PR #679: `demo` was in NEVER_GUARDED, so an enforced deny-all policy
 * (and TRUSTSHELL_REQUIRE_POLICY with no policy) still let it spawn an interpreter, unaudited. Now it is gated as
 * tool:demo: refused under fail-closed settings, and still allowed on a no-policy first run (warn-and-allow).
 * inner() standing in for the real demo body: the point is whether the gate lets it start.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT_REFUSED, NEVER_GUARDED, runGuarded } from '../src/cli/guard';
import { defaultPolicy, POLICY_FILE, renderPolicyDocument, type LocalPolicy } from '../src/lib/guardrails';

describe('demo is gated by the owner policy, not exempt (CWE-693, #679)', () => {
  let home = '';
  const io = { out: () => undefined, err: () => undefined };
  const demoArgs = { command: 'demo' } as Parameters<typeof runGuarded>[0];
  const gate = (env: Record<string, string> = {}) => {
    let ran = 0;
    const r = runGuarded(demoArgs, async () => ((ran += 1), 0), io, { ...process.env, TRUSTSHELL_HOME: home, ...env });
    return r.then((code) => ({ code, ran }));
  };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ts-demo-gate-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it('demo is not in the never-guarded set', () => {
    expect(NEVER_GUARDED.has('demo')).toBe(false);
  });

  it('a deny-all owner policy refuses demo before it runs', async () => {
    writeFileSync(join(home, POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(), actions: [] } as LocalPolicy, signature: null }));
    expect(await gate()).toEqual({ code: EXIT_REFUSED, ran: 0 });
  });

  it('TRUSTSHELL_REQUIRE_POLICY with no policy refuses demo (fail closed)', async () => {
    expect(await gate({ TRUSTSHELL_REQUIRE_POLICY: '1' })).toEqual({ code: EXIT_REFUSED, ran: 0 });
  });

  it('with no policy (no-account first run, warn-and-allow) demo still runs', async () => {
    expect(await gate()).toEqual({ code: 0, ran: 1 });
  });
});
