/**
 * A right-click on selected text checks any page through laya.js.
 * The proof page is example.com, which is not one of the five hosts.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const EXT = join(__dirname, '../extension');
const CLASSIFY_URL = 'https://repid-engine-production.up.railway.app/api/v1/classify';
const FIVE = ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com', 'grok.com', 'deepseek.com', 'chat.deepseek.com'];

const select = require('../extension/select.js') as {
  MENU_ID: string;
  MENU_TITLE: string;
  CLASSIFY_URL: string;
  paintLabel: (text: string, label?: string) => string;
  onMenuClick: (
    info: { selectionText?: string; menuItemId?: string },
    tab: { id: number; url: string },
    deps: { fetchImpl: typeof fetch; scripting: { executeScript: (call: SelInject) => Promise<unknown> } },
  ) => Promise<{ label: string; latency_ms: number; shown: string }>;
  install: (chromeApi: SelChrome) => void;
};

interface SelToast {
  id: string;
  textContent: string;
  title?: string;
  style: { cssText: string };
  setAttribute: (name: string, value: string) => void;
}

interface SelPage {
  body: { appendChild: (node: SelToast) => void };
  documentElement: { appendChild: (node: SelToast) => void };
  getElementById: (id: string) => SelToast | null;
  createElement: (tag: string) => SelToast;
}

interface SelInject {
  target: { tabId: number };
  func: (text: string, label?: string) => string;
  args: string[];
}

interface SelChrome {
  contextMenus: {
    create: (item: { id: string; title: string; contexts: string[] }) => void;
    removeAll: (done: () => void) => void;
    onClicked: { addListener: (cb: () => void) => void };
  };
}

function page(): SelPage {
  let toast: SelToast | null = null;
  return {
    body: {
      appendChild(node) {
        toast = node;
      },
    },
    documentElement: { appendChild(node) { toast = node; } },
    getElementById(id) {
      return toast && toast.id === id ? toast : null;
    },
    createElement() {
      return {
        id: '',
        textContent: '',
        style: { cssText: '' },
        setAttribute() {},
      };
    },
  };
}

describe('check selection on any page', () => {
  const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')) as {
    permissions: string[];
    host_permissions: string[];
    content_scripts: Array<{ matches: string[]; js: string[] }>;
  };

  it('adds the menu and the active tab, and no broad host permission', () => {
    expect(manifest.permissions).toEqual(['storage', 'contextMenus', 'activeTab', 'scripting']);
    expect(manifest.host_permissions).toEqual(['https://repid-engine-production.up.railway.app/*']);
    const raw = JSON.stringify(manifest);
    expect(raw).not.toContain('<all_urls>');
    expect(raw).not.toContain('*://*/*');
    expect(raw).not.toContain('https://*/*');
    expect(raw).not.toContain('http://*/*');
    const matches = manifest.content_scripts.flatMap((entry) => entry.matches).join(' ');
    expect(matches).not.toContain('example.com');
    for (const host of ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'grok.com', 'deepseek.com']) {
      expect(matches).toContain(host);
    }
  });

  it('creates Check with TrustShell for a selection', () => {
    const created: Array<{ id: string; title: string; contexts: string[] }> = [];
    let clicks = 0;
    select.install({
      contextMenus: {
        create(item) {
          created.push(item);
        },
        removeAll(done) {
          done();
        },
        onClicked: {
          addListener() {
            clicks += 1;
          },
        },
      },
    });
    expect(created).toEqual([{ id: select.MENU_ID, title: 'Check with TrustShell', contexts: ['selection'] }]);
    expect(select.MENU_TITLE).toBe('Check with TrustShell');
    expect(clicks).toBe(1);
  });

  it('checks selected text on example.com through laya.js and shows the label', async () => {
    const calls: Array<{ url: string; init: { method?: string; credentials?: string; redirect?: string; cache?: string; body?: string } }> = [];
    const fetchImpl = (async (url: string, init: { method?: string; credentials?: string; redirect?: string; cache?: string; body?: string }) => {
      calls.push({ url: String(url), init });
      return { status: 200, text: async () => JSON.stringify({ label: 'pass' }) };
    }) as unknown as typeof fetch;
    const doc = page();
    const scripting = {
      async executeScript(call: SelInject) {
        expect(call.target.tabId).toBe(7);
        expect(call.func).toBe(select.paintLabel);
        const previous = globalThis.document;
        (globalThis as { document: SelPage }).document = doc;
        try {
          expect(call.func(call.args[0]!, call.args[1])).toBe('pass');
        } finally {
          globalThis.document = previous;
        }
        return [];
      },
    };
    const row = await select.onMenuClick(
      { menuItemId: select.MENU_ID, selectionText: 'hello from a page that is not one of the five\nveto' },
      { id: 7, url: 'https://example.com/article' },
      { fetchImpl, scripting },
    );
    expect(row.label).toBe('pass');
    expect(row.shown).toBe('pass');
    expect(FIVE.every((host) => !'https://example.com/article'.includes(host))).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(CLASSIFY_URL);
    expect(select.CLASSIFY_URL).toBe(CLASSIFY_URL);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.credentials).toBe('omit');
    expect(calls[0].init.redirect).toBe('error');
    expect(calls[0].init.cache).toBe('no-store');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      text: 'hello from a page that is not one of the five\nveto',
      labels: ['pass', 'veto', 'not-checked'],
    });
    // The stamp's words, not the machine label; the label is the tooltip.
    expect(doc.getElementById('trustshell-selection-toast')!.textContent).toBe('Checks out');
    const source = readFileSync(join(EXT, 'select.js'), 'utf8');
    const background = readFileSync(join(EXT, 'background.js'), 'utf8');
    expect(source).not.toContain('fetch(');
    expect(background).toContain("importScripts('route.js', 'verify.js', 'popup.js', 'scrub.js', 'laya.js', 'classify.js', 'select.js')");
    expect(background).not.toContain('fetch(');
  });

  it('shows veto and not-checked in the stamp words, never as pass', async () => {
    async function shown(answer: { status: number; label?: string }, text: string) {
      const fetchImpl = (async () => ({
        status: answer.status,
        text: async () => JSON.stringify({ label: answer.label }),
      })) as unknown as typeof fetch;
      const doc = page();
      const scripting = {
        async executeScript(call: SelInject) {
          const previous = globalThis.document;
          (globalThis as { document: SelPage }).document = doc;
          try {
            call.func(call.args[0]!, call.args[1]);
          } finally {
            globalThis.document = previous;
          }
          return [];
        },
      };
      const row = await select.onMenuClick(
        { selectionText: text },
        { id: 9, url: 'https://example.com/notes' },
        { fetchImpl, scripting },
      );
      return { row, toast: doc.getElementById('trustshell-selection-toast')!.textContent };
    }
    const veto = await shown({ status: 200, label: 'veto' }, 'a plain sentence');
    expect(veto.row.label).toBe('veto');
    expect(veto.toast).toBe('Caught\nChecked and found false.');
    const missed = await shown({ status: 500 }, 'another sentence');
    expect(missed.row.label).toBe('not-checked');
    expect(missed.toast).toBe('Not checked');
  });

  it('the toast says what produced the label when the endpoint says, with the label in the tooltip', async () => {
    const fetchImpl = (async () => ({
      status: 200,
      text: async () => JSON.stringify({ label: 'veto', by: 'votes', voters: ['groq', 'cerebras'] }),
    })) as unknown as typeof fetch;
    const doc = page();
    const scripting = {
      async executeScript(call: SelInject) {
        const previous = globalThis.document;
        (globalThis as { document: SelPage }).document = doc;
        try {
          call.func(call.args[0]!, call.args[1]);
        } finally {
          globalThis.document = previous;
        }
        return [];
      },
    };
    const row = await select.onMenuClick({ selectionText: 'The Moon is made of cheese.' }, { id: 4, url: 'https://example.com/' }, {
      fetchImpl,
      scripting,
    });
    expect(row.label).toBe('veto');
    const toast = doc.getElementById('trustshell-selection-toast')!;
    expect(toast.textContent).toBe('Caught\nChecked and found false.\nGroq and Cerebras both said false.');
    expect(toast.title).toBe('veto');
  });

  it('an empty selection is not-checked and is not sent', async () => {
    let sent = 0;
    const fetchImpl = (async () => {
      sent += 1;
      return { status: 200, text: async () => JSON.stringify({ label: 'pass' }) };
    }) as unknown as typeof fetch;
    const row = await select.onMenuClick({ selectionText: '   ' }, { id: 3, url: 'https://example.com/' }, {
      fetchImpl,
      scripting: { async executeScript() { return []; } },
    });
    expect(row.label).toBe('not-checked');
    expect(sent).toBe(0);
  });

  it('the service worker scripts share one scope', () => {
    const background = readFileSync(join(EXT, 'background.js'), 'utf8');
    const listed = background.match(/importScripts\(([^)]*)\)/);
    expect(listed).not.toBeNull();
    const files = [...listed![1].matchAll(/'([^']+)'/g)].map((hit) => hit[1]);
    expect(files.indexOf('laya.js')).toBeLessThan(files.indexOf('select.js'));
    const ctx = vm.createContext({ console, setTimeout, clearTimeout, AbortController, URL, performance, Promise });
    (ctx as { globalThis: unknown }).globalThis = ctx;
    expect(() => {
      for (const file of files) vm.runInContext(readFileSync(join(EXT, file), 'utf8'), ctx, { filename: file });
    }).not.toThrow();
    const loaded = ctx as { trustshellLaya?: { callLaya?: unknown }; trustshellSelect?: { onMenuClick?: unknown } };
    expect(typeof loaded.trustshellLaya!.callLaya).toBe('function');
    expect(typeof loaded.trustshellSelect!.onMenuClick).toBe('function');
  });
});
