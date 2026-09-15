#!/usr/bin/env node
/**
 * e2e:mvp — pack THIS tree, install the tarball, run the advertised surface:
 *   verify PASS + VETO, getRepID, proof --verify, MCP present_proof
 * Same hash CLI vs MCP for trinity-shofet. latestProofHash not null when proof exists.
 * No npm publish. Live engine.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../..');
const AGENT = 'trinity-shofet';
const dir = mkdtempSync(join(tmpdir(), 'ts-mvp-pack-'));
const findings = [];
const note = (ok, what, detail = '') => {
  findings.push({ ok, what, detail });
  console.log(`${ok ? 'OK  ' : 'GAP '} ${what}${detail ? ` — ${detail}` : ''}`);
};

function run(cmd, args, cwd = dir) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 90_000, shell: process.platform === 'win32' });
}

try {
  execFileSync('npm', ['run', 'sdk:build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  execFileSync('npm', ['pack', '--pack-destination', dir], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  const tgz = readdirSync(dir).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error('npm pack produced no tarball');
  run('npm', ['init', '-y']);
  const inst = run('npm', ['install', join(dir, tgz)]);
  note(inst.status === 0, 'install packed tarball', inst.stderr?.slice(0, 200));

  const cli = join(dir, 'node_modules', '@hyperdag', 'trustshell', 'dist', 'cli', 'index.js');
  const paris = run(process.execPath, [cli, 'verify', 'The capital of France is Paris.']);
  note(paris.status === 0 && /PASS/i.test(paris.stdout || ''), 'verify PASS (Paris)', `exit=${paris.status}`);
  const rome = run(process.execPath, [cli, 'verify', 'The Eiffel Tower is located in Rome, Italy.']);
  note(rome.status === 1 && /VETO/i.test(rome.stdout + rome.stderr), 'verify VETO (Rome)', `exit=${rome.status}`);

  const repid = run(process.execPath, [cli, 'repid', AGENT, '--json']);
  let latest = null;
  try { latest = JSON.parse(repid.stdout || '{}').latestProofHash; } catch {}
  note(repid.status === 0, 'getRepID', `exit=${repid.status}`);

  const proof = run(process.execPath, [cli, 'proof', AGENT, '--verify', '--json']);
  let cliHash = null;
  try {
    const p = JSON.parse(proof.stdout || '{}');
    cliHash = p.proofHash || (p.proofBytes ? createHash('sha256').update(p.proofBytes, 'utf8').digest('hex') : null);
    note(proof.status === 0 && p.verification?.verified === true, 'proof --verify', `hash=${cliHash?.slice(0, 12)}`);
  } catch (e) {
    note(false, 'proof --verify', String(e));
  }
  note(Boolean(cliHash) && latest != null, 'latestProofHash not null when CLI has a proof', `latest=${latest}`);

  const mcpMod = await import(pathToFileURL(join(dir, 'node_modules', '@hyperdag', 'trustshell', 'dist', 'mcp', 'index.js')).href);
  const sdkMod = await import(pathToFileURL(join(dir, 'node_modules', '@hyperdag', 'trustshell', 'dist', 'lib', 'index.js')).href);
  const client = new sdkMod.TrustShell();
  const server = mcpMod.createServer(client);
  const tool = server._registeredTools?.present_proof;
  const res = await tool.handler({ agentId: AGENT, verify: true });
  const mcp = JSON.parse(res.content[0].text);
  const mcpHash = mcp.proofHash || (mcp.proofBytes ? createHash('sha256').update(mcp.proofBytes, 'utf8').digest('hex') : null);
  note(cliHash && mcpHash && cliHash === mcpHash, 'CLI and MCP same proof hash', `cli=${cliHash?.slice(0, 12)} mcp=${mcpHash?.slice(0, 12)}`);
} catch (e) {
  note(false, 'e2e:mvp crashed', e instanceof Error ? e.message : String(e));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const failed = findings.filter((f) => !f.ok);
process.exit(failed.length ? 1 : 0);
