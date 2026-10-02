/**
 * A veto evaluate result paints veto.
 */
const { stampLastReply } = require('../extension/content.js') as {
  stampLastReply: (doc: FakeDoc) => Promise<{ textContent: string; dataset: { stamp: string } }>;
};

interface FakeNode {
  textContent: string;
  parentNode: FakeNode | null;
  dataset?: { stamp?: string };
  contains: (other: FakeNode) => boolean;
  cloneNode: (deep: boolean) => { textContent: string; querySelectorAll: () => unknown[] };
  insertAdjacentElement?: (where: string, child: FakeNode) => FakeNode;
  appendChild?: (child: FakeNode) => FakeNode;
  setAttribute?: (name: string, value: string) => void;
  id?: string;
  className?: string;
}

interface FakeDoc {
  location: { hostname: string };
  body: FakeNode;
  getElementById: (id: string) => FakeNode | null;
  querySelector: (sel: string) => FakeNode | null;
  querySelectorAll: (sel: string) => FakeNode[];
  createElement: (tag: string) => FakeNode;
}

function replyDoc(text: string): FakeDoc {
  const assistant: FakeNode = {
    textContent: text,
    parentNode: null,
    contains: () => false,
    cloneNode: () => ({
      textContent: text,
      querySelectorAll: () => [],
    }),
    insertAdjacentElement: (_where, child) => {
      child.parentNode = assistant.parentNode;
      return child;
    },
  };
  const body: FakeNode = {
    textContent: '',
    parentNode: null,
    contains: () => false,
    cloneNode: () => ({ textContent: '', querySelectorAll: () => [] }),
    appendChild: (child) => {
      child.parentNode = body;
      return child;
    },
  };
  assistant.parentNode = body;
  return {
    location: { hostname: 'chatgpt.com' },
    body,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel.indexOf('assistant') >= 0 ? [assistant] : []),
    createElement: () => ({
      textContent: '',
      parentNode: null,
      dataset: {},
      id: 'trustshell-stamp',
      className: 'ts-stamp',
      contains: () => false,
      cloneNode: () => ({ textContent: '', querySelectorAll: () => [] }),
      setAttribute: () => undefined,
    }),
  };
}

describe('extension stamp', () => {
  const previous = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = previous;
  });

  it('paints veto when evaluate returns veto', async () => {
    globalThis.fetch = (async () => ({
      status: 200,
      json: async () => ({ decision: 'vetoed' }),
    })) as unknown as typeof fetch;

    const stamp = await stampLastReply(replyDoc('the last reply'));

    expect(stamp.textContent).toBe('veto');
    expect(stamp.dataset.stamp).toBe('veto');
  });
});
