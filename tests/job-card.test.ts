/**
 * The agent is told its job (lib/job-card.ts), and only the job its owner actually granted.
 */
import { BELTS } from '../lib/belts';
import { jobCard } from '../lib/job-card';
import { composeRunPrompt } from '../lib/agent-rules';
import type { ListedGrant } from '../lib/repid-engine';

const ME = 'aaaaaaaa-1111-2222-3333-444444444444';
const PAI = 'bbbbbbbb-1111-2222-3333-444444444444';

function grant(over: Partial<ListedGrant> = {}): ListedGrant {
  return {
    id: 'g1', grantor_agent_id: PAI, grantee_agent_id: ME, parent_grant_id: null, depth: 0, grant_class: 'cold',
    capabilities: ['read:tool:google-analytics', 'read:tool:search-console'], caveats: [], role: 'cmo', audit_for: null,
    not_before: '2026-10-07T00:00:00Z', expires_at: '2026-11-06T00:00:00Z', revoked_at: null, revoked_by: null,
    mint_reason: 'x', created_at: '2026-10-07T00:00:00Z', idempotency_key: null, grantor_signature: null,
    grantor_wallet_address_used: null, signature_status: 'NOT_CHECKED', live: true, liveReason: 'live', ...over,
  } as ListedGrant;
}

describe('jobCard', () => {
  it('no live grant naming this agent → no card, and the prompt is unchanged', () => {
    expect(jobCard(ME, 'Nova', [])).toBeNull();
    expect(jobCard(ME, 'Nova', [grant({ live: false })])).toBeNull();
    expect(jobCard(ME, 'Nova', [grant({ grantee_agent_id: PAI, grantor_agent_id: ME })])).toBeNull();
    expect(composeRunPrompt(undefined, 'Q?', null)).toBe('Q?');
  });

  it('a CMO belt grant: the role, the belt purpose, each granted tool with what it is for, and until when', () => {
    const card = jobCard(ME, 'Nova', [grant()])!;
    expect(card.role).toBe('cmo');
    expect(card.text).toContain('You are Nova, working as CMO for your owner.');
    expect(card.text).toContain(BELTS.cmo.purpose);
    const ga = BELTS.cmo.starter.find((t) => t.id === 'google-analytics')!;
    expect(card.text).toContain(`- ${ga.name}: ${ga.use}`);
    expect(card.text).toContain('until 2026-11-06');
    expect(card.tools.map((t) => t.id)).toEqual(['google-analytics', 'search-console']);
  });

  it('names what needs the owner\'s OK, and that it does not have it', () => {
    const card = jobCard(ME, 'Nova', [grant()])!;
    for (const g of BELTS.cmo.gated) expect(card.text).toContain(g.name);
    expect(card.text).toMatch(/need your owner's OK first, and you do not have it/);
    expect(card.text).toMatch(/You may not spend, post in public/);
  });

  it('a tool id the belt list does not know is listed by its id, not described from a guess', () => {
    const card = jobCard(ME, 'Nova', [grant({ capabilities: ['read:tool:mystery-tool'] })])!;
    expect(card.tools).toEqual([{ id: 'mystery-tool', name: 'mystery-tool', use: null }]);
    expect(card.text).toContain('- mystery-tool\n');
  });

  it('the card goes first, then the rules, then the question', () => {
    const card = jobCard(ME, 'Nova', [grant()])!;
    const p = composeRunPrompt('Always cite a source.', 'What can you do?', card.text);
    expect(p.indexOf('## Your job')).toBe(0);
    expect(p.indexOf('Always cite a source.')).toBeGreaterThan(p.indexOf('## Your job'));
    expect(p.endsWith('---\n\nWhat can you do?')).toBe(true);
  });
});
