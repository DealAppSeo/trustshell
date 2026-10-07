/**
 * my_job (src/lib/my-job.ts): an agent in Claude Desktop / Cursor asks what its job is.
 * Unknown agent or unreachable engine is NOT_CHECKED with the fix, never an empty job.
 */
import { myJob, resolveAgentId } from '../src/lib/my-job';

const ME = 'aaaaaaaa-1111-2222-3333-444444444444';
const noFile = () => { throw new Error('ENOENT'); };
const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });

describe('which agent', () => {
  it('TRUSTSHELL_AGENT_ID wins; else credentials.json under TRUSTSHELL_HOME; else none', () => {
    expect(resolveAgentId({ TRUSTSHELL_AGENT_ID: ME }, noFile)).toBe(ME);
    const read = (p: string) => { expect(p.replace(/\\/g, '/')).toBe('/x/credentials.json'); return JSON.stringify({ agentId: ME, apiKey: 'ts_live_secret' }); };
    expect(resolveAgentId({ TRUSTSHELL_HOME: '/x' }, read)).toBe(ME);
    expect(resolveAgentId({}, noFile)).toBeNull();
  });
});

describe('myJob', () => {
  it('no agent configured → NOT_CHECKED, and says how to fix it', async () => {
    const r = await myJob({ env: {}, read: noFile, fetchImpl: ok({ grants: [] }) });
    expect(r).toMatchObject({ status: 'NOT_CHECKED' });
    expect((r as any).reason).toMatch(/TRUSTSHELL_AGENT_ID/);
  });

  it('engine unreachable or off-contract → NOT_CHECKED, never an empty job', async () => {
    expect(await myJob({ env: { TRUSTSHELL_AGENT_ID: ME }, fetchImpl: async () => { throw new Error('fetch failed'); } })).toMatchObject({ status: 'NOT_CHECKED' });
    expect(await myJob({ env: { TRUSTSHELL_AGENT_ID: ME }, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) })).toMatchObject({ status: 'NOT_CHECKED' });
    expect(await myJob({ env: { TRUSTSHELL_AGENT_ID: ME }, fetchImpl: ok({ nope: 1 }) })).toMatchObject({ status: 'NOT_CHECKED' });
  });

  it('asks the engine for this agent, and reports only live grants naming it as grantee', async () => {
    let asked = '';
    const r = await myJob({
      env: { TRUSTSHELL_AGENT_ID: ME, TRUSTSHELL_API_URL: 'https://engine.test/' },
      fetchImpl: async (url) => {
        asked = url;
        return {
          ok: true, status: 200,
          json: async () => ({ grants: [
            { grantee_agent_id: ME, live: true, role: 'cmo', capabilities: ['read:tool:google-analytics'], expires_at: '2026-11-06T00:00:00Z' },
            { grantee_agent_id: ME, live: false, role: 'ceo', capabilities: ['pay:usdc'], expires_at: '2026-10-08T00:00:00Z' },
            { grantee_agent_id: 'someone-else', live: true, role: 'cfo', capabilities: ['read:tool:stripe-readonly'] },
          ] }),
        };
      },
    });
    expect(asked).toBe(`https://engine.test/api/v1/grants?principal=${ME}`);
    expect(r).toMatchObject({ status: 'OK', role: 'cmo', tools: ['google-analytics'], other_permissions: [], until: '2026-11-06T00:00:00Z' });
    expect((r as any).card).toContain('Your role: CMO.');
    expect((r as any).card).not.toMatch(/pay:usdc|stripe/);
  });

  it('no grants → OK with "no role yet", not NOT_CHECKED (the engine answered)', async () => {
    const r = await myJob({ env: { TRUSTSHELL_AGENT_ID: ME }, fetchImpl: ok({ grants: [] }) });
    expect(r).toMatchObject({ status: 'OK', role: null, tools: [] });
    expect((r as any).card).toMatch(/No role yet/);
  });
});
