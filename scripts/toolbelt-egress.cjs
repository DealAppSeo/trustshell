'use strict';
// Preloaded (node --require) into a belt runtime by scripts/toolbelt-proof.mjs. Every TCP connect made through
// Node's net module is logged to TOOLBELT_NET_LOG with its host and port, and refused unless the host is in
// TOOLBELT_NET_ALLOW (comma-separated: the manifest's `network` list). UDP is refused. Pipes (stdio, a local socket
// path) still connect. Same mechanism as demo/guard-carry/no-network.cjs, with an allowlist instead of nothing.
// It sees Node's net only: not a native addon, not a process that does not load it. An observation, not a sandbox.
const fs = require('node:fs');
const net = require('node:net');
const dgram = require('node:dgram');

const LOG = process.env.TOOLBELT_NET_LOG;
const ALLOW = new Set(String(process.env.TOOLBELT_NET_ALLOW || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const log = (line) => {
  if (LOG) fs.appendFileSync(LOG, `${process.pid} ${line}\n`);
};

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // net.connect() hands connect() its normalized arguments as one array: [options, callback].
  const a = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof a === 'string' || (!!a && typeof a === 'object' && typeof a.path === 'string')) return connect.apply(this, args);
  const host = String((a && typeof a === 'object' ? a.host : args[1]) || 'localhost').toLowerCase();
  const port = a && typeof a === 'object' ? a.port : a;
  const ok = ALLOW.has(host);
  log(`tcp ${host}:${port} ${ok ? 'ALLOWED' : 'REFUSED'}`);
  if (!ok) throw new Error(`toolbelt egress: ${host} is not in the belt's network list`);
  return connect.apply(this, args);
};

for (const m of ['send', 'connect']) {
  dgram.Socket.prototype[m] = function () {
    log(`udp ${m} REFUSED`);
    throw new Error('toolbelt egress: udp refused');
  };
}
