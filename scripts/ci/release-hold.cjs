#!/usr/bin/env node
'use strict';
/**
 * release-hold: one decision for one pull request revision. READY, HOLD or NOT_CHECKED.
 *
 * Why it exists: #696 said "do not merge" in its title and body, and its body said "the PR is a draft
 * so it cannot be merged by accident". It was taken out of draft, every check was green, and it merged
 * (reverted in #729). No gate read the author's own words. This one does.
 *
 * Deterministic. No model, no network, no token: it reads the pull_request object GitHub already put in
 * the event file. The workflow runs the copy of this file from the BASE commit, so a PR cannot edit the
 * rule that judges it.
 *
 *   node scripts/ci/release-hold.cjs                 # reads $GITHUB_EVENT_PATH
 *   node scripts/ci/release-hold.cjs <pr.json>       # a pull_request object, or an event with one
 *
 * Exit: 0 READY · 1 HOLD · 3 NOT_CHECKED (never 0: not checked is not the same as passed).
 *
 * ponytail: the hold is not sticky. Editing the words out of the title or body clears it, and the check
 * cannot tell who edited them. A sticky hold needs the PR's timeline (a token); add it when a second
 * maintainer account exists to make "who released it" mean something.
 * ponytail: one contradicted claim is checked ("is a draft"). Wider claim-vs-evidence checks belong to
 * `trustshell check`, wired in when a maintainer asks for them.
 */
const fs = require('node:fs');
const crypto = require('node:crypto');

const HOLD_WORDS = /\b(do not merge|don'?t merge|dnm|wip)\b/i;
const HOLD_LABELS = new Set(['do-not-merge', 'do not merge', 'hold', 'wip']);
const DRAFT_CLAIM = /\b(?:PR|pull request)\s+is\s+a\s+draft\b/i;

/** A phrase inside code or double quotes is a mention, not a statement. Drop those before matching. */
function prose(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/"[^"\n]*"|“[^”\n]*”/g, ' ');
}

/** PURE. `pr` is GitHub's pull_request object. */
function decide(pr) {
  if (!pr || typeof pr !== 'object' || typeof pr.title !== 'string' || typeof pr.draft !== 'boolean' || !pr.head || !pr.head.sha) {
    return { decision: 'NOT_CHECKED', reasons: ['no readable pull_request object (title, draft and head.sha are required)'] };
  }
  const reasons = [];
  const title = prose(pr.title), body = prose(pr.body);
  const t = title.match(HOLD_WORDS), b = body.match(HOLD_WORDS);
  if (pr.draft) reasons.push('the PR is a draft');
  if (t) reasons.push(`the title says: ${t[0]}`);
  if (b) reasons.push(`the body says: ${b[0]}`);
  for (const l of pr.labels || []) {
    const name = String((l && l.name) || l).toLowerCase();
    if (HOLD_LABELS.has(name)) reasons.push(`label: ${name}`);
  }
  if (!pr.draft && DRAFT_CLAIM.test(body)) reasons.push('CONTRADICTED: the body says the PR is a draft; GitHub says it is not');
  return { decision: reasons.length ? 'HOLD' : 'READY', reasons };
}

function receipt(pr, repo) {
  const d = decide(pr);
  return {
    subject: d.decision === 'NOT_CHECKED' ? null : `${repo || '?'}#${pr.number}@${pr.head.sha}`,
    policy: 'release-hold v0',
    policy_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    ...d,
  };
}

function main(argv, env) {
  let pr = null, repo = env.GITHUB_REPOSITORY;
  try {
    const j = JSON.parse(fs.readFileSync(argv[2] || env.GITHUB_EVENT_PATH, 'utf8'));
    pr = j.pull_request || j;
    repo = repo || (j.repository && j.repository.full_name);
  } catch { /* falls through to NOT_CHECKED with its reason */ }
  const r = receipt(pr, repo);
  const out = JSON.stringify(r, null, 2);
  console.log(out);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `### release-hold: ${r.decision}\n\n\`\`\`json\n${out}\n\`\`\`\n`);
  return { READY: 0, HOLD: 1 }[r.decision] ?? 3;
}

if (require.main === module) process.exit(main(process.argv, process.env));
module.exports = { decide, prose, receipt, main };
