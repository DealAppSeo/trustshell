/**
 * The default view on "/" is the check form under Try to trick it, with nothing to open first.
 *
 * It used to be an install-and-verify command block (FIRST_COMMANDS) plus "copy the family host
 * verdict line", with the chat and terminal options behind two reveal buttons. The home page is
 * now /check moved up, so the first thing on screen is a sentence ready to check, and the
 * terminal and agent paths are two quiet next steps under it. No memory.sqlite.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '../components/hero.tsx'), 'utf8').replace(/\r/g, '');

describe('home default view', () => {
  it('is the check form with its three cards, before the one link down to the next steps, with no panel to open', () => {
    const start = hero.indexOf('return (');
    expect(start).toBeGreaterThan(-1);
    const view = hero.slice(start);
    const form = view.indexOf('<CheckForm');
    // Since the 2026-10-05 home page the terminal and agent steps are on screen 3 (#add-agent).
    const add = view.indexOf('href="#add-agent"');
    expect(form).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(form);
    expect(view.slice(form, add)).toContain('samples={HOME_SAMPLES} boxLabel="Or paste the answer you almost used"');
    // 2026-10-06: Paste both sits in the same panel, folded, before the link down.
    expect(view.slice(form, add)).toContain('<CompareForm />');
    expect(hero).toMatch(/import \{[^}]*\bHOME_SAMPLES\b[^}]*\} from '@\/lib\/home-samples';/);
    // Sean, 2026-10-06: no prefilled box under a caption that gives the answer away.
    expect(hero).not.toContain('initialText=');
    expect(hero).not.toContain('The average is not 45');

    // Gone: the reveal panels and the old first block.
    expect(hero).not.toMatch(/useState|setPanel|aria-expanded/);
    expect(hero).not.toContain('FIRST_COMMANDS');
    expect(hero).not.toContain('WIN_COMMANDS');
    expect(hero).not.toContain('trustshell verify "paste your own claim"');
    expect(hero).not.toContain('trustshell repid trinity-shofet');
    expect(hero).not.toContain('After verify, copy the family host verdict line.');
    expect(hero).not.toContain('Check a claim in the chat you already use');
    expect(hero).not.toMatch(/trustshell status/);

    expect(view).not.toContain('PAI');
    expect(view).not.toContain('CMO belt');
    expect(hero).not.toMatch(/memory\.sqlite/);
    expect(hero).not.toMatch(/Startup|Enterprise/);
    expect(hero).not.toMatch(/stake now/i);
    // The only input on the home page is the one inside CheckForm.
    expect(hero).not.toMatch(/<(input|textarea)\b/);
  });
});
