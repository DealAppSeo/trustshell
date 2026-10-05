/**
 * grok.com is a manifest match. A verify timeout does not paint pass.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const grok = require('../extension/grok.js') as {
  stampText: (
    text: string,
    options?: {
      element?: { dataset: Record<string, string>; textContent?: string };
      timeoutMs?: number;
      fetchImpl?: (url: string, init: { signal?: AbortSignal }) => Promise<unknown>;
    },
  ) => Promise<string>;
};

describe('extension grok reader', () => {
  it('matches grok.com and does not paint pass when verify times out', async () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '../extension/manifest.json'), 'utf8')) as {
      content_scripts: { matches: string[] }[];
    };
    const matches = manifest.content_scripts.flatMap((script) => script.matches);
    expect(matches.some((match) => match.includes('grok.com'))).toBe(true);

    const element = { dataset: {} as Record<string, string>, textContent: '' };
    const word = await grok.stampText('the last grok reply', {
      element,
      timeoutMs: 15,
      fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
        const fail = () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        };
        if (init.signal?.aborted) fail();
        else init.signal?.addEventListener('abort', fail);
      }),
    });

    expect(word).toBe('not-checked');
    expect(element.dataset.stamp).toBe('not-checked');
    expect(element.textContent).toBe('Not checked');
    expect(element.textContent).not.toBe('Checks out');
    expect(element.dataset.stamp).not.toBe('pass');
  });
});
