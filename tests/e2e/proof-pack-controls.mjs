#!/usr/bin/env node
/**
 * Can the proof pack's own controls FAIL? Offline, no network, no install: it imports the pack's pure functions and feeds them
 * broken verifiers ("mutants"). A tamper test that cannot fail proves nothing, so each mutant must be CAUGHT:
 *   - a verifier that always says "ok"     -> the tamper control must report control-failed (tamper not detected)
 *   - a verifier that always says "no"     -> the positive control must report control-failed (it rejects the untouched copy)
 *   - the real verifier                     -> PASS, and a changed digest, a changed field and a changed claim all fail it
 * and the classifiers must not turn an outage into a quality result, or a model's wrong answer into an outage.
 *
 *   npm run test:proof-pack-controls        exit 0 all held, 1 any did not
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jcs, verifyRecordText, controlVerdict, flipHex, chainedLog, classifySentence, classifyRun, mdEscape } from '../../scripts/proof-pack.mjs';

let failed = 0, ran = 0;
const t = (name, fn) => { ran++; try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const record = { schema: 'dev.trustshell.action-evidence/0.1-draft', observation: { head_sha: '392797a69b6a3e57406cef210a8471585667e3af', run_id: 39619591025, fetchedAt: '2026-10-24T00:00:00.000Z' }, claims: [{ claim: 'run 39619591025', status: 'SUPPORTED', template: 'gha.run_id' }], assurance: { cryptographic_integrity: 'NOT_CHECKED' } };
const good = JSON.stringify({ record, digest: { algorithm: 'sha-256', canonicalization: 'RFC 8785', value: sha(jcs(record)) } });
const digest = JSON.parse(good).digest.value;

t('report markdown: a backslash before a pipe cannot un-escape it', () => eq(mdEscape('a\\|b'), 'a\\\\\\|b'));
t('RFC 8785: keys sort and nest regardless of input order', () => eq(jcs({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}'));
t('RFC 8785: a key order change does not change the digest', () => eq(sha(jcs({ x: 1, y: { b: 2, a: 1 } })), sha(jcs({ y: { a: 1, b: 2 }, x: 1 }))));
t('the real verifier accepts an untouched record', () => eq(verifyRecordText(good).ok, true));
t('one hex character of head_sha changed -> digest mismatch', () => { const v = verifyRecordText(good.replace(record.observation.head_sha, flipHex(record.observation.head_sha))); eq([v.ok, v.reason], [false, 'digest mismatch']); });
t('one hex digit of the digest changed -> digest mismatch', () => eq(verifyRecordText(good.replace(digest, flipHex(digest))).ok, false));
t('SUPPORTED changed to CONTRADICTED (one claim) -> digest mismatch', () => eq(verifyRecordText(good.replace('"SUPPORTED"', '"CONTRADICTED"')).ok, false));
t('a record with no digest, a wrong scheme, or not JSON is refused, never accepted', () => {
  eq(verifyRecordText('not json').ok, false);
  eq(verifyRecordText(JSON.stringify({ record })).ok, false);
  eq(verifyRecordText(good.replace('RFC 8785', 'none')).ok, false);
});

const bad = good.replace(record.observation.head_sha, flipHex(record.observation.head_sha));
t('controlVerdict with the real verifier: PASS', () => eq(controlVerdict(verifyRecordText, good, bad).verdict, 'PASS'));
t('MUTANT: a verifier that always says ok is CAUGHT (tamper not detected)', () => { const r = controlVerdict(() => ({ ok: true }), good, bad); eq([r.verdict, r.cause], ['FAIL', 'control-failed']); if (!/NOT detected/.test(r.detail)) throw new Error(r.detail); });
t('MUTANT: a verifier that always says no is CAUGHT (rejects the untouched copy)', () => { const r = controlVerdict(() => ({ ok: false, reason: 'no' }), good, bad); eq([r.verdict, r.cause], ['FAIL', 'control-failed']); if (!/UNTOUCHED/.test(r.detail)) throw new Error(r.detail); });
t('MUTANT: a "tamper" that changes nothing is CAUGHT (the copy still verifies)', () => eq(controlVerdict(verifyRecordText, good, good).verdict, 'FAIL'));

t('a chained log links every entry to the one before it, and deleting a line breaks the link', () => {
  const log = chainedLog();
  eq(log.length, 5);
  eq(log[0].prev, null);
  for (let i = 1; i < log.length; i++) eq(log[i].prev, log[i - 1].hash, `entry ${i}`);
  const cut = log.filter((_, i) => i !== 2);
  if (cut[2].prev === cut[1].hash) throw new Error('deleting a middle line left the chain linked');
});

const out = (o) => ({ stdout: '', stderr: '', code: 0, ms: 1, ...o });
const sent = (label, code, extra = {}) => out({ stdout: JSON.stringify({ label, by: 'votes', latency_ms: 5, ...extra }), code });
t('sentence: the expected label and exit code is PASS', () => { eq(classifySentence(sent('pass', 0), 'pass').verdict, 'PASS'); eq(classifySentence(sent('veto', 1), 'veto').verdict, 'PASS'); });
t('sentence: the OPPOSITE label is a FAIL of cause quality, not an outage', () => { const r = classifySentence(sent('pass', 0), 'veto'); eq([r.verdict, r.cause], ['FAIL', 'quality']); });
t('sentence: not-checked, a 429, a timeout and a network error are NOT_CHECKED with their own cause, never FAIL', () => {
  eq(classifySentence(sent('not-checked', 2), 'pass').cause, 'provider');
  eq(classifySentence(out({ stdout: '{"label":"not-checked"}', stderr: 'HTTP 429 too many requests', code: 2 }), 'pass').cause, 'quota');
  eq(classifySentence(out({ timedOut: true, code: null }), 'pass').cause, 'timeout');
  const net = classifySentence(out({ stderr: 'fetch failed', code: 3 }), 'pass');
  eq([net.verdict, net.cause], ['NOT_CHECKED', 'network']);
});
t('sentence: the right label with the wrong exit code is not a PASS', () => { if (classifySentence(sent('pass', 1), 'pass').verdict === 'PASS') throw new Error('accepted pass with exit 1'); });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-controls-'));
const withRecord = (statuses, o) => { fs.writeFileSync(path.join(dir, 'record.json'), JSON.stringify({ record: { observation: { conclusion: 'success' }, claims: statuses.map((s) => ({ template: 'x', status: s })) } })); return o; };
t('run claims: a true claim needs exit 0 and every claim SUPPORTED', () => {
  eq(classifyRun(withRecord(['SUPPORTED', 'SUPPORTED'], out({ code: 0 })), 'true', dir).verdict, 'PASS');
  eq(classifyRun(withRecord(['SUPPORTED', 'CONTRADICTED'], out({ code: 1 })), 'true', dir).verdict, 'FAIL');
  eq(classifyRun(withRecord(['NOT_CHECKED'], out({ code: 3 })), 'true', dir).verdict, 'FAIL');
});
t('run claims: a false claim needs exit 1 and a CONTRADICTED claim; exit 0 with all SUPPORTED is a FAIL', () => {
  eq(classifyRun(withRecord(['SUPPORTED', 'CONTRADICTED'], out({ code: 1 })), 'false', dir).verdict, 'PASS');
  eq(classifyRun(withRecord(['SUPPORTED'], out({ code: 0 })), 'false', dir).verdict, 'FAIL');
});
t('run claims: no record and a GitHub 403 is NOT_CHECKED (quota), never FAIL', () => {
  fs.rmSync(path.join(dir, 'record.json'), { force: true });
  const r = classifyRun(out({ code: 3, stderr: 'check failed: GitHub answered 403 rate limit exceeded' }), 'true', dir);
  eq([r.verdict, r.cause], ['NOT_CHECKED', 'quota']);
});
fs.rmSync(dir, { recursive: true, force: true });

console.log(`${ran - failed}/${ran} held${failed ? `, ${failed} did NOT` : ''}`);
process.exit(failed ? 1 : 0);
