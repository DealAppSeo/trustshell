/**
 * THE PARSE IS COSMETIC AND THE SIGNATURE IS NOT.
 *
 * `parseStatement` exists only so the claim page can set the engine's three machine parameters
 * in mono and its two sentences of English in the display face. What gets signed is the raw
 * string the engine sent, byte for byte — `bindAgent` never touches this function.
 *
 * That makes one failure mode worth guarding above all others: a statement whose shape we do
 * NOT recognise must return null, so the page falls back to rendering the raw text verbatim. A
 * tidy reconstruction shown where the real document belongs would be a rendering of our guess,
 * displayed at the exact moment somebody decides to sign. The tests below therefore spend most
 * of their effort proving the parser REFUSES, not that it succeeds.
 *
 * The success case is anchored on the real statement, fetched from the live engine on
 * 2026-09-01 (GET /api/v1/human/bind/message) rather than invented here — a parser tested only
 * against the format its author imagined is a parser nobody knows fits.
 */
import { parseStatement } from '../lib/human-bind';

/** Verbatim from repid-engine production. Do not tidy the alignment; it is load-bearing. */
const LIVE = [
  'HyperDAG — bind agent to human',
  '',
  'wallet: 0x8f4b2c1a9d7e3f60ab5c8e21d4f9a0b7c36e5d18',
  'agent:  3f9c1a72-5e84-4b1d-9a06-c7e2f4b81d55',
  'scope:  ownership',
  '',
  'Signing this proves you control this wallet and claims ownership of this agent.',
  'It moves no funds and grants no spending authority.',
].join('\n');

describe('parseStatement — the live format', () => {
  it('splits the real engine statement into title, parameters and prose', () => {
    const p = parseStatement(LIVE);
    expect(p).not.toBeNull();
    expect(p!.title).toBe('HyperDAG — bind agent to human');
    expect(p!.params).toEqual([
      { key: 'wallet', value: '0x8f4b2c1a9d7e3f60ab5c8e21d4f9a0b7c36e5d18' },
      { key: 'agent', value: '3f9c1a72-5e84-4b1d-9a06-c7e2f4b81d55' },
      { key: 'scope', value: 'ownership' },
    ]);
    expect(p!.prose).toBe(
      'Signing this proves you control this wallet and claims ownership of this agent. ' +
        'It moves no funds and grants no spending authority.',
    );
  });

  it('loses nothing — every word of the statement survives into some field', () => {
    const p = parseStatement(LIVE)!;
    const shown = [p.title, ...p.params.map((x) => `${x.key} ${x.value}`), p.prose].join(' ');
    for (const word of LIVE.split(/\s+/).filter(Boolean)) {
      expect(shown).toContain(word.replace(/:$/, ''));
    }
  });

  it('does not mutate its input', () => {
    const before = LIVE;
    parseStatement(LIVE);
    expect(LIVE).toBe(before);
  });
});

describe('parseStatement — refuses anything it does not recognise', () => {
  it('returns null when there is no parameter block', () => {
    expect(parseStatement('Just one sentence with no parameters at all.')).toBeNull();
  });

  it('returns null when the parameter block is interrupted by an unparseable line', () => {
    // If this returned a partial parse, the interrupting line would silently vanish from a
    // document somebody is about to sign.
    expect(
      parseStatement(
        ['Title', '', 'wallet: 0xabc', 'THIS LINE IS NOT A PARAMETER', 'scope:  ownership', '', 'Prose.'].join('\n'),
      ),
    ).toBeNull();
  });

  it('returns null when there is no prose after the parameters', () => {
    expect(parseStatement(['Title', '', 'wallet: 0xabc', 'scope:  ownership'].join('\n'))).toBeNull();
  });

  it('returns null on an empty statement', () => {
    expect(parseStatement('')).toBeNull();
    expect(parseStatement('\n\n  \n')).toBeNull();
  });

  it('does not mistake a colon inside the prose for a parameter', () => {
    // "Note: ..." sits after the blank line that ends the parameter block, so it belongs to the
    // prose. Treating it as a fourth parameter would move a sentence into the data table.
    const p = parseStatement(
      ['Title', '', 'wallet: 0xabc', '', 'Note: this sentence contains a colon.'].join('\n'),
    );
    expect(p).not.toBeNull();
    expect(p!.params).toEqual([{ key: 'wallet', value: '0xabc' }]);
    expect(p!.prose).toBe('Note: this sentence contains a colon.');
  });

  it('survives a format change by refusing rather than guessing', () => {
    // The canon-vs-code decision may replace this text wholesale. Whatever arrives, an
    // unrecognised shape has to fall back to the raw rendering.
    const canonShape = 'TrustShell binding\nhuman:0xabc\nagent:my-agent\nscope:ownership\nnonce:uuid';
    const p = parseStatement(canonShape);
    // No blank line after the title, so the parameter block never starts: null, not a guess.
    expect(p).toBeNull();
  });
});
