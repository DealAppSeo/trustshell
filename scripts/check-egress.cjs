#!/usr/bin/env node
/**
 * check-egress.cjs — the published per-command egress table is a claim, not a caption.
 *
 * README.md and docs/api-reference.md both assert that `inspect`, `init` and
 * `report` open NO socket, and that `check` reaches api.github.com and nothing
 * else. Nothing else in the repo enforced that. A fetch added to one of those
 * paths would make the table a lie about privacy, and every existing test
 * would stay green.
 *
 * THIS CHECK RUNS THE COMMANDS. It does not grep for `fetch(`. A scan cannot
 * see `http.request`, `undici.request`, a dynamic import, or `child_process`
 * curling a URL. We install stubs for fetch / http / https (and undici when
 * present), prove the stubs actually throw, then execute each no-network
 * command and `check`.
 *
 * Discovery: the command set is parsed from the published markdown tables, not
 * a hand-maintained list. A new `none` row is picked up; an unparseable table
 * is NOT CHECKED, never a vacuous pass.
 *
 * Outcomes (exit 3 is never 0):
 *   VERIFIED     0  — tables agree, stubs installed, no-network commands did
 *                     not touch the network and produced their verdicts,
 *                     `check` reached api.github.com and nothing else
 *   FAILED       1  — a no-network command dialed out, or `check` dialed a
 *                     host other than api.github.com, or a pinned verdict moved
 *   NOT CHECKED  3  — could not parse the tables, could not compile, or the
 *                     stubbing harness did not actually install
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, appendFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const http = require('node:http');
const https = require('node:https');

const EXIT_VERIFIED = 0;
const EXIT_FAILED = 1;
const EXIT_NOT_CHECKED = 3;

const ROOT = join(__dirname, '..');
const PRELOAD = join(__dirname, 'check-egress.cjs');
const DOC_PATHS = ['README.md', join('docs', 'api-reference.md')];

/** Pinned outcomes for the published no-socket commands, run against an empty cwd. */
const NONE_PINNED = {
  inspect: { field: 'verdict', value: 'NO_LOG', exit: 3 },
  init: { field: 'outcome', value: 'CREATED', exit: 0 },
  report: { field: 'verdict', value: 'UNSUPPORTED', exit: 3 },
};

const CHECK_URL_GITHUB = 'https://github.com/DealAppSeo/trustshell/actions/runs/1';
const CHECK_URL_ELSEWHERE = 'https://example.com/DealAppSeo/trustshell/actions/runs/1';
const ALLOW_HOST = 'api.github.com';

const DENIED = 'EGRESS_DENIED';

function notChecked(reason) {
  console.log('NOT CHECKED');
  console.error(reason);
  process.exit(EXIT_NOT_CHECKED);
}

function failed(lines) {
  console.log('FAILED');
  for (const l of lines) console.log(l);
  process.exit(EXIT_FAILED);
}

function extractHost(input) {
  try {
    const s =
      typeof input === 'string'
        ? input
        : input && typeof input === 'object'
          ? String(input.url || input.href || input)
          : String(input);
    return new URL(s).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function record(kind, dest) {
  const log = process.env.TRUSTSHELL_EGRESS_LOG;
  if (!log) return;
  const host = extractHost(dest);
  appendFileSync(log, JSON.stringify({ kind, dest: String(dest), host }) + '\n');
}

function allowHost() {
  return (process.env.TRUSTSHELL_EGRESS_ALLOW || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowed(dest) {
  const host = extractHost(dest);
  return host !== '' && allowHost().includes(host);
}

function fakeGithubFetch(url) {
  const u = String(url);
  const body = u.includes('/jobs')
    ? { total_count: 1, jobs: [{ name: 'job-0', conclusion: 'success' }] }
    : {
        conclusion: 'success',
        status: 'completed',
        head_sha: 'abc123def4567890',
        head_branch: 'main',
        name: 'check',
        display_title: 'egress-allowlist',
      };
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

function wrapFn(mod, name, kind) {
  const orig = mod[name];
  if (typeof orig !== 'function') return false;
  mod[name] = function wrapped(first, ...rest) {
    record(kind, first);
    if (isAllowed(first) && kind === 'fetch') {
      return fakeGithubFetch(first);
    }
    const err = new Error(`${DENIED}:${kind}:${first}`);
    err.code = DENIED;
    throw err;
  };
  return true;
}

/**
 * Install the stubs. Called when this file is `-r` required into a child, AND
 * by the harness probe. Returns which surfaces were actually replaced — if
 * `fetch` could not be replaced, the parent MUST NOT CHECKED.
 */
function installStubs() {
  const installed = [];
  if (wrapFn(globalThis, 'fetch', 'fetch')) installed.push('fetch');
  else {
    globalThis.fetch = function (first) {
      record('fetch', first);
      if (isAllowed(first)) return fakeGithubFetch(first);
      const err = new Error(`${DENIED}:fetch:${first}`);
      err.code = DENIED;
      throw err;
    };
    installed.push('fetch');
  }
  if (wrapFn(http, 'request', 'http.request')) installed.push('http.request');
  if (wrapFn(http, 'get', 'http.get')) installed.push('http.get');
  if (wrapFn(https, 'request', 'https.request')) installed.push('https.request');
  if (wrapFn(https, 'get', 'https.get')) installed.push('https.get');
  try {
    const undici = require('undici');
    if (undici && wrapFn(undici, 'fetch', 'undici.fetch')) installed.push('undici.fetch');
    if (undici && wrapFn(undici, 'request', 'undici.request')) installed.push('undici.request');
  } catch {
    // undici may be unavailable; Node's global fetch is still stubbed.
  }
  return installed;
}

if (process.env.TRUSTSHELL_EGRESS_PRELOAD === '1') {
  installStubs();
}

/** Parse the `| Command | Network egress |` table from a markdown file. */
function parseEgressTable(markdown) {
  const header = /^\|\s*Command\s*\|\s*Network egress\s*\|/m;
  const m = header.exec(markdown);
  if (!m) return null;
  const from = markdown.slice(m.index);
  const lines = from.split(/\r?\n/);
  if (lines.length < 3) return null;
  const rows = [];
  for (let i = 2; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const cmd = cells[0].replace(/`/g, '').trim();
    const egress = cells[1].replace(/\*\*/g, '').trim();
    if (!cmd) continue;
    rows.push({ cmd, egress });
  }
  return rows.length ? rows : null;
}

function classify(rows) {
  const none = [];
  const githubOnly = [];
  const other = [];
  for (const r of rows) {
    const e = r.egress.toLowerCase();
    if (/\bnone\b/.test(e) || e.startsWith('nothing')) none.push(r.cmd);
    else if (e.includes('api.github.com')) githubOnly.push(r.cmd);
    else other.push(r.cmd);
  }
  return { none, githubOnly, other };
}

function classKey(c) {
  return JSON.stringify({
    none: [...c.none].sort(),
    githubOnly: [...c.githubOnly].sort(),
    other: [...c.other].sort(),
  });
}

function compileCli(outDir) {
  let tsc;
  try {
    tsc = require.resolve('typescript/bin/tsc', { paths: [ROOT] });
  } catch (err) {
    return { ok: false, reason: `typescript not resolvable: ${err.message}` };
  }
  const r = spawnSync(
    process.execPath,
    [tsc, '--project', join(ROOT, 'tsconfig.sdk.json'), '--outDir', outDir],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (r.status !== 0) {
    return {
      ok: false,
      reason: `tsc failed (exit ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 800)}`,
    };
  }
  const cli = join(outDir, 'cli', 'index.js');
  if (!existsSync(cli)) return { ok: false, reason: `tsc produced no CLI at ${cli}` };
  return { ok: true, cli };
}

function readLog(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\n/)
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { kind: 'unparsed', dest: l, host: '' };
      }
    });
}

function spawnCli(cli, args, { cwd, allow, logPath }) {
  const env = {
    ...process.env,
    TRUSTSHELL_EGRESS_PRELOAD: '1',
    TRUSTSHELL_EGRESS_LOG: logPath,
    TRUSTSHELL_EGRESS_ALLOW: allow || '',
  };
  // Drop tokens so `check` cannot pick up a real GITHUB_TOKEN and surprise us.
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  const r = spawnSync(process.execPath, ['-r', PRELOAD, cli, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    log: readLog(logPath),
    error: r.error,
  };
}

function probeHarness() {
  const script = [
    'let fetchDenied = false, httpDenied = false;',
    'try { fetch("https://example.com/harness-probe"); } catch (e) {',
    `  fetchDenied = String(e && e.message).startsWith("${DENIED}");`,
    '}',
    'try { require("http").get("http://example.com/harness-probe"); } catch (e) {',
    `  httpDenied = String(e && e.message).startsWith("${DENIED}");`,
    '}',
    'if (fetchDenied && httpDenied) process.exit(0);',
    'process.stdout.write(JSON.stringify({ fetchDenied, httpDenied }));',
    'process.exit(7);',
  ].join('');
  const r = spawnSync(process.execPath, ['-r', PRELOAD, '-e', script], {
    cwd: ROOT,
    env: { ...process.env, TRUSTSHELL_EGRESS_PRELOAD: '1', TRUSTSHELL_EGRESS_ALLOW: '' },
    encoding: 'utf8',
  });
  return r.status === 0;
}

function parseJson(stdout) {
  const text = stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function runNoneCommand(cli, cmd) {
  const cwd = mkdtempSync(join(tmpdir(), `ts-egress-${cmd}-`));
  const logPath = join(cwd, 'egress.log');
  writeFileSync(logPath, '');
  const result = spawnCli(cli, [cmd, '--json'], { cwd, allow: '', logPath });
  return { ...result, cwd, cmd };
}

function main() {
  const tables = [];
  for (const rel of DOC_PATHS) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) notChecked(`missing published surface: ${rel}`);
    const rows = parseEgressTable(readFileSync(p, 'utf8'));
    if (!rows) notChecked(`could not parse '| Command | Network egress |' table in ${rel}`);
    tables.push({ rel, rows });
  }
  const classes = tables.map((t) => ({ rel: t.rel, c: classify(t.rows) }));
  if (classKey(classes[0].c) !== classKey(classes[1].c)) {
    failed([
      `${classes[0].rel} and ${classes[1].rel} disagree on which commands open a socket.`,
      `${classes[0].rel}: none=[${classes[0].c.none.join(', ')}] github=[${classes[0].c.githubOnly.join(', ')}]`,
      `${classes[1].rel}: none=[${classes[1].c.none.join(', ')}] github=[${classes[1].c.githubOnly.join(', ')}]`,
    ]);
  }

  const { none, githubOnly } = classes[0].c;
  if (none.length === 0) notChecked('egress table parsed but named no no-network commands — refusing a vacuous pass');
  if (githubOnly.length === 0) notChecked('egress table parsed but named no api.github.com command — refusing a vacuous pass');

  const outDir = mkdtempSync(join(tmpdir(), 'ts-egress-build-'));
  const compiled = compileCli(outDir);
  if (!compiled.ok) {
    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    notChecked(compiled.reason);
  }

  if (!probeHarness()) {
    notChecked(
      'stubbing harness did not install: fetch and/or http.get still reached the network (or threw something other than EGRESS_DENIED). NOT CHECKED, not a pass.',
    );
  }

  const problems = [];

  for (const cmd of none) {
    const ran = runNoneCommand(compiled.cli, cmd);
    if (ran.error) {
      problems.push(`${cmd}: spawn failed: ${ran.error.message}`);
      continue;
    }
    if (ran.log.length > 0) {
      const dests = ran.log.map((e) => `${e.kind} ${e.dest}`).join('; ');
      problems.push(`${cmd} reached the network: ${dests}`);
      continue;
    }
    const body = parseJson(ran.stdout);
    const pin = NONE_PINNED[cmd];
    if (pin) {
      if (!body || body[pin.field] !== pin.value) {
        problems.push(
          `${cmd} produced ${body ? JSON.stringify(body[pin.field]) : 'non-JSON'} (exit ${ran.status}), expected ${pin.field}=${pin.value}`,
        );
      } else if (ran.status !== pin.exit) {
        problems.push(`${cmd} verdict ${pin.value} but exit ${ran.status}, expected ${pin.exit}`);
      }
    }
  }

  // Positive allowlist for `check`: it MUST call fetch against api.github.com
  // and MUST NOT call anything else. Responses are canned — this is a destination
  // check, not a live GitHub integration (api.github.com rate-limits shared CI IPs).
  for (const cmd of githubOnly) {
    const cwd = mkdtempSync(join(tmpdir(), `ts-egress-${cmd}-`));
    const logPath = join(cwd, 'egress.log');
    writeFileSync(logPath, '');
    const ran = spawnCli(compiled.cli, [cmd, CHECK_URL_GITHUB, '--json'], {
      cwd,
      allow: ALLOW_HOST,
      logPath,
    });
    if (ran.error) {
      problems.push(`${cmd}: spawn failed: ${ran.error.message}`);
      continue;
    }
    const foreign = ran.log.filter((e) => e.host && e.host !== ALLOW_HOST);
    if (foreign.length > 0) {
      problems.push(
        `${cmd} reached a host other than ${ALLOW_HOST}: ${foreign.map((e) => e.host).join(', ')}`,
      );
    }
    const toGithub = ran.log.filter((e) => e.host === ALLOW_HOST);
    if (toGithub.length === 0) {
      problems.push(`${cmd} produced a verdict without reaching ${ALLOW_HOST}`);
    }
    const body = parseJson(ran.stdout);
    if (!body || body.verdict !== 'COMPLETE') {
      problems.push(
        `${cmd} against a GitHub run URL produced ${body ? body.verdict : 'non-JSON'} (exit ${ran.status}), expected COMPLETE`,
      );
    } else if (ran.status !== 0) {
      problems.push(`${cmd} COMPLETE but exit ${ran.status}, expected 0`);
    }

    // Pointed anywhere else: must not succeed, must not fetch that host.
    const elseLog = join(cwd, 'elsewhere.log');
    writeFileSync(elseLog, '');
    const elseRan = spawnCli(compiled.cli, [cmd, CHECK_URL_ELSEWHERE, '--json'], {
      cwd,
      allow: ALLOW_HOST,
      logPath: elseLog,
    });
    const elseHosts = elseRan.log.map((e) => e.host).filter(Boolean);
    if (elseHosts.includes('example.com')) {
      problems.push(`${cmd} fetched example.com when pointed at ${CHECK_URL_ELSEWHERE}`);
    }
    if (elseRan.status === 0) {
      problems.push(`${cmd} exited 0 when pointed at ${CHECK_URL_ELSEWHERE} — must fail if pointed anywhere else`);
    }
  }

  try {
    rmSync(outDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (problems.length) failed(problems.map((p) => `  ${p}`));

  console.log('VERIFIED');
  console.log(
    `no-network: ${none.join(', ')} produced their verdicts with fetch/http/https stubbed to throw; ${githubOnly.join(', ')} reached ${ALLOW_HOST} and failed when pointed at example.com`,
  );
  process.exit(EXIT_VERIFIED);
}

module.exports = {
  EXIT_VERIFIED,
  EXIT_FAILED,
  EXIT_NOT_CHECKED,
  parseEgressTable,
  classify,
  extractHost,
  installStubs,
  NONE_PINNED,
  DOC_PATHS,
  ALLOW_HOST,
};

if (require.main === module && process.env.TRUSTSHELL_EGRESS_PRELOAD !== '1') {
  try {
    main();
  } catch (err) {
    console.log('NOT CHECKED');
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(EXIT_NOT_CHECKED);
  }
}
