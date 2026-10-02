/**
 * A missing Grok reply is not-checked, and a veto shows the toast.
 */
export {};

const grok = require('../extension/grok-host.js') as {
  grokReply: (doc: { querySelectorAll: (sel: string) => GrokReply[] }) => { text: string; stamp: string };
  draw: (doc: GrokDoc) => GrokStamp | null;
};

interface GrokStamp {
  id: string;
  className: string;
  textContent: string;
  dataset: { stamp?: string };
  parentNode: GrokReply | null;
  previousElementSibling: GrokReply | null;
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
}

interface GrokReply {
  textContent: string;
  children: GrokStamp[];
  ownerDocument: { createElement: (tag: string) => GrokStamp };
  appendChild: (child: GrokStamp) => GrokStamp;
  querySelector: (sel: string) => GrokStamp | null;
  cloneNode: (deep: boolean) => { textContent: string; querySelectorAll: (sel: string) => GrokStamp[] };
  contains: (node: GrokReply | GrokStamp | null) => boolean;
  insertAdjacentElement: (where: string, el: GrokStamp) => GrokStamp;
}

interface GrokDoc {
  querySelectorAll: (sel: string) => GrokReply[];
  getElementById: (id: string) => GrokStamp | null;
  createElement: (tag: string) => GrokStamp;
  querySelector: (sel: string) => null;
  body: { appendChild: (el: GrokStamp) => GrokStamp };
}

function grokVetoPage(): { doc: GrokDoc; reply: GrokReply } {
  const children: GrokStamp[] = [];
  const reply = {} as GrokReply;
  reply.textContent = 'veto';
  reply.children = children;
  reply.ownerDocument = {
    createElement(): GrokStamp {
      const el: GrokStamp = {
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
  reply.appendChild = (child: GrokStamp) => {
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
  reply.contains = (node) => node != null && children.indexOf(node as GrokStamp) >= 0;
  reply.insertAdjacentElement = (_where, el) => {
    el.previousElementSibling = reply;
    return el;
  };

  const doc: GrokDoc = {
    querySelectorAll: () => [reply],
    getElementById: () => null,
    createElement: () => reply.ownerDocument.createElement('div'),
    querySelector: () => null,
    body: { appendChild: (el) => el },
  };
  return { doc, reply };
}

describe('grok.com host', () => {
  it('a missing reply is not-checked and a veto shows the toast', () => {
    const missing = grok.grokReply({ querySelectorAll: () => [] });
    expect(missing.text).toBe('');
    expect(missing.stamp).toBe('not-checked');

    const page = grokVetoPage();
    const stamp = grok.draw(page.doc);
    const toast = page.reply.querySelector('#trustshell-toast');
    expect(stamp && stamp.textContent).toBe('veto');
    expect(toast && toast.textContent).toBe('Caught. This reply did not pass.');
    expect(page.reply.contains(toast)).toBe(true);
  });
});
