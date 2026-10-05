/**
 * V1-2 — the popup shows an agent's RepID and verifies its zkRepID proof in the browser.
 * verified / not-verified / not-checked, never two outcomes.
 */
export {};

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const agent = require('../extension/agent.js') as {
  cleanId: (raw: unknown) => string | null;
  checkAgent: (id: unknown, opts?: Record<string, unknown>) => Promise<Record<string, any>>;
  agentLines: (r: Record<string, any>) => string[];
};

const ROOT = join(__dirname, '..');
const FIXTURE = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'repid-proof-trinity-sophia.json'), 'utf8'));

function stubFetch(routes: Record<string, unknown>) {
  const seen: string[] = [];
  const impl = async (url: string, init: RequestInit) => {
    seen.push(url);
    expect(init.credentials).toBe('omit');
    const path = url.split('?')[0]!;
    const key = Object.keys(routes).find((k) => path.endsWith(k));
    if (!key || routes[key] === undefined) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => routes[key] };
  };
  return { impl, seen };
}

const LIVE = { score: 1334, tier: 'ESTABLISHED', agent_id: FIXTURE.statement.agent_id };

describe('checkAgent', () => {
  it('verified only when the verifier says verified, with live and proven score kept apart', async () => {
    const { impl, seen } = stubFetch({ '/api/v1/repid/trinity-sophia': LIVE, '/api/v1/repid/trinity-sophia/proof': FIXTURE });
    const r = await agent.checkAgent(' trinity-sophia ', {
      fetchImpl: impl,
      verify: async () => ({ verified: true, verifier_version: '0.2.0' }),
    });
    expect(r).toMatchObject({ outcome: 'verified', score: 1334, provenScore: 1334, threshold: 999, provenTier: 'ESTABLISHED' });
    expect(seen.every((u) => u.startsWith('https://repid-engine-production.up.railway.app/api/v1/repid/'))).toBe(true);
  });

  it('a verifier "no" is not-verified, never verified', async () => {
    const { impl } = stubFetch({ '/api/v1/repid/a': LIVE, '/api/v1/repid/a/proof': FIXTURE });
    const r = await agent.checkAgent('a', { fetchImpl: impl, verify: async () => ({ verified: false, error: 'bad' }) });
    expect(r.outcome).toBe('not-verified');
    expect(agent.agentLines(r).join(' ')).toMatch(/NOT verified/);
  });

  it('no proof, a failed fetch, no verifier, or a throwing verifier is not-checked', async () => {
    const none = stubFetch({ '/api/v1/repid/a': LIVE });
    expect((await agent.checkAgent('a', { fetchImpl: none.impl, verify: async () => ({ verified: true }) })).outcome).toBe(
      'not-checked',
    );
    const down = async () => {
      throw new Error('offline');
    };
    expect((await agent.checkAgent('a', { fetchImpl: down, verify: async () => ({ verified: true }) })).outcome).toBe(
      'not-checked',
    );
    const ok = stubFetch({ '/api/v1/repid/a': LIVE, '/api/v1/repid/a/proof': FIXTURE });
    expect((await agent.checkAgent('a', { fetchImpl: ok.impl })).outcome).toBe('not-checked');
    expect(
      (await agent.checkAgent('a', {
        fetchImpl: ok.impl,
        verify: async () => {
          throw new Error('wasm');
        },
      })).outcome,
    ).toBe('not-checked');
  });

  it('a proof whose statement names another agent is not-verified without asking the verifier', async () => {
    const other = { ...FIXTURE, statement: { ...FIXTURE.statement, agent_id: 'someone-else' } };
    const { impl } = stubFetch({ '/api/v1/repid/a': LIVE, '/api/v1/repid/a/proof': other });
    const verify = jest.fn(async () => ({ verified: true }));
    const r = await agent.checkAgent('a', { fetchImpl: impl, verify });
    expect(r.outcome).toBe('not-verified');
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects ids that are not a plain slug, before any fetch', async () => {
    const fetchImpl = jest.fn();
    for (const bad of ['', '../admin', 'a b', 'x'.repeat(200), '<script>']) {
      expect((await agent.checkAgent(bad, { fetchImpl })).reason).toBe('bad_id');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('the popup never says "verified" for anything but a verified outcome', () => {
    for (const outcome of ['not-verified', 'not-checked']) {
      expect(agent.agentLines({ id: 'a', score: 1, outcome }).join(' ')).not.toMatch(/Proof verified/);
    }
  });
});

describe('binding: the proof must belong to the agent that was asked about (Strix, #437)', () => {
  it('a valid proof for a different agent is not-verified, and the verifier is never asked', async () => {
    const { impl } = stubFetch({
      '/api/v1/repid/a': { ...LIVE, agent_id: 'the-agent-you-asked-about' },
      '/api/v1/repid/a/proof': FIXTURE,
    });
    const verify = jest.fn(async () => ({ verified: true }));
    const r = await agent.checkAgent('a', { fetchImpl: impl, verify });
    expect(r).toMatchObject({ outcome: 'not-verified', reason: 'statement_for_other_agent' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('with no resolved id to compare (an engine without ?with=id) it is not-checked, never verified', async () => {
    const { impl } = stubFetch({
      '/api/v1/repid/a': { score: 1334, tier: 'ESTABLISHED' },
      '/api/v1/repid/a/proof': FIXTURE,
    });
    const r = await agent.checkAgent('a', { fetchImpl: impl, verify: async () => ({ verified: true }) });
    expect(r).toMatchObject({ outcome: 'not-checked', reason: 'binding_unavailable' });
  });

  it('asks the live route for the resolved id', async () => {
    const { impl, seen } = stubFetch({ '/api/v1/repid/a': LIVE, '/api/v1/repid/a/proof': FIXTURE });
    await agent.checkAgent('a', { fetchImpl: impl, verify: async () => ({ verified: true }) });
    expect(seen).toContain('https://repid-engine-production.up.railway.app/api/v1/repid/a?with=id');
  });
});

describe('the vendored WASM verifier, run for real', () => {
  // The child is an ES module. On Windows an absolute path is not a valid import
  // (protocol 'c:'), and a backslash inside a quoted string is an invalid escape.
  // The import takes a file URL. readFileSync takes a path, and it does not accept that URL.
  const importUrl = (p: string) => pathToFileURL(p).href;
  const fsPath = (p: string) => p.replace(/\\/g, '/');
  const run = (statementPatch: string) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
import { readFileSync } from 'node:fs';
import { initSync, verify_proof } from '${importUrl(join(ROOT, 'extension/vendor/proof-verifier/hyperdag_proof_verifier.js'))}';
initSync({ module: readFileSync('${fsPath(join(ROOT, 'extension/vendor/proof-verifier/hyperdag_proof_verifier_bg.wasm'))}') });
const p = JSON.parse(readFileSync('${fsPath(join(__dirname, 'fixtures', 'repid-proof-trinity-sophia.json'))}', 'utf8'));
const statement = { ...p.statement, ${statementPatch} };
process.stdout.write(verify_proof(JSON.stringify({ proof_bytes: p.proof_bytes, statement })));
`,
      ],
      { encoding: 'utf8', timeout: 60000 },
    );

  it('the real live proof verifies', () => {
    const r = run('');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).verified).toBe(true);
  });

  it('the same proof with an inflated score does not', () => {
    const r = run('repid_score: 9999');
    expect(JSON.parse(r.stdout).verified).toBe(false);
  });
});

describe('packaging', () => {
  const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
  it('the vendored verifier is byte-identical to @hyperdag/proof-verifier 0.2.0 pkg-web', () => {
    expect(sha('extension/vendor/proof-verifier/hyperdag_proof_verifier.js')).toBe(
      'cbd07cf51a3c597df0a671abb86278af1d67508e4a6b2f16563346dd0418746f',
    );
    expect(sha('extension/vendor/proof-verifier/hyperdag_proof_verifier_bg.wasm')).toBe(
      '85bb267df8a86ab50e947a85087dfd4111c9eb9da0f0565dd2efd905a8fd07d2',
    );
  });

  it('the manifest allows WASM and nothing broader, and asks for no new host', () => {
    const m = JSON.parse(readFileSync(join(ROOT, 'extension/manifest.json'), 'utf8'));
    expect(m.content_security_policy.extension_pages).toBe("script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");
    expect(m.content_security_policy.extension_pages).not.toMatch(/'unsafe-eval'|'unsafe-inline'|https?:/);
    expect(m.host_permissions).toEqual(['https://repid-engine-production.up.railway.app/*']);
    expect(JSON.stringify(m)).not.toContain('<all_urls>');
  });

  it('the popup keeps the privacy line first and loads the agent box', () => {
    const html = readFileSync(join(ROOT, 'extension/popup.html'), 'utf8');
    expect(html.indexOf('popup-privacy')).toBeLessThan(html.indexOf('agent-form'));
    expect(html).toContain('<script src="agent.js"></script>');
    expect(html).toContain('<script type="module" src="agent-popup.js"></script>');
  });
});
