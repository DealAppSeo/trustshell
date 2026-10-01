/**
 * trustshell --help lists remember, recall, redact, verify, and status.
 * A command in that help text that is absent from package.json files[] fails.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';

const ROOT = join(__dirname, '..');

export function helpCommands(help: string): string[] {
  const start = help.indexOf('COMMANDS\n');
  const rest = start === -1 ? '' : help.slice(start);
  const end = rest.indexOf('\nOPTIONS\n');
  const block = end === -1 ? rest : rest.slice(0, end);
  const names = new Set<string>();
  for (const match of block.matchAll(/^  ([a-z][a-z0-9-]*)\b/gm)) names.add(match[1] as string);
  return [...names];
}

export function helpCommandsMissingFromFiles(help: string, files: readonly string[]): string[] {
  return helpCommands(help).filter((name) => !files.some((file) => {
    if (file === name) return true;
    const base = file.split(/[/\\]/).pop() ?? '';
    return base === name || base === `${name}.js`;
  }));
}

describe('help commands are packed', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8').replace(/\r/g, '')) as {
    files: string[];
  };

  async function helpText(): Promise<string> {
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    expect(await run(parseArgs(['--help']), {} as never, io)).toBe(0);
    return out.join('\n');
  }

  it('lists remember, recall, redact, verify, and status', async () => {
    const help = await helpText();
    for (const name of ['remember', 'recall', 'redact', 'verify', 'status']) {
      expect(help).toContain(name);
    }
  });

  it('fails when a help command is absent from files', async () => {
    const help = await helpText();
    expect(helpCommandsMissingFromFiles(help, pkg.files)).toEqual([]);
  });

  it('a stranger command in help that is not in files fails', () => {
    const help = 'COMMANDS\n  frobnicate <thing>   stranger\nOPTIONS\n';
    expect(helpCommandsMissingFromFiles(help, ['bin/verify.js'])).toEqual(['frobnicate']);
  });
});
