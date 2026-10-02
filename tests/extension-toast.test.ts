/**
 * A veto shows the toast. A pass does not. A timeout does not.
 */
const toast = require('../extension/toast.js') as {
  CAUGHT: string;
  toastFor: (result: string | { score?: number | null; line?: number }) => string;
  placeToast: (reply: ReplyBox, text: string) => ToastEl | null;
};

interface ToastEl {
  id: string;
  className: string;
  textContent: string;
  parentNode: ReplyBox | null;
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
}

interface ReplyBox {
  children: ToastEl[];
  ownerDocument: { createElement: (tag: string) => ToastEl };
  appendChild: (child: ToastEl) => ToastEl;
  querySelector: (sel: string) => ToastEl | null;
  contains: (node: ToastEl | null) => boolean;
}

function replyNode(): ReplyBox {
  const children: ToastEl[] = [];
  const reply: ReplyBox = {
    children,
    ownerDocument: {
      createElement(): ToastEl {
        const el: ToastEl = {
          id: '',
          className: '',
          textContent: '',
          parentNode: null,
          setAttribute() {},
          remove() {
            const at = children.indexOf(el);
            if (at >= 0) children.splice(at, 1);
            el.parentNode = null;
          },
        };
        return el;
      },
    },
    appendChild(child: ToastEl) {
      child.parentNode = reply;
      children.push(child);
      return child;
    },
    querySelector(sel: string) {
      if (sel !== '#trustshell-toast') return null;
      return children.find((child) => child.id === 'trustshell-toast') || null;
    },
    contains(node: ToastEl | null) {
      return node != null && children.indexOf(node) >= 0;
    },
  };
  return reply;
}

describe('extension toast', () => {
  it('shows the toast for a veto', () => {
    const reply = replyNode();
    const text = toast.toastFor('veto');
    const node = toast.placeToast(reply, text);
    expect(text).toBe('Caught. This reply did not pass.');
    expect(text).toBe(toast.CAUGHT);
    expect(node && node.textContent).toBe(toast.CAUGHT);
    expect(reply.contains(node)).toBe(true);
    expect(reply.querySelector('#trustshell-toast')).toBe(node);
  });

  it('shows nothing for a pass', () => {
    const reply = replyNode();
    const text = toast.toastFor('pass');
    const node = toast.placeToast(reply, text);
    expect(text).toBe('');
    expect(node).toBeNull();
    expect(reply.querySelector('#trustshell-toast')).toBeNull();
    expect(toast.toastFor('not-checked')).toBe('');
    expect(toast.toastFor({ score: null, line: 50 })).toBe('');
    expect(toast.toastFor({ score: 49, line: 50 })).toBe(toast.CAUGHT);
  });

  it('shows nothing for a timeout', () => {
    const reply = replyNode();
    const text = toast.toastFor('timeout');
    const node = toast.placeToast(reply, text);
    expect(text).toBe('');
    expect(node).toBeNull();
    expect(reply.children).toHaveLength(0);
  });
});
