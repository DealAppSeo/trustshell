/**
 * Docs-vs-code conformance.
 *
 * An audit found that docs/api-reference.md documented an SDK that did not
 * exist — `evaluate`, `report`, `getAttestation`, `payAndEscrow`,
 * `getLLMTrustScore`, `getReputationHistory`, an `EventEmitter` base class, and
 * four CLI commands (`whois`, `attestation`, `pay`, `init`). A repo-wide grep
 * for those names returned zero hits in executable code, and checking the
 * published 0.4.1 tarball showed the surface had never existed in any shipped
 * build either. The docs are rendered at trustshell.dev/docs/api-reference,
 * which returns 200 — so a stranger could follow them and find nothing.
 *
 * The root cause was not the wrong words. It was that NOTHING TIED THE DOCS TO
 * THE CODE: no test, no CI step, no generation step. The prose could say
 * anything and stay green forever.
 *
 * This is that missing mechanism. It reads the real exports at runtime and the
 * markdown from disk, so it fails by itself the next time either side moves —
 * rather than encoding a snapshot that would drift exactly the way the docs did.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TrustShell } from '../src/lib/trustshell';

const ROOT = join(__dirname, '..');
const DOCS_DIR = join(ROOT, 'docs');

function docFiles(): string[] {
  return readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'));
}

function readDoc(f: string): string {
  return readFileSync(join(DOCS_DIR, f), 'utf8');
}

/**
 * Every markdown surface that DESCRIBES THE SDK TO A READER, repo-root-relative.
 *
 * README.md joined this set on 2026-09-04, and it is the whole point of the
 * addition. The scans below were scoped to `docs/` only, so the repo's most-read
 * file — the one npm and GitHub render on the package's front page — was the one
 * markdown surface free to describe an SDK that does not exist. That is the exact
 * hole this file was written to close, reproduced one directory up.
 *
 * (It was a sibling README that actually shipped the bug: the protocol repo
 * advertised `shell.evaluate(...)`, which existed nowhere. Fixed by adding the
 * method. A cross-repo scan is not possible from here, so this covers the README
 * that IS reachable — and `evaluate` is now real, so the claim is true wherever
 * it appears.)
 */
function describedFiles(): string[] {
  return [...docFiles().map((f) => `docs/${f}`), 'README.md'];
}

function readDescribed(f: string): string {
  return readFileSync(join(ROOT, f), 'utf8');
}

/** Every public method actually on the client, read from the class itself. */
function realMethods(): Set<string> {
  const names = new Set<string>();
  for (const n of Object.getOwnPropertyNames(TrustShell.prototype)) {
    if (n !== 'constructor' && !n.startsWith('_')) names.add(n);
  }
  // Statics too — `TrustShell.init` is documented and is a static.
  for (const n of Object.getOwnPropertyNames(TrustShell)) {
    if (!['length', 'name', 'prototype'].includes(n)) names.add(n);
  }
  return names;
}

describe('docs describe the SDK that exists', () => {
  const methods = realMethods();

  it('sanity: the client exposes the methods this test relies on', () => {
    // If this fails the reflection above broke, and the rest of the file would
    // pass vacuously — which is the exact failure class being guarded here.
    expect(methods.size).toBeGreaterThan(5);
    expect(methods.has('score')).toBe(true);
    expect(methods.has('verifyOutput')).toBe(true);
  });

  it.each(describedFiles())('%s references no SDK method that does not exist', (file) => {
    const text = readDescribed(file);
    // `shell.foo(` / `client.foo(` — how the docs show call sites.
    const referenced = [...text.matchAll(/\b(?:shell|client)\.([a-zA-Z][a-zA-Z0-9]*)\s*\(/g)].map(
      (m) => m[1] as string,
    );
    const phantom = [...new Set(referenced)].filter((m) => !methods.has(m));
    expect(phantom).toEqual([]);
  });
});

describe('docs describe the CLI that exists', () => {
  /**
   * Parsed from the CLI source rather than retyped, so widening the union
   * updates this automatically.
   *
   * EVERY quoted member is taken, with no character class to get wrong. This
   * used to extract `/'([a-z]+)'/g`, and a member the pattern could not match —
   * `'check-run'`, say — did not fail: it silently DISAPPEARED from the set.
   * The two consequences are not symmetric, which is why this was worth fixing
   * rather than widening by one character:
   *
   * - The phantom scan below would go red, calling a real command a phantom. A
   *   false alarm, but a loud one.
   * - The coverage test after it would go quiet. A command absent from the set
   *   is a command nothing requires to be documented — so the guard written to
   *   catch an undocumented command would be the thing hiding it, and every
   *   suite would stay green.
   *
   * Silent and in the safe-looking direction is the failure this file exists to
   * prevent. So: take every member, then ASSERT the shape rather than filtering
   * by it. A member this file did not anticipate now fails out loud and gets
   * looked at, instead of dropping out of both scans.
   */
  const cliSource = readFileSync(join(__dirname, '..', 'src', 'cli', 'index.ts'), 'utf8');
  const commands = (() => {
    const m = cliSource.match(/export type Command\s*=\s*([^;]+);/);
    if (!m || !m[1]) throw new Error('could not parse the Command union from src/cli/index.ts');
    return new Set([...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1] as string));
  })();

  it('sanity: parsed a plausible command set', () => {
    expect(commands.size).toBeGreaterThanOrEqual(3);
    expect(commands.has('verify')).toBe(true);
  });

  it('every parsed member has the shape the scans below assume', () => {
    // The scans match `trustshell <cmd>` as /[a-z][a-z0-9-]*/ and look for a
    // `### \`trustshell <cmd>` heading. A member outside that shape would be
    // matched by neither, so it must fail HERE — where the message names it —
    // rather than passing vacuously in both.
    const malformed = [...commands].filter((c) => !/^[a-z][a-z0-9-]*$/.test(c));
    expect(malformed).toEqual([]);
  });

  it.each(describedFiles())('%s documents no `trustshell <cmd>` that does not exist', (file) => {
    const text = readDescribed(file);
    const referenced = [...text.matchAll(/\btrustshell\s+([a-z][a-z0-9-]*)/g)]
      .map((m) => m[1] as string)
      // Flags and the package name are not subcommands.
      .filter((c) => !c.startsWith('-') && c !== 'verify--' && c !== 'dev');
    const phantom = [...new Set(referenced)].filter((c) => !commands.has(c));
    expect(phantom).toEqual([]);
  });

  /**
   * The MIRROR of the test above, and the one that was missing.
   *
   * The phantom scan catches a doc that promises a command the CLI does not
   * have. It cannot catch the opposite — a command that SHIPS and is documented
   * nowhere — because there is nothing in the prose to compare against. That is
   * the quieter half, and it had already happened: the union carried `badge`,
   * `check`, `inspect`, `init` and `report` while `docs/api-reference.md`, the
   * page rendered at trustshell.dev/docs/api-reference, described three
   * commands. Nothing was red. A reader following the reference would have
   * concluded the other five did not exist.
   *
   * Reading the union rather than a list is the point: the next command added
   * to the CLI fails this test until it is documented, with nobody to remember.
   */
  it('every shipped command appears in docs/api-reference.md', () => {
    // `help` and `version` are reachable as commands but are documented as the
    // `--help` / `--version` flags, which is how anyone actually invokes them.
    const documented = readDescribed('docs/api-reference.md');
    const subcommands = [...commands].filter((c) => c !== 'help' && c !== 'version');
    const undocumented = subcommands.filter(
      (c) => !new RegExp(`^### \`trustshell ${c}\\b`, 'm').test(documented),
    );
    expect(undocumented).toEqual([]);
  });
});

describe('docs describe the environment the code actually reads', () => {
  /**
   * The specific ghosts this repo shipped. A generic scan cannot catch an env
   * var that no longer appears in code at all, because there is nothing left to
   * compare against — so these are pinned by name. Each entry is a bug that was
   * live in published docs, not a hypothetical.
   */
  const RETIRED = [
    'TRUSTSHELL_KEY', // never read; users exporting it got silence
    'TRUSTSHELL_ENDPOINT', // the real name is TRUSTSHELL_API_URL
    'get-api-key', // advertised as the "fastest" route; 404s in production
    '.trustshell.json', // no code reads or writes it; no `init` writes it
    'byok-warning', // no emitter, no event
  ];

  it.each(describedFiles())('%s does not resurrect a retired name', (file) => {
    const text = readDescribed(file);
    const found = RETIRED.filter((name) => text.includes(name));
    expect(found).toEqual([]);
  });
});

describe('doc links resolve', () => {
  it.each(docFiles())('%s has no relative link to a missing doc', (file) => {
    const text = readDoc(file);
    const available = new Set(docFiles());
    const broken = [...text.matchAll(/\]\(\.\/([A-Za-z0-9._-]+\.md)\)/g)]
      .map((m) => m[1] as string)
      .filter((target) => !available.has(target));
    expect([...new Set(broken)]).toEqual([]);
  });
});
