/**
 * Every checked reply shows its state. Unmarked text reads as true, so silence is not a pass,
 * and a miss never greens: a timeout, a skip, a non-200, a network error, an unreadable body
 * and an unknown label all paint Not checked, never Checks out.
 *
 *   in flight    Checking with Groq and Cerebras   (title: checking)
 *   2.5 s on     Still checking. Two checkers must agree.   (title: checking)
 *   pass         Checks out                        (title: pass)
 *   veto         Caught + the voter line           (title: veto)
 *   anything else Not checked                      (title: not-checked)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const classify = require('../extension/classify.js') as {
  STAMP_WORDS: Record<string, string>;
  VETO_LINE: string;
  SLOW_LINE: string;
  stampText: (label: unknown, since?: number, now?: number) => string;
  STILL_MS: number;
  CHECKING_LONGER: string;
  stampState: (label: unknown) => string;
  paintStamp: (stamp: { dataset?: Record<string, string>; textContent: string; title?: string }, label: unknown) => unknown;
  knownRow: (text: string) => { label: string } | null;
  classifyReply: (text: string, options?: unknown) => Promise<{ label: string; latency_ms: number }>;
};
const toast = require('../extension/toast.js') as { CAUGHT: string };

const CHECKING = 'Checking with Groq and Cerebras';
const CHECKS_OUT = 'Checks out';
const CAUGHT = 'Caught\nChecked and found false.';
const NOT_CHECKED = 'Not checked';

// ---- a small DOM, enough for the five host scripts ------------------------------------------

class El {
  id = '';
  className = '';
  textContent = '';
  title = '';
  dataset: Record<string, string> = {};
  children: El[] = [];
  parentNode: El | null = null;
  constructor(
    public ownerDocument: Doc,
    public replyText = '',
  ) {}
  setAttribute(name: string, value: string) {
    if (name === 'title') this.title = value;
  }
  appendChild(child: El) {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  remove() {
    const p = this.parentNode;
    if (!p) return;
    p.children.splice(p.children.indexOf(this), 1);
    this.parentNode = null;
  }
  insertAdjacentElement(_where: string, el: El) {
    const p = this.parentNode;
    if (!p) return el;
    el.remove();
    el.parentNode = p;
    p.children.splice(p.children.indexOf(this) + 1, 0, el);
    return el;
  }
  get previousElementSibling(): El | null {
    const p = this.parentNode;
    if (!p) return null;
    const at = p.children.indexOf(this);
    return at > 0 ? p.children[at - 1]! : null;
  }
  contains(node: unknown): boolean {
    return node === this || this.children.some((c) => c.contains(node));
  }
  find(pred: (el: El) => boolean): El | null {
    for (const c of this.children) {
      if (pred(c)) return c;
      const hit = c.find(pred);
      if (hit) return hit;
    }
    return null;
  }
  querySelector(sel: string) {
    return sel.startsWith('#') ? this.find((el) => el.id === sel.slice(1)) : null;
  }
  querySelectorAll(sel: string) {
    // deepseek looks for its answer block inside the message.
    return sel === '.ds-markdown' && this.replyText ? [{ closest: () => null }] : [];
  }
  cloneNode() {
    return { textContent: this.replyText, querySelectorAll: () => [] };
  }
}

class Doc {
  body: El;
  main: El;
  reply: El | null = null;
  documentElement = {};
  constructor(text: string | null) {
    this.body = new El(this);
    this.main = new El(this);
    this.body.appendChild(this.main);
    if (text !== null) {
      this.reply = new El(this, text);
      this.main.appendChild(this.reply);
    }
  }
  getElementById(id: string) {
    return this.body.find((el) => el.id === id);
  }
  createElement() {
    return new El(this);
  }
  querySelector(sel: string) {
    return sel === 'main' ? this.main : null;
  }
  querySelectorAll() {
    return this.reply ? [this.reply] : [];
  }
  stamp() {
    return this.getElementById('trustshell-stamp');
  }
}

type Res = { status: number; text: () => Promise<string> };
type FetchImpl = (url: string, init: { body?: string; signal?: AbortSignal }) => Promise<Res>;
type Draw = (doc: Doc, options?: { fetchImpl?: FetchImpl; timeoutMs?: number; endpoint?: string }) => Promise<unknown>;

const answer = (status: number, body: string): FetchImpl => async () => ({ status, text: async () => body });
const said = (label: string) => answer(200, JSON.stringify({ label, latency_ms: 1 }));
const hang: FetchImpl = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

/** A fetch that answers only when the test says so. Releasing one that was never called is a test bug. */
function held() {
  let release: ((res: Res) => void) | null = null;
  const fetchImpl: FetchImpl = () => new Promise<Res>((resolve) => (release = resolve));
  return {
    fetchImpl,
    release: (label: string) => {
      if (!release) throw new Error('released before the fetch was called');
      release({ status: 200, text: async () => JSON.stringify({ label }) });
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

const HOSTS: Array<[string, Draw]> = [
  ['chatgpt (content.js)', (require('../extension/content.js') as { draw: Draw }).draw],
  ['claude.ai', (require('../extension/claude.js') as { draw: Draw }).draw],
  ['gemini', (require('../extension/gemini.js') as { draw: Draw }).draw],
  ['deepseek', (require('../extension/deepseek.js') as { draw: Draw }).draw],
];

const grok = require('../extension/grok.js') as {
  stampText: (text: string, options?: Record<string, unknown>) => Promise<string>;
  install: (doc: Doc) => void;
};

// ---- the words themselves -------------------------------------------------------------------

describe('stamp words (classify.js)', () => {
  it('names each state in the stranger words', () => {
    expect(classify.stampText('checking')).toBe(CHECKING);
    expect(classify.stampText('pass')).toBe(CHECKS_OUT);
    expect(classify.stampText('veto')).toBe(CAUGHT);
    expect(classify.stampText('not-checked')).toBe(NOT_CHECKED);
  });

  it.each([undefined, null, 0, '0', '', 'timeout', 'probably', 'PASS', 'pass ', 'true', {}, ['pass']])(
    'anything that is not exactly a known label is Not checked, never Checks out: %p',
    (label) => {
      expect(classify.stampText(label)).toBe(NOT_CHECKED);
      expect(classify.stampState(label)).toBe('not-checked');
    },
  );

  it('puts the machine label in the tooltip', () => {
    for (const [label, state] of [
      ['pass', 'pass'],
      ['veto', 'veto'],
      ['not-checked', 'not-checked'],
      ['weird', 'not-checked'],
      ['checking', 'checking'],
    ]) {
      const stamp = { textContent: '', title: '' } as { dataset?: Record<string, string>; textContent: string; title: string };
      classify.paintStamp(stamp, label);
      expect(stamp.title).toBe(state);
      expect(stamp.dataset!.stamp).toBe(state);
    }
  });

  it('no stamp copy carries a speed number, a web search, or an internal name', () => {
    const copy = [...Object.values(classify.STAMP_WORDS), classify.VETO_LINE, classify.SLOW_LINE, toast.CAUGHT];
    for (const line of copy) {
      expect(line).not.toMatch(/\d/);
      expect(line).not.toMatch(/\bms\b|second|latency|fast|speed/i);
      expect(line).not.toMatch(/search|web|internet|google/i);
      expect(line).not.toMatch(/laya|jev|convai/i);
    }
  });
});

// ---- the four hosts that draw through draw(doc, options) -------------------------------------

describe.each(HOSTS)('%s stamp', (_name, draw) => {
  it('a pass paints Checks out, with pass in the tooltip', async () => {
    const doc = new Doc('Paris is the capital of France.');
    await draw(doc, { fetchImpl: said('pass') });
    expect(doc.stamp()!.textContent).toBe(CHECKS_OUT);
    expect(doc.stamp()!.title).toBe('pass');
    expect(doc.stamp()!.dataset.stamp).toBe('pass');
  });

  it('a veto paints Caught and the voter line, with veto in the tooltip', async () => {
    const doc = new Doc('The Moon is made of cheese.');
    await draw(doc, { fetchImpl: said('veto') });
    expect(doc.stamp()!.textContent).toBe(CAUGHT);
    expect(doc.stamp()!.textContent.split('\n')).toEqual(['Caught', 'Checked and found false.']);
    expect(doc.stamp()!.title).toBe('veto');
  });

  it.each<[string, () => { fetchImpl?: FetchImpl; timeoutMs?: number; endpoint?: string }]>([
    ['the checkers answered not-checked', () => ({ fetchImpl: said('not-checked') })],
    ['an unknown label', () => ({ fetchImpl: said('probably') })],
    ['a non-200 whose body says pass', () => ({ fetchImpl: answer(500, '{"label":"pass"}') })],
    ['a network error', () => ({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } })],
    ['an unparseable body', () => ({ fetchImpl: answer(200, 'pass') })],
    ['an empty body', () => ({ fetchImpl: answer(200, '') })],
    ['a timeout', () => ({ fetchImpl: hang, timeoutMs: 20 })],
    ['a skip (no endpoint)', () => ({ endpoint: '' })],
  ])('%s paints Not checked, never Checks out', async (_case, opts) => {
    const doc = new Doc('A reply.');
    await draw(doc, opts());
    expect(doc.stamp()!.textContent).toBe(NOT_CHECKED);
    expect(doc.stamp()!.textContent).not.toBe(CHECKS_OUT);
    expect(doc.stamp()!.title).toBe('not-checked');
  });

  it('a pass past the 6 s cap paints Not checked', async () => {
    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => clock;
    try {
      const doc = new Doc('A slow reply.');
      await draw(doc, {
        fetchImpl: async () => {
          clock += 6001;
          return { status: 200, text: async () => '{"label":"pass"}' };
        },
      });
      expect(doc.stamp()!.textContent).toBe(NOT_CHECKED);
      expect(doc.getElementById('trustshell-check-line')!.textContent).toBe(classify.SLOW_LINE);
    } finally {
      Date.now = realNow;
    }
  });

  it('while the call is out the stamp says Checking, then the answer', async () => {
    const doc = new Doc('A reply.');
    const call = held();
    const done = draw(doc, { fetchImpl: call.fetchImpl });
    expect(doc.stamp()!.textContent).toBe(CHECKING);
    expect(doc.stamp()!.title).toBe('checking');
    expect(doc.stamp()!.dataset.stamp).toBe('checking');
    await flush();
    call.release('pass');
    await done;
    expect(doc.stamp()!.textContent).toBe(CHECKS_OUT);
  });

  it('an older answer never paints over a newer call', async () => {
    const doc = new Doc('A reply.');
    const first = held();
    const second = held();
    const a = draw(doc, { fetchImpl: first.fetchImpl });
    const b = draw(doc, { fetchImpl: second.fetchImpl });
    await flush();
    first.release('pass');
    await a;
    expect(doc.stamp()!.textContent).toBe(CHECKING);
    second.release('not-checked');
    await b;
    expect(doc.stamp()!.textContent).toBe(NOT_CHECKED);
  });

  it('no reply at all is Not checked', async () => {
    const doc = new Doc(null);
    await draw(doc, { fetchImpl: said('pass') });
    expect(doc.stamp()!.textContent).toBe(NOT_CHECKED);
  });
});

// ---- the browser path: the shared cache, no flicker -------------------------------------------

describe('browser path (no options) shares the cache', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('a settled answer is painted straight away, never flickered back to Checking', async () => {
    const content = require('../extension/content.js') as { draw: Draw };
    const call = held();
    globalThis.fetch = call.fetchImpl as unknown as typeof fetch;
    const text = 'Only the browser path uses the cache.';
    const doc = new Doc(text);
    const first = content.draw(doc);
    expect(doc.stamp()!.textContent).toBe(CHECKING);
    await flush();
    call.release('pass');
    await first;
    expect(doc.stamp()!.textContent).toBe(CHECKS_OUT);
    expect(classify.knownRow(text)).toMatchObject({ label: 'pass' });

    const again = content.draw(doc);
    expect(doc.stamp()!.textContent).toBe(CHECKS_OUT);
    await again;
    expect(doc.stamp()!.textContent).toBe(CHECKS_OUT);
  });
});

// ---- grok.com ----------------------------------------------------------------------------------

describe('grok.com stamp', () => {
  it.each<[string, string, Record<string, unknown>]>([
    ['pass', CHECKS_OUT, { fetchImpl: said('pass') }],
    ['veto', CAUGHT, { fetchImpl: said('veto') }],
    ['not-checked', NOT_CHECKED, { fetchImpl: said('not-checked') }],
    ['an unknown label', NOT_CHECKED, { fetchImpl: said('probably') }],
    ['a non-200', NOT_CHECKED, { fetchImpl: answer(503, '{"label":"pass"}') }],
    ['a network error', NOT_CHECKED, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }],
    ['a timeout', NOT_CHECKED, { fetchImpl: hang, timeoutMs: 20 }],
  ])('%s paints %p', async (_case, words, opts) => {
    const element = { dataset: {} as Record<string, string>, textContent: '', title: '' };
    await grok.stampText('A grok reply.', { ...opts, element });
    expect(element.textContent).toBe(words);
    expect(element.title).toBe(element.dataset.stamp);
    if (words !== CHECKS_OUT) expect(element.textContent).not.toBe(CHECKS_OUT);
  });

  it('an answer that is no longer current is not painted', async () => {
    const element = { dataset: { stamp: 'checking' } as Record<string, string>, textContent: CHECKING, title: 'checking' };
    await grok.stampText('A grok reply.', { fetchImpl: said('pass'), element, current: () => false });
    expect(element.textContent).toBe(CHECKING);
  });

  describe('installed', () => {
    const realFetch = globalThis.fetch;
    const realObserver = (globalThis as { MutationObserver?: unknown }).MutationObserver;
    beforeEach(() => {
      (globalThis as { MutationObserver?: unknown }).MutationObserver = class {
        observe() {}
      };
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
      globalThis.fetch = realFetch;
      (globalThis as { MutationObserver?: unknown }).MutationObserver = realObserver;
    });

    it('says Checking while the call is out, then the answer', async () => {
      const call = held();
      globalThis.fetch = call.fetchImpl as unknown as typeof fetch;
      const doc = new Doc('An installed grok reply.');
      grok.install(doc);
      jest.advanceTimersByTime(1000);
      await flush();
      expect(doc.stamp()!.textContent).toBe(CHECKING);
      expect(doc.stamp()!.title).toBe('checking');
      call.release('veto');
      await flush();
      expect(doc.stamp()!.textContent).toBe(CAUGHT);
      expect(doc.stamp()!.title).toBe('veto');
    });
  });
});

// ---- the stylesheet ----------------------------------------------------------------------------

describe('stamp.css', () => {
  const css = readFileSync(join(__dirname, '../extension/stamp.css'), 'utf8');

  it('pulses a dot while checking, and not under prefers-reduced-motion', () => {
    expect(css).toMatch(/\.ts-stamp\[data-stamp="checking"\]::before\s*\{[^}]*animation:\s*trustshell-stamp-pulse/);
    const reduced = css.slice(css.indexOf('prefers-reduced-motion: reduce'));
    expect(reduced).toMatch(/\.ts-stamp\[data-stamp="checking"\]::before\s*\{[^}]*animation:\s*none/);
  });

  it('lets the tooltip show and keeps the words as written', () => {
    expect(css).not.toMatch(/pointer-events:\s*none/);
    expect(css).not.toMatch(/text-transform:\s*lowercase/);
    expect(css).not.toMatch(/line-through/);
    // Caught carries its voter line as a newline.
    expect(css).toMatch(/white-space:\s*pre-line/);
  });

  it('styles every state', () => {
    for (const state of ['checking', 'pass', 'veto', 'not-checked']) {
      expect(css).toContain(`.ts-stamp[data-stamp="${state}"]`);
    }
  });
});

describe('latency as opportunity: a long Checking says why the wait is worth it', () => {
  it('Checking for STILL_MS or more reads CHECKING_LONGER, and nothing else changes', () => {
    expect(classify.STILL_MS).toBe(2500);
    expect(classify.stampText('checking', 1000, 1000 + classify.STILL_MS - 1)).toBe(CHECKING);
    expect(classify.stampText('checking', 1000, 1000 + classify.STILL_MS)).toBe(classify.CHECKING_LONGER);
    expect(classify.CHECKING_LONGER).toBe('Still checking. Two checkers must agree.');
    // Only Checking grows a second wording: a settled label never does.
    expect(classify.stampText('pass', 0, 1e9)).toBe(CHECKS_OUT);
    expect(classify.stampText('not-checked', 0, 1e9)).toBe(NOT_CHECKED);
  });

  it('the painted stamp switches on its own at STILL_MS, and a settled label clears the clock', () => {
    jest.useFakeTimers();
    try {
      const stamp: { dataset: Record<string, string>; textContent: string; title?: string } = { dataset: {}, textContent: '' };
      classify.paintStamp(stamp, 'checking');
      expect(stamp.textContent).toBe(CHECKING);
      jest.advanceTimersByTime(classify.STILL_MS);
      expect(stamp.textContent).toBe(classify.CHECKING_LONGER);
      expect(stamp.title).toBe('checking');
      // A redraw while still checking keeps the longer line instead of flickering back.
      classify.paintStamp(stamp, 'checking');
      expect(stamp.textContent).toBe(classify.CHECKING_LONGER);
      classify.paintStamp(stamp, 'pass');
      expect(stamp.textContent).toBe(CHECKS_OUT);
      expect(stamp.dataset.checkingSince).toBeUndefined();
      // The timer of an earlier Checking cannot overwrite a settled stamp.
      jest.advanceTimersByTime(classify.STILL_MS);
      expect(stamp.textContent).toBe(CHECKS_OUT);
    } finally {
      jest.useRealTimers();
    }
  });
});
