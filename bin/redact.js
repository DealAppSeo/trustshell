#!/usr/bin/env node
'use strict';
/**
 * Packed command bin. npm links this filename, and the CLI command is that name.
 * dist/cli/index.js is the implementation. This file only forwards argv.
 */
const { basename } = require('node:path');

const command = basename(__filename, '.js');
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
