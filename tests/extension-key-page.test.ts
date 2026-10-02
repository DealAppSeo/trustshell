/**
 * The saved key is not in the page text.
 */
export {};

const SECRET = 'sk-test-do-not-print';

const options = require('../extension/options.js') as {
  bind: (doc: Page, storage: BagStorage) => void;
  pageText: (doc: Page) => string;
};

type Input = {
  name: string;
  type?: string;
  value: string;
  checked?: boolean;
  listeners: Array<() => void>;
  addEventListener: (type: string, fn: () => void) => void;
};

type Page = {
  textContent: string;
  note: { textContent: string };
  key: Input;
  button: { listeners: Array<() => void>; addEventListener: (type: string, fn: () => void) => void };
  querySelector: (selector: string) => unknown;
  querySelectorAll: (selector: string) => Input[];
};

type BagStorage = {
  local: {
    get: (keys: string[], cb: (stored: Record<string, string>) => void) => void;
    set: (items: Record<string, string>) => void;
  };
};

function pageFor(bag: Record<string, string>): { doc: Page; storage: BagStorage } {
  const note = { textContent: '' };
  const radios: Input[] = [
    { name: 'route', value: 'my model', checked: true, listeners: [], addEventListener() {} },
    { name: 'route', value: 'cheap first', checked: false, listeners: [], addEventListener() {} },
  ];
  const key: Input = { name: 'key', type: 'password', value: '', listeners: [], addEventListener() {} };
  for (const input of radios.concat([key])) {
    input.addEventListener = (_type, fn) => {
      input.listeners.push(fn);
    };
  }
  const button = {
    listeners: [] as Array<() => void>,
    addEventListener(_type: string, fn: () => void) {
      this.listeners.push(fn);
    },
  };
  const lines = [
    'My model: the check still runs.',
    'Cheap first: open-source hosts first, their model only checks.',
  ];
  const doc = {
    note,
    key,
    button,
    get textContent() {
      return lines.join(' ') + ' ' + note.textContent;
    },
    querySelector(selector: string) {
      if (selector === '#save-key') return button;
      if (selector === '#key-note') return note;
      if (selector === 'input[name="key"]') return key;
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === 'input[name="route"]') return radios;
      if (selector === 'input[name="key"]') return [key];
      return [];
    },
  };
  const storage: BagStorage = {
    local: {
      get(names, cb) {
        const stored: Record<string, string> = {};
        for (const name of names) {
          const value = bag[name];
          if (value !== undefined) stored[name] = value;
        }
        cb(stored);
      },
      set(items) {
        Object.assign(bag, items);
      },
    },
  };
  return { doc, storage };
}

describe('options key field', () => {
  it('the saved key is not in the page text', () => {
    const bag: Record<string, string> = {};
    const { doc, storage } = pageFor(bag);
    options.bind(doc, storage);
    doc.key.value = SECRET;
    const click = doc.button.listeners[0];
    expect(typeof click).toBe('function');
    if (click) click();
    expect(bag.hostKey).toBe(SECRET);
    expect(doc.key.value).toBe('');
    expect(doc.note.textContent).toBe('Saved.');
    expect(options.pageText(doc)).not.toContain(SECRET);
    expect(doc.textContent).not.toContain(SECRET);
  });
});
