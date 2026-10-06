/**
 * YOUR TRUSTSHELL, the extension's Options page (Sean and Grok, 2026-10-06): where it checks, when
 * it checks, and a record of the last stamps. No key box, no route switch, no bring-your-own-key,
 * and no new permission. Everything here is in chrome.storage.local and never sent.
 *
 * The rules pinned below:
 * - a chat site switched off sends nothing and shows no stamp; settings that cannot be read check
 *   nothing (a switched-off site is never sent from because storage was slow)
 * - Only when I click: nothing is sent until the person clicks Check this reply
 * - the record keeps the stamp, the site and the time, never the text; the site comes from the
 *   tab's own URL, not from the message
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

type Settings = { sites: Record<string, boolean>; mode: 'auto' | 'click' };
type Entry = { label: string; site: string; at: number; by: string | null; deciders: string[] };
type Rec = { counts: Record<string, number>; recent: Entry[] };
type SettingsApi = {
  __reset: () => void;
  SETTINGS_KEY: string;
  RECORD_KEY: string;
  RECENT_MAX: number;
  AUTO: 'auto';
  CLICK: 'click';
  SITES: Array<{ id: string; name: string; hosts: string[] }>;
  normalSettings: (raw: unknown) => Settings;
  normalRecord: (raw: unknown) => Rec;
  siteOf: (host: string) => string | null;
  siteName: (id: string) => string;
  siteOn: (s: Settings | null, site: string | null) => boolean;
  ready: (storage?: unknown) => Promise<Settings | null>;
  current: () => Settings | null;
  recordEntry: (message: unknown, senderUrl: unknown, at: number) => Entry | null;
  addToRecord: (local: unknown, entry: unknown) => Promise<void>;
};

const settings = require('../extension/settings.js') as SettingsApi;

/** A chrome.storage.local stand-in: callbacks run on a later tick, as the real one's do. */
function fakeLocal(bag: Record<string, unknown> = {}) {
  return {
    bag,
    get: jest.fn((keys: string[], cb: (v: Record<string, unknown>) => void) => {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in bag) out[k] = JSON.parse(JSON.stringify(bag[k]));
      setTimeout(() => cb(out), 0);
    }),
    set: jest.fn((v: Record<string, unknown>, cb?: () => void) => {
      Object.assign(bag, JSON.parse(JSON.stringify(v)));
      setTimeout(() => cb && cb(), 0);
    }),
    remove: jest.fn((k: string) => {
      delete bag[k];
    }),
  };
}

beforeEach(() => settings.__reset());

describe('settings: what the person chose, and what happens when nothing was chosen', () => {
  it('missing is every site on, automatically: what the extension did before the page', () => {
    const s = settings.normalSettings(undefined);
    expect(Object.values(s.sites).every(Boolean)).toBe(true);
    expect(s.mode).toBe('auto');
  });

  it('a site is off only when switched off; click only when chosen', () => {
    const s = settings.normalSettings({ sites: { claude: false, grok: 'no', gemini: 0 }, mode: 'CLICK' });
    expect(s.sites.claude).toBe(false);
    expect(s.sites.grok).toBe(true);
    expect(s.sites.gemini).toBe(true);
    expect(s.mode).toBe('auto');
    expect(settings.normalSettings({ mode: 'click' }).mode).toBe('click');
  });

  it("the sites are exactly the manifest's chat hosts, and every one loads settings.js before classify.js", () => {
    const manifest = JSON.parse(read('extension/manifest.json')) as {
      content_scripts: Array<{ matches: string[]; js: string[] }>;
      permissions: string[];
    };
    const hosts = manifest.content_scripts.flatMap((c) => c.matches.map((m) => new URL(m.replace('/*', '/')).hostname));
    expect(new Set(settings.SITES.flatMap((s) => s.hosts))).toEqual(new Set(hosts));
    for (const c of manifest.content_scripts) {
      expect(c.js[0]).toBe('settings.js');
      expect(c.js.indexOf('classify.js')).toBeGreaterThan(0);
    }
    // No new permission.
    expect(manifest.permissions).toEqual(['storage', 'contextMenus', 'activeTab', 'scripting']);
  });

  it('ready() reads storage once; a read that fails is null, never the defaults', async () => {
    const local = fakeLocal({ settings: { sites: { chatgpt: false } } });
    const s = await settings.ready({ local });
    expect(s?.sites.chatgpt).toBe(false);
    await settings.ready({ local });
    expect(local.get).toHaveBeenCalledTimes(1);

    settings.__reset();
    const g = globalThis as { chrome?: unknown };
    g.chrome = { runtime: { lastError: { message: 'boom' } } };
    try {
      expect(await settings.ready({ local: fakeLocal() })).toBeNull();
    } finally {
      delete g.chrome;
    }
  });
});

describe('the record: the stamp, the site and the time, never the text', () => {
  it('the site comes from the tab URL, not from the message, and the text is never kept', () => {
    const e = settings.recordEntry(
      { label: 'veto', site: 'grok', text: 'secret reply text', by: 'votes', deciders: ['groq', 'cerebras', 'extra'] },
      'https://claude.ai/chat/abc',
      1000,
    );
    expect(e).toEqual({ label: 'veto', site: 'claude', at: 1000, by: 'votes', deciders: ['groq', 'cerebras'] });
    expect(JSON.stringify(e)).not.toContain('secret');
  });

  it('refuses what it cannot vouch for: another host, an unknown label, a bad URL', () => {
    expect(settings.recordEntry({ label: 'pass' }, 'https://evil.example/', 1)).toBeNull();
    expect(settings.recordEntry({ label: 'checking' }, 'https://chatgpt.com/', 1)).toBeNull();
    expect(settings.recordEntry({ label: 'pass' }, 'not a url', 1)).toBeNull();
    const odd = settings.recordEntry({ label: 'pass', by: 'magic', deciders: ['<b>', 'groq'] }, 'https://chatgpt.com/c/1', 1);
    expect(odd).toEqual({ label: 'pass', site: 'chatgpt', at: 1, by: null, deciders: ['groq'] });
  });

  it('counts each stamp, keeps the newest first, at most RECENT_MAX, and two writes at once both land', async () => {
    const local = fakeLocal();
    const writes = [];
    for (let i = 0; i < settings.RECENT_MAX + 3; i += 1) {
      writes.push(settings.addToRecord(local, { label: i % 2 ? 'pass' : 'not-checked', site: 'gemini', at: i, by: 'votes', deciders: [] }));
    }
    await Promise.all(writes);
    const rec = settings.normalRecord(local.bag.record);
    expect(rec.counts.pass + rec.counts['not-checked']).toBe(settings.RECENT_MAX + 3);
    expect(rec.counts.veto).toBe(0);
    expect(rec.recent).toHaveLength(settings.RECENT_MAX);
    expect(rec.recent[0]!.at).toBe(settings.RECENT_MAX + 2);
  });
});

/** classify.js with a settings stub, in a fresh module so its memo starts empty. */
function loadClassify(cfg: Settings | null, host = 'chatgpt.com') {
  const g = globalThis as Record<string, unknown>;
  g.location = { hostname: host };
  g.trustshellSettings = {
    ...settings,
    ready: () => Promise.resolve(cfg),
    current: () => cfg,
  };
  let mod: Record<string, unknown> = {};
  jest.isolateModules(() => {
    mod = require('../extension/classify.js') as Record<string, unknown>;
  });
  return mod as {
    whenSettled: (run: () => void, ms?: number) => void;
    classifyReply: (text: string) => Promise<{ label: string }>;
    knownRow: (text: string) => { label: string } | null;
    paintStamp: (stamp: unknown, label: string) => unknown;
    STAMP_WORDS: Record<string, string>;
  };
}

function cleanup() {
  const g = globalThis as Record<string, unknown>;
  delete g.location;
  delete g.trustshellSettings;
  delete g.chrome;
  delete g.trustshellLaya;
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

const ON: Settings = { sites: { chatgpt: true, claude: true, gemini: true, grok: true, deepseek: true }, mode: 'auto' };

describe('where it checks: a site switched off sends nothing', () => {
  afterEach(cleanup);

  it.each([
    ['switched off', { ...ON, sites: { ...ON.sites, chatgpt: false } }, false],
    ['unreadable settings', null, false],
    ['switched on', ON, true],
  ])('%s', async (_why, cfg, runs) => {
    jest.useFakeTimers();
    try {
      const api = loadClassify(cfg as Settings | null);
      const run = jest.fn();
      api.whenSettled(run, 10);
      jest.advanceTimersByTime(20);
      jest.useRealTimers();
      await new Promise((r) => setTimeout(r, 0));
      expect(run).toHaveBeenCalledTimes(runs ? 1 : 0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('another site being off does not stop this one', async () => {
    const api = loadClassify({ ...ON, sites: { ...ON.sites, claude: false } }, 'chatgpt.com');
    const run = jest.fn();
    api.whenSettled(run, 0);
    await new Promise((r) => setTimeout(r, 20));
    expect(run).toHaveBeenCalledTimes(1);
  });
});

/** A stamp element good enough for paintStamp and a click. */
function fakeStamp() {
  const handlers: Record<string, Array<(e: unknown) => void>> = {};
  const attrs: Record<string, string> = {};
  return {
    dataset: {} as Record<string, string>,
    textContent: '',
    title: '',
    tabIndex: -1,
    attrs,
    setAttribute: (k: string, v: string) => (attrs[k] = v),
    removeAttribute: (k: string) => delete attrs[k],
    addEventListener: (t: string, fn: (e: unknown) => void) => (handlers[t] ||= []).push(fn),
    fire: (t: string, e: Record<string, unknown> = {}) => (handlers[t] || []).forEach((fn) => fn({ type: t, ...e })),
  };
}

describe('when it checks: Only when I click sends nothing until the click', () => {
  afterEach(cleanup);

  it('the reply is offered, not sent: Check this reply, a button, and no request', async () => {
    const engine = stubEngine('pass');
    try {
      require('../extension/scrub.js');
      require('../extension/laya.js');
      const api = loadClassify({ ...ON, mode: 'click' });
      expect(api.knownRow('Paris is the capital of France.')).toEqual({ label: 'ask', latency_ms: 0 });
      expect(await api.classifyReply('Paris is the capital of France.')).toEqual({ label: 'ask', latency_ms: 0 });
      expect(engine.sent).toHaveLength(0);

      const stamp = fakeStamp();
      api.paintStamp(stamp, 'ask');
      expect(stamp.textContent).toBe('Check this reply');
      expect(stamp.attrs.role).toBe('button');
      expect(stamp.tabIndex).toBe(0);

      // A key that is not Enter or Space does nothing.
      stamp.fire('keydown', { key: 'a' });
      expect(stamp.dataset.stamp).toBe('ask');
      stamp.fire('click');
      expect(stamp.dataset.stamp).toBe('checking');
      expect(stamp.attrs.role).toBe('status');

      // The host draws again: the clicked reply is no longer offered, and goes out once.
      expect(api.knownRow('Paris is the capital of France.')).toBeNull();
      expect((await api.classifyReply('Paris is the capital of France.')).label).toBe('pass');
      expect(engine.sent).toHaveLength(1);
      // A new reply is offered again.
      expect(api.knownRow('Water boils at 100 C at sea level.')).toEqual({ label: 'ask', latency_ms: 0 });
    } finally {
      engine.restore();
    }
  });

  it('automatically: no reply is ever offered', () => {
    const api = loadClassify(ON);
    expect(api.knownRow('Paris is the capital of France.')).toBeNull();
  });

  it('every host lets Check this reply through instead of turning it into Not checked', () => {
    expect(read('extension/content.js')).toContain("label: known || label === 'ask' ? label : 'not-checked'");
    expect(read('extension/grok.js')).toContain("label: known || label === 'ask' ? label : 'not-checked'");
    for (const f of ['claude.js', 'gemini.js', 'deepseek.js']) {
      expect(read(`extension/${f}`)).toContain("label === 'not-checked' || label === 'ask' ? label : 'not-checked'");
    }
  });
});

describe('the record is reported without the text', () => {
  afterEach(cleanup);

  it('a stamp tells the service worker its label, how and who, and not the text', async () => {
    const engine = stubEngine('veto');
    const sendMessage = jest.fn();
    (globalThis as Record<string, unknown>).chrome = { runtime: { sendMessage, lastError: undefined } };
    try {
      require('../extension/scrub.js');
      require('../extension/laya.js');
      const api = loadClassify(ON);
      const text = 'The Sun orbits the Earth.';
      await api.classifyReply(text);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      const msg = sendMessage.mock.calls[0]![0] as Record<string, unknown>;
      expect(msg).toEqual({ type: 'trustshell-record', label: 'veto', by: 'votes', deciders: ['groq', 'cerebras'] });
      expect(JSON.stringify(msg)).not.toContain('Sun');
    } finally {
      engine.restore();
    }
  });

  it('an endpoint that sends only two voters records them as who decided, as the stamp line does', async () => {
    const g = globalThis as Record<string, unknown>;
    const realFetch = g.fetch;
    g.fetch = jest.fn(async () => new Response(JSON.stringify({ label: 'pass', by: 'votes', voters: ['groq', 'cerebras'] }), { status: 200 }));
    const sendMessage = jest.fn();
    g.chrome = { runtime: { sendMessage, lastError: undefined } };
    try {
      require('../extension/scrub.js');
      require('../extension/laya.js');
      const api = loadClassify(ON);
      await api.classifyReply('Paris is the capital of France.');
      expect(sendMessage.mock.calls[0]![0]).toMatchObject({ label: 'pass', deciders: ['groq', 'cerebras'] });
    } finally {
      g.fetch = realFetch;
    }
  });

  it("grok's own draw takes the browser path, so Only when I click and the record hold there too", () => {
    const grok = read('extension/grok.js');
    expect(grok).toContain("const call = CALL_OPTIONS.some((k) => Object.prototype.hasOwnProperty.call(opts, k)) ? opts : undefined;");
    expect(grok).toContain('await stampText(text, { element: stamp, doc: doc, current: () => pending === text })');
  });

  it('a Not checked retried on the same reply is one entry, though it is sent again', async () => {
    const engine = stubEngine('not-checked');
    const sendMessage = jest.fn();
    (globalThis as Record<string, unknown>).chrome = { runtime: { sendMessage, lastError: undefined } };
    const realNow = Date.now;
    try {
      require('../extension/scrub.js');
      require('../extension/laya.js');
      const api = loadClassify(ON);
      await api.classifyReply('An opinion about tea.');
      const later = realNow() + 60_000;
      Date.now = () => later;
      await api.classifyReply('An opinion about tea.');
      expect(engine.sent).toHaveLength(2);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    } finally {
      Date.now = realNow;
      engine.restore();
    }
  });
});

describe('the service worker writes the record, and only for this extension', () => {
  afterEach(cleanup);

  function loadBackground() {
    const local = fakeLocal();
    let listener: ((m: unknown, s: unknown) => void) | null = null;
    const g = globalThis as Record<string, unknown>;
    g.chrome = {
      runtime: { id: 'ours', onMessage: { addListener: (fn: typeof listener) => (listener = fn) } },
      storage: { local },
    };
    g.trustshellSettings = settings;
    const importScripts = jest.fn();
    // background.js is a service worker script, not a module: run it with importScripts stubbed.
    new Function('importScripts', 'chrome', 'globalThis', read('extension/background.js'))(importScripts, g.chrome, g);
    return { local, listener: listener!, importScripts };
  }

  it('records a stamp from a chat tab; ignores another extension, another message, another host', async () => {
    const { local, listener, importScripts } = loadBackground();
    expect(importScripts).toHaveBeenCalledWith('settings.js', 'scrub.js', 'laya.js', 'classify.js', 'select.js');
    listener({ type: 'trustshell-record', label: 'pass' }, { id: 'someone-else', url: 'https://chatgpt.com/' });
    listener({ type: 'trustshell-verify', label: 'pass' }, { id: 'ours', url: 'https://chatgpt.com/' });
    listener({ type: 'trustshell-record', label: 'pass' }, { id: 'ours', url: 'https://evil.example/' });
    listener({ type: 'trustshell-record', label: 'pass', by: 'votes', deciders: ['groq', 'workers-ai'] }, { id: 'ours', url: 'https://grok.com/c/1' });
    await new Promise((r) => setTimeout(r, 20));
    const rec = settings.normalRecord(local.bag.record);
    expect(rec.counts.pass).toBe(1);
    expect(rec.recent[0]).toMatchObject({ label: 'pass', site: 'grok', deciders: ['groq', 'workers-ai'] });
  });

  it('the old verify handler, its key and its route are gone', () => {
    const bg = read('extension/background.js');
    expect(bg).not.toContain('trustshell-verify');
    expect(bg).not.toContain('hostKey');
    expect(bg).not.toMatch(/route\.js|verify\.js|popup\.js/);
  });
});

type OptionsApi = {
  renderSettings: (doc: unknown, raw: unknown) => Settings;
  readSettings: (doc: unknown) => Settings;
  renderRecord: (doc: unknown, raw: unknown) => Rec;
  downloadText: (raw: unknown) => string;
  save: (doc: unknown, storage: unknown) => boolean;
  clearClick: (button: { textContent: string }, storage: unknown) => boolean;
  bind: (doc: unknown, storage: unknown, onChanged: unknown) => void;
  CLEAR: string;
  CONFIRM: string;
};

/** Just enough DOM for options.js: the inputs options.html declares, and the record nodes. */
function fakeOptionsDoc() {
  const html = read('extension/options.html');
  const inputs = [...html.matchAll(/<input type="(checkbox|radio)" name="(\w+)" value="([\w-]+)">/g)].map((m) => {
    const handlers: Array<() => void> = [];
    return {
      type: m[1],
      name: m[2],
      value: m[3],
      checked: false,
      addEventListener: (_t: string, fn: () => void) => handlers.push(fn),
      change() {
        handlers.forEach((fn) => fn());
      },
    };
  });
  const node = () => ({
    textContent: '',
    children: [] as Array<{ textContent: string }>,
    get firstChild() {
      return this.children[0];
    },
    removeChild(c: { textContent: string }) {
      this.children.splice(this.children.indexOf(c), 1);
    },
    appendChild(c: { textContent: string }) {
      this.children.push(c);
    },
    addEventListener: jest.fn(),
  });
  const nodes: Record<string, ReturnType<typeof node>> = {
    '#record-counts': node(),
    '#record-last': node(),
    '#record-recent': node(),
    '#record-download': node(),
    '#record-clear': node(),
  };
  return {
    inputs,
    nodes,
    querySelectorAll: (sel: string) => {
      const name = /name="(\w+)"/.exec(sel)![1];
      return inputs.filter((i) => i.name === name);
    },
    querySelector: (sel: string) => nodes[sel] ?? null,
    createElement: () => ({ textContent: '' }),
  };
}

describe('the Options page', () => {
  afterEach(cleanup);

  function loadOptions(): OptionsApi {
    (globalThis as Record<string, unknown>).trustshellSettings = settings;
    require('../extension/classify.js');
    return require('../extension/options.js') as OptionsApi;
  }

  it('has a switch per chat site, the two ways to check, the record, and no key or route', () => {
    const html = read('extension/options.html');
    expect(html).toContain('<title>Your TrustShell</title>');
    for (const s of settings.SITES) expect(html).toContain(`<input type="checkbox" name="site" value="${s.id}"> ${s.name}</label>`);
    expect(html).toContain('<input type="radio" name="mode" value="auto"> Automatically, after each reply');
    expect(html).toContain('<input type="radio" name="mode" value="click"> Only when I click Check this reply');
    expect(html).toContain('Never the text.');
    expect(html).not.toMatch(/type="password"|name="key"|name="route"|Cheap first|My model/);
    expect(read('extension/options.js')).not.toMatch(/hostKey|KEY_STORAGE|trustshellRoute|route\.js/);
  });

  it('shows what is stored, and saves what is changed', () => {
    const opts = loadOptions();
    const doc = fakeOptionsDoc();
    opts.renderSettings(doc, { sites: { deepseek: false }, mode: 'click' });
    expect(doc.inputs.find((i) => i.value === 'deepseek')!.checked).toBe(false);
    expect(doc.inputs.find((i) => i.value === 'chatgpt')!.checked).toBe(true);
    expect(doc.inputs.find((i) => i.value === 'click')!.checked).toBe(true);
    const local = fakeLocal();
    doc.inputs.find((i) => i.value === 'claude')!.checked = false;
    expect(opts.save(doc, { local })).toBe(true);
    expect(local.bag.settings).toEqual({
      sites: { chatgpt: true, claude: false, gemini: true, grok: true, deepseek: false },
      mode: 'click',
    });
  });

  it('the record: counts in the stamp words, the last stamp with who decided, and no text anywhere', () => {
    const opts = loadOptions();
    const doc = fakeOptionsDoc();
    const raw = {
      counts: { pass: 3, veto: 1, 'not-checked': 2 },
      recent: [
        { label: 'veto', site: 'claude', at: Date.UTC(2026, 9, 6, 10, 0), by: 'votes', deciders: ['groq', 'workers-ai'] },
        { label: 'pass', site: 'chatgpt', at: Date.UTC(2026, 9, 6, 9, 0), by: 'arithmetic', deciders: [] },
      ],
    };
    opts.renderRecord(doc, raw);
    expect(doc.nodes['#record-counts']!.textContent).toBe('Checks out 3 · Caught 1 · Not checked 2');
    expect(doc.nodes['#record-last']!.textContent).toMatch(/^Last stamp: Caught on Claude, .+\. Groq and Cloudflare Workers AI both said false\.$/);
    expect(doc.nodes['#record-recent']!.children.map((c) => c.textContent.split(', ').slice(0, 2).join(', '))).toEqual([
      'Caught, Claude',
      'Checks out, ChatGPT',
    ]);
    const file = JSON.parse(opts.downloadText(raw)) as { counts: unknown; recent: Array<Record<string, unknown>> };
    expect(file.counts).toEqual(raw.counts);
    expect(file.recent[0]).toEqual({
      stamp: 'Caught',
      label: 'veto',
      site: 'Claude',
      at: '2026-10-06T10:00:00.000Z',
      decided_by: 'votes',
      deciders: ['groq', 'workers-ai'],
    });
    expect(Object.keys(file.recent[0]!)).not.toContain('text');
    opts.renderRecord(doc, undefined);
    expect(doc.nodes['#record-last']!.textContent).toBe('No stamps yet.');
  });

  it('Clear takes two clicks', () => {
    const opts = loadOptions();
    const local = fakeLocal({ record: { counts: { pass: 1 } } });
    const button = { textContent: opts.CLEAR };
    expect(opts.clearClick(button, { local })).toBe(false);
    expect(button.textContent).toBe(opts.CONFIRM);
    expect(local.bag.record).toBeDefined();
    expect(opts.clearClick(button, { local })).toBe(true);
    expect(local.bag.record).toBeUndefined();
  });

  it('live: a stamp painted in another tab shows here without a reload', async () => {
    const opts = loadOptions();
    const doc = fakeOptionsDoc();
    let changed: ((c: unknown, area: string) => void) | null = null;
    opts.bind(doc, { local: fakeLocal() }, { addListener: (fn: typeof changed) => (changed = fn) });
    await new Promise((r) => setTimeout(r, 10));
    expect(doc.nodes['#record-last']!.textContent).toBe('No stamps yet.');
    changed!({ record: { newValue: { counts: { pass: 1 }, recent: [{ label: 'pass', site: 'grok', at: 1, by: null, deciders: [] }] } } }, 'local');
    expect(doc.nodes['#record-counts']!.textContent).toBe('Checks out 1 · Caught 0 · Not checked 0');
    expect(doc.nodes['#record-last']!.textContent).toMatch(/^Last stamp: Checks out on Grok, /);
  });
});

describe('the words around it', () => {
  it('the privacy page says what the Options page keeps, and that it is never sent', () => {
    const privacy = read('public/privacy.html');
    expect(privacy).toContain('a record of your last 20 stamps (the stamp, the chat site and the time, never the text)');
    expect(privacy).toContain('The extension never sends them.');
    expect(privacy).toContain('A chat site you switch off sends nothing');
    expect(privacy).not.toContain('If you type a key');
  });

  it('the Store listing discloses the local record, and no longer a key', () => {
    const listing = read('store/LISTING.md');
    expect(listing).toContain('- **Web history**: the Options page record keeps the last 20 stamps');
    expect(listing).not.toContain('Authentication information');
    expect(listing).toContain('Check this reply');
  });
});
