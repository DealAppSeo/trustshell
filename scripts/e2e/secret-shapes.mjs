// Catalog of secret-shaped and personal-data-shaped inputs. EVERY VALUE IS FAKE and built at runtime from
// fragments (no real credential, nothing a secret scanner should match in this file). Deterministic.
//
// `needle` is the secret VALUE only (never its label), so a scrubber that removes the value but keeps the word
// "Authorization:" is correctly scored as scrubbed. A shape LEAKS when its needle appears in what was sent.
//
// `leaksToday` marks a shape KNOWN to leak. 13 shapes carried it until the scrubber fix of 2026-10-12 (measured
// against published @hyperdag/trustshell@1.6.0 and trustshell #518 @72dff8d, XC1); all are now held and no shape
// carries the flag. A new gap is added with `leaksToday: true`, and `--mode regress` then goes red the moment it is
// fixed, so the marker cannot go stale. Authored by XC1; folded in and corrected by CC1 (see cli-secret-battery.mjs).
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (n, chars) => Array.from({ length: n }, () => chars[Math.floor(rnd() * chars.length)]).join('');
const AN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const HEX = '0123456789abcdef';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const J = (...p) => p.join(''); // keeps prefixes from appearing literally in this file

const s = (id, group, value, { text = value, leaksToday = false } = {}) => ({ id, group, needle: value, text, leaksToday });

export const SHAPES = [
  // ---- api keys and tokens: scrubbed today ----
  s('stripe-sk-live', 'token', J('sk_li', 've_') + pick(24, AN)),
  s('stripe-rk-live', 'token', J('rk_li', 've_') + pick(24, AN)),
  s('github-ghp', 'token', 'ghp_' + pick(36, AN)),
  s('github-fine-grained', 'token', 'github_pat_' + pick(22, AN) + '_' + pick(59, AN)),
  s('aws-access-key', 'token', 'AKIA' + pick(16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')),
  s('google-aiza', 'token', 'AIza' + pick(35, AN + '_-')),
  s('openai-sk-proj', 'token', 'sk-proj-' + pick(48, AN + '_-')),
  s('openai-sk', 'token', 'sk-' + pick(48, AN)),
  s('anthropic-sk-ant', 'token', 'sk-ant-api03-' + pick(80, AN + '_-')),
  s('slack-xoxb', 'token', J('xox', 'b-1234567890-1234567890123-') + pick(24, AN)),
  s('supabase-sb-secret', 'token', 'sb_secret_' + pick(30, AN + '_-')),
  s('huggingface-hf', 'token', 'hf_' + pick(34, AN)),
  s('npm-token', 'token', 'npm_' + pick(36, AN)),
  s('jwt', 'token', 'eyJ' + pick(20, AN) + '.eyJ' + pick(30, AN) + '.' + pick(30, AN)),
  (() => { const v = pick(40, AN); return s('bearer-header', 'token', v, { text: 'Authorization: Bearer ' + v }); })(),
  (() => { const v = pick(40, AN); return s('pem-private-key', 'token', v, { text: '-----BEGIN PRIVATE KEY-----' + v + '-----END PRIVATE KEY-----' }); })(),
  (() => { const v = pick(14, AN); return s('labelled-password', 'token', v, { text: 'password: ' + v }); })(),
  (() => { const v = pick(24, AN); return s('labelled-client-secret', 'token', v, { text: 'client_secret: ' + v }); })(),
  // ---- connection strings: scrubbed today ----
  (() => { const v = pick(12, AN); return s('postgres-url', 'url', v, { text: `postgresql://app:${v}@db.example.invalid:5432/prod` }); })(),
  (() => { const v = pick(12, AN); return s('mongodb-srv-url', 'url', v, { text: `mongodb+srv://app:${v}@cluster0.example.invalid/prod` }); })(),
  (() => { const v = pick(12, AN); return s('redis-url', 'url', v, { text: `redis://:${v}@cache.example.invalid:6379` }); })(),
  // ---- evm private keys: scrubbed today ----
  s('eth-privkey-0x', 'wallet', '0x' + pick(64, HEX)),
  s('eth-privkey-bare64', 'wallet', pick(64, HEX)),
  // ---- personal data: scrubbed today ----
  s('email', 'pii', 'jane.doe.test@example.invalid'),
  s('phone-separators', 'pii', '(415) 555-0132'),
  s('ssn-dashed', 'pii', '078-05-1120'),
  s('card-luhn-valid', 'pii', '4242 4242 4242 4242'),
  s('iban', 'pii', 'GB82 WEST 1234 5698 7654 32'),

  // ================= were GAPS (leaked verbatim until the scrubber fix of 2026-10-12): now HELD =================
  s('stripe-whsec', 'token', 'whsec_' + pick(32, AN)),
  s('aws-secret-40-bare', 'token', pick(40, AN + '/+')),
  s('google-oauth-ya29', 'token', 'ya29.' + pick(60, AN + '_-')),
  (() => { const v = pick(24, AN); return s('labelled-api-secret-eq', 'token', v, { text: 'api_secret=' + v }); })(),
  // BIP39 test vectors are PUBLIC reference mnemonics, not any real wallet's seed.
  s('bip39-12-degenerate', 'wallet', Array(11).fill('abandon').concat('about').join(' ')),
  s('bip39-12-distinct', 'wallet', 'legal winner thank year wave sausage worth useful legal winner thank yellow'),
  s('bip39-24-distinct', 'wallet', 'letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic bless'),
  s('bip39-12-comma-separated', 'wallet', 'legal,winner,thank,year,wave,sausage,worth,useful,legal,winner,thank,yellow'),
  (() => { const v = 'legal winner thank year wave sausage worth useful legal winner thank yellow'; return s('bip39-12-labelled', 'wallet', v, { text: 'seed phrase: ' + v }); })(),
  s('bitcoin-wif', 'wallet', 'L' + pick(51, B58)),
  s('xprv-extended-key', 'wallet', 'xprv9s21ZrQH143K' + pick(95, B58)),
  s('solana-secret-base58', 'wallet', pick(88, B58)),
  s('solana-keypair-json', 'wallet', '[' + Array.from({ length: 64 }, () => Math.floor(rnd() * 256)).join(',') + ']'),

  // ================= the variant sweep (XC1, acceptance of #519): the same secrets in forms the first rules missed =================
  // Appended LAST so the pseudo-random stream, and so every value above, is unchanged. All held; none carries `leaksToday`.
  s('google-oauth-ya29-service-account', 'token', ['ya29', 'c', pick(24, AN + '_-'), pick(40, AN + '_-'), pick(20, AN)].join('.')),
  s('stripe-whsec-base64-body', 'token', 'whsec_' + pick(10, AN) + '+' + pick(10, AN) + '/' + pick(10, AN) + '=='),
  ...[
    ['hyphen', '-'], ['underscore', '_'], ['slash', '/'], ['pipe', '|'], ['dot', '.'], ['zero-width', '\u200b'],
  ].map(([name, sep]) => s('bip39-12-' + name + '-separated', 'wallet', 'legal winner thank year wave sausage worth useful legal winner thank yellow'.split(' ').join(sep))),
  s('bip39-12-json-array', 'wallet', JSON.stringify('legal winner thank year wave sausage worth useful legal winner thank yellow'.split(' '))),
  s('bip39-12-quoted-csv', 'wallet', 'legal winner thank year wave sausage worth useful legal winner thank yellow'.split(' ').map((w) => '"' + w + '"').join(',')),
];

export const sentenceWith = (shape) => `My value is ${shape.text} and the capital of France is Paris.`;
/** 'LEAKED' (needle verbatim), 'PARTIAL' (>=12-char run of the VALUE survives), 'SCRUBBED', or 'REFUSED' (nothing sent). */
export function classifySent(shape, sentText) {
  if (sentText === null || sentText === undefined) return 'REFUSED';
  if (sentText.includes(shape.needle)) return 'LEAKED';
  const n = shape.needle;
  if (n.length >= 20) for (let i = 0; i + 12 <= n.length; i++) if (sentText.includes(n.slice(i, i + 12))) return 'PARTIAL';
  return 'SCRUBBED';
}
