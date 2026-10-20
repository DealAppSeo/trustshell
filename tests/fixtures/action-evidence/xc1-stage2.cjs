/**
 * XC1's CLAIMS-v1 stage-2 corpus (claims-v1/xc1-stage2-adversarial.md), as [label, text, run]:
 * text items for the shadow switches. `run` is the corpus run they are judged on ('green' or
 * 'red'). On 'green' no outcome may be SUPPORTED; on 'red' (the asym items) none may be CONTRADICTED
 * either, because the text does not assert the claim. The five checks-evidence items need their
 * own evidence and live in experiments/claims-v1/ablate.cjs.
 */
'use strict';
const PARA = (a, b) => a + String.fromCharCode(10, 10) + b;
const ALL = 'All checks pass.';
const STAGE2 = [
  ['binding: another commit above', PARA('On commit deadbeefcafe1234.', ALL), 'green'],
  ['binding: another run above', PARA('In run 39290226739.', ALL), 'green'],
  ['binding: another attempt above', PARA('On attempt 2.', 'The workflow passed.'), 'green'],
  ['binding: local label above', PARA('Locally', ALL), 'green'],
  ['binding: production label above', PARA('In production', 'CI is green.'), 'green'],
  ['asym: negation above', PARA('None of the following is true.', ALL), 'red'],
  ['asym: falsity above', PARA('The statements below are false.', ALL), 'red'],
  ['asym: known issues', PARA('Known issues', ALL), 'red'],
  ['asym: before this change', PARA('Before this change', ALL), 'red'],
  ['asym: just kidding below', PARA(ALL, 'Just kidding.'), 'red'],
  ['asym: definition of done', PARA('Definition of done', ALL), 'red'],
  ['asym: goal', PARA('Goal for the next push', ALL), 'red'],
  ['asym: request to confirm', PARA('Reviewer, please confirm', ALL), 'red'],
  ['asym: expectation', PARA('Expected once the flaky test is fixed', ALL), 'red'],
  ['asym: not done', PARA('Not done yet.', ALL), 'red'],
  ['asym: before this change, run claim', PARA('Before this change', 'The workflow passed in run 39290226738.'), 'red'],
];
module.exports = { STAGE2 };
