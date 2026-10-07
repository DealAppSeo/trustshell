/**
 * A belt grant is what the "Give an agent a role" panel on /agents mints. These pin the shape the
 * engine expects (cold, read:tool:<id>, the role as ceiling) and the refusals that happen before
 * anything is sent — above all, that a tool on the "Needs your OK first" list can never be granted.
 */
import { BELTS, BELT_ROLES } from '../lib/belts';
import { BELT_GRANT_DAYS, beltCapability, beltToolsOf, buildBeltGrant } from '../lib/belt-grant';
import { mintGrant, revokeGrant } from '../lib/repid-engine';

const PAI = 'aaaaaaaa-1111-2222-3333-444444444444';
const CTO = 'bbbbbbbb-1111-2222-3333-444444444444';
const base = { grantorId: PAI, granteeId: CTO, role: 'cto' as const, toolIds: ['github', 'gitleaks'], days: 30, idempotencyKey: 'k-1' };

describe('buildBeltGrant', () => {
  it('builds a cold, read-only grant from the PAI, one capability per tool, with the role as ceiling', () => {
    const out = buildBeltGrant(base);
    expect(out).toEqual({
      ok: true,
      request: {
        grantorAgentId: PAI,
        granteeAgentId: CTO,
        grantClass: 'cold',
        capabilities: ['read:tool:github', 'read:tool:gitleaks'],
        caveats: [],
        ttlSeconds: 30 * 86400,
        role: 'cto',
        idempotencyKey: 'k-1',
      },
    });
  });

  it('every starter tool of every role can be given, and reads back from the grant', () => {
    for (const role of BELT_ROLES) {
      const ids = BELTS[role].starter.map((t) => t.id);
      const out = buildBeltGrant({ ...base, role, toolIds: ids });
      expect(out.ok).toBe(true);
      if (out.ok) {
        for (const c of out.request.capabilities) expect(c).toMatch(/^read:tool:[a-z0-9-]+$/);
        expect(beltToolsOf(out.request.capabilities)).toEqual(ids);
      }
    }
  });

  it('refuses any tool that is not in that role\'s starter belt, including a gated one by name', () => {
    expect(buildBeltGrant({ ...base, toolIds: ['github', 'stripe-readonly'] })).toMatchObject({ ok: false, reason: expect.stringContaining('stripe-readonly') });
    expect(buildBeltGrant({ ...base, toolIds: ['Postiz'] })).toMatchObject({ ok: false });
    expect(buildBeltGrant({ ...base, toolIds: ['*'] })).toMatchObject({ ok: false });
  });

  it.each([
    ['no tools', { toolIds: [] }],
    ['a self-grant', { granteeId: PAI }],
    ['no grantor', { grantorId: '' }],
    ['an unlisted duration', { days: 365 }],
    ['an unknown role', { role: 'ceo' }],
  ])('refuses %s before anything is sent', (_n, over) => {
    expect(buildBeltGrant({ ...base, ...(over as object) } as any).ok).toBe(false);
  });

  it('drops a duplicate tool rather than sending it twice', () => {
    const out = buildBeltGrant({ ...base, toolIds: ['github', 'github'] });
    expect(out.ok && out.request.capabilities).toEqual(['read:tool:github']);
  });

  it('offers short, bounded durations only', () => {
    expect([...BELT_GRANT_DAYS]).toEqual([7, 30, 90]);
    expect(beltCapability('x')).toBe('read:tool:x');
    expect(beltToolsOf(['pay:usdc', 'read:tool:a', 'read:activity'])).toEqual(['a']);
  });
});

describe('the grantor\'s key travels with mint and revoke', () => {
  const realFetch = global.fetch;
  let calls: Array<{ url: string; init: RequestInit }> = [];
  beforeEach(() => {
    calls = [];
    global.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true, grant: { id: 'g' } }), { status: 201 });
    }) as any;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  it('mint sends x-api-key when given one, and no auth header when not', async () => {
    const built = buildBeltGrant(base);
    if (!built.ok) throw new Error(built.reason);
    await mintGrant({ ...built.request, apiKey: 'pai-key' });
    await mintGrant(built.request);
    expect((calls[0]!.init.headers as Record<string, string>)['x-api-key']).toBe('pai-key');
    expect((calls[1]!.init.headers as Record<string, string>)['x-api-key']).toBeUndefined();
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ grantor_agent_id: PAI, grantee_agent_id: CTO, grant_class: 'cold', role: 'cto', audit_for: null });
  });

  it('revoke sends requested_by = the PAI and its key', async () => {
    await revokeGrant('g-1', PAI, 'pai-key');
    expect(calls[0]!.url).toMatch(/\/api\/v1\/grants\/g-1\/revoke$/);
    expect((calls[0]!.init.headers as Record<string, string>)['x-api-key']).toBe('pai-key');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ requested_by: PAI });
  });
});
