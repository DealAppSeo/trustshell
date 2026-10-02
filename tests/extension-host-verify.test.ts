/**
 * A reply that ends in the word veto is not a veto unless verify.js says veto.
 * A timeout is not-checked. A missing reply stays not-checked.
 */
export {};

const claude = require('../extension/claude.js') as HostApi;
const gemini = require('../extension/gemini.js') as HostApi;
const grok = require('../extension/grok-host.js') as HostApi;

interface CheckStamp {
  id: string;
  className: string;
  textContent: string;
  dataset: { stamp?: string };
  parentNode: CheckReply | null;
  previousElementSibling: CheckReply | null;
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
}

interface CheckReply {
  textContent: string;
  children: CheckStamp[];
  ownerDocument: { createElement: (tag: string) => CheckStamp };
  appendChild: (child: CheckStamp) => CheckStamp;
  querySelector: (sel: string) => CheckStamp | null;
  cloneNode: (deep: boolean) => { textContent: string; querySelectorAll: (sel: string) => CheckStamp[] };
  contains: (node: CheckReply | CheckStamp | null) => boolean;
  insertAdjacentElement: (where: string, el: CheckStamp) => CheckStamp;
}

interface CheckDoc {
  querySelectorAll: (sel: string) => CheckReply[];
  getElementById: (id: string) => CheckStamp | null;
  createElement: (tag: string) => CheckStamp;
  querySelector: (sel: string) => null;
  body: { appendChild: (el: CheckStamp) => CheckStamp };
}

interface FetchInit {
  body?: string;
  signal?: AbortSignal;
}

interface HostApi {
  claudeReply?: (doc: { querySelectorAll: () => CheckReply[] }, options?: unknown) => { stamp: string };
  geminiReply?: (doc: { querySelectorAll: () => CheckReply[] }, options?: unknown) => { stamp: string };
  grokReply?: (doc: { querySelectorAll: () => CheckReply[] }, options?: unknown) => { stamp: string };
  draw: (
    doc: CheckDoc,
    options: {
      timeoutMs?: number;
      fetchImpl: (url: string, init: FetchInit) => Promise<{ status: number; json: () => Promise<{ decision?: string }> }>;
    },
  ) => Promise<CheckStamp | null>;
}

function pageEndingInVeto(): { doc: CheckDoc; reply: CheckReply } {
  const children: CheckStamp[] = [];
  const reply = {} as CheckReply;
  reply.textContent = 'noted\nveto';
  reply.children = children;
  reply.ownerDocument = {
    createElement(): CheckStamp {
      const el: CheckStamp = {
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
  reply.contains = (node) => node != null && children.indexOf(node as CheckStamp) >= 0;
  reply.insertAdjacentElement = (_where, el) => {
    el.previousElementSibling = reply;
    return el;
  };
  return {
    doc: {
      querySelectorAll: () => [reply],
      getElementById: () => null,
      createElement: () => reply.ownerDocument.createElement('div'),
      querySelector: () => null,
      body: { appendChild: (el) => el },
    },
    reply,
  };
}

function readSent(url: string, init: FetchInit): string {
  expect(url).not.toMatch(/anthropic/i);
  expect(url).toContain('/api/v1/hal/evaluate');
  const body = JSON.parse(init.body || '{}') as { text?: string; order?: string[] };
  expect(JSON.stringify(body.order || [])).not.toMatch(/anthropic/i);
  return String(body.text || '');
}

describe('host verify', () => {
  it('a reply ending in veto is not a veto unless verify.js says so, and a timeout is not-checked', async () => {
    const hosts = [claude, gemini, grok];
    for (const host of hosts) {
      const quiet = pageEndingInVeto();
      const passed = await host.draw(quiet.doc, {
        fetchImpl: async (url, init) => {
          expect(readSent(url, init).trim().toLowerCase().endsWith('veto')).toBe(true);
          return { status: 200, json: async () => ({ decision: 'clean' }) };
        },
      });
      expect(passed && passed.textContent).toBe('pass');
      expect(quiet.reply.querySelector('#trustshell-toast')).toBeNull();

      const caught = pageEndingInVeto();
      const vetoed = await host.draw(caught.doc, {
        fetchImpl: async (url, init) => {
          readSent(url, init);
          return { status: 200, json: async () => ({ decision: 'vetoed' }) };
        },
      });
      const toast = caught.reply.querySelector('#trustshell-toast');
      expect(vetoed && vetoed.textContent).toBe('veto');
      expect(toast && toast.textContent).toBe('Caught. This reply did not pass.');

      const slow = pageEndingInVeto();
      const timed = await host.draw(slow.doc, {
        timeoutMs: 20,
        fetchImpl: (url, init) =>
          new Promise((_resolve, reject) => {
            expect(url).not.toMatch(/anthropic/i);
            const signal = init.signal;
            if (signal) signal.addEventListener('abort', () => reject(new Error('timeout')));
          }),
      });
      expect(timed && timed.textContent).toBe('not-checked');
      expect(slow.reply.querySelector('#trustshell-toast')).toBeNull();
    }

    let calls = 0;
    const fetchImpl = () => {
      calls += 1;
      return Promise.resolve({ status: 200, json: async () => ({ decision: 'vetoed' }) });
    };
    expect(claude.claudeReply && claude.claudeReply({ querySelectorAll: () => [] }, { fetchImpl }).stamp).toBe(
      'not-checked',
    );
    expect(gemini.geminiReply && gemini.geminiReply({ querySelectorAll: () => [] }, { fetchImpl }).stamp).toBe(
      'not-checked',
    );
    expect(grok.grokReply && grok.grokReply({ querySelectorAll: () => [] }, { fetchImpl }).stamp).toBe('not-checked');
    expect(calls).toBe(0);
  });
});
