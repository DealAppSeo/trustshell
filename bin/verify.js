#!/usr/bin/env node
'use strict';
/**
 * Packed command bin. npm links this filename, and the CLI command is that name.
 * dist/cli/index.js is the implementation. This file only forwards argv.
 */
const { basename } = require('node:path');

const command = basename(__filename, '.js');
// Deprecated in 1.6.0: the bare global name. `trustshell <command>` is the same command, and a bare
// global name can collide with another package's bin. Removed in 2.0. stderr and a terminal only,
// so a script or CI log that parses output sees nothing new.
if (process.stderr.isTTY) process.stderr.write(`note: \`${command}\` on its own is deprecated and goes away in 2.0. Use \`trustshell ${command}\`.\n`);
let main;
try {
  ({ main } = require('../dist/cli/index.js'));
} catch (e) {
  process.stderr.write('error: dist/ is not built. Run `npm run sdk:build` first.\n');
  process.exit(3);
}

main([command, ...process.argv.slice(2)]).catch((e) => {
  process.stderr.write(String((e && e.stack) || e) + '\n');
  process.exit(3);
});
