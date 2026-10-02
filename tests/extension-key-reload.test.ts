/**
 * A reload keeps the switch and does not show the key.
 */
export {};

const SECRET = 'sk-test-reload-hidden';

const options = require('../extension/options.js') as {
  bind: (doc: Page, storage: BagStorage) => void;
  reload: (doc: Page, storage: BagStorage) => void;
  pageText: (doc: Page) => string;
};

type Input = {
  name: string;
  value: string;
  checked?: boolean;
  listeners: Array<() => void>;
  addEventListener: (type: string, fn: () => void) => void;
};

type Page = {
  textContent: string;
  key: Input;
  radios: Input[];
  querySelector: (selector: string) => unknown;
  querySelectorAll: (selector: string) => Input[];
};

type BagStorage = {
  local: {
    get: (keys: string[], cb: (stored: Record<string, string>) => void) => void;
    set: (items: Record<string, string>) => void;
  };
};

function storageFor(bag: Record<string, string>): BagStorage {
  return {
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
}

function page(prefill: string): Page {
  const note = { textContent: '' };
  const radios: Input[] = [
    { name: 'route', value: 'my model', checked: true, listeners: [], addEventListener() {} },
    { name: 'route', value: 'cheap first', checked: false, listeners: [], addEventListener() {} },
  ];
  const key: Input = { name: 'key', value: prefill, listeners: [], addEventListener() {} };
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
  return {
    key,
    radios,
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
}

describe('options key reload', () => {
  it('a reload keeps the switch and does not show the key', () => {
    const bag: Record<string, string> = {};
    const storage = storageFor(bag);
    const first = page('');
    options.bind(first, storage);
    first.radios[0].checked = false;
    first.radios[1].checked = true;
    const change = first.radios[1].listeners[0];
    expect(typeof change).toBe('function');
    if (change) change();
    expect(bag.route).toBe('cheap first');

    first.key.value = SECRET;
    const saveButton = first.querySelector('#save-key') as { listeners: Array<() => void> };
    const click = saveButton.listeners[0];
    expect(typeof click).toBe('function');
    if (click) click();
    expect(bag.hostKey).toBe(SECRET);

    const again = page(SECRET);
    options.reload(again, storage);
    expect(again.radios[1].checked).toBe(true);
    expect(again.radios[0].checked).toBe(false);
    expect(again.key.value).toBe('');
    expect(options.pageText(again)).not.toContain(SECRET);
    expect(again.textContent).not.toContain(SECRET);
  });
});
