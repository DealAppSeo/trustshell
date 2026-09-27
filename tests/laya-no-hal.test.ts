/**
 * layaHook records cheap, escalate, or ask and does not call HAL.
 */
import { layaHook } from '../src/laya/hook';

describe('laya hook runtime', () => {
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('cheap, escalate, and ask do not call HAL', () => {
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error('HAL called');
    }) as typeof fetch;

    expect(layaHook('cheap')).toEqual({ classify: 'cheap' });
    expect(layaHook('escalate')).toEqual({ classify: 'escalate' });
    expect(layaHook('ask')).toEqual({ classify: 'ask' });
    expect(calls).toEqual([]);
  });
});
