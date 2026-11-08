#!/usr/bin/env node
'use strict';
/**
 * Refuse repo-specific work in the WRONG checkout — a durable guard for the launcher-misrouting defect
 * (DECISION 3, #679 sprint). The session launcher has bound a TrustShell task to the old `ihh-ica` project
 * while the working dir was the `trustshell-tl` worktree, so `start_session` resolved the wrong repo and
 * work risked landing (or silently failing) against the wrong history. The session-binding itself is
 * app-level config this script cannot change; this is the in-repo assertion so any loop or session can gate
 * its own work and fail LOUDLY instead of silently misrouting:
 *
 *   node scripts/check-workspace.cjs                 # expects origin = DealAppSeo/trustshell
 *   node scripts/check-workspace.cjs owner/repo      # expects that repo
 *   TRUSTSHELL_EXPECT_REPO=owner/repo node scripts/check-workspace.cjs
 *
 * Exit 0 when origin matches, 1 (with a loud message) otherwise. No deps; safe to call at task startup.
 */
const { execSync } = require('node:child_process');

/** PURE. Does a git remote URL (https or ssh, optional `.git` / trailing slash) point at `owner/repo`? */
function workspaceMatches(remoteUrl, expected) {
  const m = String(remoteUrl)
    .trim()
    .match(/github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i);
  return m ? m[1].toLowerCase() === String(expected).toLowerCase() : false;
}

/** Resolve the current origin + branch and assert it is `expected`. Returns the process exit code. */
function main(argv, env, run) {
  const expected = argv[2] || env.TRUSTSHELL_EXPECT_REPO || 'DealAppSeo/trustshell';
  const sh = run || ((cmd) => execSync(cmd, { encoding: 'utf8' }).trim());
  let remote = '';
  let branch = '';
  try { remote = sh('git remote get-url origin'); } catch { /* no remote */ }
  try { branch = sh('git rev-parse --abbrev-ref HEAD'); } catch { /* detached / no repo */ }
  if (!workspaceMatches(remote, expected)) {
    process.stderr.write(
      `WORKSPACE MISROUTED: origin is "${remote || '(none)'}", expected ${expected}. ` +
        `Refusing repo-specific work in the wrong checkout — cd to the ${expected} worktree first.\n`,
    );
    return 1;
  }
  process.stderr.write(`workspace OK: ${expected}${branch ? ` @ ${branch}` : ''}\n`);
  return 0;
}

module.exports = { workspaceMatches, main };

if (require.main === module) process.exit(main(process.argv, process.env));
