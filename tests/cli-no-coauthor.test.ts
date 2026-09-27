/**
 * The CLI must not add a Gemini or Antigravity commit trailer.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(path));
    else out.push(path);
  }
  return out;
}

describe('CLI commit identity', () => {
  it('does not add a Gemini or Antigravity trailer', () => {
    const text = files(join(__dirname, '../src/cli'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(text).not.toMatch(/Co-authored-by:[^\n]*(Gemini|Antigravity)/i);
    expect(text).not.toMatch(/gemini@trustshell\.dev/);
  });
});
