/**
 * Every manifest entry loads the way Chrome loads it: one shared global scope, files in order.
 * Unit tests require each file as its own module, so a redeclared top-level name (two files
 * both declaring `api`) passed every test while four of five hosts threw on load and painted
 * nothing. This test runs the real order in one vm context.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const EXT = join(__dirname, '../extension');
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')) as {
  content_scripts: Array<{ matches: string[]; js: string[] }>;
};

type Ctx = vm.Context & {
  trustshellLaya?: { callLaya: unknown };
  trustshellClassify?: { classifyReply: (t: string, o?: unknown) => Promise<{ label: string }> };
  trustshellToast?: unknown;
};

function load(files: string[]): Ctx {
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, AbortController, URL, performance }) as Ctx;
  (ctx as Record<string, unknown>).globalThis = ctx;
  for (const file of files) vm.runInContext(readFileSync(join(EXT, file), 'utf8'), ctx, { filename: file });
  return ctx;
}

describe('manifest load order', () => {
  it('five hosts are listed', () => {
    const matches = manifest.content_scripts.flatMap((c) => c.matches).join(' ');
    for (const host of ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'grok.com', 'chat.deepseek.com']) {
      expect(matches).toContain(host);
    }
  });

  for (const entry of manifest.content_scripts) {
    const host = entry.matches[0];
    it(`${host} loads with no redeclared name, laya.js before classify.js`, () => {
      expect(entry.js).toContain('laya.js');
      expect(entry.js).toContain('classify.js');
      expect(entry.js.indexOf('laya.js')).toBeLessThan(entry.js.indexOf('classify.js'));
      let ctx: Ctx | null = null;
      expect(() => {
        ctx = load(entry.js);
      }).not.toThrow();
      expect(typeof ctx!.trustshellLaya!.callLaya).toBe('function');
      expect(typeof ctx!.trustshellClassify!.classifyReply).toBe('function');
    });
  }

  it('in the shared scope, classify.js reaches laya.js and a veto word in the reply is not a veto', async () => {
    const chatgpt = manifest.content_scripts.find((c) => c.matches.some((m) => m.includes('chatgpt.com')))!;
    const ctx = load(chatgpt.js.filter((f) => f !== 'content.js'));
    const sent: Array<{ credentials?: string; redirect?: string }> = [];
    const said = (label: string) => async (_url: string, init: { credentials?: string; redirect?: string }) => {
      sent.push(init);
      return { status: 200, json: async () => ({ label }) };
    };
    const api = ctx.trustshellClassify!;
    const passed = await api.classifyReply('noted\nveto', { endpoint: 'http://localhost:8080/classify', fetchImpl: said('pass') });
    expect(passed.label).toBe('pass');
    expect(sent[0]!.credentials).toBe('omit');
    expect(sent[0]!.redirect).toBe('error');
  });
});
