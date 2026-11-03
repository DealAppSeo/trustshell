/**
 * Live containment probes (C15). NON-ATTACK: it runs a FIXED set of BENIGN probes AS the mission worker
 * command, inside the SAME disposable sandbox the conformance harness uses (`runMission` from mission.ts),
 * then asserts each probe was CONTAINED from what the worker could observe in its own outbox. This turns
 * "configured isolation" (checkProfile re-reads --read-only/--network none/--cap-drop ALL/... from docker
 * inspect before start) into "observed containment" (the worker TRIED a benign thing and was blocked).
 *
 * It is security testing of our own infrastructure, not attack tooling:
 *   - the only network target is 127.0.0.1:9 (discard), never an external host;
 *   - the only files read are the worker's own container files;
 *   - the only child process is one `node -e` that repeats the network probe.
 * Token exfiltration (body AND filename) is already covered by #669 + the airlock filename fix; it is
 * referenced, not duplicated here. Resource exhaustion (fork bomb / memory) is left to the container's own
 * pids/memory limits, already re-verified field-by-field by checkProfile — skipped in CI (isolated-host-only).
 *
 * Runs under BOTH runc and runsc via the sandbox-mission workflow matrix (one leg each). The CLI prints,
 * per runtime, each probe as CONTAINED / NOT-CONTAINED and EXITS NON-ZERO if ANY probe is NOT contained.
 * A NOT-CONTAINED probe is a real finding to surface, not to paper over, and not to "fix" here.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  deleteMissionDirs,
  destroyContainer,
  MissionRefused,
  nodeExec,
  RUNTIMES,
  runMission,
  type Exec,
  type Runtime,
} from './mission';

/** What a probe's own output (and the container's exit) let us observe. The judgment uses only this. */
export interface ProbeObservation {
  /** Contents of the probe's outbox file, or null if it wrote nothing the harness could read. */
  result: string | null;
  exitCode: number | null;
  timedOut: boolean;
  oomKilled: boolean | null;
}

export interface Verdict {
  contained: boolean;
  detail: string;
}

export interface Probe {
  name: string;
  /** The file the probe writes its RESULT to, under /mission/outbox/. */
  outFile: string;
  description: string;
  /** Benign worker body, run as `node -e <workerJs>` in the sandbox. */
  workerJs: string;
  judge: (o: ProbeObservation) => Verdict;
}

/* --------------------------------------------------------------------------------------------------- *
 * Worker bodies. Each is benign and self-contained (defines its own fs/out). Kept close to the supplied
 * probes; the only change is a `done` guard on the network timeout (see judgeNet) so a real breach can
 * never be overwritten by the fallback timer.
 * --------------------------------------------------------------------------------------------------- */

/** probe 1 + the child in probe 5: try to reach 127.0.0.1:9; record NETERR / NETTIMEOUT, never REACHED. */
function networkWorker(outName: string): string {
  return [
    "const fs=require('fs'); const out='/mission/outbox/';",
    "const http=require('http');",
    'let done=false;', // guard: the fallback timer must not overwrite a decisive REACHED/NETERR
    `const r=http.get('http://127.0.0.1:9/',()=>{done=true;try{fs.writeFileSync(out+'${outName}','REACHED')}catch{}});`,
    `r.on('error',e=>{done=true;try{fs.writeFileSync(out+'${outName}','NETERR:'+e.code)}catch{}});`,
    `setTimeout(()=>{if(!done){try{fs.writeFileSync(out+'${outName}','NETTIMEOUT')}catch{}}},1500);`,
  ].join('\n');
}

/** Judge a network result: contained unless the worker actually REACHED the socket. */
function judgeNet(outName: string) {
  return (o: ProbeObservation): Verdict => {
    const r = o.result;
    if (r === null) return { contained: false, detail: `no ${outName} result written` };
    if (r === 'REACHED') return { contained: false, detail: 'REACHED 127.0.0.1:9 — network was NOT contained' };
    if (/^NETERR:/.test(r) || r === 'NETTIMEOUT') return { contained: true, detail: r };
    return { contained: false, detail: `unexpected network result: ${r}` };
  };
}

export const PROBES: Probe[] = [
  {
    name: 'network',
    outFile: 'net',
    description: '--network none: a socket to 127.0.0.1:9 must not connect',
    workerJs: networkWorker('net'),
    judge: judgeNet('net'),
  },
  {
    name: 'input-read-only',
    outFile: 'ro',
    description: 'the input mount is read-only: a write must fail (EROFS/EACCES)',
    workerJs: [
      "const fs=require('fs'); const out='/mission/outbox/';",
      "try{ fs.writeFileSync('/mission/input/x','y'); fs.writeFileSync(out+'ro','WROTE'); }",
      "catch(e){ fs.writeFileSync(out+'ro','RO:'+e.code); }",
    ].join('\n'),
    judge: (o): Verdict => {
      const r = o.result;
      if (r === null) return { contained: false, detail: 'no ro result written' };
      if (r === 'WROTE') return { contained: false, detail: 'WROTE to /mission/input — input was NOT read-only' };
      if (/^RO:/.test(r)) return { contained: true, detail: r };
      return { contained: false, detail: `unexpected ro result: ${r}` };
    },
  },
  {
    name: 'no-escape',
    outFile: 'esc',
    description: 'uid 65534 on a read-only rootfs cannot read /etc/shadow or escape via /proc/1/root',
    // Reads /etc/shadow (must be denied to nobody) and lists /proc/1/root. The worker IS pid 1, so
    // /proc/1/root is its OWN root; a listing equal to `/` is self-referential (SELF), not an escape.
    // Only a listing that differs from the worker's own `/` would be a real leak of another filesystem.
    workerJs: [
      "const fs=require('fs'); const out='/mission/outbox/';",
      'let shadow,proc;',
      "try{ const b=fs.readFileSync('/etc/shadow'); shadow='LEAK:'+b.length; }catch(e){ shadow='DENIED:'+e.code; }",
      "try{ const names=fs.readdirSync('/proc/1/root').sort(); let self=[]; try{ self=fs.readdirSync('/').sort(); }catch{}",
      "     proc = names.length===0 ? 'EMPTY' : (JSON.stringify(names)===JSON.stringify(self) ? 'SELF:'+names.length : 'LEAK:'+names.length); }",
      "catch(e){ proc='DENIED:'+e.code; }",
      "fs.writeFileSync(out+'esc','shadow='+shadow+';proc='+proc);",
    ].join('\n'),
    judge: (o): Verdict => {
      const r = o.result;
      if (r === null) return { contained: false, detail: 'no esc result written' };
      const shadow = /shadow=([^;]*)/.exec(r)?.[1] ?? '';
      const proc = /proc=(.*)$/.exec(r)?.[1] ?? '';
      const shadowOk = /^DENIED:/.test(shadow) || shadow === 'EMPTY';
      const procOk = /^DENIED:/.test(proc) || /^SELF:/.test(proc) || proc === 'EMPTY' || proc === 'LEAK:0';
      if (shadowOk && procOk) return { contained: true, detail: r };
      const why = !shadowOk ? '/etc/shadow was readable' : '/proc/1/root exposed a filesystem other than the worker’s own root';
      return { contained: false, detail: `${r}  (${why})` };
    },
  },
  {
    name: 'privilege',
    outFile: 'priv',
    description: 'the worker runs as uid 65534, not root, and cannot read a root-only path',
    workerJs: [
      "const fs=require('fs'); const out='/mission/outbox/';",
      'let root;',
      "try{ fs.readFileSync('/etc/shadow'); root='READABLE'; }catch(e){ root='DENIED:'+e.code; }",
      "fs.writeFileSync(out+'priv','uid='+process.getuid()+';shadow='+root);",
    ].join('\n'),
    judge: (o): Verdict => {
      const r = o.result;
      if (r === null) return { contained: false, detail: 'no priv result written' };
      const uid = /uid=(-?\d+)/.exec(r)?.[1];
      const shadow = /shadow=(.*)$/.exec(r)?.[1] ?? '';
      if (uid !== '65534') return { contained: false, detail: `${r}  (uid is ${uid ?? 'unknown'}, not 65534)` };
      if (shadow === 'READABLE') return { contained: false, detail: `${r}  (a root-only path was readable)` };
      return { contained: true, detail: r };
    },
  },
  {
    name: 'child-containment',
    outFile: 'child',
    description: 'a spawned child inherits the same isolation (network still contained)',
    workerJs: [
      "const fs=require('fs'); const out='/mission/outbox/';",
      "const {execFileSync}=require('child_process');",
      `const child=${JSON.stringify(networkWorker('child'))};`,
      "try{ execFileSync('node',['-e',child],{timeout:5000,stdio:'ignore'}); }",
      "catch(e){ try{ if(!fs.existsSync(out+'child')) fs.writeFileSync(out+'child','SPAWNERR:'+(e.code||e.message)); }catch{} }",
    ].join('\n'),
    judge: judgeNet('child'),
  },
];

export interface ProbeResult {
  name: string;
  contained: boolean;
  detail: string;
  observation: ProbeObservation;
}

/** Run one probe as the mission worker, read its outbox file, destroy + clean up, then judge. */
export function runProbe(probe: Probe, runtime: Runtime, baseDir: string, exec: Exec = nodeExec): ProbeResult {
  const missionId = randomBytes(8).toString('hex');
  const { run } = runMission({ baseDir, missionId, runtime, command: ['node', '-e', probe.workerJs], inputFiles: {} }, exec);
  destroyContainer(run.container_id, exec); // the outbox is read only after nothing can write to it
  let result: string | null = null;
  try {
    result = readFileSync(join(run.paths.outbox, probe.outFile), 'utf8');
  } catch {
    result = null;
  }
  const observation: ProbeObservation = {
    result,
    exitCode: run.worker.exit_code,
    timedOut: run.worker.timed_out,
    oomKilled: run.worker.oom_killed,
  };
  deleteMissionDirs(run.paths);
  const v = probe.judge(observation);
  return { name: probe.name, contained: v.contained, detail: v.detail, observation };
}

export function summarize(results: ProbeResult[]): { total: number; contained: number; notContained: string[]; failed: boolean } {
  const notContained = results.filter((r) => !r.contained).map((r) => r.name);
  return { total: results.length, contained: results.length - notContained.length, notContained, failed: notContained.length > 0 };
}

function flag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? (args[i + 1] ?? null) : null;
}

export function main(argv: string[]): number {
  const runtime = (flag(argv, '--runtime') ?? 'runc') as Runtime;
  if (!RUNTIMES.includes(runtime)) {
    console.error(`--runtime must be one of ${RUNTIMES.join(', ')}`);
    return 2;
  }
  const baseDir = mkdtempSync(join(resolve(flag(argv, '--work') ?? tmpdir()), 'ts-probes-'));
  try {
    console.log(`== live containment probes under runtime=${runtime} ==`);
    const results: ProbeResult[] = [];
    for (const p of PROBES) {
      let r: ProbeResult;
      try {
        r = runProbe(p, runtime, baseDir);
      } catch (e) {
        // No container runtime (or the requested one) means we cannot OBSERVE containment. Fail, do not pass.
        if (e instanceof MissionRefused) {
          console.error(`REFUSED (cannot verify containment without the sandbox): ${e.message}`);
          return 3;
        }
        throw e;
      }
      results.push(r);
      console.log(`PROBE ${r.name.padEnd(18)} ${r.contained ? 'CONTAINED    ' : 'NOT-CONTAINED'}  ${r.detail}`);
    }
    const s = summarize(results);
    console.log(`\nSUMMARY runtime=${runtime}: ${s.contained}/${s.total} contained`);
    if (s.failed) {
      console.error(`FAIL: NOT contained under ${runtime}: ${s.notContained.join(', ')}`);
      return 1;
    }
    console.log(`PASS: every probe contained under ${runtime}`);
    return 0;
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
