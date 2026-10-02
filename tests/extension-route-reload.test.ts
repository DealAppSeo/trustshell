/**
 * A reload keeps cheap first. The default stays my model.
 */
export {};

const options = require('../extension/options.js') as {
  bind: (doc: FakeDoc, storage: FakeStorage) => void;
  reload: (doc: FakeDoc, storage: FakeStorage) => void;
};

type Radio = {
  value: string;
  checked: boolean;
  listeners: Array<() => void>;
  addEventListener: (type: string, fn: () => void) => void;
};

type FakeDoc = {
  querySelectorAll: (selector: string) => Radio[];
  inputs: Radio[];
};

type FakeStorage = {
  local: {
    get: (keys: string[], cb: (stored: { route?: string }) => void) => void;
    set: (items: Record<string, string>) => void;
  };
};

function page(): FakeDoc {
  const inputs: Radio[] = [
    { value: 'my model', checked: true, listeners: [], addEventListener() {} },
    { value: 'cheap first', checked: false, listeners: [], addEventListener() {} },
  ];
  for (const input of inputs) {
    input.addEventListener = (_type, fn) => {
      input.listeners.push(fn);
    };
  }
  return {
    inputs,
    querySelectorAll: () => inputs,
  };
}

function storageFor(bag: { route?: string }): FakeStorage {
  return {
    local: {
      get(_keys, cb) {
        cb({ route: bag.route });
      },
      set(items) {
        Object.assign(bag, items);
      },
    },
  };
}

describe('extension route storage', () => {
  it('a reload keeps cheap first', () => {
    const bag: { route?: string } = {};
    const storage = storageFor(bag);
    const first = page();
    options.bind(first, storage);
    expect(first.inputs[0].checked).toBe(true);
    expect(first.inputs[1].checked).toBe(false);

    const cheap = first.inputs[1];
    first.inputs[0].checked = false;
    cheap.checked = true;
    cheap.listeners[0]();
    expect(bag.route).toBe('cheap first');

    const reloaded = page();
    options.reload(reloaded, storage);
    expect(reloaded.inputs[1].checked).toBe(true);
    expect(reloaded.inputs[0].checked).toBe(false);
  });
});
