import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const doc = readFileSync(join(__dirname, '../docs/HUMAN_TESTNET.md'), 'utf8');

describe('human testnet', () => {
  it('is six steps on chain 84532 and the engine does not send ETH', () => {
    const steps = doc.match(/^\d+\. /gm) ?? [];
    expect(steps).toHaveLength(6);
    expect(doc).toContain('84532');
    expect(doc).toContain('GET /api/v1/faucet/info');
    expect(doc).toContain('dispenses');
    expect(doc).toMatch(/The faucet is external/);
    expect(doc).toMatch(/The engine does not send ETH/);
    expect(doc).toMatch(/TrustShell does not send the ETH/);
    expect(doc).toMatch(/No mainnet stake/);
    expect(doc).not.toMatch(/stake now|staking is live/i);
    expect(doc).not.toMatch(/HeyGen/i);
    expect(doc).not.toMatch(/npx @hyperdag\/trustshell/);
  });
});
