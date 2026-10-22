// Preloaded (node --require) into every trustshell process the demo starts. Any TCP connect or host lookup is
// refused and logged to GUARD_CARRY_NET_LOG, so "no network" is something the demo observed, not something it
// assumed. Pipes (stdio, a local socket path) still connect: those never leave the machine.
const fs = require('node:fs');
const net = require('node:net');
const dns = require('node:dns');

function refuse(what) {
  fs.appendFileSync(process.env.GUARD_CARRY_NET_LOG, `${process.pid} ${what}\n`);
  throw new Error(`guard-carry demo: network refused (${what})`);
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // net.connect() hands connect() its normalized arguments as one array: [options, callback].
  const a = Array.isArray(args[0]) ? args[0][0] : args[0];
  const pipe = typeof a === 'string' || (!!a && typeof a === 'object' && typeof a.path === 'string');
  return pipe ? connect.apply(this, args) : refuse('tcp connect');
};
dns.lookup = () => refuse('dns lookup');
dns.promises.lookup = () => refuse('dns lookup');
