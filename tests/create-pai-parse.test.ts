import { rejectEmptyName, parseHalVerdict, parseRegister } from '../lib/create-pai-parse';

describe('create PAI parsers (live HAL decision field)', () => {
  it('empty name is refused before register', () => {
    expect(rejectEmptyName('')).toBe('Give your PAI a name first.');
    expect(rejectEmptyName('   ')).toBe('Give your PAI a name first.');
    expect(rejectEmptyName('Atlas')).toBeNull();
  });

  it('live HAL decision vetoed → VETO (not verdict/hal_decision)', () => {
    expect(parseHalVerdict({ decision: 'vetoed' })).toBe('VETO');
    expect(parseHalVerdict({ decision: 'clean' })).toBe('PASS');
    expect(parseHalVerdict({ verdict: 'PASS' })).toBe('PASS');
    expect(parseHalVerdict({})).toBeNull();
  });

  it('429 with empty body is name taken, not a stack', () => {
    expect(parseRegister(429, {})).toEqual({
      ok: false,
      message: 'That name is taken — pick another.',
    });
  });

  it('201 shows api_key; camelCase apiKey also accepted', () => {
    expect(parseRegister(201, { agent_id: 'abc', api_key: 'ts_live_x' })).toEqual({
      ok: true,
      agentId: 'abc',
      apiKey: 'ts_live_x',
    });
    expect(parseRegister(201, { agentId: 'abc', apiKey: 'ts_live_y' })).toEqual({
      ok: true,
      agentId: 'abc',
      apiKey: 'ts_live_y',
    });
  });

  it('201 without a key is honest — not returned, not invented', () => {
    expect(parseRegister(201, { agent_id: 'abc' })).toEqual({
      ok: true,
      agentId: 'abc',
      apiKey: null,
    });
  });
});
