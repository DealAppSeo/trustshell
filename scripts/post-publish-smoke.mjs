#!/usr/bin/env node
/**
 * POST-PUBLISH SMOKE: is what npm serves the release we meant? Run it minutes after a publish.
 *
 * READ-ONLY AND KEYLESS. It asks the registry, installs the exact version into a temp directory,
 * runs the CLI and the MCP server from there, and deletes the directory. Nothing is published,
 * pushed or written outside the temp directory. API keys and TRUSTSHELL_API_URL are removed from
 * every child's environment, so `check` asks the default public endpoint with no key.
 *
 * Usage:  node scripts/post-publish-smoke.mjs <version> [--files 123] [--tools 20] [--keep]
 *   --files  how many files `npm pack` counted for this release (1.8.0: 123)
 *   --tools  how many tools its MCP server lists (1.8.0: 20, and never `quarantine_release`)
 *
 * Exit 0 only when every check passes. 1 when any fails, including `latest` not being <version>.
 * 2 when the registry did not answer: NOT_CHECKED, never a pass.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PKG = '@hyperdag/trustshell';
const DEFAULTS = { files: 123, tools: 20 };
// Decided by the engine's exact calculation, so the answer does not depend on which model is up.
const TRUE_SENTENCE = '2 + 2 = 4';
const FALSE_SENTENCE = '2 + 2 = 5';
const MANIFEST = 'Bill of lading\nordered 150 ft of cable\n';
const WIN = process.platform === 'win32';

function parseArgs(argv) {
  const out = { version: undefined, files: DEFAULTS.files, tools: DEFAULTS.tools, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--files' || a === '--tools') out[a.slice(2)] = Number(argv[++i]);
    else if (a === '--keep') out.keep = true;
    else if (!out.version) out.version = a;
  }
  return out;
}

/** The environment every child gets: no key, no endpoint override, memory in the temp dir. */
function childEnv(dir) {
  const env = { ...process.env, TRUSTSHELL_MEMORY: join(dir, 'smoke-memory.sqlite'), NO_COLOR: '1' };
  for (const k of ['REPID_API_KEY', 'TRUSTSHELL_API_KEY', 'TRUSTSHELL_API_URL', 'NPM_TOKEN', 'NODE_AUTH_TOKEN']) delete env[k];
  return env;
}

function npm(args, opts = {}) {
  return spawnSync(WIN ? 'npm.cmd' : 'npm', args, { encoding: 'utf8', shell: WIN, windowsHide: true, timeout: 15 * 60_000, ...opts });
}

function runNode(file, args, dir) {
  const r = spawnSync(process.execPath, [file, ...args], { cwd: dir, env: childEnv(dir), encoding: 'utf8', timeout: 120_000 });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(/\r/g, '').trim();
  return { code: r.status, out: (r.stdout ?? '').replace(/\r/g, '').trim(), first: text.split('\n')[0] ?? '' };
}

/** Ask a stdio MCP server for its tools: initialize, initialized, tools/list. Newline-delimited JSON-RPC. */
function listTools(file, dir, timeoutMs = 90_000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { cwd: dir, env: childEnv(dir), stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '';
    let settled = false;
    // Resolve only after the server has exited: on Windows a live child keeps its cwd (the temp dir)
    // locked, and the cleanup below would fail with EBUSY.
    const done = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode !== null || child.signalCode !== null) return resolve(v);
      child.once('exit', () => resolve(v));
      child.kill();
    };
    const timer = setTimeout(() => done({ error: `no tools/list answer in ${timeoutMs / 1000} s` }), timeoutMs);
    child.on('error', (e) => {
      // A spawn that failed may never emit 'exit', so this resolves directly.
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ error: String(e?.message ?? e) });
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1) {
          child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
          child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
        } else if (msg.id === 2) {
          // ponytail: one page. A paginated list (nextCursor) is reported, not followed.
          if (msg.error) done({ error: JSON.stringify(msg.error) });
          else done({ names: (msg.result?.tools ?? []).map((t) => t.name).sort(), more: Boolean(msg.result?.nextCursor) });
        }
      }
    });
    const init = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'post-publish-smoke', version: '0' } };
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: init })}\n`);
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(opts.version) || !Number.isInteger(opts.files) || !Number.isInteger(opts.tools)) {
    console.log('usage: node scripts/post-publish-smoke.mjs <version> [--files N] [--tools N] [--keep]');
    process.exit(2);
  }
  const v = opts.version;
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  let loud = '';

  // 1. The registry. Unreachable is NOT_CHECKED, never a pass.
  const view = npm(['view', `${PKG}@${v}`, 'version', 'dist.tarball', 'dist.integrity', 'dist.fileCount', '--json']);
  let meta;
  try {
    meta = JSON.parse(view.stdout);
  } catch {
    meta = null;
  }
  if (view.status !== 0 || !meta) {
    console.log(`post-publish smoke ${PKG}@${v} — NOT_CHECKED`);
    console.log(`  npm view did not answer: ${(view.stderr || view.stdout || String(view.error ?? '')).split('\n')[0]}`);
    process.exit(2);
  }
  check('registry serves the version', meta.version === v, `npm view: ${meta.version}`);
  const latest = npm(['view', PKG, 'dist-tags.latest']).stdout?.trim();
  check('dist-tag latest is this version', latest === v, `latest = ${latest || '(no answer)'}`);
  if (latest !== v) loud = `!!! npm latest is ${latest || '(no answer)'}, not ${v}. Everyone running a plain install gets ${latest || 'something else'}.`;
  check(`tarball file count is ${opts.files}`, meta['dist.fileCount'] === opts.files, `dist.fileCount = ${meta['dist.fileCount']}`);

  // 2. A clean install of exactly that version, outside any repo.
  const dir = mkdtempSync(join(tmpdir(), 'ts-smoke-'));
  try {
    // A package.json AND --prefix pin the install to the temp dir. Without them npm walks up to the
    // first ancestor with a package.json (a home directory can have one) and installs THERE.
    writeFileSync(join(dir, 'package.json'), '{ "name": "ts-post-publish-smoke", "private": true }\n');
    const inst = npm(['install', '--prefix', dir, '--no-audit', '--no-fund', '--ignore-scripts', '--no-save', `${PKG}@${v}`], { cwd: dir });
    let pkg = null;
    try {
      pkg = JSON.parse(readFileSync(join(dir, 'node_modules', '@hyperdag', 'trustshell', 'package.json'), 'utf8'));
    } catch {
      pkg = null;
    }
    check('clean install', inst.status === 0 && pkg?.version === v, inst.status === 0 ? `installed ${pkg?.version}` : (inst.stderr || '').split('\n')[0]);
    if (pkg) {
      const root = join(dir, 'node_modules', '@hyperdag', 'trustshell');
      const cli = join(root, pkg.bin?.trustshell ?? 'dist/cli/index.js');
      const mcp = join(root, pkg.bin?.['trustshell-mcp'] ?? 'dist/mcp/index.js');
      writeFileSync(join(dir, 'manifest.txt'), MANIFEST);

      const ver = runNode(cli, ['--version'], dir);
      check('--version', ver.code === 0 && ver.out === v, `exit ${ver.code}: ${ver.first}`);
      const yes = runNode(cli, ['check', TRUE_SENTENCE], dir);
      check(`check "${TRUE_SENTENCE}" exits 0`, yes.code === 0, `exit ${yes.code}: ${yes.first}`);
      const no = runNode(cli, ['check', FALSE_SENTENCE], dir);
      check(`check "${FALSE_SENTENCE}" exits 1`, no.code === 1, `exit ${no.code}: ${no.first}`);
      const g1 = runNode(cli, ['ground', '--source', 'manifest.txt', '--quote', 'ordered 150 ft', '--page', '1', '--kind', 'number', '--value', '150', '--unit', 'ft'], dir);
      check('ground VERIFIED exits 0', g1.code === 0 && g1.out.startsWith('VERIFIED'), `exit ${g1.code}: ${g1.first}`);
      const g2 = runNode(cli, ['ground', '--source', 'manifest.txt', '--quote', 'ordered 999 ft', '--page', '1'], dir);
      check('ground VETO exits 1', g2.code === 1 && g2.out.startsWith('VETO'), `exit ${g2.code}: ${g2.first}`);

      const tools = await listTools(mcp, dir);
      if (tools.error) check(`MCP lists ${opts.tools} tools`, false, tools.error);
      else {
        check(
          `MCP lists ${opts.tools} tools`,
          tools.names.length === opts.tools && !tools.more,
          `${tools.names.length} tools${tools.more ? ' (and more pages)' : ''}`,
        );
        check('MCP has no quarantine_release', !tools.names.includes('quarantine_release'), tools.names.includes('quarantine_release') ? 'quarantine_release is listed' : 'absent');
      }
    }
  } finally {
    if (opts.keep) console.log(`  (kept ${dir})`);
    else {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      } catch (e) {
        // Cleanup is not a check: a locked temp dir is reported, never a crash that hides the results.
        console.log(`  (could not remove ${dir}: ${e?.code ?? e})`);
      }
    }
  }

  // One screen.
  const failed = results.filter((r) => !r.ok);
  console.log(`post-publish smoke — ${PKG}@${v}`);
  if (loud) console.log(loud);
  console.log(`  tarball   ${meta['dist.tarball']}`);
  console.log(`  integrity ${meta['dist.integrity']}`);
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(36)} ${r.detail ?? ''}`);
  console.log(failed.length ? `SMOKE FAIL — ${failed.length} of ${results.length} checks failed` : `SMOKE PASS — ${results.length} of ${results.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.log(`post-publish smoke — crashed: ${e?.stack ?? e}`);
  process.exit(1);
});
