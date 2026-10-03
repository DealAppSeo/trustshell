/**
 * register() does not mint ERC-8004. The skill shells out to the CLI.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TrustShell } from '../src/lib/trustshell';

const ROOT = join(__dirname, '..');
const skill = readFileSync(join(ROOT, 'skills/trustshell/SKILL.md'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'skills/trustshell/skill.json'), 'utf8')) as {
  commands: string[];
};

describe('register() does not mint', () => {
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('leaves the ERC-8004 token null and does not call mint', async () => {
    const urls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify({
          agent_id: 'agent-keyless',
          api_key: 'shown-once',
          repid: 200,
          tier: 'PROBATIONARY',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const res = await new TrustShell({ apiUrl: 'https://engine.test' }).register({
      agentName: 'keyless',
    });

    expect(res.erc8004TokenId).toBeNull();
    expect(urls).toEqual(['https://engine.test/api/v1/agents/register']);
    expect(urls.join('\n')).not.toMatch(/mint/);
  });
});

describe('skill shells out to trustshell', () => {
  it('lists verify, repid, proof, and status', () => {
    expect(manifest.commands).toEqual([
      'trustshell verify "<claim>"',
      'trustshell repid <id>',
      'trustshell proof <id> --verify',
      'trustshell status',
    ]);
    for (const command of manifest.commands) {
      expect(skill).toContain(command);
    }
    expect(skill).toContain('npm i -g @hyperdag/trustshell@1.4.1');
    expect(skill).not.toMatch(/npx @hyperdag\/trustshell@1\.4\.0/);
    expect(skill).not.toMatch(/staking is live/i);
  });
});
