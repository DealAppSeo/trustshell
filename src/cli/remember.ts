/**
 * Write one local note, or one value under a key. No network.
 * New secret shapes are added to SECRET_PREFIXES. Not a new pull request.
 */
import { insertMemory, memoryDbPath, writeKeyed } from '../memory/local-store';

const SECRET_PREFIXES = [
  'sb_secret_',
  'postgresql://',
  'eyJ',
  'Bearer ',
  'xoxb-',
  'xoxp-',
  'xoxa-',
  'xoxe-',
  'xoxc-',
  'xoxr-',
  'xoxs-',
  'ghr_',
  'ghs_',
  'ghu_',
  'gho_',
  'ghp_',
  'github_pat_',
  'glpat-',
  'gloas-',
  'glsoat-',
  'glagent-',
  'glptt-',
  'glrt-',
  'gldt-',
  'npm_',
  'pypi-',
  'sk-',
  'AKIA',
];

/** True when a value carries a secret shape and must not be stored. */
export function refusedValue(value: string): boolean {
  return SECRET_PREFIXES.some((prefix) => value.includes(prefix));
}

export function rememberNote(text: string, env: NodeJS.ProcessEnv = process.env): void {
  insertMemory(memoryDbPath(env), 'note', text);
}

export function rememberKey(key: string, value: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (refusedValue(value)) return false;
  writeKeyed(memoryDbPath(env), key, value);
  return true;
}
