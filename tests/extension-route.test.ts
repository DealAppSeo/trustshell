/**
 * Default route is my model. A missing key is not-checked, never a pass.
 */
const route = require('../extension/route.js') as {
  DEFAULT_SETTING: string;
  settingOf: (value?: string) => string;
  checkRuns: (value?: string) => boolean;
  keyStamp: (host: string, keys?: Record<string, string>) => string;
};

describe('extension route', () => {
  it('defaults to my model and still runs the check', () => {
    expect(route.DEFAULT_SETTING).toBe('my model');
    expect(route.settingOf(undefined)).toBe('my model');
    expect(route.settingOf('other')).toBe('my model');
    expect(route.checkRuns('my model')).toBe(true);
    expect(route.checkRuns('cheap first')).toBe(true);
  });

  it('a missing key is not-checked', () => {
    expect(route.keyStamp('groq', {})).toBe('not-checked');
    expect(route.keyStamp('groq', { groq: '   ' })).toBe('not-checked');
    expect(route.keyStamp('groq', {})).not.toBe('pass');
    expect(route.keyStamp('anthropic', { anthropic: 'present' })).toBe('not-checked');
    expect(route.keyStamp('anthropic', { anthropic: 'present' })).not.toBe('pass');
  });
});
