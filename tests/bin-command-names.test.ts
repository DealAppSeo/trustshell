/**
 * README and SKILL command names stay equal to package.json bin.
 * A new bin, or a subcommand written as `trustshell <name>`, fails CI.
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

describe('bin command names', () => {
  it('README and SKILL command names equal package.json bin', () => {
    const root = join(__dirname, '..');
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const skill = readFileSync(join(root, 'skills', 'trustshell', 'SKILL.md'), 'utf8');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { bin: Record<string, string> };
    const found = new Set<string>([...commandNames(readme), ...commandNames(skill)]);
    expect([...found].sort()).toEqual(Object.keys(pkg.bin).sort());
  });
});
