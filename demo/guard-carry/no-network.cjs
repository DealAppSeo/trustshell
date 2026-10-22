// Preloaded (node --require) into every trustshell process the demo starts. Any TCP connect, UDP send or DNS
// query made through Node's net, dgram or dns modules is refused and logged to GUARD_CARRY_NET_LOG, so "no
// network" is something the demo observed, not something it assumed. Pipes (stdio, a local socket path) still
// connect: those never leave the machine. NOT covered: a native addon, or a process this one starts.
const fs = require('node:fs');
const net = require('node:net');
const dns = require('node:dns');
const dgram = require('node:dgram');

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

for (const m of ['send', 'connect']) dgram.Socket.prototype[m] = () => refuse(`udp ${m}`);

// Every call that asks a resolver: lookup and lookupService (getaddrinfo), resolve* and reverse (c-ares), on the
// module, its promises API and both Resolver classes.
const ASKS = /^(lookup|lookupService|resolve|reverse)/;
for (const o of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const k of Object.getOwnPropertyNames(o)) if (ASKS.test(k) && typeof o[k] === 'function') o[k] = () => refuse(`dns ${k}`);
}
