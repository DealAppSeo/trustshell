/**
 * Load a TypeScript FIXTURE (tests/fixtures/*.ts) from a plain .mjs browser suite.
 *
 * The browser suites are .mjs and run under plain node, but the shared fixtures (the scrub corpus)
 * are TypeScript so jest can import them. Rather than keep two copies of the same secret-shaped
 * values, this transpiles the .ts with the repo's own TypeScript and evaluates it, resolving the
 * fixtures' relative imports the same way. It is for fixtures only: pure data, no side effects.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

export function loadTsFixture(file) {
  const cache = new Map();
  const load = (path) => {
    const full = path.endsWith('.ts') ? path : `${path}.ts`;
    if (cache.has(full)) return cache.get(full).exports;
    const out = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const module = { exports: {} };
    cache.set(full, module);
    const localRequire = (spec) => (spec.startsWith('.') ? load(resolve(dirname(full), spec)) : require(spec));
    vm.runInNewContext(`(function (exports, require, module) {${out}\n})`, {})(module.exports, localRequire, module);
    return module.exports;
  };
  return load(resolve(file));
}
