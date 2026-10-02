/**
 * A missing Claude reply is not-checked.
 * A missing Gemini reply is not-checked.
 * A veto still shows the toast.
 */
export {};

const claude = require('../extension/claude.js') as {
  claudeReply: (doc: { querySelectorAll: (sel: string) => HostReply[] }) => { text: string; stamp: string };
  draw: (
    doc: HostDoc,
    options?: { fetchImpl: () => Promise<{ status: number; json: () => Promise<{ decision: string }> }> },
  ) => Promise<HostStamp | null>;
};
const gemini = require('../extension/gemini.js') as {
  geminiReply: (doc: { querySelectorAll: (sel: string) => HostReply[] }) => { text: string; stamp: string };
};

interface HostStamp {
  id: string;
  className: string;
  textContent: string;
  dataset: { stamp?: string };
  parentNode: HostReply | null;
  previousElementSibling: HostReply | null;
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
}

interface HostReply {
  textContent: string;
  children: HostStamp[];
  ownerDocument: { createElement: (tag: string) => HostStamp };
  appendChild: (child: HostStamp) => HostStamp;
  querySelector: (sel: string) => HostStamp | null;
  cloneNode: (deep: boolean) => { textContent: string; querySelectorAll: (sel: string) => HostStamp[] };
  contains: (node: HostReply | HostStamp | null) => boolean;
  insertAdjacentElement: (where: string, el: HostStamp) => HostStamp;
}

interface HostDoc {
  querySelectorAll: (sel: string) => HostReply[];
  getElementById: (id: string) => HostStamp | null;
  createElement: (tag: string) => HostStamp;
  querySelector: (sel: string) => null;
  body: { appendChild: (el: HostStamp) => HostStamp };
}

function emptyHostDoc(): { querySelectorAll: (sel: string) => HostReply[] } {
  return { querySelectorAll: () => [] };
}

function hostVetoPage(): { doc: HostDoc; reply: HostReply } {
  const children: HostStamp[] = [];
  const reply = {} as HostReply;
  reply.textContent = 'veto';
  reply.children = children;
  reply.ownerDocument = {
    createElement(): HostStamp {
      const el: HostStamp = {
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
  reply.appendChild = (child: HostStamp) => {
    child.parentNode = reply;
    children.push(child);
    return child;
  };
  reply.querySelector = (sel: string) => {
    if (sel !== '#trustshell-toast') return null;
    return children.find((child) => child.id === 'trustshell-toast') || null;
  };
  reply.cloneNode = () => ({
    textContent: 'veto',
    querySelectorAll: () => [],
  });
  reply.contains = (node) => node != null && children.indexOf(node as HostStamp) >= 0;
  reply.insertAdjacentElement = (_where, el) => {
    el.previousElementSibling = reply;
    return el;
  };

  const doc: HostDoc = {
    querySelectorAll: () => [reply],
    getElementById: () => null,
    createElement: () => reply.ownerDocument.createElement('div'),
    querySelector: () => null,
    body: { appendChild: (el) => el },
  };
  return { doc, reply };
}

describe('extension hosts', () => {
  it('a missing Claude reply is not-checked', () => {
    const read = claude.claudeReply(emptyHostDoc());
    expect(read.text).toBe('');
    expect(read.stamp).toBe('not-checked');
  });

  it('a missing Gemini reply is not-checked', () => {
    const read = gemini.geminiReply(emptyHostDoc());
    expect(read.text).toBe('');
    expect(read.stamp).toBe('not-checked');
  });

  it('a veto still shows the toast', async () => {
    const page = hostVetoPage();
    const stamp = await claude.draw(page.doc, {
      fetchImpl: async () => ({ status: 200, json: async () => ({ decision: 'vetoed' }) }),
    });
    const toast = page.reply.querySelector('#trustshell-toast');
    expect(stamp && stamp.textContent).toBe('veto');
    expect(toast && toast.textContent).toBe('Caught. This reply did not pass.');
    expect(page.reply.contains(toast)).toBe(true);
  });
});
