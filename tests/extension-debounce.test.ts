/**
 * A reply is classified only after it has stopped changing for about one second.
 */
export {};

const classify = require('../extension/classify.js') as {
  QUIET_MS: number;
  whenSettled: (run: () => void, ms?: number) => void;
  classifyReply: (text: string, options?: unknown) => Promise<{ label: string; latency_ms: number }>;
};

interface QuietStamp {
  id: string;
  className: string;
  textContent: string;
  dataset: { stamp?: string };
  parentNode: QuietReply | null;
  setAttribute: (name: string, value: string) => void;
  insertAdjacentElement: (where: string, el: QuietStamp) => QuietStamp;
  appendChild: (child: QuietStamp) => QuietStamp;
  remove: () => void;
}

interface QuietReply {
  textContent: string;
  className: string;
  children: QuietStamp[];
  dataset: { stamp?: string };
  querySelector: (sel: string) => null;
  querySelectorAll: (sel: string) => Array<{ closest: (sel: string) => null }>;
  cloneNode: (deep: boolean) => { textContent: string; querySelectorAll: (sel: string) => QuietStamp[] };
  contains: (node: QuietReply | QuietStamp | null) => boolean;
  insertAdjacentElement: (where: string, el: QuietStamp) => QuietStamp;
  appendChild: (child: QuietStamp) => QuietStamp;
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
}

interface QuietDoc {
  documentElement: Record<string, never>;
  defaultView: Record<string, never>;
  body: { appendChild: (el: QuietStamp) => QuietStamp };
  querySelector: (sel: string) => null;
  querySelectorAll: (sel: string) => QuietReply[];
  getElementById: (id: string) => null;
  createElement: (tag: string) => QuietStamp;
}

function quietDoc(): QuietDoc {
  const reply = {} as QuietReply;
  reply.textContent = 'hello reply';
  reply.className = 'items-start';
  reply.children = [];
  reply.dataset = {};
  reply.querySelector = () => null;
  reply.querySelectorAll = (sel) => (sel.indexOf('ds-markdown') >= 0 ? [{ closest: () => null }] : []);
  reply.cloneNode = () => ({ textContent: 'hello reply', querySelectorAll: () => [] });
  reply.contains = () => false;
  reply.setAttribute = () => {};
  reply.remove = () => {};
  reply.appendChild = (child) => child;
  reply.insertAdjacentElement = (_where, el) => el;

  function stamp(): QuietStamp {
    return {
      id: '',
      className: '',
      textContent: '',
      dataset: {},
      parentNode: null,
      setAttribute() {},
      insertAdjacentElement(_where, el) {
        return el;
      },
      appendChild(child) {
        return child;
      },
      remove() {},
    };
  }

  return {
    documentElement: {},
    defaultView: {},
    body: { appendChild: (el) => el },
    querySelector: () => null,
    querySelectorAll: () => [reply],
    getElementById: () => null,
    createElement: () => stamp(),
  };
}

interface QuietGlobal {
  trustshellClassify?: {
    QUIET_MS: number;
    whenSettled: (run: () => void, ms?: number) => void;
    lineFor: () => string;
    showCheckLine: () => null;
    classifyReply: (text: string) => Promise<{ label: string; latency_ms: number }>;
  };
  MutationObserver: typeof MutationObserver;
}

describe('reply debounce', () => {
  const calls: string[] = [];
  const pageGlobal = globalThis as typeof globalThis & QuietGlobal;
  let lastObserver: (() => void) | null = null;
  const PreviousObserver = globalThis.MutationObserver;

  beforeEach(() => {
    calls.length = 0;
    lastObserver = null;
    pageGlobal.trustshellClassify = {
      QUIET_MS: classify.QUIET_MS,
      whenSettled: classify.whenSettled,
      lineFor: () => '',
      showCheckLine: () => null,
      classifyReply: (text: string) => {
        calls.push(String(text));
        return Promise.resolve({ label: 'pass', latency_ms: 1 });
      },
    };
    pageGlobal.MutationObserver = class {
      constructor(cb: () => void) {
        lastObserver = cb;
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof MutationObserver;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    pageGlobal.MutationObserver = PreviousObserver;
  });

  it('waits about one second, and a newer change cancels the wait', () => {
    const ran: string[] = [];
    classify.whenSettled(() => ran.push('first'));
    jest.advanceTimersByTime(999);
    classify.whenSettled(() => ran.push('second'));
    jest.advanceTimersByTime(999);
    expect(ran).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(ran).toEqual(['second']);
  });

  it('all five hosts classify only after the reply stops changing', async () => {
    const hosts = [
      require('../extension/content.js') as { install: (doc: QuietDoc) => void },
      require('../extension/claude.js') as { install: (doc: QuietDoc) => void },
      require('../extension/gemini.js') as { install: (doc: QuietDoc) => void },
      require('../extension/grok.js') as { install: (doc: QuietDoc) => void },
      require('../extension/deepseek.js') as { install: (doc: QuietDoc) => void },
    ];
    expect(hosts).toHaveLength(5);
    for (const host of hosts) {
      calls.length = 0;
      host.install(quietDoc());
      expect(calls).toEqual([]);
      jest.advanceTimersByTime(999);
      expect(calls).toEqual([]);
      if (lastObserver) lastObserver();
      jest.advanceTimersByTime(999);
      expect(calls).toEqual([]);
      jest.advanceTimersByTime(1);
      // content.js calls classifyReply from a promise callback. The timer
      // firing and the call are not the same turn.
      await Promise.resolve();
      expect(calls).toEqual(['hello reply']);
    }
  });
});
