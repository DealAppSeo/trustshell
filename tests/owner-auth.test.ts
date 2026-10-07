/**
 * The browser half of owner approval (lib/owner-auth.ts). The engine verifies; these pin that what
 * the browser asks the wallet to sign is exactly what the engine will check.
 */
import { TypedDataEncoder, Wallet, verifyTypedData } from 'ethers';
import { BASE_SEPOLIA_HEX, type Eip1193 } from '../lib/agent-spend-client';
import { canonicalJson, grantApprovalParams, paramsHash, signOwnerAuthorization } from '../lib/owner-auth';

// SHARED VECTOR — repid-engine tests/owner-authorization.test.ts pins the same input and hash.
// If either side changes how settings are fingerprinted, one of the two suites goes red.
const VECTOR = {
  grantor_agent_id: 'aaaaaaaa-1111-2222-3333-444444444444',
  grantee_agent_id: 'bbbbbbbb-1111-2222-3333-444444444444',
  grant_class: 'cold',
  capabilities: ['read:tool:github', 'write:tool:github'],
  caveats: [{ type: 'note', text: 'é ✓' }],
  ttl_seconds: 2592000,
  role: 'cto',
  audit_for: null,
  parent_grant_id: null,
};

describe('the fingerprint matches the engine', () => {
  it('canonical JSON and hash equal the shared vector', () => {
    expect(canonicalJson(VECTOR)).toBe(
      '{"audit_for":null,"capabilities":["read:tool:github","write:tool:github"],"caveats":[{"text":"é ✓","type":"note"}],"grant_class":"cold","grantee_agent_id":"bbbbbbbb-1111-2222-3333-444444444444","grantor_agent_id":"aaaaaaaa-1111-2222-3333-444444444444","parent_grant_id":null,"role":"cto","ttl_seconds":2592000}',
    );
    expect(paramsHash(VECTOR)).toBe('0x226126e7ded097e452dbc1a77b866a65f6de45e86d85115941b82093498a6d23');
  });
  it('grantApprovalParams sorts capabilities and fills absent fields with null', () => {
    const p = grantApprovalParams({ ...VECTOR, capabilities: ['write:tool:github', 'read:tool:github'], audit_for: undefined, parent_grant_id: undefined });
    expect(paramsHash(p)).toBe(paramsHash(VECTOR));
  });
});

// What GET /api/v1/owner-authorization serves (copied from the engine's constants).
const SHAPE = {
  domain: { name: 'HyperDAG Owner Authorization', version: '1', chainId: 84532 },
  types: {
    OwnerAuthorization: [
      { name: 'subject', type: 'string' },
      { name: 'action', type: 'string' },
      { name: 'params', type: 'bytes32' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'expiresAt', type: 'uint64' },
    ],
  },
  primary_type: 'OwnerAuthorization',
  max_lifetime_seconds: 600,
};

describe('signOwnerAuthorization', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  function wallet(chain = BASE_SEPOLIA_HEX) {
    const w = Wallet.createRandom();
    const calls: string[] = [];
    let current = chain;
    const eth: Eip1193 = {
      request: async ({ method, params }) => {
        calls.push(method);
        if (method === 'eth_chainId') return current;
        if (method === 'wallet_switchEthereumChain') { current = BASE_SEPOLIA_HEX; return null; }
        if (method === 'eth_signTypedData_v4') {
          const [, json] = params as [string, string];
          const t = JSON.parse(json);
          const { EIP712Domain: _omit, ...types } = t.types;
          return w.signTypedData(t.domain, types, t.message);
        }
        throw new Error(method);
      },
    };
    return { w, eth, calls };
  }

  it('produces a signature over the engine\'s domain and exactly these settings, on Base Sepolia', async () => {
    global.fetch = (async () => new Response(JSON.stringify(SHAPE), { status: 200 })) as any;
    const { w, eth, calls } = wallet('0x1');
    const params = { agent_id: 'a', name: 'k', scopes: [] };
    const auth = await signOwnerAuthorization(eth, w.address, { engine: 'https://e', subject: 'a', action: 'keys.create', params, nowS: 1000 });
    expect(calls).toEqual(['eth_chainId', 'wallet_switchEthereumChain', 'eth_signTypedData_v4']);
    expect(auth.expires_at).toBe(1300);
    const message = { subject: 'a', action: 'keys.create', params: paramsHash(params), nonce: auth.nonce, expiresAt: auth.expires_at };
    expect(verifyTypedData(SHAPE.domain, SHAPE.types, message, auth.signature)).toBe(w.address);
    expect(TypedDataEncoder.hash(SHAPE.domain, SHAPE.types, message)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('never asks for longer than the engine allows', async () => {
    global.fetch = (async () => new Response(JSON.stringify(SHAPE), { status: 200 })) as any;
    const { w, eth } = wallet();
    const auth = await signOwnerAuthorization(eth, w.address, { engine: 'https://e', subject: 'a', action: 'keys.create', params: {}, ttlSeconds: 99999, nowS: 1000 });
    expect(auth.expires_at).toBe(1600);
  });

  it('an unreachable engine signs nothing', async () => {
    global.fetch = (async () => { throw new TypeError('fetch failed'); }) as any;
    const { w, eth, calls } = wallet();
    await expect(signOwnerAuthorization(eth, w.address, { engine: 'https://e', subject: 'a', action: 'keys.create', params: {} })).rejects.toThrow(/Nothing was signed/);
    expect(calls).toEqual([]);
  });
});
