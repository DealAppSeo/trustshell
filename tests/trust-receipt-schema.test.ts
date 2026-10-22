/**
 * Trust Receipt v0, a DESIGN DRAFT (docs/trust-receipt.md). Nothing in src/ emits or reads one yet.
 * This pins three things: the worked example validates against schemas/trust-receipt-v0.schema.json;
 * it is built from the real record the site serves, not a look-alike; and each rule the doc says the
 * schema makes checkable fails when it is broken.
 *
 * VALIDATOR: Ajv's draft 2020-12 build (ajv@8). The top-level `ajv` here is 6.x (eslint's), which
 * cannot read 2020-12. ajv@8 is already installed for @modelcontextprotocol/sdk, a runtime dependency,
 * and package-lock.json pins it; resolving it from the SDK's own location follows Node's rules, so it
 * keeps working whether npm nests ajv@8 or hoists it. No dependency is added.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jcsSha256 } from '../src/lib/jcs';

const ROOT = join(__dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const Ajv2020 = createRequire(require.resolve('@modelcontextprotocol/sdk/server/index.js'))('ajv/dist/2020').default;

const schema = read('schemas/trust-receipt-v0.schema.json');
const example = read('schemas/trust-receipt-v0.example.json');
const served = read('public/samples/inspect-39619591025/record.json');
// strict: an unknown keyword or a type the schema leaves ambiguous is an error, not a warning.
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const errorsOf = (doc: unknown): string[] =>
  validate(doc) ? [] : (validate.errors ?? []).map((e: { instancePath: string; message?: string }) => `${e.instancePath} ${e.message}`);

/** RFC 6901, from the document root. */
function resolves(doc: unknown, pointer: string): boolean {
  let node: any = doc;
  for (const raw of pointer.split('/').slice(1)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object' || !(key in node)) return false;
    node = node[key];
  }
  return true;
}

describe('the worked example', () => {
  it('validates against the v0 schema', () => {
    expect(errorsOf(example)).toEqual([]);
  });

  it('embeds the record the site serves, unchanged, under the digest the site prints', () => {
    const obs = example.receipt.observed[0];
    expect(obs.record).toEqual(served.record);
    expect(obs.provenance.digest).toEqual(served.digest);
    expect(jcsSha256(served.record)).toBe(served.digest.value);
  });

  it("carries its own digest, recomputable from the receipt alone, and the doc quotes it", () => {
    expect(jcsSha256(example.receipt)).toBe(example.digest.value);
    expect(readFileSync(join(ROOT, 'docs/trust-receipt.md'), 'utf8')).toContain(example.digest.value);
  });

  it("states as executed exactly the sentences the record read, nothing more", () => {
    const sentences = [...new Set(served.record.claims.map((c: { sentence: string }) => c.sentence))];
    expect(example.receipt.executed.statements).toEqual(sentences);
  });

  it('points every unknown at something that exists, and lists every NOT_CHECKED claim', () => {
    for (const u of example.receipt.unknown) if (u.ref !== null) expect([u.ref, resolves(example, u.ref)]).toEqual([u.ref, true]);
    const refs = new Set(example.receipt.unknown.map((u: { ref: string | null }) => u.ref));
    example.receipt.observed.forEach((o: any, i: number) =>
      o.record.claims.forEach((c: { status: string }, j: number) => {
        if (c.status === 'NOT_CHECKED') expect(refs).toContain(`/receipt/observed/${i}/record/claims/${j}`);
      }),
    );
  });
});

describe('each rule the doc calls checkable is refused when broken', () => {
  const signature = { alg: 'ed25519', public_key: 'placeholder', fingerprint: 'placeholder', signature: 'placeholder' };
  /** A LOCAL_GUARDRAIL policy with an owner signature: what Guard would contribute. */
  const withAuthorized = (authorized: object) => {
    const d = clone(example);
    d.receipt.authorized = authorized;
    d.receipt.unknown = d.receipt.unknown.filter((u: { part: string }) => u.part !== 'authorized');
    return d;
  };
  const guardPolicy = {
    mode: 'LOCAL_GUARDRAIL',
    permits: ['tool:reader'],
    enforcer: { name: 'trustshell run (Guard)', version: null },
    provenance: {
      source: 'policy.json in the owner TrustShell home',
      origin: 'STATED',
      integrity: 'SIGNED',
      digest: { algorithm: 'sha-256', canonicalization: 'RFC 8785', value: '0'.repeat(64) },
      signature,
      verifier: null,
    },
  };

  it('a signed owner policy is still LOCAL_GUARDRAIL, and that is well-formed', () => {
    expect(errorsOf(withAuthorized(guardPolicy))).toEqual([]);
  });

  // [rule, mutation, the instancePath the refusal must name]
  const cases: Array<[string, (d: any) => any, string]> = [
    ['a digest-only part labelled SIGNED', (d) => { d.receipt.observed[0].provenance.integrity = 'SIGNED'; return d; }, '/receipt/observed/0/provenance/signature'],
    ['a signature carried on a part labelled DIGEST_ONLY', (d) => { d.receipt.observed[0].provenance.signature = signature; return d; }, '/receipt/observed/0/provenance/signature'],
    ['a part labelled NONE that carries a digest', (d) => { d.receipt.executed.provenance.digest = d.digest; return d; }, '/receipt/executed/provenance/digest'],
    ['a fourth outcome (PASS)', (d) => { d.receipt.observed[0].record.claims[0].status = 'PASS'; return d; }, '/receipt/observed/0/record/claims/0/status'],
    ['a roll-up pass flag', (d) => { d.receipt.pass = true; return d; }, '/receipt'],
    ['a platform record relabelled INDEPENDENT', (d) => { d.receipt.observed[0].provenance.origin = 'INDEPENDENT'; return d; }, '/receipt/observed/0/provenance/origin'],
    ['a REFERENCED observation that still carries its record', (d) => { d.receipt.observed[0].carriage = 'REFERENCED'; d.receipt.observed[0].uri = 'https://example.invalid/record.json'; return d; }, '/receipt/observed/0'],
    ['a payment part in v0 (a CI run offered as delivery)', (d) => { d.receipt.payment = { delivered: true, evidence: '/receipt/observed/0' }; return d; }, '/receipt/payment'],
    ['a missing part with no NOT_RECORDED entry', (d) => { d.receipt.unknown = d.receipt.unknown.filter((u: { part: string }) => u.part !== 'intended'); return d; }, '/receipt/unknown'],
    ['an empty unknown list', (d) => { d.receipt.unknown = []; return d; }, '/receipt/unknown'],
    ['an authority mode left out', () => { const { mode: _, ...rest } = guardPolicy; return withAuthorized(rest); }, '/receipt/authorized'],
    ['PROTECTED_OWNER_AUTHORITY with no enforcer', () => withAuthorized({ ...guardPolicy, mode: 'PROTECTED_OWNER_AUTHORITY', enforcer: null }), '/receipt/authorized/enforcer'],
    ['PROTECTED_OWNER_AUTHORITY resting on a digest alone', () => withAuthorized({ ...guardPolicy, mode: 'PROTECTED_OWNER_AUTHORITY', provenance: { ...guardPolicy.provenance, integrity: 'DIGEST_ONLY', signature: null } }), '/receipt/authorized/provenance/integrity'],
  ];

  it.each(cases)('refuses %s', (_rule, mutate, path) => {
    const errors = errorsOf(mutate(clone(example)));
    expect(errors.length).toBeGreaterThan(0);
    // Refused for the named reason, not for an unrelated typo in the mutation.
    expect(errors.some((e) => e.startsWith(`${path} `))).toBe(true);
  });
});
