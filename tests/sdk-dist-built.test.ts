/**
 * npm pack ships dist/ as it is committed. prepublishOnly rebuilds dist only on
 * npm publish, so a stale dist is what a pack installs.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function dist(name: string): string {
  return readFileSync(join(ROOT, 'dist', name), 'utf8');
}

describe('committed SDK dist matches the source gates', () => {
  const hal = dist('lib/trustshell.js');
  const mcp = dist('mcp/index.js');
  const cli = dist('cli/index.js');

  it('an all-uncertain HAL answer is not a pass', () => {
    expect(hal).toContain('noProviderDecided');
    expect(hal).toContain('NOT_CHECKED');
  });

  it('the MCP server exposes check_claim', () => {
    expect(mcp).toContain('check_claim');
  });

  it('the CLI check command classifies a sentence', () => {
    expect(cli).toContain('runClaimCheck');
  });

  it('a missing ethers install says what to run', () => {
    expect(hal).toContain('loadEthers');
    expect(dist('lib/optional-ethers.js')).toContain('npm i ethers@^6');
  });
});
