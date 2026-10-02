/**
 * A missing Grok reply is not-checked, and a veto shows the toast.
 */
const grok = require('../extension/grok-host.js') as {
  grokReply: (doc: { querySelectorAll: (sel: string) => ReplyBox[] }) => { text: string; stamp: string };
  draw: (doc: HostDoc) => StampEl | null;
};

interface StampEl {
  id: string;
  className: string;
  textContent: string;
  dataset: { stamp?: string };
  parentNode: ReplyBox | null;
  previousElementSibling: ReplyBox | null;
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
}

interface ReplyBox {
  textContent: string;
  children: StampEl[];
  ownerDocument: { createElement: (tag: string) => StampEl };
  appendChild: (child: StampEl) => StampEl;
  querySelector: (sel: string) => StampEl | null;
  cloneNode: (deep: boolean) => { textContent: string; querySelectorAll: (sel: string) => StampEl[] };
  contains: (node: ReplyBox | StampEl | null) => boolean;
  insertAdjacentElement: (where: string, el: StampEl) => StampEl;
}

interface HostDoc {
  querySelectorAll: (sel: string) => ReplyBox[];
  getElementById: (id: string) => StampEl | null;
  createElement: (tag: string) => StampEl;
  querySelector: (sel: string) => null;
  body: { appendChild: (el: StampEl) => StampEl };
}

function vetoPage(): { doc: HostDoc; reply: ReplyBox } {
  const children: StampEl[] = [];
  const reply = {} as ReplyBox;
  reply.textContent = 'veto';
  reply.children = children;
  reply.ownerDocument = {
    createElement(): StampEl {
      const el: StampEl = {
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
  reply.appendChild = (child: StampEl) => {
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
  reply.contains = (node) => node != null && children.indexOf(node as StampEl) >= 0;
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

describe('grok.com host', () => {
  it('a missing reply is not-checked and a veto shows the toast', () => {
    const missing = grok.grokReply({ querySelectorAll: () => [] });
    expect(missing.text).toBe('');
    expect(missing.stamp).toBe('not-checked');

    const page = vetoPage();
    const stamp = grok.draw(page.doc);
    const toast = page.reply.querySelector('#trustshell-toast');
    expect(stamp && stamp.textContent).toBe('veto');
    expect(toast && toast.textContent).toBe('Caught. This reply did not pass.');
    expect(page.reply.contains(toast)).toBe(true);
  });
});
