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
      args: ['-y', '-p', '@hyperdag/trustshell@1.8.0', 'trustshell-mcp'],
    });
    expect(agent.mcpPaste()).toContain('"@hyperdag/trustshell@1.8.0"');
    expect(agent.mcpPaste()).toContain('"trustshell-mcp"');
  });

  it('names Claude Desktop, Cursor and Claude Code, then says not yet', () => {
    expect(agent.AGENT_TABS.map((tab) => tab.label)).toEqual(['Claude Desktop', 'Cursor', 'Claude Code']);
    expect(agent.NOT_YET).toBe('ChatGPT and Grok apps: not yet. On their websites, use the Chrome extension.');
  });

  it('the install-first home renders its MCP tab from the same pinned config', () => {
    // 2026-10-24: the home page is one command, the real output and three install tabs; the MCP tab
    // pastes mcpPaste(), so it cannot drift from .mcp.json.
    const html = renderHome();
    expect(html).toContain('id="how"');
    expect(html).toContain('id="install"');
    expect(html).toContain('&quot;@hyperdag/trustshell@1.8.0&quot;');
    expect(html.indexOf('<h1')).toBeGreaterThan(-1);
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('id="install"'));
  });

  it('does not say the lines that are not true', () => {
    const files = [
      'components/home-agent.tsx',
      'app/page.tsx',
      'components/home-install.tsx',
      'components/top-nav.tsx',
      'components/hero-result.tsx',
    ];
    const source = files.map((rel) => readFileSync(join(ROOT, rel), 'utf8')).join('\n');
    for (const line of FORBIDDEN) expect(source).not.toContain(line);
    expect(source).not.toMatch(/\d\s*ms\b|accuracy\s*%|%\s*accurate/i);
    expect(source).not.toMatch(/\blaya\b|\bjev\b/i);
  });
});
