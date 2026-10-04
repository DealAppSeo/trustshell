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

  it('lists the chat-first path and does not put sqlite on /', () => {
    expect(skill).toContain('trustshell status');
    expect(skill).toContain('Check a claim in the chat you already use');
    expect(skill).toContain('Claude, ChatGPT, Grok, and Cursor');
    expect(skill).toContain('I have a terminal');
    expect(skill).not.toMatch(/memory\.sqlite/);
    expect(skill).not.toMatch(/npx @hyperdag\/trustshell@1\.5\.0/);
  });
});
