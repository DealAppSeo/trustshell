/**
 * The version this package reports — read from the package it was installed
 * as, never retyped anywhere else.
 *
 * Extracted 2026-08-26 from the CLI's own `resolveVersion()` (the fix for
 * `trustshell --version` staying hardcoded at `'1.0.0'` through the 1.1.0 and
 * 1.2.0 releases). The MCP server had the identical bug one door down —
 * `MCP_VERSION` was a separate hardcoded literal, last updated to `'1.2.0'`
 * and never touched again through the 1.3.0 release — because the CLI's fix
 * was never generalized past the one file it landed in. One shared helper
 * closes both call sites at once and stops a third one from opening.
 *
 * WHY A RUNTIME READ AND NOT `import pkg from '../../package.json'`:
 * tsconfig.sdk.json pins `rootDir: ./src`, so importing package.json is a
 * TS6059 compile error — and relaxing rootDir would move every emitted file
 * from `dist/cli/` and `dist/mcp/` to `dist/src/cli/` and `dist/src/mcp/`,
 * breaking the `bin` paths. So this resolves it at runtime instead. Output is
 * CommonJS, so `__dirname` is real: `dist/<entry>/` -> `../../` -> the
 * package root, which holds package.json in both the repo and the published
 * tarball (npm always ships package.json).
 *
 * Falls back to 'unknown' rather than to a number: a wrong version is worse
 * than an absent one, and a stale literal is exactly the failure this exists
 * to end.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function resolvePackageVersion(fromDir: string): string {
  try {
    const raw = readFileSync(join(fromDir, '..', '..', 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const v =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { version?: unknown }).version
        : undefined;
    return typeof v === 'string' && v.length > 0 ? v : 'unknown';
  } catch {
    return 'unknown';
  }
}
