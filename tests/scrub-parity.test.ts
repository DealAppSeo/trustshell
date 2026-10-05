/**
 * One scrubber, every door. src/memory/redact.ts (CLI, MCP, SDK, memory) and extension/scrub.js
 * (the Chrome extension) must agree byte for byte, and each extension door must send only the
 * scrubbed text, or nothing at all.
 *
 * Fail-closed is the point of the second half: an extension whose scrub.js failed to load must
 * not fall back to sending the raw reply.
 */
import { redact } from '../src/memory/redact';
import { refusedValue } from '../src/cli/remember';
import { SENSITIVE, KEEP } from './fixtures/scrub-corpus';

type Scrub = { redact: (v: unknown) => string };
type FetchInit = { body?: string };
type Laya = {
  callLaya: (text: unknown, options?: Record<string, unknown>) => Promise<{ label: string }>;
};
type Verify = {
  verifyLastReply: (text: unknown, options?: Record<string, unknown>) => Promise<string>;
};

const scrubJs = require('../extension/scrub.js') as Scrub;

const MIXED = SENSITIVE.map((r) => r.text).join(' ');

describe('src/memory/redact.ts and extension/scrub.js agree', () => {
  it.each([...SENSITIVE.map((r) => r.text), ...KEEP, MIXED].map((s) => [s.slice(0, 40), s]))('%s', (_label, text) => {
    expect(scrubJs.redact(text)).toBe(redact(text));
  });

  it('agree on empty, null and non-string input', () => {
    expect(scrubJs.redact('')).toBe(redact(''));
    expect(scrubJs.redact(null)).toBe(redact(null as unknown as string));
    expect(scrubJs.redact(undefined)).toBe(redact(undefined as unknown as string));
  });

  it('declare the same patterns in the same order', () => {
    // Text-level parity: every regex literal in the TS source appears in the JS port, in order.
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const ts = fs.readFileSync(path.join(__dirname, '../src/memory/redact.ts'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../extension/scrub.js'), 'utf8');
    const calls = (src: string) => [...src.matchAll(/\.replace\((\w+),/g)].map((m) => m[1]);
    expect(calls(js)).toEqual(calls(ts));
  });
});

function recordingFetch() {
  const bodies: string[] = [];
  const fetchImpl = jest.fn(async (_url: string, init: FetchInit) => {
    bodies.push(String(init.body ?? ''));
    return { status: 200, text: async () => '{"label":"pass"}', json: async () => ({ decision: 'clean' }) };
  });
  return { bodies, fetchImpl };
}

describe('extension laya door sends only scrubbed text', () => {
  const laya = require('../extension/laya.js') as Laya;

  it('no sensitive value reaches the request body', async () => {
    const { bodies, fetchImpl } = recordingFetch();
    await laya.callLaya(`Paris is the capital of France. ${MIXED}`, { modelUrl: 'http://localhost:8080/classify', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(bodies[0]!).text as string;
    for (const row of SENSITIVE) expect(sent).not.toContain(row.secret);
    expect(sent).toContain('Paris is the capital of France.');
  });

  it('a reply that is only secrets sends nothing and is not checked', async () => {
    const { fetchImpl } = recordingFetch();
    const out = await laya.callLaya(SENSITIVE[0]!.secret, { modelUrl: 'http://localhost:8080/classify', fetchImpl });
    expect(out.label).toBe('not-checked');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('extension verify door sends only scrubbed text', () => {
  const verify = require('../extension/verify.js') as Verify;

  it('no sensitive value reaches the request body', async () => {
    const { bodies, fetchImpl } = recordingFetch();
    await verify.verifyLastReply(`Paris is the capital of France. ${MIXED}`, { baseUrl: 'http://localhost:9', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(bodies[0]!).text as string;
    for (const row of SENSITIVE) expect(sent).not.toContain(row.secret);
    expect(sent).toContain('Paris is the capital of France.');
  });

  it('a reply that is only secrets sends nothing and is not checked', async () => {
    const { fetchImpl } = recordingFetch();
    const out = await verify.verifyLastReply(SENSITIVE[0]!.secret, { baseUrl: 'http://localhost:9', fetchImpl });
    expect(out).toBe('not-checked');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('a missing scrubber fails closed: nothing is sent', () => {
  const g = globalThis as { trustshellScrub?: unknown };
  let saved: unknown;
  beforeEach(() => {
    saved = g.trustshellScrub;
    delete g.trustshellScrub;
  });
  afterEach(() => {
    g.trustshellScrub = saved;
    jest.dontMock('../extension/scrub.js');
  });

  function loadWithoutScrub<T>(path: string): T {
    let mod: T | undefined;
    jest.isolateModules(() => {
      jest.doMock('../extension/scrub.js', () => {
        throw new Error('scrub.js failed to load');
      });
      mod = require(path) as T;
    });
    // Loading laya.js or verify.js must not have pulled the real scrubber in through a side door.
    delete g.trustshellScrub;
    return mod!;
  }

  it('laya', async () => {
    const laya = loadWithoutScrub<Laya>('../extension/laya.js');
    const { fetchImpl } = recordingFetch();
    const out = await laya.callLaya('Paris is the capital of France.', { modelUrl: 'http://localhost:8080/classify', fetchImpl });
    expect(out.label).toBe('not-checked');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('verify', async () => {
    const verify = loadWithoutScrub<Verify>('../extension/verify.js');
    const { fetchImpl } = recordingFetch();
    const out = await verify.verifyLastReply('Paris is the capital of France.', { baseUrl: 'http://localhost:9', fetchImpl });
    expect(out).toBe('not-checked');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('remember refuses credentials, and keeps personal notes local', () => {
  const credentials = SENSITIVE.filter((r) => !/email|phone|ssn|card|iban/.test(r.kind));
  it.each(credentials.map((r) => [r.kind, r.text]))('refuses %s', (_kind, text) => {
    expect(refusedValue(text)).toBe(true);
  });

  it('stores an email or a phone number: memory is local, and the outbound scrubber covers sending', () => {
    expect(refusedValue('Write to jane.doe@example.com about the venue.')).toBe(false);
    expect(refusedValue('Call (555) 123-4567 after 5pm.')).toBe(false);
  });

  it('stores ordinary notes', () => {
    for (const s of KEEP) expect(refusedValue(s)).toBe(false);
  });
});
