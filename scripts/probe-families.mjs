#!/usr/bin/env node
/**
 * probe-families.mjs: does the live engine answer a check with TWO NAMED MODEL FAMILIES?
 *
 * The site, the glossary, /mission and llms.txt say a check is made by two model families. That is a
 * claim about what the engine does when asked, so the way to hold it is to ask. This sends ONE fixed,
 * harmless public sentence to the two endpoints the claim is about and reads which families answered:
 *
 *   POST /api/v1/classify      the one-sentence check (CLI `check`, the extension, the home box):
 *                              `votes[].family`
 *   POST /api/v1/hal/evaluate  the HAL fact-check (SDK `verify`, MCP `verify_output`, llms.txt):
 *                              `signals.families`
 *
 *   node scripts/probe-families.mjs [--json]
 *
 * Exit 0 VERIFIED (both endpoints named at least two different families)
 *      1 FAILED   (an endpoint answered with fewer than two: the claim is false right now)
 *      3 NOT_CHECKED (unreachable, off-contract, answered without a model, or OFFLINE / local-only)
 * NOT_CHECKED never shares a code with success.
 *
 * WHAT A PASS DOES NOT SHOW. Two named families answered ONE sentence at ONE moment. It does not show
 * the families are statistically independent (they may share training data), that they run on
 * different hosts (HAL reports `independent_hosts` separately and this prints it), or that neither is
 * the family of the model that wrote the answer being checked. "Independent" is a word this cannot
 * prove; "two named families" is what it can. The two endpoints also name the same lineage
 * differently (classify says `gpt-oss`, HAL says `openai`), so names are NOT compared across them.
 *
 * It honours OFFLINE=1 and TRUSTSHELL_LOCAL_ONLY=1: it sends nothing and says NOT_CHECKED.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const SENTENCE = 'Paris is the capital of France.';
const DEFAULT_API = 'https://repid-engine-production.up.railway.app';

const names = (list) =>
  [...new Set((Array.isArray(list) ? list : []).filter((f) => typeof f === 'string' && f.trim() !== '').map((f) => f.trim()))];

/** classify body -> { families, note } | { notChecked }. PURE. */
export function classifyFamilies(body) {
  if (!body || typeof body !== 'object') return { notChecked: 'classify answered with no JSON object' };
  if (body.by !== 'votes') return { notChecked: `classify answered by ${JSON.stringify(body.by ?? 'nothing')}, not by votes, so no model family was asked` };
  if (!Array.isArray(body.votes)) return { notChecked: 'classify said by votes but named no votes' };
  return { families: names(body.votes.map((v) => v && v.family)), voters: names(body.voters), deciders: names(body.deciders) };
}

/** hal/evaluate body -> { families, hosts } | { notChecked }. PURE. */
export function halFamilies(body) {
  const sig = body && typeof body === 'object' ? body.signals : null;
  if (!sig || typeof sig !== 'object') return { notChecked: 'HAL answered with no signals object' };
  if (sig.degraded === true || body.mode !== 'fact-check') return { notChecked: `HAL did not run the fact-check quorum (mode ${JSON.stringify(body.mode)}, degraded ${JSON.stringify(sig.degraded)})` };
  if (!Array.isArray(sig.families)) return { notChecked: 'HAL named no families' };
  return { families: names(sig.families), hosts: typeof sig.independent_hosts === 'number' ? sig.independent_hosts : null };
}

/** The verdict from the two parsed endpoint results. PURE. */
export function judge({ classify, hal }) {
  const lines = [];
  const parts = [
    ['classify (one-sentence check)', classify],
    ['hal/evaluate (HAL fact-check)', hal],
  ];
  let failed = false;
  let notChecked = false;
  for (const [label, r] of parts) {
    if (r.notChecked) {
      notChecked = true;
      lines.push(`NOT_CHECKED  ${label}: ${r.notChecked}`);
    } else if (r.families.length < 2) {
      failed = true;
      lines.push(`FAILED       ${label}: ${r.families.length} named family (${r.families.join(', ') || 'none'}); the claim needs two`);
    } else {
      lines.push(`VERIFIED     ${label}: ${r.families.length} named families: ${r.families.join(', ')}${r.hosts != null ? `; independent_hosts ${r.hosts}` : ''}`);
    }
  }
  // A FAILED endpoint outranks a NOT_CHECKED one: a known-false answer is not softened by a gap elsewhere.
  const verdict = failed ? 'FAILED' : notChecked ? 'NOT_CHECKED' : 'VERIFIED';
  return { verdict, exit: verdict === 'VERIFIED' ? 0 : verdict === 'FAILED' ? 1 : 3, lines };
}

async function post(fetchImpl, url, body) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Ask both endpoints. Returns the judge() result plus the ruler. `fetchImpl` is injectable for tests. */
export async function probe({ env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  const base = (env.TRUSTSHELL_API_URL || DEFAULT_API).replace(/[/]+$/, '');
  const ruler = { engine: base, sentence: SENTENCE, at: now().toISOString() };
  if (env.OFFLINE === '1' || env.TRUSTSHELL_LOCAL_ONLY === '1') {
    return { ...judge({ classify: { notChecked: 'OFFLINE=1 or TRUSTSHELL_LOCAL_ONLY=1 is set, so nothing was sent' }, hal: { notChecked: 'OFFLINE=1 or TRUSTSHELL_LOCAL_ONLY=1 is set, so nothing was sent' } }), ruler };
  }
  const ask = async (path, body, read) => {
    try {
      return read(await post(fetchImpl, base + path, body));
    } catch (e) {
      return { notChecked: `${path} failed: ${e && e.message ? e.message : e}` };
    }
  };
  const [classify, hal] = await Promise.all([
    ask('/api/v1/classify', { text: SENTENCE, labels: ['pass', 'veto', 'not-checked'] }, classifyFamilies),
    ask('/api/v1/hal/evaluate', { text: SENTENCE, strictness: 2 }, halFamilies),
  ]);
  return { ...judge({ classify, hal }), ruler, classify, hal };
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  const r = await probe();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`${r.verdict}  (${r.ruler.engine}, ${r.ruler.at}, one sentence: ${JSON.stringify(r.ruler.sentence)})`);
    for (const l of r.lines) console.log('  ' + l);
    console.log('  Not shown: independence between the families, or different hosts, or that neither wrote the answer.');
  }
  process.exit(r.exit);
}
