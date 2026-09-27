import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

/**
 * stake or VETO is a product claim when the line tells the reader to stake,
 * says staking is live, or frames either word as what the product says or is.
 * A negation and a bare word are not a claim.
 */
export function spokenAsStakeOrVetoClaim(text: string): boolean {
  if (/\bstake now\b/i.test(text)) return true;
  if (/\bstaking is live\b/i.test(text)) return true;
  return /(?:product claim|TrustShell says|the product says|this product says|verdict is|returns)(?:\s+is)?\s+["']?(?:stake\b|staking\b|VETO)|(?:stake|staking|VETO)\s+is\s+(?:the|a|our)\s+(?:product|verdict|claim)/i.test(
    text,
  );
}

describe('cmo jev', () => {
  const channel = readFileSync(join(ROOT, 'docs/CHANNEL.md'), 'utf8');
  const script = readFileSync(join(ROOT, 'scripts/cmo-mock-publish.mjs'), 'utf8');

  it('fails if stake or VETO is spoken as a product claim', () => {
    expect(spokenAsStakeOrVetoClaim('stake now')).toBe(true);
    expect(spokenAsStakeOrVetoClaim('staking is live')).toBe(true);
    expect(spokenAsStakeOrVetoClaim('TrustShell says VETO')).toBe(true);
    expect(spokenAsStakeOrVetoClaim('VETO is the product')).toBe(true);
    expect(spokenAsStakeOrVetoClaim('VETO is the verdict')).toBe(true);
    expect(spokenAsStakeOrVetoClaim('Staking is not live')).toBe(false);
    expect(spokenAsStakeOrVetoClaim('do not say stake')).toBe(false);
    expect(spokenAsStakeOrVetoClaim('VETO')).toBe(false);
    expect(spokenAsStakeOrVetoClaim(channel)).toBe(false);
    expect(spokenAsStakeOrVetoClaim(script)).toBe(false);
  });

  it('names the inbox and the channel order', () => {
    const lie = channel.indexOf('01-lie');
    const caught = channel.indexOf('02-caught');
    const receipt = channel.indexOf('03-receipt');
    expect(lie).toBeGreaterThanOrEqual(0);
    expect(caught).toBeGreaterThan(lie);
    expect(receipt).toBeGreaterThan(caught);
    const linkedin = channel.indexOf('LinkedIn');
    const tiktok = channel.indexOf('TikTok');
    const shorts = channel.indexOf('YouTube Shorts');
    expect(linkedin).toBeGreaterThanOrEqual(0);
    expect(tiktok).toBeGreaterThan(linkedin);
    expect(shorts).toBeGreaterThan(tiktok);
    expect(channel).toMatch(/9:16/);
    expect(channel).toMatch(/receipt line/);
    expect(channel).toMatch(/^No HeyGen\.$/m);
    expect(channel).toMatch(/does not post live/);
    expect(channel).not.toMatch(/use HeyGen|HeyGen render/i);
  });

  it('publishes linkedin, then tiktok, then youtube through mockBackend', () => {
    expect(script).toContain('mockBackend');
    expect(script).toContain('immediate-text-success');
    expect(script).not.toMatch(/@opencoredev\/social-sdk\/(?:linkedin|tiktok|youtube|x|instagram|bluesky)/);
    expect(script).not.toMatch(/HeyGen/i);
    const run = spawnSync(process.execPath, [join(ROOT, 'scripts/cmo-mock-publish.mjs')], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(run.status).toBe(0);
    const body = JSON.parse(run.stdout) as {
      mock: boolean;
      order: string[];
      copy: string;
      outcomes: { platform: string; status: string; state: string }[];
    };
    expect(body.mock).toBe(true);
    expect(body.order).toEqual(['linkedin', 'tiktok', 'youtube']);
    expect(body.outcomes.map((row) => row.platform)).toEqual(['linkedin', 'tiktok', 'youtube']);
    for (const row of body.outcomes) {
      expect(row.status).toBe('complete');
      expect(row.state).toBe('published');
    }
    expect(spokenAsStakeOrVetoClaim(body.copy)).toBe(false);
    expect(body.copy).toContain('01-lie');
    expect(body.copy).toContain('02-caught');
    expect(body.copy).toContain('03-receipt');
    expect(body.copy).toMatch(/receipt/i);
  });
});
