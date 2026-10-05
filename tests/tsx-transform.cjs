/**
 * Jest transform for TSX (app pages and components): JSX on, transpile-only.
 *
 * NOT a second ts-jest entry, because that cannot work. ts-jest keeps a STATIC cache of config
 * sets keyed by the Jest project config, which is the same object for every transform entry, so a
 * second `['ts-jest', { tsconfig: {...} }]` silently reuses the first one's settings — here the
 * SDK tsconfig, which has no JSX. Measured: the TSX entry was called for app/page.tsx and still
 * reported "Cannot use JSX unless the '--jsx' flag is provided".
 *
 * Transpile-only on purpose: type errors in app code are `tsc --noEmit`'s job, and
 * `npm run verify` runs that before jest.
 */
const { createHash } = require('node:crypto');
const ts = require('typescript');

const COMPILER_OPTIONS = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
  esModuleInterop: true,
  inlineSourceMap: true,
  inlineSources: true,
};

module.exports = {
  process(sourceText, sourcePath) {
    const out = ts.transpileModule(sourceText, { fileName: sourcePath, compilerOptions: COMPILER_OPTIONS });
    return { code: out.outputText };
  },
  getCacheKey(sourceText, sourcePath) {
    return createHash('sha256')
      .update('tsx-transform-v1\0')
      .update(ts.version)
      .update('\0')
      .update(sourcePath)
      .update('\0')
      .update(sourceText)
      .digest('hex');
  },
};
