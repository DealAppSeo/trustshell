/**
 * One corpus for the outbound scrubber, shared by tests/scrub-corpus.test.ts (what it removes and
 * what it must keep) and tests/scrub-parity.test.ts (src/memory/redact.ts and extension/scrub.js
 * agree byte for byte).
 *
 * Every value is fake, and credential-shaped values are assembled at runtime from pieces so the
 * file itself never contains a string a secret scanner would flag.
 */
const x = (n: number, ch = 'x') => ch.repeat(n);

/** Each entry: a sentence with one sensitive value, and that value (which must not survive). */
export const SENSITIVE: ReadonlyArray<{ kind: string; text: string; secret: string }> = [
  { kind: 'aws key id', secret: 'AKIA' + 'IOSFODNN7EXAMPLE', text: '' },
  { kind: 'aws secret (labelled)', secret: 'wJalrXUtnFEMI' + x(27, 'K'), text: '' },
  { kind: 'google api key', secret: 'AIza' + x(35, 'A'), text: '' },
  { kind: 'stripe secret key', secret: 'sk_' + 'live_' + x(24, '9'), text: '' },
  { kind: 'stripe restricted key', secret: 'rk_' + 'test_' + x(24, '7'), text: '' },
  { kind: 'openai/anthropic key', secret: 'sk-' + 'ant-' + x(30, 'q'), text: '' },
  { kind: 'github token', secret: 'ghp_' + x(36, 'G'), text: '' },
  { kind: 'npm token', secret: 'npm_' + x(36, 'a'), text: '' },
  { kind: 'slack token', secret: 'xoxb-' + x(20, '1'), text: '' },
  { kind: 'supabase secret', secret: 'sb_secret_' + x(20, 'z'), text: '' },
  { kind: 'jwt', secret: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.' + x(20, 'k'), text: '' },
  { kind: 'postgres url', secret: 'postgres://user:' + x(10, 'p') + '@db.example.com/app', text: '' },
  { kind: 'mongodb url', secret: 'mongodb+srv://user:' + x(10, 'p') + '@cluster0.example.net/db', text: '' },
  { kind: 'redis url', secret: 'rediss://default:' + x(10, 'p') + '@cache.example.com:6380', text: '' },
  { kind: 'slack webhook', secret: 'https://hooks.slack.com/services/' + 'T000/B000/' + x(24, 'w'), text: '' },
  { kind: 'private key (64 hex)', secret: '0x' + x(64, 'a'), text: '' },
  { kind: 'pem private key', secret: '-----BEGIN ' + 'PRIVATE KEY-----\n' + x(40, 'M') + '\n-----END ' + 'PRIVATE KEY-----', text: '' },
  { kind: 'email', secret: 'jane.doe@example.com', text: '' },
  { kind: 'phone (us)', secret: '(555) 123-4567', text: '' },
  { kind: 'phone (intl)', secret: '+1 555-123-4567', text: '' },
  { kind: 'ssn', secret: '123-45-6789', text: '' },
  { kind: 'card (luhn-valid test number)', secret: '4111 1111 1111 1111', text: '' },
  { kind: 'iban (valid example)', secret: 'GB82 WEST 1234 5698 7654 32', text: '' },
].map((row) => ({
  ...row,
  text:
    row.kind === 'aws secret (labelled)'
      ? `Our config has aws_secret_access_key=${row.secret} in it.`
      : `The value ${row.secret} came from the reply.`,
}));

/** Sentences that must come out EXACTLY as they went in: a claim is useless if the scrubber eats it. */
export const KEEP: ReadonlyArray<string> = [
  'The Eiffel Tower is in Berlin.',
  'Paris is the capital of France.',
  'Apollo 11 landed on the Moon in 1969.',
  'The world population passed 8,000,000,000 in 2022.',
  'Version 1.5.0 was published on 2026-10-04.',
  'The speed of light is 299,792,458 metres per second.',
  'Water boils at 100 degrees Celsius at sea level.',
  'A marathon is 42.195 kilometres long.',
  'The Bearer of good news asked me to skateboard.',
  'Ask me anything about task-runners.',
  'Publishable keys like pk_' + 'live_' + x(24, '3') + ' are public by design.',
  'The password: is required on the form.',
  'Call 911 in an emergency.',
  'The order number is 1234567890123.',
];
