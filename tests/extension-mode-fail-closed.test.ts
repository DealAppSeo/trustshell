/**
 * X-2b (XC1 ledger): the extension FAILED OPEN on a setting it did not recognise. `normalSettings` read
 * `mode === 'click' ? 'click' : 'auto'`, and the send gate in classify.js read `mode !== 'click'`, so a `mode`
 * that was a wrong-case spelling ("Click", "CLICK"), a stray value, a null, a missing key, or settings that
 * were not an object at all all fell through to AUTO-SEND. A person who chose "Only when I click" could be
 * silently reverted by a migration or a typo, and their reply sent without a click.
 *
 * Now: auto-send happens only for an EXACT `auto`, or for nothing stored at all. Anything else is ask-first.
 *
 * NOT changed here (a product decision for Sean, X-2a): what a fresh install does. Nothing stored is still
 * `auto`, and these tests pin that so nobody mistakes this change for flipping the default.
 *
 * It can only ask more. It never sends something that used to be held back.
 */
export {};

type Settings = { sites: Record<string, boolean>; mode: string };
type SettingsApi = {
  __reset: () => void;
  AUTO: 'auto';
  CLICK: 'click';
  normalSettings: (raw: unknown) => Settings;
  ready: (storage?: unknown) => Promise<Settings | null>;
  current: () => Settings | null;
};

const settings = require('../extension/settings.js') as SettingsApi;

const SITES = { chatgpt: true, claude: true, gemini: true, grok: true, deepseek: true };

/** A chrome.storage.local stand-in: callbacks run on a later tick, as the real one's do. */
function fakeLocal(bag: Record<string, unknown> = {}) {
  return {
    get: (keys: string[], cb: (v: Record<string, unknown>) => void) => {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in bag) out[k] = bag[k];
      setTimeout(() => cb(out), 0);
    },
  };
}

beforeEach(() => settings.__reset());

describe('X-2b: normalSettings keeps auto-send for an exact auto, and for nothing stored', () => {
  it('nothing stored is the product default, AUTO (X-2a is Sean\'s call, not this change)', () => {
    expect(settings.normalSettings(undefined).mode).toBe('auto');
  });

  it('an exact "auto" is auto', () => {
    expect(settings.normalSettings({ sites: SITES, mode: 'auto' }).mode).toBe('auto');
  });

  it('an exact "click" is click', () => {
    expect(settings.normalSettings({ sites: SITES, mode: 'click' }).mode).toBe('click');
  });

  it.each([
    ['a wrong-case "Click"', { sites: SITES, mode: 'Click' }],
    ['"CLICK"', { sites: SITES, mode: 'CLICK' }],
    ['a wrong-case "Auto" (not the exact auto)', { sites: SITES, mode: 'Auto' }],
    ['"AUTO"', { sites: SITES, mode: 'AUTO' }],
    ['a padded " auto"', { sites: SITES, mode: ' auto' }],
    ['"click " with a space', { sites: SITES, mode: 'click ' }],
    ['a stray word', { sites: SITES, mode: 'manual' }],
    ['"on"', { sites: SITES, mode: 'on' }],
    ['the empty string', { sites: SITES, mode: '' }],
    ['null', { sites: SITES, mode: null }],
    ['true', { sites: SITES, mode: true }],
    ['the number 1', { sites: SITES, mode: 1 }],
    ['an object', { sites: SITES, mode: { value: 'auto' } }],
    ['an array', { sites: SITES, mode: ['auto'] }],
    ['a missing mode key (a migration that dropped it)', { sites: SITES }],
    ['an empty settings object', {}],
    ['settings that are a string', 'auto'],
    ['settings that are the string "{\\"mode\\":\\"auto\\"}"', '{"mode":"auto"}'],
    ['settings that are a number', 1],
    ['settings that are true', true],
    ['settings that are an array', [{ mode: 'auto' }]],
    ['settings that are null', null],
  ])('%s is ask-first, not auto-send', (_label, raw) => {
    expect(settings.normalSettings(raw).mode).toBe('click');
  });

  it('what else normalSettings returns is unchanged: every site on unless switched off', () => {
    const s = settings.normalSettings({ sites: { claude: false }, mode: 'Click' });
    expect(s.sites.claude).toBe(false);
    expect(s.sites.chatgpt).toBe(true);
    expect(Object.keys(s.sites).sort()).toEqual(['chatgpt', 'claude', 'deepseek', 'gemini', 'grok']);
  });
});

describe('X-2b: the same, read from storage the way the extension reads it', () => {
  it('a stored wrong-case mode is ask-first after ready()', async () => {
    const cfg = await settings.ready({ local: fakeLocal({ settings: { sites: SITES, mode: 'Click' } }) });
    expect(cfg?.mode).toBe('click');
  });

  it('nothing in storage is still auto after ready()', async () => {
    const cfg = await settings.ready({ local: fakeLocal({}) });
    expect(cfg?.mode).toBe('auto');
  });

  it('settings that cannot be read are still null (nothing is checked), not defaults', async () => {
    const g = globalThis as { chrome?: unknown };
    g.chrome = { runtime: { lastError: { message: 'boom' } } };
    try {
      expect(await settings.ready({ local: fakeLocal({}) })).toBeNull();
    } finally {
      delete g.chrome;
    }
  });
});

/** classify.js against the REAL settings module (not a stub), in a fresh module so its memo starts empty. */
function loadClassifyWithRealSettings(host = 'chatgpt.com') {
  const g = globalThis as Record<string, unknown>;
  g.location = { hostname: host };
  g.trustshellSettings = settings;
  let mod: Record<string, unknown> = {};
  jest.isolateModules(() => {
    mod = require('../extension/classify.js') as Record<string, unknown>;
  });
  return mod as {
    classifyReply: (text: string) => Promise<{ label: string }>;
    knownRow: (text: string) => { label: string } | null;
  };
}

/** A fetch the laya door can call; counts what was sent. */
function stubEngine(label: string) {
  const sent: string[] = [];
  const g = globalThis as Record<string, unknown>;
  const realFetch = g.fetch;
  g.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
    sent.push(String(init?.body ?? ''));
    return new Response(JSON.stringify({ label, by: 'votes', voters: ['groq', 'cerebras'], deciders: ['groq', 'cerebras'] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { sent, restore: () => (g.fetch = realFetch) };
}

function cleanup() {
  const g = globalThis as Record<string, unknown>;
  delete g.location;
  delete g.trustshellSettings;
  delete g.chrome;
  delete g.trustshellLaya;
}

describe('X-2b: end to end, a reply is NOT sent when the stored mode is not an exact auto', () => {
  afterEach(cleanup);

  it.each([
    ['"Click"', { sites: SITES, mode: 'Click' }],
    ['"manual"', { sites: SITES, mode: 'manual' }],
    ['null', { sites: SITES, mode: null }],
    ['a missing mode', { sites: SITES }],
    ['non-object settings', 'auto'],
  ])('stored mode %s: the reply is offered (Check this reply) and nothing is sent', async (_label, raw) => {
    const engine = stubEngine('pass');
    try {
      require('../extension/scrub.js');
      require('../extension/laya.js');
      await settings.ready({ local: fakeLocal({ settings: raw }) });
      const api = loadClassifyWithRealSettings();
      expect(api.knownRow('Paris is the capital of France.')).toEqual({ label: 'ask', latency_ms: 0 });
      expect(await api.classifyReply('Paris is the capital of France.')).toEqual({ label: 'ask', latency_ms: 0 });
      expect(engine.sent).toHaveLength(0);
    } finally {
      engine.restore();
    }
  });

  it('the default is untouched: nothing stored still sends without a click', async () => {
    const engine = stubEngine('pass');
    try {
      require('../extension/scrub.js');
      require('../extension/laya.js');
      await settings.ready({ local: fakeLocal({}) });
      const api = loadClassifyWithRealSettings();
      expect(api.knownRow('Paris is the capital of France.')).toBeNull();
      expect((await api.classifyReply('Paris is the capital of France.')).label).toBe('pass');
      expect(engine.sent).toHaveLength(1);
    } finally {
      engine.restore();
    }
  });

  it('an exact stored auto still sends without a click', async () => {
    const engine = stubEngine('pass');
    try {
      require('../extension/scrub.js');
      require('../extension/laya.js');
      await settings.ready({ local: fakeLocal({ settings: { sites: SITES, mode: 'auto' } }) });
      const api = loadClassifyWithRealSettings();
      expect(api.knownRow('Paris is the capital of France.')).toBeNull();
      expect((await api.classifyReply('Paris is the capital of France.')).label).toBe('pass');
      expect(engine.sent).toHaveLength(1);
    } finally {
      engine.restore();
    }
  });
});

describe('X-2b: the send gate is closed on its own, not only because the settings were cleaned', () => {
  afterEach(cleanup);

  // classify.js is handed settings that did NOT come from normalSettings (a stale cache, a future writer).
  it.each(['Click', 'manual', '', 'AUTO', undefined, null, 1])('a settings object whose mode is %p asks first', (mode) => {
    const g = globalThis as Record<string, unknown>;
    g.location = { hostname: 'chatgpt.com' };
    const cfg = { sites: SITES, mode };
    g.trustshellSettings = { ...settings, ready: () => Promise.resolve(cfg), current: () => cfg };
    let api: { knownRow: (t: string) => { label: string } | null } = { knownRow: () => null };
    jest.isolateModules(() => {
      api = require('../extension/classify.js') as typeof api;
    });
    expect(api.knownRow('Paris is the capital of France.')).toEqual({ label: 'ask', latency_ms: 0 });
  });

  it('only an exact auto sends', () => {
    const g = globalThis as Record<string, unknown>;
    g.location = { hostname: 'chatgpt.com' };
    const cfg = { sites: SITES, mode: 'auto' };
    g.trustshellSettings = { ...settings, ready: () => Promise.resolve(cfg), current: () => cfg };
    let api: { knownRow: (t: string) => { label: string } | null } = { knownRow: () => ({ label: 'x' }) };
    jest.isolateModules(() => {
      api = require('../extension/classify.js') as typeof api;
    });
    expect(api.knownRow('Paris is the capital of France.')).toBeNull();
  });
});
