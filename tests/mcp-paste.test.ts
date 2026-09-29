/**
 * The home MCP paste block is valid JSON for npx @hyperdag/trustshell-mcp.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '..', 'components', 'hero.tsx'), 'utf8');

describe('MCP paste block', () => {
  it('is valid JSON with npx and the trustshell-mcp args', () => {
    const block = hero.match(/const MCP_PASTE = `([\s\S]*?)`;/);
    expect(block).not.toBeNull();
    const parsed = JSON.parse(block?.[1] ?? '') as {
      mcpServers: { trustshell: { command: string; args: string[] } };
    };
    expect(parsed.mcpServers.trustshell.command).toBe('npx');
    expect(parsed.mcpServers.trustshell.args).toEqual(['-y', '@hyperdag/trustshell-mcp']);
    expect(hero).toContain('{MCP_PASTE}');
  });
});
