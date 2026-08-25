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
