import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const QUESTION = 'Where do you already talk to AI?';
const CLIENTS = ['Claude', 'ChatGPT', 'Grok', 'Cursor'];
const COMMANDS = [
  'npm i -g @hyperdag/trustshell@1.4.0',
  'trustshell verify "paste your own claim"',
  'trustshell repid trinity-shofet',
];
const AFTER = 'Copy family host verdict. That is the receipt.';

describe('/start', () => {
  const page = readFileSync(join(ROOT, 'app/start/page.tsx'), 'utf8').replace(/\r/g, '');
  const layout = readFileSync(join(ROOT, 'app/start/layout.tsx'), 'utf8').replace(/\r/g, '');

  it('asks where you already talk to AI', () => {
    expect(page).toContain(`<h1 className="text-3xl font-extrabold tracking-tight text-white">{QUESTION}</h1>`);
    expect(page).toContain(QUESTION);
    expect(layout).toContain(QUESTION);
    expect(page).toContain(`const CLIENTS = ['Claude', 'ChatGPT', 'Grok', 'Cursor']`);
    expect(page).toMatch(/>\s*Terminal\s*</);
    for (const name of CLIENTS) {
      expect(page).toContain(name);
    }
  });

  it('shows that client an MCP paste with no npm', () => {
    const paste = page.slice(page.indexOf("const PASTE = '") + "const PASTE = '".length, page.indexOf("';", page.indexOf('const PASTE')));
    expect(JSON.parse(paste)).toEqual({
      mcpServers: { trustshell: { command: 'trustshell-mcp' } },
    });
    expect(paste).not.toMatch(/npm/);
    const chatAt = page.indexOf('{chat ? (');
    const chat = page.slice(chatAt, page.indexOf("{pick === 'Terminal' ? (", chatAt));
    expect(chat).toContain('Paste this into {pick}');
    expect(chat).toContain('{PASTE}');
    expect(chat).not.toMatch(/npm/);
    expect(chat).not.toContain('{COMMANDS}');
    const idle = page.slice(page.indexOf('return ('), page.indexOf('{chat ? ('));
    expect(idle).not.toMatch(/npm/);
    expect(idle).not.toMatch(/memory\.sqlite/);
  });

  it('shows Terminal the install line and status on its own line', () => {
    const commands = page.slice(
      page.indexOf('const COMMANDS = `') + 'const COMMANDS = `'.length,
      page.indexOf('`;', page.indexOf('const COMMANDS')),
    );
    expect(commands.split('\n')).toEqual(COMMANDS);
    expect(page).not.toMatch(/npm i -g @hyperdag\/trustshell@1\.4\.0[^\n]*status/);
    expect(page.match(/trustshell verify /g) ?? []).toHaveLength(1);
    expect(page).not.toMatch(/trustshell proof/);
    expect(page).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
    expect(page).not.toMatch(/VETO/);
    const commandsAt = page.indexOf('{COMMANDS}');
    const afterAt = page.indexOf(AFTER);
    expect(commandsAt).toBeGreaterThan(-1);
    expect(afterAt).toBeGreaterThan(commandsAt);
    const idle = page.slice(page.indexOf('return ('), page.indexOf('{chat ? ('));
    expect(idle).not.toContain(AFTER);
  });

  it('does not ask for a wallet, a stake, or a tailor path', () => {
    expect(page).not.toMatch(/wallet/i);
    expect(page).not.toMatch(/stake/i);
    expect(page).not.toMatch(/Market/);
    expect(page).not.toMatch(/Leaderboard/);
    expect(page).not.toMatch(/\/start\/tailor/);
    expect(page).not.toMatch(/HeyGen/i);
    expect(page).not.toMatch(/memory\.sqlite/);
    expect(layout).not.toMatch(/wallet/i);
    expect(layout).not.toMatch(/HeyGen/i);
  });
});
