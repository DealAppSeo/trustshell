/**
 * One veto-word case on each host.
 * The last word veto is not a veto unless verify.js says veto.
 * A timeout is not-checked. A miss is not-checked, not 0.
 */
export {};

const claude = require('../extension/claude.js') as HostDrawer;
const gemini = require('../extension/gemini.js') as HostDrawer;
const grok = require('../extension/grok.js') as {
  stampText: (text: string, options?: VerifyOpts) => Promise<string | number>;
};

interface WordStamp {
  id: string;
  className: string;
  textContent: string;
  dataset: { stamp?: string };
  parentNode: WordReply | null;
  previousElementSibling: WordReply | null;
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
}

interface WordReply {
  textContent: string;
  children: WordStamp[];
  ownerDocument: { createElement: (tag: string) => WordStamp };
  appendChild: (child: WordStamp) => WordStamp;
  querySelector: (sel: string) => WordStamp | null;
  cloneNode: (deep: boolean) => { textContent: string; querySelectorAll: (sel: string) => WordStamp[] };
  contains: (node: WordReply | WordStamp | null) => boolean;
  insertAdjacentElement: (where: string, el: WordStamp) => WordStamp;
}

interface WordDoc {
  querySelectorAll: (sel: string) => WordReply[];
  getElementById: (id: string) => WordStamp | null;
  createElement: (tag: string) => WordStamp;
  querySelector: (sel: string) => null;
  body: { appendChild: (el: WordStamp) => WordStamp };
}

interface FetchInit {
  body?: string;
  signal?: AbortSignal;
}

interface VerifyOpts {
  timeoutMs?: number;
  fetchImpl: (url: string, init: FetchInit) => Promise<{ status: number; json: () => Promise<{ label?: string }> }>;
}

interface HostDrawer {
  draw: (doc: WordDoc, options?: VerifyOpts) => Promise<WordStamp | null>;
  claudeReply?: (doc: { querySelectorAll: () => WordReply[] }) => { stamp: string | number };
  geminiReply?: (doc: { querySelectorAll: () => WordReply[] }) => { stamp: string | number };
}

function pageEndingInVeto(): WordDoc {
  const children: WordStamp[] = [];
  const reply = {} as WordReply;
  reply.textContent = 'noted\nveto';
  reply.children = children;
  reply.ownerDocument = {
    createElement(): WordStamp {
      const el: WordStamp = {
        id: '',
        className: '',
        textContent: '',
        dataset: {},
        parentNode: null,
        previousElementSibling: null,
        setAttribute() {},
        remove() {
          const at = children.indexOf(el);
          if (at >= 0) children.splice(at, 1);
          el.parentNode = null;
        },
      };
      return el;
    },
  };
  reply.appendChild = (child) => {
    child.parentNode = reply;
    children.push(child);
    return child;
  };
  reply.querySelector = (sel) => {
    if (sel !== '#trustshell-toast') return null;
    return children.find((child) => child.id === 'trustshell-toast') || null;
  };
  reply.cloneNode = () => ({
    textContent: 'noted\nveto',
    querySelectorAll: () => [],
  });
  reply.contains = (node) => node != null && children.indexOf(node as WordStamp) >= 0;
  reply.insertAdjacentElement = (_where, el) => el;
  return {
    querySelectorAll: () => [reply],
    getElementById: () => null,
    createElement: () => reply.ownerDocument.createElement('div'),
    querySelector: () => null,
    body: { appendChild: (el) => el },
  };
}

function cleanFetch(url: string, init: FetchInit) {
  expect(url).not.toMatch(/anthropic/i);
  const body = JSON.parse(init.body || '{}') as { text?: string };
  expect(String(body.text || '').trim().toLowerCase().endsWith('veto')).toBe(true);
  return Promise.resolve({ status: 200, json: async () => ({ label: 'pass' }) });
}

function vetoFetch(url: string, init: FetchInit) {
  expect(url).not.toMatch(/anthropic/i);
  const body = JSON.parse(init.body || '{}') as { text?: string };
  expect(String(body.text || '').trim().toLowerCase().endsWith('veto')).toBe(true);
  return Promise.resolve({ status: 200, json: async () => ({ label: 'veto' }) });
}

function timeoutFetch(url: string, init: FetchInit) {
  expect(url).not.toMatch(/anthropic/i);
  return new Promise<never>((_resolve, reject) => {
    if (init.signal) init.signal.addEventListener('abort', () => reject(new Error('timeout')));
  });
}

async function hostCase(draw: HostDrawer['draw'], miss: string | number) {
  expect(miss).toBe('not-checked');
  expect(miss).not.toBe(0);

  const passed = await draw(pageEndingInVeto(), { fetchImpl: cleanFetch });
  expect(passed && passed.textContent).toBe('pass');
  expect(passed && passed.textContent).not.toBe('veto');

  const vetoed = await draw(pageEndingInVeto(), { fetchImpl: vetoFetch });
  expect(vetoed && vetoed.textContent).toBe('veto');

  const timed = await draw(pageEndingInVeto(), { timeoutMs: 20, fetchImpl: timeoutFetch });
  expect(timed && timed.textContent).toBe('not-checked');
  expect(timed && timed.textContent).not.toBe(0);
}

describe('veto word on each host', () => {
  it('claude.ai does not treat a trailing veto as a veto', async () => {
    const miss = claude.claudeReply ? claude.claudeReply({ querySelectorAll: () => [] }).stamp : 'not-checked';
    await hostCase(claude.draw, miss);
  });

  it('gemini.google.com does not treat a trailing veto as a veto', async () => {
    const miss = gemini.geminiReply ? gemini.geminiReply({ querySelectorAll: () => [] }).stamp : 'not-checked';
    await hostCase(gemini.draw, miss);
  });

  it('grok.com does not treat a trailing veto as a veto', async () => {
    const miss = await grok.stampText('', { fetchImpl: cleanFetch });
    expect(miss).toBe('not-checked');
    expect(miss).not.toBe(0);

    const passed = await grok.stampText('noted\nveto', { fetchImpl: cleanFetch });
    expect(passed).toBe('pass');
    expect(passed).not.toBe('veto');

    const vetoed = await grok.stampText('noted\nveto', { fetchImpl: vetoFetch });
    expect(vetoed).toBe('veto');

    const timed = await grok.stampText('noted\nveto', { timeoutMs: 20, fetchImpl: timeoutFetch });
    expect(timed).toBe('not-checked');
    expect(timed).not.toBe(0);
  });
});
