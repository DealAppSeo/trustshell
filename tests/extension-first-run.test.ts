/**
 * SEC F1 (security run 2026-10-16, MAJOR, a privacy default). A fresh install of the Chrome extension
 * used to check every reply on every chat site AUTOMATICALLY: the reply text left for the engine, and
 * from there for third-party checker LLMs, before the person had read what is sent or where.
 *
 * Now, pinned below:
 * - nothing stored (a fresh install) = every site OFF and ask-first (Only when I click);
 * - with every site off a reply is not sent and no stamp is painted;
 * - the Options page opens by itself when nothing was chosen yet, and says first what is sent and
 *   where (the engine's /api/v1/classify, then the outside checkers);
 * - Automatically stays a choice the person makes; an install that saved settings keeps them.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

type Settings = { sites: Record<string, boolean>; mode: string };
type SettingsApi = {
  __reset: () => void;
  SETTINGS_KEY: string;
  SITES: Array<{ id: string }>;
  normalSettings: (raw: unknown) => Settings;
  ready: (storage?: unknown) => Promise<Settings | null>;
};

const settings = require('../extension/settings.js') as SettingsApi;
const ALL_ON = { chatgpt: true, claude: true, gemini: true, grok: true, deepseek: true };

function fakeLocal(bag: Record<string, unknown> = {}) {
  return {
    bag,
    get: (keys: string[], cb: (v: Record<string, unknown>) => void) => {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in bag) out[k] = bag[k];
      setTimeout(() => cb(out), 0);
    },
    set: (v: Record<string, unknown>, cb?: () => void) => {
      Object.assign(bag, v);
      setTimeout(() => cb && cb(), 0);
    },
  };
}

function cleanup() {
  const g = globalThis as Record<string, unknown>;
  for (const k of ['location', 'trustshellSettings', 'chrome']) delete g[k];
}

beforeEach(() => settings.__reset());
afterEach(cleanup);

describe('SEC F1: the fresh-install defaults', () => {
  it('nothing stored is every site OFF, and ask-first', () => {
    const s = settings.normalSettings(undefined);
    expect(s.mode).toBe('click');
    expect(Object.keys(s.sites).sort()).toEqual(['chatgpt', 'claude', 'deepseek', 'gemini', 'grok']);
    expect(Object.values(s.sites).some(Boolean)).toBe(false);
  });

  it.each([
    ['null', null],
    ['a string', 'auto'],
    ['an array', [{ mode: 'auto', sites: ALL_ON }]],
    ['a number', 1],
  ])('settings that are %s are not a choice: every site off, ask-first', (_why, raw) => {
    const s = settings.normalSettings(raw);
    expect(s.mode).toBe('click');
    expect(Object.values(s.sites).some(Boolean)).toBe(false);
  });

  it('nothing in storage reads back as off and ask-first, the way the content scripts read it', async () => {
    const cfg = await settings.ready({ local: fakeLocal({}) });
    expect(cfg?.mode).toBe('click');
    expect(Object.values(cfg!.sites).some(Boolean)).toBe(false);
  });

  it('an existing install keeps what it saved, Automatically included', () => {
    expect(settings.normalSettings({ sites: ALL_ON, mode: 'auto' })).toEqual({ sites: ALL_ON, mode: 'auto' });
    const partial = settings.normalSettings({ sites: { claude: false }, mode: 'click' });
    expect(partial.sites.claude).toBe(false);
    expect(partial.sites.chatgpt).toBe(true);
    expect(partial.mode).toBe('click');
  });
});

describe('SEC F1: with nothing stored, a reply on a chat site is not sent and gets no stamp', () => {
  it('whenSettled does not run the check, and fetch is never called', async () => {
    const g = globalThis as Record<string, unknown>;
    const realFetch = g.fetch;
    const fetchSpy = jest.fn();
    g.fetch = fetchSpy;
    try {
      await settings.ready({ local: fakeLocal({}) });
      g.location = { hostname: 'chatgpt.com' };
      g.trustshellSettings = settings;
      let api: { whenSettled: (run: () => void, ms?: number) => void } | null = null;
      jest.isolateModules(() => {
        api = require('../extension/classify.js') as typeof api;
      });
      const run = jest.fn();
      api!.whenSettled(run, 0);
      await new Promise((r) => setTimeout(r, 20));
      expect(run).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      g.fetch = realFetch;
    }
  });
});

describe('SEC F1: the first-run page', () => {
  type Listener = (details: { reason: string }) => void;

  function loadBackground(bag: Record<string, unknown>) {
    let onInstalled: Listener | null = null;
    const opened = jest.fn();
    const g = globalThis as Record<string, unknown>;
    g.chrome = {
      runtime: {
        id: 'ours',
        onMessage: { addListener: () => undefined },
        onInstalled: { addListener: (fn: Listener) => (onInstalled = fn) },
        getURL: (path: string) => `chrome-extension://ours/${path}`,
      },
      tabs: { create: (opts: { url: string }) => opened(opts.url) },
      storage: { local: fakeLocal(bag) },
    };
    g.trustshellSettings = settings;
    new Function('importScripts', 'chrome', 'globalThis', read('extension/background.js'))(jest.fn(), g.chrome, g);
    return { fire: (reason: string) => onInstalled!({ reason }), opened };
  }

  const tick = () => new Promise((r) => setTimeout(r, 10));

  it('opens by itself at install', async () => {
    const bg = loadBackground({});
    bg.fire('install');
    await tick();
    expect(bg.opened).toHaveBeenCalledTimes(1);
    expect(bg.opened).toHaveBeenCalledWith('chrome-extension://ours/options.html');
  });

  it('opens at an update of an install that never saved a choice (its sites just went off)', async () => {
    const bg = loadBackground({});
    bg.fire('update');
    await tick();
    expect(bg.opened).toHaveBeenCalledTimes(1);
  });

  it('does not open for an install that saved settings, or for a Chrome update', async () => {
    const saved = loadBackground({ settings: { sites: ALL_ON, mode: 'auto' } });
    saved.fire('update');
    await tick();
    expect(saved.opened).not.toHaveBeenCalled();
    const chromeUpdate = loadBackground({});
    chromeUpdate.fire('chrome_update');
    await tick();
    expect(chromeUpdate.opened).not.toHaveBeenCalled();
  });

  it('says plainly what is sent and where, before the switches', () => {
    const html = read('extension/options.html');
    const sent = html.indexOf('What is sent, and where');
    expect(sent).toBeGreaterThan(0);
    expect(sent).toBeLessThan(html.indexOf('name="site"'));
    expect(html).toContain('Nothing is sent until you switch on a chat site below.');
    expect(html).toContain('https://repid-engine-production.up.railway.app/api/v1/classify');
    for (const host of ['Groq', 'Cerebras', 'Cloudflare Workers AI', 'OpenRouter', 'Mistral', 'Together', 'Fireworks']) {
      expect(html).toContain(host);
    }
    // Automatically is still offered, as a choice.
    expect(html).toContain('<input type="radio" name="mode" value="auto"> Automatically, after each reply');
  });

  it('the privacy page and the store listing say the same', () => {
    expect(read('public/privacy.html')).toContain('A new install starts with every chat site off');
    expect(read('store/LISTING.md')).toContain('A new install starts with every chat site off');
  });
});
