#!/usr/bin/env node
/**
 * Calls an exported function of an ES module, once per argument list, and prints the results as JSON.
 *
 * Why this exists. The repo's jest is CommonJS and several scripts are ES modules, so a test has to
 * run them in a child `node`. The first version of those tests built JavaScript SOURCE by string
 * interpolation (`node --input-type=module -e "<code with paths pasted in>"`). CodeQL flags that
 * (js/bad-code-sanitization) and it is the wrong shape anyway: this file is fixed code, and the test
 * hands it DATA on stdin. Nothing is evaluated, nothing is spliced into a source string.
 *
 *   stdin:  {"module": "<absolute path>", "fn": "<export name>", "calls": [[arg, ...], ...]}
 *   stdout: [{"value": ...} | {"error": "<message>"}, ...]   one entry per call, in order
 *
 * An export that returns a promise is awaited. A throw is reported as {"error"}, never swallowed.
 */
import { pathToFileURL } from 'node:url';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const { module: file, fn, calls } = JSON.parse(raw);
const mod = await import(pathToFileURL(file).href);
if (typeof mod[fn] !== 'function') {
  console.error(`${fn} is not an exported function of ${file}`);
  process.exit(2);
}
const out = [];
for (const args of calls) {
  try {
    out.push({ value: await mod[fn](...args) });
  } catch (e) {
    out.push({ error: e && e.message ? String(e.message) : String(e) });
  }
}
console.log(JSON.stringify(out));
