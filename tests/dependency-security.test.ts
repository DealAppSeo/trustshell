// Keep the real-runtime dependency controls inside the existing Jest CI gate.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

jest.setTimeout(60000);
it('passes the dependency and built-MCP security controls through native Node', () => {
  const result = spawnSync(process.execPath, ['--test', join(__dirname, 'dependency-security.test.mjs')], {
    encoding: 'utf8', timeout: 55000, windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error(`${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
});
