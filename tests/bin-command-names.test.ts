/**
 * Every package.json bin is named in the README or the skill.
 * A `trustshell <name>` line must be one of those bins, or a command in the CLI help.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function commandNames(text: string): Set<string> {
  const found = new Set<string>();
  const stripped = text.replace(/`[^`\r\n]*\/[^`\r\n]*`/g, ' ');
  if (/\btrustshell-mcp\b/.test(stripped)) found.add('trustshell-mcp');
  if (/\bhal\b/.test(stripped)) found.add('hal');
  if (/\btrustshell\b/.test(stripped)) found.add('trustshell');
  for (const match of stripped.matchAll(/(?<![@\w./])trustshell[ \t]+([a-z][a-z0-9-]*)/g)) {
    found.add(match[1]);
  }
  return found;
}

function cliSubcommands(source: string): Set<string> {
  const help = source.match(/const HELP = `([\s\S]*?)`;/);
  if (!help?.[1]) throw new Error('CLI HELP not found');
  const commands = help[1].split('COMMANDS')[1]?.split('OPTIONS')[0] ?? '';
  const names = new Set<string>();
  for (const match of commands.matchAll(/^  ([a-z][a-z0-9-]*)\b/gm)) {
    names.add(match[1]);
  }
  if (names.size === 0) throw new Error('CLI HELP listed no commands');
  return names;
}

describe('bin command names', () => {
  it('README and SKILL name every bin, and every trustshell word is a bin or a CLI command', () => {
    const root = join(__dirname, '..');
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const skill = readFileSync(join(root, 'skills', 'trustshell', 'SKILL.md'), 'utf8');
    const cli = readFileSync(join(root, 'src', 'cli', 'index.ts'), 'utf8');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { bin: Record<string, string> };
    const found = new Set<string>([...commandNames(readme), ...commandNames(skill)]);
    const bins = new Set(Object.keys(pkg.bin));
    const subs = cliSubcommands(cli);
    expect([...bins].filter((name) => !found.has(name)).sort()).toEqual([]);
    expect([...found].filter((name) => !bins.has(name) && !subs.has(name)).sort()).toEqual([]);
  });
});
