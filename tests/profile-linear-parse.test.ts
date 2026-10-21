/**
 * profile.md parsing is linear (CodeQL js/polynomial-redos, PR #593). A bundle's profile is parsed by
 * brainContext, so profile text is now library input. Three regexes were replaced; the results must not move.
 */
import { parseProfile, renderProfile, defaultProfile, splitPerson } from '../src/lib/profile';

describe('profile parsing: same answers, linear time', () => {
  it('reads the same fields as before on ordinary files, comments and odd spacing included', () => {
    const text = [
      '---',
      'trustshell_profile:    1',
      'share_identity :  true  ',
      'share_context: false',
      '---',
      '',
      '#   Identity   ',
      'Ada <!-- hidden --> Lovelace',
      '<!-- a comment',
      'over two lines -->',
      '# Context',
      'keep <!-- unclosed comment stays',
      '# Trust settings',
      'autonomy: do_then_tell',
    ].join('\n');
    const { profile } = parseProfile(text);
    expect(profile.share_identity).toBe(true);
    expect(profile.share_context).toBe(false);
    expect(profile.identity).toBe('Ada  Lovelace');
    expect(profile.context).toBe('keep <!-- unclosed comment stays');
    expect(profile.trust.autonomy).toBe('do_then_tell');
    expect(parseProfile(renderProfile(defaultProfile())).profile).toEqual(defaultProfile());
  });

  it('splitPerson gives what the old who — why: regex gave', () => {
    const OLD = /^(.*?)\s+[—–-]+\s*why:\s*(.*)$/i;
    const old = (item: string) => {
      const m = item.match(OLD);
      return m ? { who: (m[1] ?? '').trim(), why: (m[2] ?? '').trim() } : { who: item, why: '' };
    };
    for (const item of [
      'first-time founders — why: they cannot afford a wrong answer',
      'my sister -- WHY: she asked',
      'a – why:   b',
      'x — why: y — why: z',
      'no separator here',
      'why: at the start',
      'dash-but-no-space—why: x',
      'a —why:b',
      'a — whY: b',
      'trailing — why:',
      'mid-word somewhy: no — why: yes',
    ]) {
      expect(splitPerson(item)).toEqual(old(item));
    }
  });

  it('stays fast on input built to make the old regexes backtrack', () => {
    const n = 100_000;
    const t1 = Date.now();
    splitPerson(`a${' '.repeat(n)}${'-'.repeat(n)}`);
    splitPerson(`${' -'.repeat(n)}why`);
    expect(Date.now() - t1).toBeLessThan(1000);
    const evil = ['---', `share_identity:${' '.repeat(n)}\u2028`, '---', `#${' '.repeat(n)}\u2028`, '# Identity', '<!--'.repeat(n), '# Style', `tone:${' '.repeat(n)}\u2028`, '# Model priorities', `order:${' '.repeat(n)}\u2028`].join('\n');
    const t0 = Date.now();
    parseProfile(evil);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
