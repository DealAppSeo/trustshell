import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from '../src/cli';

const ROOT = join(__dirname, '..');
const skill = readFileSync(join(ROOT, 'skills/trustshell/SKILL.md'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'skills/trustshell/skill.json'), 'utf8')) as {
  commands: string[];
};

describe('trustshell skill lists status', () => {
  it('SKILL.md contains status and the after-create call', () => {
    expect(skill).toContain('trustshell status');
    expect(skill).toMatch(/after-create/);
    expect(skill).toMatch(/can_verify/);
    expect(skill).toMatch(/Honesty A/);
    expect(skill).toMatch(/Do not invent an HTTP API/);
  });

  it('skill.json lists the status bin and the CLI actually routes it', () => {
    expect(manifest.commands).toContain('trustshell status');
    expect(parseArgs(['status']).command).toBe('status');
  });

  it('lists remember, recall, and redact as local commands with the refuse rules', () => {
    expect(skill).toContain('trustshell remember KEY VALUE');
    expect(skill).toContain('trustshell recall KEY');
    expect(skill).toContain('trustshell redact KEY');
    expect(skill).toContain('sb_secret_');
    expect(skill).toContain('postgresql://');
    expect(skill).toContain('eyJ');
    expect(skill).toMatch(/do not call a vendor/i);
    expect(skill).not.toMatch(/memory\.sqlite/);
    expect(skill).not.toMatch(/HeyGen/i);
    expect(skill).not.toMatch(/stake now/i);
  });

  // 2026-10-06: the skill used to describe two homepage buttons ("Check a claim in the chat you
  // already use" / "I have a terminal") that are in neither app/ nor the live page. It now quotes
  // what components/hero.tsx and components/home-agent.tsx render, and this reads both, so the
  // skill cannot drift from the homepage again without a red test.
  it('describes the homepage that ships and does not put sqlite on /', () => {
    const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
    const agent = readFileSync(join(ROOT, 'components/home-agent.tsx'), 'utf8');
    expect(skill).toContain('trustshell status');
    for (const words of ['Try to trick it', 'Add it to the AI you already use']) {
      expect(hero).toContain(words);
      expect(skill).toContain(words);
    }
    expect(agent).toContain('ChatGPT and Grok apps: not yet.');
    expect(skill).toContain('The ChatGPT and Grok apps do not load MCP servers yet');
    expect(agent).toContain("'-p', '@hyperdag/trustshell@1.6.0', 'trustshell-mcp'");
    expect(skill).toContain('`npx -y -p`');
    expect(skill).not.toContain('Check a claim in the chat you already use');
    expect(skill).not.toContain('I have a terminal');
    expect(skill).not.toMatch(/memory\.sqlite/);
    expect(skill).not.toMatch(/npx @hyperdag\/trustshell@1\.6\.0/);
  });
});
