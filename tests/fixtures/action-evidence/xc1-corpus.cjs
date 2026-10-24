/**
 * Every adversarial input XC1 used against `check --claims` (PR #583, rounds 1-6), as [label, text].
 * None may yield exit 0 or a SUPPORTED outcome, on a green run or a red one. Shared by
 * tests/action-evidence.test.ts and the CLAIMS-v1 ablation harness, so both read the same inputs.
 */
'use strict';
const CH = (...cps) => String.fromCodePoint(...cps);
const FENCE = '`'.repeat(3);
const P = 'The check workflow passed (run 39290226738).';
const DEP = 'The deploy workflow failed and all tests fail.';
const fw = (s) => [...s].map((ch) => ({ '<': CH(0xff1c), '!': CH(0xff01), '-': CH(0xff0d), '>': CH(0xff1e) })[ch] ?? ch).join('');
const CORPUS = [
  // round 1 (7c16dc22)
  ['F7 unnamed workflow plus commit', 'The workflow passed on 5cd68edc782f.'],
  ['F1 attempt alone', 'The workflow passed on attempt 1.'],
  ['H1 inline fence', P + '\n' + FENCE + 'Heads-up' + FENCE + ' the deploy workflow failed and nothing works.\nAll tests fail.'],
  ['H2 comment in a code span', P + ' Comments start with `<!--`.\nAll checks fail and the fix does not work.\nThey end with `-->`.'],
  ['B conditional', 'If the workflow passed (run 39290226738), we can merge.'],
  ['B question', 'The workflow passed (run 39290226738)? Unknown.'],
  ['C zero-width Not', 'N' + CH(0x200b) + 'ot true: the workflow passed in run 39290226738.'],
  ['C soft hyphen Not', 'N' + CH(0xad) + 'ot true: the workflow passed in run 39290226738.'],
  ['C tag Not', 'N' + CH(0xe0020) + 'ot true: the workflow passed in run 39290226738.'],
  ['A quoted name', 'The "deploy" workflow passed in run 39290226738.'],
  ['A emphasis', 'The **deploy** workflow passed in run 39290226738.'],
  ['A colon', 'Deploy: the workflow passed in run 39290226738.'],
  ['A longer name', 'The release check workflow passed in run 39290226738.'],
  ['D dry run', 'The dry run passed in run 39290226738.'],
  ['D cross-sentence tie', 'CI run 39290226738 is linked below. The staging smoke run passed.'],
  ['E rebased on', 'The workflow passed on a branch rebased on 5cd68edc782f.'],
  ['F2 unread context', 'The workflow passed for deadbeefcafe1234 too, run 39290226738.'],
  ['F3 zero-width SHA', 'The check workflow passed on commit dead' + CH(0x200b) + 'beef1234.'],
  ['F4 fullwidth run id', 'The workflow passed in run ' + [...'39290226739'].map((d) => CH(0xff10 + Number(d))).join('') + '.'],
  ['F5 other URL', 'The workflow passed in run 39290226738: https://ci.example.com/build/39290226739'],
  ['F6 first try', 'The check workflow passed on the first try in run 39290226738.'],
  // round 2 (be80f012)
  ['N1 strikethrough', '~~' + P + '~~'],
  ['N2 cross mark', 'The check workflow passed in run 39290226738 ' + CH(0x274c)],
  ['N3 interrobang', 'The check workflow passed in run 39290226738' + CH(0x203d)],
  ['N4 fence after a list marker', P + '\n- ' + FENCE + '\n  ' + FENCE + '\n' + DEP],
  ['N5 inverted question', 'Has the check workflow passed in run 39290226738.'],
  ['N6 lazy blockquote', '> The release bot wrote:\nThe check workflow passed in run 39290226738.'],
  ['N8 indented code', '    The check workflow passed in run 39290226738.'],
  ['N9 inline comment', CH(0x2014) + ' <!-- The check workflow passed in run 39290226738. -->'],
  // round 3 (12fd3c79)
  ['R1-a ". cross mark"', 'The check workflow passed in run 39290226738. ' + CH(0x274c)],
  ['R1-a newline ?', 'The check workflow passed in run 39290226738\n?'],
  ['R1-b soft line break', 'The check workflow passed in run 39290226738\nis false.'],
  ['H-a comment in indented code', P + '\n\n    <!-- sample opener\n\n' + DEP + '\n\n-->'],
  ['H-b comment as fence info', 'The check workflow passed in run 39290226738.\n' + FENCE + '<!--\nx\n' + FENCE + '\n' + DEP + '\n-->'],
  ['H-c inline comment across a blank', P + ' Comments open with <!-- this\n\n' + DEP + '\n\n-->'],
  ['F-a fence outside its list', '- ' + FENCE + '\n' + FENCE + '\n' + P + '\n' + FENCE],
  ['F-b fence outside its quote', '> ' + FENCE + '\n> log\n' + FENCE + '\n' + P + '\n' + FENCE],
  ['P-a link reference definition', '[a]: - "' + P + '"'],
  ['P-b image alt', '![' + P + ']()'],
  ['Q *Has*', '*Has* the check workflow passed in run 39290226738.'],
  ['Q And has', 'And has the check workflow passed in run 39290226738.'],
  ['S-a setext', 'The check workflow passed in run 39290226738.\n==='],
  ['T-a "- [ ]text"', '- [ ]The check workflow passed in run 39290226738.'],
  // round 4 (4536e199)
  ['X1 fullwidth comment', 'The check workflow passed in run 39290226738.\n' + fw('<!--') + ' note\n' + DEP + '\n' + fw('-->')],
  ['X2 zero-width in comment', 'The check workflow passed in run 39290226738.\n<' + CH(0x200b) + '!-- note\n' + DEP + '\n--' + CH(0x200b) + '>'],
  ['X3 "<!-->"', 'The check workflow passed in run 39290226738.\n<!-->\n' + DEP + '\n-->'],
  ['X4 marker plus 5 spaces', '-     The check workflow passed in run 39290226738.'],
  ['X5 definition label over two lines', '[a\n]: - "The check workflow passed in run 39290226738."'],
  ['X6 title on the next line', '[a](-\n"The check workflow passed in run 39290226738.")'],
  ['X7 inline-code paragraph', '`The check workflow passed in run 39290226738.`'],
  ['X8 "2." continuation', 'The check workflow passed in run 39290226738\n2. ' + CH(0x274c)],
  ['bidi reorder', 'The check workflow ' + CH(0x202e) + 'dessap' + CH(0x202c) + ' in run 39290226738.'],
  // round 5 (466dff84)
  ['Y1 "Locally" above', 'Locally\nthe check workflow passed in run 39290226738.'],
  ['Y1 "On my machine" above', 'On my machine\nthe check workflow passed in run 39290226738.'],
  ['Y1 "locally." below', 'The check workflow passed in run 39290226738\nlocally.'],
  ['Y1 NBSP-only line between', 'Locally\n' + CH(0xa0) + '\nthe check workflow passed in run 39290226738.'],
  ['Z2 7-hex prefix', 'The check workflow passed on 5cd68ed.'],
  ['Y3 that-clause', 'That the check workflow passed in run 39290226738'],
  // round 6 (f70b33c1)
  ['W2 run URL on agithub.com', 'The check workflow passed in agithub.com/DealAppSeo/trustshell/actions/runs/39290226738'],
  ['W2 run URL on a github.com subdomain', 'The check workflow passed in https://evil.github.com/DealAppSeo/trustshell/actions/runs/39290226738'],
  ['W2 commit URL on thegithub.com', 'The check workflow passed in run 39290226738, fixed in https://thegithub.com/DealAppSeo/trustshell/commit/5cd68edc782f'],
];

module.exports = { CORPUS };
