/**
 * A missing endpoint is not-checked, not 0, not pass.
 * A reply that ends in the word veto is not a veto unless the classifier says veto.
 */
export {};

const deepseek = require('../extension/deepseek.js') as {
  draw: (
    doc: TrackDoc,
    options?: {
      fetchImpl: (url: string, init: { body?: string }) => Promise<{ status: number; json: () => Promise<{ label?: string }> }>;
    },
  ) => Promise<{ textContent: string } | null>;
};

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

interface TrackEl {
  id: string;
  className: string;
  textContent: string;
  dataset: { stamp?: string };
  parentNode: TrackReply | null;
  previousElementSibling: TrackReply | TrackEl | null;
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
  insertAdjacentElement: (where: string, el: TrackEl) => TrackEl;
}

interface TrackReply {
  textContent: string;
  children: TrackEl[];
  ownerDocument: { createElement: (tag: string) => TrackEl };
  appendChild: (child: TrackEl) => TrackEl;
  querySelector: (sel: string) => TrackEl | null;
  querySelectorAll: (sel: string) => Array<{ closest: (sel: string) => null }>;
  cloneNode: (deep: boolean) => { textContent: string; querySelectorAll: (sel: string) => TrackEl[] };
  contains: (node: TrackReply | TrackEl | null) => boolean;
  insertAdjacentElement: (where: string, el: TrackEl) => TrackEl;
}

interface TrackDoc {
  querySelectorAll: (sel: string) => TrackReply[];
  getElementById: (id: string) => TrackEl | null;
  createElement: (tag: string) => TrackEl;
  querySelector: (sel: string) => null;
  body: { appendChild: (el: TrackEl) => TrackEl };
}

function tracked(text: string, host: 'claude' | 'deepseek'): { doc: TrackDoc; reply: TrackReply } {
  const created: TrackEl[] = [];
  const reply = {} as TrackReply;
  reply.textContent = text;
  reply.children = [];
  reply.ownerDocument = { createElement: () => replyDocCreate() };
  reply.querySelectorAll = (sel) => (host === 'deepseek' && sel === '.ds-markdown' ? [{ closest: () => null }] : []);
  reply.querySelector = (sel) => {
    if (sel !== '#trustshell-toast') return null;
    return reply.children.find((child) => child.id === 'trustshell-toast') || null;
  };
  reply.cloneNode = () => ({ textContent: text, querySelectorAll: () => [] });
  reply.contains = () => false;
  reply.appendChild = (child) => {
    child.parentNode = reply;
    reply.children.push(child);
    return child;
  };
  reply.insertAdjacentElement = (_where, el) => {
    el.previousElementSibling = reply;
    return el;
  };

  function replyDocCreate(): TrackEl {
    const el: TrackEl = {
      id: '',
      className: '',
      textContent: '',
      dataset: {},
      parentNode: null,
      previousElementSibling: null,
      setAttribute() {},
      remove() {
        const at = created.indexOf(el);
        if (at >= 0) created.splice(at, 1);
      },
      insertAdjacentElement(_where, child) {
        child.previousElementSibling = el;
        return child;
      },
    };
    created.push(el);
    return el;
  }

  const doc: TrackDoc = {
    querySelectorAll: (sel) => {
      if (host === 'deepseek' && sel !== '.ds-message') return [];
      return [reply];
    },
    getElementById: (id) => created.find((el) => el.id === id) || null,
    createElement: () => replyDocCreate(),
    querySelector: () => null,
    body: { appendChild: (el) => el },
  };
  return { doc, reply };
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
    expect(passed && passed.textContent).toBe('Checks out');

    const vetoed = await claude.draw(page('noted\nveto'), {
      fetchImpl: async () => ({ status: 200, json: async () => ({ label: 'veto' }) }),
    });
    expect(vetoed && vetoed.textContent).toBe('Caught\nChecked and found false.');
  });

  it('a missing endpoint, a veto word, and a 6 second call', async () => {
    const classify = require('../extension/classify.js') as {
      classifyReply: (text: string, options?: { endpoint?: string }) => Promise<{ label: string; latency_ms: number }>;
      SLOW_LINE: string;
    };
    const missing = await classify.classifyReply('noted reply\nveto', { endpoint: '' });
    expect(missing.label).toBe('not-checked');
    expect(missing.label).not.toBe(0);
    expect(missing.label).not.toBe('pass');

    const claudePage = tracked('noted\nveto', 'claude');
    const passed = await claude.draw(claudePage.doc as unknown as CallDoc, {
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body || '{}') as { text?: string; labels?: string[] };
        expect(String(body.text || '').trim().toLowerCase().endsWith('veto')).toBe(true);
        expect(body.labels).toEqual(['pass', 'veto', 'not-checked']);
        return { status: 200, json: async () => ({ label: 'pass' }) };
      },
    });
    expect(passed && passed.textContent).toBe('Checks out');
    expect(claudePage.doc.getElementById('trustshell-check-line')).toBeNull();

    const deepPage = tracked('noted\nveto', 'deepseek');
    const deepPassed = await deepseek.draw(deepPage.doc, {
      fetchImpl: async () => ({ status: 200, json: async () => ({ label: 'pass' }) }),
    });
    expect(deepPassed && deepPassed.textContent).toBe('Checks out');
    expect(deepPassed && deepPassed.textContent).not.toContain('Caught');

    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => clock;
    try {
      const slowPage = tracked('noted\nveto', 'claude');
      const slow = await claude.draw(slowPage.doc as unknown as CallDoc, {
        fetchImpl: async () => {
          clock += 6001;
          return { status: 200, json: async () => ({ label: 'veto' }) };
        },
      });
      // Past the 6 s cap the classifier's own veto does not count: the claim is Not checked.
      expect(slow && slow.textContent).toBe('Not checked');
      expect(slow && slow.textContent).not.toContain('Caught');
      expect(slow && slow.textContent).not.toBe(0 as unknown as string);
      const line = slowPage.doc.getElementById('trustshell-check-line');
      expect(line && line.textContent).toBe('No answer in time.');
      expect(line && line.textContent).toBe(classify.SLOW_LINE);
    } finally {
      Date.now = realNow;
    }
  });
});
