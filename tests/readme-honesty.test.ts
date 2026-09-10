/**
 * README must carry one live | live-degraded | paused/blocked table.
 *
 * Production change that would make this fail: dropping the table, labeling
 * HAL as live (it is live-degraded: 2/6 providers), or claiming register()
 * mints ERC-8004 / on-chain writes are landing / v1 is on-device.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const README = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');

describe('README live vs paused', () => {
  it('has one table whose heading names live vs paused', () => {
    expect(README).toMatch(/##[^\n]*[Ll]ive vs paused/);
    const after = README.split(/##[^\n]*[Ll]ive vs paused/)[1] ?? '';
    const table = after.split(/\n## /)[0];
    expect(table).toMatch(/\|/);
    expect(table.toLowerCase()).toMatch(/hosted thin client/);
    expect(table.toLowerCase()).toMatch(/live-degraded/);
    expect(table.toLowerCase()).toMatch(/paused\/blocked/);
    expect(table).toMatch(/register\(\)/);
    expect(table).toMatch(/ERC-8004/);
    expect(table).toMatch(/Base Sepolia/);
    expect(table.toLowerCase()).toMatch(/paraphras/);
  });

  it('labels HAL verifyOutput live-degraded, not live', () => {
    const after = README.split(/##[^\n]*[Ll]ive vs paused/)[1] ?? '';
    const table = after.split(/\n## /)[0];
    expect(table).toMatch(/verifyOutput[\s\S]{0,400}live-degraded/i);
  });

  it('does not contradict the five facts', () => {
    const forbidden = [
      /register\(\)\s+mints/i,
      /on-chain writes are (live|landing|active)/i,
      /v1[^\n.]{0,80}on-device/i,
      /portable mesh[^\n.]{0,40}\bis (shipped|live)/i,
      /x402[^\n.]{0,60}mainnet/i,
      /HAL[^\n.]{0,40}(strong|robust)[^\n.]{0,20}paraphras/i,
    ];
    const hits = forbidden.filter((re) => re.test(README));
    expect(hits.map(String)).toEqual([]);
  });
});
