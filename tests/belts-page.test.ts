import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, '../app/belts/page.tsx'), 'utf8').replace(/\r/g, '');

const CARDS = [
  ['CMO', 'Tell the true story in a short clip.'],
  ['CFO', 'Leave the money alone until someone says to spend it.'],
  ['CTO', 'Read the check the tool prints, and keep secrets off the screen.'],
];

describe('/belts', () => {
  it('has three cards, one sentence each, and no MCP JSON', () => {
    const block = page.slice(page.indexOf('const CARDS = ['), page.indexOf('];'));
    expect(block.match(/role: '/g)).toHaveLength(3);
    for (const [role, line] of CARDS) {
      expect(block).toContain(`role: '${role}'`);
      expect(block).toContain(`line: '${line}'`);
      expect(line.split('.').filter((part) => part.trim().length > 0)).toHaveLength(1);
    }
    expect(page).not.toMatch(/mcpServers|trustshell-mcp/);
    expect(page).not.toMatch(/```/);
    expect(page).not.toMatch(/HeyGen/i);
  });
});
