/**
 * profile.md parsing is linear (CodeQL js/polynomial-redos, PR #593). A bundle's profile is parsed by
 * brainContext, so profile text is now library input. Three regexes were replaced; the results must not move.
 */
import { parseProfile, renderProfile, defaultProfile } from '../src/lib/profile';

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

  it('stays fast on input built to make the old regexes backtrack', () => {
    const n = 100_000;
    const evil = ['---', `share_identity:${' '.repeat(n)} `, '---', `#${' '.repeat(n)} `, '# Identity', '<!--'.repeat(n)].join('\n');
    const t0 = Date.now();
    parseProfile(evil);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
