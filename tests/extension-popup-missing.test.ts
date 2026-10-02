/**
 * A missing verdict prints not-checked, not 0.
 */
export {};

const popup = require('../extension/popup.js') as {
  render: (
    doc: { querySelector: (selector: string) => { textContent: string } | null },
    word?: unknown,
  ) => string;
};

function lineDoc(): { textContent: string } {
  const node = { textContent: '' };
  return node;
}

describe('missing verdict', () => {
  it('a missing verdict prints not-checked, not 0', () => {
    const node = lineDoc();
    const doc = {
      querySelector(selector: string) {
        return selector === '#popup-line' ? node : null;
      },
    };
    expect(popup.render(doc, undefined)).toBe('not-checked');
    expect(node.textContent).toBe('not-checked');
    expect(node.textContent).not.toBe(0);
    expect(node.textContent).not.toBe('0');
    expect(popup.render(doc, 0)).toBe('not-checked');
    expect(node.textContent).toBe('not-checked');
    expect(node.textContent).not.toBe('0');
  });
});
