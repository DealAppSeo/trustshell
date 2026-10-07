/**
 * /start: where you already talk to AI, then a fresh agent or one you have, then one plan.
 *
 * What the old one-question page pinned and still holds: the same opening sentence and measured
 * check as the README, the question first, and nothing asked for before a pick. What changed on
 * 2026-10-07 (B3): every answer now leads to a plan whose first step is a real next step, the MCP
 * paste is the npx form the home page uses (the old `trustshell-mcp` paste needed a global install
 * the page never mentioned, and was offered to ChatGPT and Grok, which cannot load MCP), and no
 * plan sends anyone to /connect to "link an agent" — /connect stores model keys and links nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// .tsx modules load through the transpile-only transform (see jest.config.js), so they are
// required, and their shapes are restated here rather than imported as types.
type Where = 'claude-desktop' | 'claude-code' | 'cursor' | 'chat-site' | 'terminal' | 'web';
type Origin = 'fresh' | 'own';
type Step = { text: string; code?: string; href?: string; label?: string; notYet?: true };
const { mcpPaste, MCP_SERVER } = require('../components/home-agent') as { mcpPaste: () => string; MCP_SERVER: unknown };
const { ORIGIN, WHERE, planFor } = require('../lib/start-plan') as {
  ORIGIN: ReadonlyArray<{ id: Origin; label: string }>;
  WHERE: ReadonlyArray<{ id: Where; label: string }>;
  planFor: (w: Where, o: Origin) => Step[];
};

const ROOT = join(__dirname, '..');
const QUESTION = 'Where do you already talk to AI?';
const SENTENCE = 'Paste something an AI told you and see if it checks out.';
const COMMANDS = [
  'npx @hyperdag/trustshell check "If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 45 mph."',
];
const OUTPUT = 'veto\nThe classifier labelled this sentence veto — do not rely on it (356 ms).';
const AFTER = 'That run exited 1.';

const page = readFileSync(join(ROOT, 'app/start/page.tsx'), 'utf8').replace(/\r/g, '');
const layout = readFileSync(join(ROOT, 'app/start/layout.tsx'), 'utf8').replace(/\r/g, '');
const everyPlan = WHERE.flatMap((w) => ORIGIN.map((o) => ({ where: w.id as Where, origin: o.id as Origin, steps: planFor(w.id, o.id) })));

describe('/start', () => {
  it('asks where you already talk to AI, first', () => {
    expect(page).toContain(`<h1 className="text-3xl font-extrabold tracking-tight text-white">{QUESTION}</h1>`);
    expect(page).toContain(`const QUESTION = '${QUESTION}'`);
    expect(layout).toContain(QUESTION);
    expect(WHERE.map((w) => w.label)).toEqual(['Claude Desktop', 'Claude Code', 'Cursor', 'ChatGPT, Grok or Gemini', 'A terminal', 'Just this website']);
  });

  it('opens on the README sentence, and asks for nothing before a pick', () => {
    const idle = page.slice(page.indexOf('return ('), page.indexOf('{where && ('));
    expect(idle).toContain('{SENTENCE}');
    expect(page).toContain(SENTENCE);
    expect(idle).not.toMatch(/<input|<textarea/i);
    expect(idle).not.toMatch(/wallet|stake/i);
    expect(page).not.toMatch(/<input|<textarea/i);
  });

  it('shows Terminal the same check as the README, with the measured output', () => {
    const commands = page.slice(page.indexOf('const COMMANDS = `') + 'const COMMANDS = `'.length, page.indexOf('`;', page.indexOf('const COMMANDS')));
    expect(commands.split('\n')).toEqual(COMMANDS);
    expect(page).toContain(OUTPUT);
    const terminal = page.slice(page.indexOf("{where === 'terminal' && ("));
    expect(terminal.indexOf('{COMMANDS}')).toBeGreaterThan(-1);
    expect(terminal.indexOf(AFTER)).toBeGreaterThan(terminal.indexOf('{COMMANDS}'));
    expect(page).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
    expect(page).not.toMatch(/Get a receipt/);
  });

  it('every pair of answers has a plan, and its first step is something to do', () => {
    expect(everyPlan).toHaveLength(WHERE.length * ORIGIN.length);
    for (const p of everyPlan) {
      expect(p.steps.length).toBeGreaterThan(0);
      const first = p.steps[0]!;
      expect(Boolean(first.code) || Boolean(first.href) || first.notYet === true).toBe(true);
    }
  });

  it('MCP apps get the home page paste (npx, published package) and only MCP apps do', () => {
    expect(JSON.parse(mcpPaste())).toEqual({ mcpServers: { trustshell: MCP_SERVER } });
    for (const p of everyPlan) {
      const hasPaste = p.steps.some((s) => s.code === mcpPaste());
      expect({ where: p.where, hasPaste }).toEqual({ where: p.where, hasPaste: ['claude-desktop', 'claude-code', 'cursor'].includes(p.where) });
    }
  });

  it('a terminal user is told how to make an agent from the terminal', () => {
    expect(planFor('terminal', 'fresh').some((s) => s.code === 'npx @hyperdag/trustshell@1.6.0 init --pai')).toBe(true);
  });

  it('fresh is offered first, and a fresh plan always ends at claiming the agent', () => {
    expect(ORIGIN[0]!.id).toBe('fresh');
    for (const p of everyPlan.filter((x) => x.origin === 'fresh')) {
      expect(p.steps[p.steps.length - 1]!.href).toBe('/bind');
    }
  });

  it('nothing sends anyone to /connect to link an agent, and what is not built says so', () => {
    for (const p of everyPlan) for (const s of p.steps) expect(s.href).not.toBe('/connect');
    for (const w of ['chat-site', 'web', 'claude-desktop'] as const) {
      expect(planFor(w, 'own').some((s) => s.notYet)).toBe(true);
    }
  });

  it('does not ask for a stake or link a tailor path', () => {
    expect(page).not.toMatch(/stake/i);
    expect(page).not.toMatch(/Market|Leaderboard/);
    expect(page).not.toMatch(/\/start\/tailor/);
    expect(page).not.toMatch(/HeyGen|memory\.sqlite/i);
    expect(layout).not.toMatch(/wallet|stake|HeyGen/i);
  });
});
