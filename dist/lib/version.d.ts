export declare function resolvePackageVersion(fromDir: string): string;
/**
 * The command to print in a "run this next" hint. A first user who ran us through npx has no
 * `trustshell` on PATH, so a bare `trustshell …` hint failed with "not recognized"
 * (FIRST_USER_VERIFICATION #2). npm sets npm_command=exec for `npx` and `npm exec`; then the hint
 * names the package at the version that is running. On Windows it says `npx.cmd`, which works in
 * every shell there, while `npx` is blocked under PowerShell's default execution policy.
 */
export declare function selfCommand(version: string, env?: Record<string, string | undefined>, platform?: string): string;
