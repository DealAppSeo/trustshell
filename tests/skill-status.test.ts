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

  it('lists the chat-first path and does not put sqlite on /', () => {
    expect(skill).toContain('trustshell status');
    expect(skill).toContain('Check a claim in the chat you already use');
    expect(skill).toContain('Claude, ChatGPT, Grok, and Cursor');
    expect(skill).toContain('I have a terminal');
    expect(skill).not.toMatch(/memory\.sqlite/);
    expect(skill).not.toMatch(/npx @hyperdag\/trustshell@1\.4\.0/);
  });
});
