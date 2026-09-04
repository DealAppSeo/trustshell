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
  // Parsed from the CLI source rather than retyped, so widening the union
  // updates this automatically.
  const cliSource = readFileSync(join(__dirname, '..', 'src', 'cli', 'index.ts'), 'utf8');
  const commands = (() => {
    const m = cliSource.match(/export type Command\s*=\s*([^;]+);/);
    if (!m || !m[1]) throw new Error('could not parse the Command union from src/cli/index.ts');
    return new Set([...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1] as string));
  })();

  it('sanity: parsed a plausible command set', () => {
    expect(commands.size).toBeGreaterThanOrEqual(3);
    expect(commands.has('verify')).toBe(true);
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
