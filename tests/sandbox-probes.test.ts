/**
 * C15 containment-probe LOGIC, without Docker. The real containment is observed in CI
 * (.github/workflows/sandbox-mission.yml) under BOTH runc and runsc; here we only prove that the
 * judges call a contained outcome CONTAINED and an escape NOT-CONTAINED, and that any single
 * NOT-CONTAINED fails the whole run. The judge is the load-bearing security logic.
 */
import { PROBES, summarize, type ProbeObservation, type ProbeResult } from '../src/sandbox/probes';

const byName = Object.fromEntries(PROBES.map((p) => [p.name, p]));
const obs = (result: string | null): ProbeObservation => ({ result, exitCode: 0, timedOut: false, oomKilled: false });
const judge = (name: string, result: string | null) => byName[name]!.judge(obs(result));

describe('network probe', () => {
  it('contains NETERR and NETTIMEOUT, fails on REACHED or a missing result', () => {
    expect(judge('network', 'NETERR:ECONNREFUSED').contained).toBe(true);
    expect(judge('network', 'NETERR:ENETUNREACH').contained).toBe(true);
    expect(judge('network', 'NETTIMEOUT').contained).toBe(true);
    expect(judge('network', 'REACHED').contained).toBe(false);
    expect(judge('network', null).contained).toBe(false);
    expect(judge('network', 'weird').contained).toBe(false);
  });
});

describe('input-read-only probe', () => {
  it('contains EROFS/EACCES, fails on WROTE', () => {
    expect(judge('input-read-only', 'RO:EROFS').contained).toBe(true);
    expect(judge('input-read-only', 'RO:EACCES').contained).toBe(true);
    expect(judge('input-read-only', 'WROTE').contained).toBe(false);
    expect(judge('input-read-only', null).contained).toBe(false);
  });
});

describe('no-escape probe', () => {
  it('needs /etc/shadow denied AND /proc/1/root self-or-empty', () => {
    expect(judge('no-escape', 'shadow=DENIED:EACCES;proc=SELF:18').contained).toBe(true);
    expect(judge('no-escape', 'shadow=DENIED:EACCES;proc=DENIED:EACCES').contained).toBe(true);
    expect(judge('no-escape', 'shadow=DENIED:EACCES;proc=EMPTY').contained).toBe(true);
    // a readable /etc/shadow is a real escape
    expect(judge('no-escape', 'shadow=LEAK:812;proc=SELF:18').contained).toBe(false);
    // /proc/1/root revealing a DIFFERENT root than our own is a real escape
    expect(judge('no-escape', 'shadow=DENIED:EACCES;proc=LEAK:40').contained).toBe(false);
    expect(judge('no-escape', null).contained).toBe(false);
  });
});

describe('privilege probe', () => {
  it('requires uid 65534 and no readable root-only path', () => {
    expect(judge('privilege', 'uid=65534;shadow=DENIED:EACCES').contained).toBe(true);
    expect(judge('privilege', 'uid=0;shadow=READABLE').contained).toBe(false);
    expect(judge('privilege', 'uid=65534;shadow=READABLE').contained).toBe(false);
    expect(judge('privilege', 'uid=1000;shadow=DENIED:EACCES').contained).toBe(false);
    expect(judge('privilege', null).contained).toBe(false);
  });
});

describe('child-containment probe', () => {
  it('contains the child only when the child could not reach the network', () => {
    expect(judge('child-containment', 'NETERR:ENETUNREACH').contained).toBe(true);
    expect(judge('child-containment', 'NETTIMEOUT').contained).toBe(true);
    expect(judge('child-containment', 'REACHED').contained).toBe(false);
    expect(judge('child-containment', 'SPAWNERR:EACCES').contained).toBe(false);
    expect(judge('child-containment', null).contained).toBe(false);
  });
});

describe('summarize', () => {
  const mk = (name: string, contained: boolean): ProbeResult => ({ name, contained, detail: '', observation: obs(null) });
  it('fails the run if ANY probe is not contained', () => {
    expect(summarize([mk('a', true), mk('b', true)]).failed).toBe(false);
    const s = summarize([mk('a', true), mk('b', false), mk('c', true)]);
    expect(s.failed).toBe(true);
    expect(s.notContained).toEqual(['b']);
    expect(s.contained).toBe(2);
    expect(s.total).toBe(3);
  });
});

describe('probe set', () => {
  it('is the five supplied probes, each writing a distinct outbox file', () => {
    expect(PROBES.map((p) => p.name)).toEqual(['network', 'input-read-only', 'no-escape', 'privilege', 'child-containment']);
    expect(new Set(PROBES.map((p) => p.outFile)).size).toBe(PROBES.length);
    for (const p of PROBES) expect(p.workerJs).toContain("require('fs')");
  });
});
