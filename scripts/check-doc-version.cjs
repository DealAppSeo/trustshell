#!/usr/bin/env node
/**
 * check-doc-version.cjs — a doc that names this package's version must match package.json.
 *
 * CC walked the packed 1.4.0 tarball as a stranger. Every command passed. The one
 * real staleness: docs/api-reference.md still claimed it reflected the "v1.3.0
 * surface" while package.json was 1.4.0. The page renders publicly. Nothing
 * caught it.
 *
 * Discovery: walk every `*.md` from the repo root. Not a hand-maintained file
 * list. repid-engine's jest `roots` named directories by hand and silently ran
 * zero of 52 assertions in six of them — a list fails in the safe-looking
 * direction. The next markdown file is picked up with no one to remember.
 *
 * A version string is a *current package claim* when it presents this package
 * as being that version (published surface, installed `--version`,
 * `@hyperdag/trustshell` vX.Y.Z without a ≥ floor). Historical notes, Node
 * engines, backend `/health` JSON, and "badge ships in ≥ 1.3.0" floors are
 * not current claims. Floors that exceed package.json fail: they tell the
 * reader to upgrade past what exists.
 *
 * Outcomes (exit 3 is never 0):
 *   VERIFIED     0  — walked markdown, package.json version loaded, no contradicting claims
 *   FAILED       1  — a current claim names a version that is not package.json
 *   NOT CHECKED  3  — no package.json version, or the walk found no markdown
 */
'use strict';

const { readFileSync, readdirSync, statSync, existsSync } = require('node:fs');
const { join, relative, extname } = require('node:path');

const EXIT_VERIFIED = 0;
const EXIT_FAILED = 1;
const EXIT_NOT_CHECKED = 3;

const ROOT = join(__dirname, '..');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.next']);

/** semver x.y.z, optional leading v. */
const SEMVER = /\bv?(\d+\.\d+\.\d+)\b/g;

function notChecked(reason) {
  console.log('NOT CHECKED');
  console.error(reason);
  process.exit(EXIT_NOT_CHECKED);
}

function failed(lines) {
  console.log('FAILED');
  for (const l of lines) console.log(l);
  process.exit(EXIT_FAILED);
}

function loadPackageVersion(root = ROOT) {
  const p = join(root, 'package.json');
  if (!existsSync(p)) return { ok: false, reason: 'package.json missing', version: null };
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    return { ok: false, reason: `package.json unreadable: ${err.message}`, version: null };
  }
  const version = typeof pkg.version === 'string' ? pkg.version.trim() : '';
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    return { ok: false, reason: 'package.json has no x.y.z version', version: null };
  }
  return { ok: true, reason: null, version: version.split('-')[0] };
}

function walkMarkdown(root = ROOT) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (extname(name) === '.md') out.push(full);
    }
  }
  return out;
}

function relPosix(root, file) {
  return relative(root, file).replaceAll('\\', '/');
}

function cmpSemver(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/** True when the matched semver is a ≥ / >= floor, not "the version is X". */
function isFloor(line, matchIndex) {
  const before = line.slice(Math.max(0, matchIndex - 12), matchIndex);
  return /(?:>=|≥|>)\s*v?$/u.test(before);
}

/**
 * True when this line presents `version` as the current/published/installed
 * version of *this* package. Historical plans, other products, and floors are
 * not current claims.
 */
function isHistoricalPlan(text) {
  const head = text.slice(0, 1200);
  return /version-bump plan/i.test(head) && /(?:staged|do not publish)/i.test(head);
}

function isCurrentClaim(line, version, matchIndex) {
  if (isFloor(line, matchIndex)) return false;
  if (/(?:version-bump plan|staged\b|do not publish)/i.test(line)) return false;

  if (/installed package version/i.test(line)) return true;
  if (
    new RegExp(String.raw`\bv?${version.replace(/\./g, '\\.')}\s+surface\b`, 'i').test(line) &&
    /(?:published|@hyperdag\/trustshell)/i.test(line)
  ) {
    return true;
  }
  if (/@hyperdag\/trustshell/.test(line)) return true;
  if (/trustshell --version/i.test(line)) return true;
  return false;
}

function scanFile(text, fileRel, pkgVersion) {
  const hits = [];
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    SEMVER.lastIndex = 0;
    for (const m of line.matchAll(SEMVER)) {
      const version = m[1];
      const idx = m.index;
      if (version === pkgVersion) continue;
      if (isFloor(line, idx)) {
        // A floor is only a claim about THIS package when the package is named.
        // `>=18.0.0` is Node; comparing it to package.json 1.4.0 is nonsense.
        if (/@hyperdag\/trustshell/.test(line) && cmpSemver(version, pkgVersion) > 0) {
          hits.push({
            file: fileRel,
            line: i + 1,
            version,
            kind: 'floor',
            excerpt: line.trim().slice(0, 160),
          });
        }
        continue;
      }
      if (!isCurrentClaim(line, version, idx)) continue;
      hits.push({
        file: fileRel,
        line: i + 1,
        version,
        kind: 'claim',
        excerpt: line.trim().slice(0, 160),
      });
    }
  }
  return hits;
}

function scanRepo(root = ROOT) {
  const pkg = loadPackageVersion(root);
  if (!pkg.ok) {
    return { status: 'NOT_CHECKED', reason: pkg.reason, hits: [], stats: null };
  }
  const files = walkMarkdown(root);
  if (files.length === 0) {
    return {
      status: 'NOT_CHECKED',
      reason: 'walk found zero markdown files — refusing to go green over an empty scan',
      hits: [],
      stats: { md: 0, version: pkg.version },
    };
  }
  const hits = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (isHistoricalPlan(text)) continue;
    hits.push(...scanFile(text, relPosix(root, f), pkg.version));
  }
  const stats = { md: files.length, version: pkg.version, hits: hits.length };
  if (hits.length > 0) return { status: 'FAILED', reason: null, hits, stats };
  return { status: 'VERIFIED', reason: null, hits, stats };
}

function main() {
  let result;
  try {
    result = scanRepo(ROOT);
  } catch (err) {
    console.log('NOT CHECKED');
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(EXIT_NOT_CHECKED);
  }
  if (result.status === 'NOT_CHECKED') {
    console.log('NOT CHECKED');
    console.error(result.reason);
    process.exit(EXIT_NOT_CHECKED);
  }
  if (result.status === 'FAILED') {
    console.log('FAILED');
    console.log(
      `package.json is ${result.stats.version}; walked ${result.stats.md} markdown files; ${result.hits.length} contradicting claim(s)`,
    );
    for (const h of result.hits) {
      console.log(`  ${h.file}:${h.line}  claims ${h.version} (${h.kind})  ${h.excerpt}`);
    }
    process.exit(EXIT_FAILED);
  }
  console.log('VERIFIED');
  console.log(
    `package.json ${result.stats.version}; walked ${result.stats.md} markdown files; no current-version claim contradicts it`,
  );
  process.exit(EXIT_VERIFIED);
}

module.exports = {
  EXIT_VERIFIED,
  EXIT_FAILED,
  EXIT_NOT_CHECKED,
  loadPackageVersion,
  walkMarkdown,
  scanFile,
  scanRepo,
  isFloor,
  isCurrentClaim,
  isHistoricalPlan,
  cmpSemver,
};

if (require.main === module) main();
