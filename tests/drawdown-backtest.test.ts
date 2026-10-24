/**
 * Loop sprint 6 (claims-vs-code, 2026-10-23): scripts/drawdown-backtest.mjs.
 *
 * The figure "0% drawdown with the veto vs 49.63% without" had no source. This pins the replacement
 * measurement so it cannot quietly rot into another one:
 *   - the pinned price files still hash to what MANIFEST.json says (and a flipped byte is REFUSED,
 *     so the check can say no);
 *   - the JS port of the veto engine gives the same answers as the Python original on 113 vectors
 *     (fixtures/veto-engine-vectors.json, produced by running trinity-science/veto_engine.py);
 *   - results.json is byte-for-byte what the pinned data plus this script produce (`run --check`);
 *   - the headline facts the report states are asserted, each next to a control that CAN give the
 *     other answer: the as-written arm never trades, and a configuration that does trade is in the
 *     market on every day.
 *
 * The module is ESM, jest here is CommonJS, so each check runs the real module in a child `node`
 * through tests/helpers/esm-call.mjs: JSON in, JSON out, no source built from strings.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

jest.setTimeout(60000);

const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'drawdown-backtest.mjs');
const DATA = join(ROOT, 'docs', 'measurements', 'drawdown-backtest-2026-10-23');
const VECTORS = join(ROOT, 'fixtures', 'veto-engine-vectors.json');

const RUNNER = join(ROOT, 'tests', 'helpers', 'esm-call.mjs');

/**
 * Call an export of the ES module once per argument list, in a child `node`. The request goes in as
 * JSON on stdin and the answers come back as JSON: no JavaScript source is assembled from strings.
 */
function call(fn: string, calls: unknown[][]): { value?: any; error?: string }[] {
  const r = spawnSync(process.execPath, [RUNNER], { input: JSON.stringify({ module: SCRIPT, fn, calls }), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`node exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const results = JSON.parse(readFileSync(join(DATA, 'results.json'), 'utf8'));

describe('drawdown backtest: the ruler', () => {
  it('the pinned files hash to the manifest, and a flipped byte is refused', () => {
    expect(call('verifyPinned', [[]])[0].error).toBeUndefined();
    const dir = mkdtempSync(join(tmpdir(), 'ts-dd-'));
    try {
      cpSync(DATA, dir, { recursive: true });
      const f = join(dir, 'btc-usd-daily.json');
      const bytes = readFileSync(f);
      bytes[bytes.length - 3] = bytes[bytes.length - 3] === 0x31 ? 0x32 : 0x31; // change one digit
      writeFileSync(f, bytes);
      // The same call that just succeeded, pointed at the altered copy, must now refuse.
      expect(call('verifyPinned', [[dir]])[0].error).toContain('NOT_CHECKED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('results.json is exactly what the pinned data and the script produce (run --check, offline)', () => {
    const r = spawnSync(process.execPath, [SCRIPT, 'run', '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('# Drawdown backtest, four named events');
  });

  it('results.json names the script and the inputs it was made from', () => {
    const manifest = JSON.parse(readFileSync(join(DATA, 'MANIFEST.json'), 'utf8'));
    expect(results.inputSha256['btc-usd-daily.json']).toBe(manifest.files[0].sha256);
    expect(results.inputSha256['fear-greed.json']).toBe(manifest.files[1].sha256);
    expect(results.scriptSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(results.ruler.data.bars).toBe(1919);
  });
});

describe('drawdown backtest: the port matches the Python original', () => {
  const fixture = JSON.parse(readFileSync(VECTORS, 'utf8')) as {
    vectors: { signals: Record<string, number>; repid: number; profile: string; veto: boolean; execute: boolean; unity: number; dissonance: number }[];
  };

  it('113 vectors agree on veto, execute, unity (4 dp) and dissonance (6 dp); the exactly-aligned corner is bounded', () => {
    expect(fixture.vectors.length).toBeGreaterThanOrEqual(100);
    const veto = call('computeVeto', fixture.vectors.map((v) => [v.signals, v.repid, v.profile]));
    const notes = call('notesOf', fixture.vectors.map((v) => [v.signals]));
    const got = fixture.vectors.map((_, i) => {
      const r = veto[i].value;
      return {
        aligned: new Set(notes[i].value as number[]).size === 1,
        veto: r.veto as boolean,
        execute: r.execute as boolean,
        unity: Math.round(r.unity * 1e4) / 1e4,
        dissonance: Math.round(r.dissonance * 1e6) / 1e6,
      };
    });
    const pairs = fixture.vectors.map((v, i) => ({ v, g: got[i] }));
    // Everywhere the notes are not all the same, the port matches the Python to the digits it prints.
    const wrong = pairs.filter(({ v, g }) => !g.aligned && (g.veto !== v.veto || g.execute !== v.execute || Math.abs(g.unity - v.unity) > 1e-4 || Math.abs(g.dissonance - v.dissonance) > 1e-6));
    expect(wrong).toEqual([]);
    // When every signal lands on one note the phasors line up exactly and float noise decides between
    // dissonance 0.053846 and 0.060990 (see computeVeto's note). The DECISION must still agree.
    const aligned = pairs.filter(({ g }) => g.aligned);
    expect(aligned.length).toBeGreaterThan(0);
    for (const { v, g } of aligned) {
      expect(g.veto).toBe(v.veto);
      expect(g.execute).toBe(v.execute);
      expect(Math.abs(g.dissonance - v.dissonance)).toBeLessThan(0.0075);
    }
    // The vectors include both vetoed and not-vetoed cases, so agreement is not agreement on one answer.
    expect(fixture.vectors.some((v) => v.veto)).toBe(true);
    expect(fixture.vectors.some((v) => !v.veto)).toBe(true);
    // No pinned day is in the corner, so the report's numbers do not depend on it.
    expect(results.dissonance.alignedDays).toBe(0);
  });

  it('rounds halves to even like numpy (JS Math.round would send them up)', () => {
    const got = call('roundHalfEven', [[0.5], [1.5], [2.5], [3.5], [6.5], [7.5]]).map((x) => x.value);
    expect(got).toEqual([0, 2, 2, 4, 6, 8]);
  });
});

describe('drawdown backtest: what the report says is what the data shows', () => {
  const asWritten = results.configs.find((c: any) => c.id === 'as-written');
  const trades = results.configs.find((c: any) => c.id === 'nogate-moderate-7000');

  it('the unity gate cannot open for any input (the best unity the Python original ever returned is 0.9339)', () => {
    expect(results.gateArithmetic.gateReachable).toBe(false);
    expect(results.gateArithmetic.unityMaxAnyInput).toBeLessThan(0.95);
    const best = Math.max(...JSON.parse(readFileSync(VECTORS, 'utf8')).vectors.map((v: any) => v.unity));
    expect(best).toBeLessThan(0.95);
    expect(Math.abs(best - results.gateArithmetic.unityMaxAnyInput)).toBeLessThan(2e-4);
  });

  it('as written, the veto arm is never in the market: 0% drawdown because it never traded', () => {
    for (const e of asWritten.events) {
      expect(e.executedDays).toBe(0);
      expect(e.withVetoMaxDrawdownPct).toBe(0);
      expect(e.withVetoReturnPct).toBe(0);
    }
  });

  it('control: an arm that does trade (gate removed, repid 7000) is in the market every day and matches buy-and-hold', () => {
    for (const e of trades.events) {
      expect(e.executedDays).toBe(e.days);
      expect(e.withVetoMaxDrawdownPct).toBe(e.withoutVetoMaxDrawdownPct);
    }
  });

  it('dissonance is above every profile theta on every pinned day, so the veto never reads the market', () => {
    for (const p of Object.values(results.dissonance.byProfile) as any[]) expect(p.daysAboveTheta).toBe(results.dissonance.days);
    // ... and so the only thing that moves the veto is the repid input: 6499 vetoes all, 6500 vetoes none.
    const at = (id: string) => results.configs.find((c: any) => c.id === id).events.map((e: any) => e.executedDays);
    expect(at('nogate-moderate-6499')).toEqual([0, 0, 0, 0]);
    expect(at('nogate-moderate-6500')).toEqual(trades.events.map((e: any) => e.days));
  });

  it('the old 49.63% is not reproduced by any event window', () => {
    expect(results.claimedFigureScan.within0_5).toEqual([]);
    for (const w of results.buyAndHold.windows) expect(Math.abs(w.maxDrawdownPct - 49.63)).toBeGreaterThan(0.5);
  });
});

it('the script has no network code in its run path (fetch only in the fetch step)', () => {
  const text = readFileSync(SCRIPT, 'utf8');
  const runStepBody = text.slice(text.indexOf('async function runStep'), text.indexOf('const entry ='));
  expect(runStepBody).not.toMatch(/fetch\(|getJson\(|https?:\/\//);
});
