/**
 * write-receipt — build + validate a TrustShell action receipt against schemas/receipt.schema.json.
 *
 * One shared shape with scripts/safety-glass.mjs (hal / repid / onchain.tx / proof.verified) plus the
 * `cap` block safety-glass does not emit. Validation reads the schema file itself (single source) —
 * no ajv dependency. Run `node scripts/write-receipt.mjs` for the self-check.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(HERE, '..', 'schemas', 'receipt.schema.json'), 'utf8'));

/** Assemble a receipt from parts. Pass through the same field paths safety-glass uses. */
export function buildReceipt({ agent, hal, repid, onchain, proof, cap }) {
  return { agent, hal, repid, onchain, proof, cap };
}

// Minimal JSON-Schema check covering exactly the constructs this schema uses:
// type, required, enum, pattern, minimum, nested object properties. Returns string[] of errors.
function check(node, schema, path, errors) {
  if (schema.type === 'object' && node !== null && typeof node === 'object') {
    for (const req of schema.required ?? []) {
      if (node[req] === undefined) errors.push(`${path}: missing required '${req}'`);
    }
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      if (node[k] !== undefined) check(node[k], sub, `${path}.${k}`, errors);
    }
    return errors;
  }
  const t = schema.type;
  if (t === 'string' && typeof node !== 'string') errors.push(`${path}: expected string`);
  if (t === 'number' && (typeof node !== 'number' || !Number.isFinite(node))) errors.push(`${path}: expected finite number`);
  if (t === 'boolean' && typeof node !== 'boolean') errors.push(`${path}: expected boolean`);
  if (t === 'object' && (node === null || typeof node !== 'object')) errors.push(`${path}: expected object`);
  if (schema.enum && !schema.enum.includes(node)) errors.push(`${path}: '${node}' not in [${schema.enum}]`);
  if (schema.pattern && typeof node === 'string' && !new RegExp(schema.pattern).test(node)) errors.push(`${path}: does not match ${schema.pattern}`);
  if (typeof schema.minimum === 'number' && typeof node === 'number' && node < schema.minimum) errors.push(`${path}: ${node} < minimum ${schema.minimum}`);
  return errors;
}

/** Validate a receipt against the schema. Returns { valid, errors }. */
export function validateReceipt(receipt) {
  const errors = check(receipt, SCHEMA, 'receipt', []);
  // Cross-field invariant the schema can't express: an enforced cap must not have been exceeded.
  if (receipt?.cap?.enforced === true && receipt.cap.amount > receipt.cap.limit) {
    errors.push(`receipt.cap: enforced but amount ${receipt.cap.amount} > limit ${receipt.cap.limit}`);
  }
  return { valid: errors.length === 0, errors };
}

// ── self-check ──────────────────────────────────────────────────────────────
function selfCheck() {
  // Sample mirrors safety-glass's `glass` object + the cap block.
  const good = buildReceipt({
    agent: 'trinity-shofet',
    hal: { verdict: 'PASS', trustScore: 0.98, evidence: [] },
    repid: { score: 2150, tier: 'ESTABLISHED' },
    onchain: { tx: '0xa9a17329b6cc4c7eb6bfbba547f076687c64512f084422258041d603ffda5c95', registry: '0x8004B663056A597Dffe9eCcC1965A193B7388713', block: 46652364, method: 'Append Response' },
    proof: { scheme: 'plonky3_range_check', verified: true, statement: { tier: 'ESTABLISHED' } },
    cap: { limit: 1000, amount: 5, currency: 'USDC', enforced: true },
  });
  const ok = validateReceipt(good);
  if (!ok.valid) throw new Error(`self-check FAIL: valid receipt rejected: ${ok.errors.join('; ')}`);

  // A null proof.scheme (safety-glass may copy through a null scheme) must still validate.
  const nullScheme = JSON.parse(JSON.stringify(good));
  nullScheme.proof.scheme = null;
  if (!validateReceipt(nullScheme).valid) throw new Error('self-check FAIL: null proof.scheme must validate');

  const cases = [
    ['missing cap', (r) => { delete r.cap; }],
    ['missing onchain.tx', (r) => { delete r.onchain.tx; }],
    ['bad verdict', (r) => { r.hal.verdict = 'MAYBE'; }],
    ['non-0x tx', (r) => { r.onchain.tx = 'nope'; }],
    ['cap exceeded but enforced', (r) => { r.cap.amount = 2000; }],
    ['non-finite cap limit', (r) => { r.cap.limit = Infinity; }],
    ['NaN cap amount', (r) => { r.cap.amount = NaN; }],
    ['missing cap currency', (r) => { delete r.cap.currency; }],
  ];
  for (const [name, mutate] of cases) {
    const bad = JSON.parse(JSON.stringify(good));
    mutate(bad);
    if (validateReceipt(bad).valid) throw new Error(`self-check FAIL: '${name}' should have been rejected`);
  }
  console.log(`write-receipt self-check: PASS — valid receipt accepted, ${cases.length} malformed variants rejected`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) selfCheck();
