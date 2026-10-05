/**
 * Home screens below the hero: the agent tabs, where this goes, and the phone Check.
 * The paste matches the trustshell server pinned in .mcp.json.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';

const ROOT = join(__dirname, '..');

const FORBIDDEN = [
  'filtered before it reaches you',
  'private by default',
  'powered by Laya',
  'powered by Jev',
  'get a receipt',
  'Get a receipt',
];

function renderHome(): string {
  let html = '';
  jest.isolateModules(() => {
    const { createElement } = require('react') as typeof import('react');
    const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
    const Page = (require('../app/page') as { default: () => ReactElement }).default;
    html = renderToStaticMarkup(createElement(Page));
  });
  return html;
}

describe('home screens below the hero', () => {
  const agent = require('../components/home-agent') as {
    MCP_SERVER: { command: string; args: string[] };
    AGENT_TABS: { id: string; label: string; where: string }[];
    NOT_YET: string;
    mcpPaste: () => string;
  };
  const pinned = JSON.parse(readFileSync(join(ROOT, '.mcp.json'), 'utf8')).mcpServers.trustshell;

  it('pastes the published package config, the same one .mcp.json runs', () => {
    expect(agent.MCP_SERVER).toEqual(pinned);
    expect(agent.MCP_SERVER).toEqual({
      command: 'npx',
      args: ['-y', '-p', '@hyperdag/trustshell@1.6.0', 'trustshell-mcp'],
    });
    expect(agent.mcpPaste()).toContain('"@hyperdag/trustshell@1.6.0"');
    expect(agent.mcpPaste()).toContain('"trustshell-mcp"');
  });

  it('names Claude Desktop, Cursor and Claude Code, then says not yet', () => {
    expect(agent.AGENT_TABS.map((tab) => tab.label)).toEqual(['Claude Desktop', 'Cursor', 'Claude Code']);
    expect(agent.NOT_YET).toBe('ChatGPT and Grok apps: not yet. On their websites, use the Chrome extension.');
    const html = renderHome();
    expect(html).toContain('Add it to the agent you already use');
    expect(html).toContain('id="add-agent"');
    expect(html).toContain('Where this goes');
    expect(html).toContain('id="where"');
    expect(html).toContain('Known key and personal-data formats are removed before sending.');
    expect(html).toContain('Whole-sentence arithmetic is exact, with no model.');
    expect(html).toContain('data-testid="sticky-check"');
    expect(html).toContain('href="#claim"');
    expect(html).toContain('sm:hidden');
    const sticky = html.match(/<a\b[^>]*data-testid="sticky-check"[^>]*>/)?.[0] ?? '';
    expect(sticky).not.toMatch(/type="submit"/);
    const addAt = html.indexOf('Add it to the agent you already use');
    const whereAt = html.indexOf('Where this goes');
    const heroAt = html.indexOf('<h1');
    expect(heroAt).toBeGreaterThan(-1);
    expect(addAt).toBeGreaterThan(heroAt);
    expect(whereAt).toBeGreaterThan(addAt);
  });

  it('does not say the lines that are not true', () => {
    const files = ['components/home-agent.tsx', 'components/home-where.tsx', 'components/sticky-check.tsx', 'components/top-nav.tsx'];
    const source = files.map((rel) => readFileSync(join(ROOT, rel), 'utf8')).join('\n');
    for (const line of FORBIDDEN) expect(source).not.toContain(line);
    expect(source).not.toMatch(/\d\s*ms\b|accuracy\s*%|%\s*accurate/i);
    expect(source).not.toMatch(/\blaya\b|\bjev\b/i);
  });
});
