/**
 * A missing endpoint is not-checked, not 0, not pass.
 * A reply that ends in the word veto is not a veto unless the classifier says veto.
 */
export {};

const claude = require('../extension/claude.js') as {
  classifyReply: (
    text: string,
    options?: {
      endpoint?: string;
      timeoutMs?: number;
      fetchImpl?: (url: string, init: { body?: string; signal?: AbortSignal }) => Promise<{ status: number; json: () => Promise<{ label?: string }> }>;
    },
  ) => Promise<{ label: string; latency_ms: number }>;
  draw: (
    doc: CallDoc,
    options?: {
      fetchImpl: (url: string, init: { body?: string; signal?: AbortSignal }) => Promise<{ status: number; json: () => Promise<{ label?: string }> }>;
    },
  ) => Promise<{ textContent: string } | null>;
};

interface CallStamp {
  id: string;
  className: string;
  textContent: string;
  dataset: { stamp?: string };
  setAttribute: (name: string, value: string) => void;
  parentNode: CallReply | null;
  previousElementSibling: CallReply | null;
  remove: () => void;
}

interface CallReply {
  textContent: string;
  children: CallStamp[];
  ownerDocument: { createElement: (tag: string) => CallStamp };
  appendChild: (child: CallStamp) => CallStamp;
  querySelector: (sel: string) => CallStamp | null;
  cloneNode: (deep: boolean) => { textContent: string; querySelectorAll: (sel: string) => CallStamp[] };
  contains: (node: CallReply | CallStamp | null) => boolean;
  insertAdjacentElement: (where: string, el: CallStamp) => CallStamp;
}

interface CallDoc {
  querySelectorAll: (sel: string) => CallReply[];
  getElementById: (id: string) => CallStamp | null;
  createElement: (tag: string) => CallStamp;
  querySelector: (sel: string) => null;
  body: { appendChild: (el: CallStamp) => CallStamp };
}

function page(text: string): CallDoc {
  const children: CallStamp[] = [];
  const reply = {} as CallReply;
  reply.textContent = text;
  reply.children = children;
  reply.ownerDocument = {
    createElement(): CallStamp {
      const el: CallStamp = {
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
  reply.querySelector = () => null;
  reply.cloneNode = () => ({ textContent: text, querySelectorAll: () => [] });
  reply.contains = () => false;
  reply.insertAdjacentElement = (_where, el) => el;
  return {
    querySelectorAll: () => [reply],
    getElementById: () => null,
    createElement: () => reply.ownerDocument.createElement('div'),
    querySelector: () => null,
    body: { appendChild: (el) => el },
  };
}

describe('classifier call', () => {
  it('a missing endpoint is not-checked, not 0, not pass', async () => {
    const logged: unknown[][] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => {
      logged.push(args);
    };
    try {
      const missing = await claude.classifyReply('noted reply\nveto', { endpoint: '' });
      expect(missing.label).toBe('not-checked');
      expect(missing.label).not.toBe(0);
      expect(missing.label).not.toBe('pass');
      expect(typeof missing.latency_ms).toBe('number');

      let anthropicCalls = 0;
      const blocked = await claude.classifyReply('noted reply\nveto', {
        endpoint: 'https://api.anthropic.com/v1/messages',
        fetchImpl: () => {
          anthropicCalls += 1;
          return Promise.resolve({ status: 200, json: async () => ({ label: 'pass' }) });
        },
      });
      expect(anthropicCalls).toBe(0);
      expect(blocked.label).toBe('not-checked');

      const empty = await claude.classifyReply('noted reply\nveto', {
        endpoint: 'https://repid-engine-production.up.railway.app/api/v1/classify',
        fetchImpl: async (url) => {
          expect(url).not.toMatch(/anthropic/i);
          return { status: 200, json: async () => ({}) };
        },
      });
      expect(empty.label).toBe('not-checked');
      expect(empty.label).not.toBe('pass');

      const timed = await claude.classifyReply('noted reply\nveto', {
        endpoint: 'https://repid-engine-production.up.railway.app/api/v1/classify',
        timeoutMs: 20,
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => {
            if (init.signal) init.signal.addEventListener('abort', () => reject(new Error('timeout')));
          }),
      });
      expect(timed.label).toBe('not-checked');
      expect(timed.label).not.toBe(0);
      expect(timed.label).not.toBe('pass');
      expect(logged).toEqual([]);
    } finally {
      console.log = log;
    }
  });

  it('a reply ending in veto is not a veto unless the classifier says veto', async () => {
    const passed = await claude.draw(page('noted\nveto'), {
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body || '{}') as { text?: string; labels?: string[] };
        expect(String(body.text || '').trim().toLowerCase().endsWith('veto')).toBe(true);
        expect(body.labels).toEqual(['pass', 'veto', 'not-checked']);
        return { status: 200, json: async () => ({ label: 'pass' }) };
      },
    });
    expect(passed && passed.textContent).toBe('pass');

    const vetoed = await claude.draw(page('noted\nveto'), {
      fetchImpl: async () => ({ status: 200, json: async () => ({ label: 'veto' }) }),
    });
    expect(vetoed && vetoed.textContent).toBe('veto');
  });
});
