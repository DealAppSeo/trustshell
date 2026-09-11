#!/usr/bin/env node
/** MCP present_proof vs production shofet. No npm publish. */
import { createServer } from '../dist/mcp/index.js';
import { TrustShell } from '../dist/lib/index.js';

const { client, health } = await TrustShell.init({ timeout: 60_000 });
if (!health.ok) {
  console.error('backend not ok');
  process.exit(1);
}
const server = createServer(client);
const tool = server._registeredTools?.present_proof;
if (!tool) {
  console.error('missing export: present_proof');
  process.exit(1);
}
const res = await tool.handler({ agentId: 'trinity-shofet', verify: true });
const body = JSON.parse(res.content[0].text);
if (body.verification?.verified !== true) {
  console.error('present_proof not verified', body);
  process.exit(1);
}
console.log('present_proof verified', body.scheme, body.tier);
process.exit(0);
