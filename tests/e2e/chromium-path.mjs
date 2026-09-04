/**
 * Where is Chromium? The answer differs by environment, and getting it wrong is
 * silent until launch.
 *
 * MEASURED 2026-08-25, first real run of .github/workflows/e2e-honesty.yml:
 * both suites failed in ~15s with
 *
 *   browserType.launch: Failed to launch chromium because executable
 *   doesn't exist at /opt/pw-browsers/chromium
 *
 * even though the step above them had just reported
 * `Chrome Headless Shell ... downloaded to
 * /home/runner/.cache/ms-playwright/chromium_headless_shell-1234`. The install
 * worked. The launch looked somewhere else.
 *
 * WHY THE HARDCODED PATH WAS THERE, because it was not a mistake at the time.
 * An agent sandbox pre-installs a browser in a FLAT layout at
 * /opt/pw-browsers/chromium and sets PLAYWRIGHT_BROWSERS_PATH to that
 * directory. Playwright's own resolver expects a VERSIONED subdirectory
 * (chromium-<rev>/) underneath, so it does not find the flat one, and an
 * explicit executablePath is genuinely required there. A CI runner installs the
 * ordinary versioned layout, where Playwright resolves correctly on its own and
 * that flat path does not exist at all.
 *
 * So each environment needs the OPPOSITE of what the other needs, and neither
 * literal is portable. Probing the file is what tells them apart.
 *
 * Returning `undefined` is the "let Playwright decide" case and is passed
 * straight to `chromium.launch({ executablePath })` — an undefined value there
 * is the same as omitting the key.
 *
 * This lives in one file because the two suites had already drifted: one read
 * PLAYWRIGHT_CHROMIUM before falling back, the other hardcoded the path with no
 * escape hatch at all. Two copies of a resolver are two things to keep in step,
 * and these two had already stopped being in step.
 */
import { existsSync } from 'node:fs';

/** The flat, pre-installed layout used by agent sandboxes. Not present in CI. */
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';

/**
 * Resolve the Chromium executable for THIS environment.
 *
 * Order, most explicit first:
 *   1. PLAYWRIGHT_CHROMIUM — an operator said exactly which binary to use.
 *   2. The sandbox's flat path, but only if it actually exists on disk.
 *   3. undefined — let Playwright resolve its own installed browser.
 *
 * @returns {string | undefined}
 */
export function chromiumExecutablePath() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM?.trim();
  if (explicit) return explicit;
  if (existsSync(SANDBOX_CHROMIUM)) return SANDBOX_CHROMIUM;
  return undefined;
}

/**
 * `--no-proxy-server` is required, not hygiene. In a sandboxed environment
 * Chromium honours the ambient HTTPS_PROXY for every host INCLUDING loopback,
 * so a browser-side fetch to 127.0.0.1 dies as "Failed to fetch" while the
 * server-side fetch — Node, which does not use that proxy — succeeds against
 * the same origin. That asymmetry reads as "the feature is broken" when the
 * product is fine. It is a no-op where no proxy is configured, so it is passed
 * unconditionally rather than guessing which environment we are in.
 */
export const LAUNCH_ARGS = ['--no-proxy-server'];

/**
 * WHERE IS PLAYWRIGHT? Same shape as the question above, one level up, and it
 * was costing the whole browser suite.
 *
 * MEASURED 2026-09-04 from an agent sandbox: `playwright@1.56.1` is installed
 * GLOBALLY (`/opt/node22/lib/node_modules`), and `import('playwright')` from
 * this package still throws MODULE_NOT_FOUND — Node does not search the global
 * root. Every suite then printed "this package does not depend on Playwright"
 * and exited 2.
 *
 * THAT IS THE DANGEROUS OUTCOME, not a harmless skip. Exit 2 is NOT_CHECKED,
 * which this project deliberately treats as neither pass nor failure — so four
 * browser suites and 60+ assertions silently did not run, and nothing went red.
 * `AGENTS.md` says these suites DO run here "because it is installed globally",
 * which was half true: installed, yes; resolvable, no. An agent that follows
 * that doc, sees exit 2, and concludes "browser paths are unverifiable in a
 * sandbox" reaches the exact wrong conclusion the doc exists to prevent — and
 * that conclusion has already been published once before.
 *
 * So probe for it the way we probe for the browser, rather than trusting one
 * resolution strategy. A genuinely absent Playwright still exits 2; what no
 * longer happens is reporting NOT_CHECKED while a usable copy sits on disk.
 */
export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    // Not in the package. Try the global npm root, which is where an agent
    // sandbox and many CI images put it.
    try {
      const { execFileSync } = await import('node:child_process');
      const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
      if (root) {
        const { pathToFileURL } = await import('node:url');
        const { join } = await import('node:path');
        const mod = await import(pathToFileURL(join(root, 'playwright', 'index.js')).href);
        // playwright's entry is CommonJS. Imported by URL from ESM, Node does not
        // detect its named exports, so the namespace is `{ default }` alone and
        // `mod.chromium` is undefined. Returning that unnormalised turned a clean
        // NOT_CHECKED into `Cannot read properties of undefined (reading 'launch')`
        // 100 lines later — a worse failure than the one being fixed. Normalise
        // here so every caller sees the same shape as a plain `import('playwright')`.
        return mod?.chromium ? mod : (mod?.default ?? mod);
      }
    } catch {
      /* fall through to the honest NOT_CHECKED below */
    }
    return null;
  }
}

/** Load Playwright or exit 2 = NOT_CHECKED, saying which of the two happened. */
export async function loadPlaywrightOrExit() {
  const pw = await loadPlaywright();
  if (pw) return pw;
  console.error('NOT_CHECKED: this suite needs Playwright, and no copy was found.');
  console.error('  Not in this package (deliberate — declaring it installs a browser driver on every PR)');
  console.error('  and not in the global npm root either.');
  console.error('  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
