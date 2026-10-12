/**
 * The BIP39 English word list: 2048 words, the public standard for wallet seed phrases
 * (github.com/bitcoin/bips, bip-0039/english.txt). It is not a secret and not ours.
 *
 * WHY IT IS HERE. A seed phrase has no SHAPE a regex can see: it is twelve or more ordinary
 * words. The scrubber (redact.ts) removes a run of 12 or more consecutive words that are ALL on this
 * list, because a run that long that is entirely on the list is a wallet recovery phrase and
 * nothing a claim needs. tests/scrub-bip39.test.ts pins the count, the first and last word, and the
 * SHA-256 of the list as published (one word per line, a trailing newline), so a typo here cannot
 * quietly turn into a hole. extension/scrub.js carries the same list; the same test compares them.
 */
export declare const BIP39_ENGLISH: string;
