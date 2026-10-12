/**
 * Secret shapes the outbound scrubber used to MISS (found by XC1's red team, 2026-10-12, and
 * reproduced in tests/scrub-outbound.test.ts before the fix). Every value is FAKE, structurally
 * valid-but-nonsense, and assembled at runtime from pieces so this file never contains a string a
 * secret scanner would flag. The seed phrases are BIP39 words in an order that is not any wallet.
 */
const rep = (n: number, ch: string) => ch.repeat(n);

/** 12 BIP39 words, alphabetical (a fake: no wallet is generated from this order). */
export const WORDS_12 = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'];
/** 24 BIP39 words, alphabetical-ish and fake. */
export const WORDS_24 = [...WORDS_12, 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual'];

export type Shape = { kind: string; secret: string; text: string };

const solana = '[' + Array.from({ length: 64 }, (_v, i) => (i * 7 + 3) % 256).join(', ') + ']';
const AWS_BARE = 'wJalrXUtnFEMI' + '/K7MDENG/' + 'bPxRfiCYEXAMPLEKEY'; // 40 chars, mixed case, a digit and slashes

export const MISSED: ReadonlyArray<Shape> = [
  { kind: 'stripe webhook secret (whsec_)', secret: 'whsec_' + rep(32, 'q'), text: '' },
  { kind: 'aws secret, bare 40 characters', secret: AWS_BARE, text: '' },
  { kind: 'google oauth access token (ya29.)', secret: 'ya29.' + 'a0Af' + rep(40, 'B'), text: '' },
  { kind: 'seed phrase, 12 words, space-separated', secret: WORDS_12.join(' '), text: '' },
  { kind: 'seed phrase, 12 words, comma-separated', secret: WORDS_12.join(', '), text: '' },
  { kind: 'seed phrase, 24 words', secret: WORDS_24.join(' '), text: '' },
  { kind: 'seed phrase with a label', secret: WORDS_12.join(' '), text: 'My seed phrase: ' + WORDS_12.join(' ') + ' is backed up.' },
  { kind: 'extended private key (xprv)', secret: 'xprv' + rep(107, 'A'), text: '' },
  { kind: 'extended public key (xpub)', secret: 'xpub' + rep(107, 'B'), text: '' },
  { kind: 'wif private key, uncompressed (5...)', secret: '5' + rep(50, 'H'), text: '' },
  { kind: 'wif private key, compressed (K...)', secret: 'K' + rep(51, 'x'), text: '' },
  { kind: 'wif private key, compressed (L...)', secret: 'L' + rep(51, 'z'), text: '' },
  { kind: 'wif private key, testnet (c...)', secret: 'c' + rep(51, 'T'), text: '' },
  { kind: 'raw ethereum private key (0x + 64 hex)', secret: '0x' + rep(32, 'a1'.charAt(0)) + rep(32, 'b'), text: '' },
  { kind: 'raw ethereum private key, labelled', secret: rep(16, 'c3d4'.slice(0, 2)) + rep(32, 'e'), text: 'My private_key: ' + rep(16, 'c3d4'.slice(0, 2)) + rep(32, 'e') + ' in it.' },
  { kind: 'solana secret key, base58 (88 chars)', secret: rep(44, 'Ab') , text: '' },
  { kind: 'solana keypair, 64-int JSON array', secret: solana, text: '' },
  { kind: 'api_secret= labelled value', secret: rep(24, 'q'), text: 'The config has api_secret=' + rep(24, 'q') + ' in it.' },
  { kind: 'api_secret JSON-quoted', secret: rep(24, 'r'), text: 'The body was {"api_secret": "' + rep(24, 'r') + '"} as sent.' },
  { kind: 'prefixed env name (WEBHOOK_SECRET=)', secret: rep(24, 's'), text: 'The env has WEBHOOK_SECRET=' + rep(24, 's') + ' set.' },
].map((row) => ({ ...row, text: row.text || `The value ${row.secret} came from the reply.` }));

/** Sentences that must come out EXACTLY as they went in (over-redaction would make a claim uncheckable). */
export const KEEP_MORE: ReadonlyArray<string> = [
  'The commit 3f786850e387550fdab836ed7e6dc881de23001b fixed the bug.', // a 40-hex git SHA-1 is not a secret
  'The Eiffel Tower, the Louvre, the Seine, the Arc de Triomphe and the Panthéon are all in Paris, France.',
  'Water boils at one hundred degrees and freezes at zero, which is why ice floats on a lake in winter.',
  'The word whsec is a prefix, and ya29 is a number.',
  'An xpub key is public and may be shared.',
  'A Bitcoin address such as 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2 is 34 characters long.', // an address, not a key
  'The IPFS hash QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG is 46 characters.',
  'The identifier Lorem' + 'ipsumdolorsitametconsecteturadipiscingelitseddo is long and has no key shape.',
  'The array [1, 2, 3, 4, 5, 6, 7, 8] has eight elements.',
  'The values were 12, 18, 24, 30, 36, 42, 48 and 54.',
  'The secret to good bread is patience and a hot oven.',
  'The token economy was introduced in 1971 by a psychologist.',
  'She said the password: was a mystery to everyone.',
];
