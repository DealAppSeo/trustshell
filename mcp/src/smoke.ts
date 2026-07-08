/**
 * Smoke test for @hyperdag/trustshell-mcp.
 *
 * Spawns the built server (dist/index.js) over stdio via the real MCP client,
 * lists its tools, and calls a KEYLESS tool against the LIVE HyperDAG backend.
 * Prints the real result. Exits non-zero on any failure.
 *
 * Run:  npm run build && npm run smoke   (from mcp/)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(__dirname, 'index.js');

function line(s: string) {
  process.stdout.write(s + '\n');
}

async function main() {
  line('=== trustshell-mcp smoke test ===');
  line(`server: ${serverEntry}`);

  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: [serverEntry],
  });
  const client = new Client({ name: 'trustshell-mcp-smoke', version: '1.0.0' });

  await client.connect(transport);
  line('connected to server over stdio ✓');

  // 1) List tools.
  const { tools } = await client.listTools();
  line(`\ntools listed (${tools.length}):`);
  for (const t of tools) line(`  - ${t.name}: ${t.title ?? ''}`);

  const expected = [
    'verify_output',
    'get_repid',
    'present_proof',
    'verify_proof',
    'list_services',
    'buy_service',
  ];
  const names = new Set(tools.map((t) => t.name));
  const missing = expected.filter((n) => !names.has(n));
  if (missing.length) {
    throw new Error(`missing expected tools: ${missing.join(', ')}`);
  }
  line('all 6 expected tools present ✓');

  // 2) Call a KEYLESS tool against the live backend.
  //    get_repid is a cheap, non-rate-limited keyless read — ideal for a deterministic smoke.
  line('\ncalling get_repid("sophia") against the live backend...');
  const repidRes: any = await client.callTool({
    name: 'get_repid',
    arguments: { agent_id: 'sophia' },
  });
  const repidText = repidRes?.content?.[0]?.text ?? '';
  line('get_repid result:');
  line(repidText);
  if (repidRes?.isError) throw new Error('get_repid returned isError');
  const repidObj = JSON.parse(repidText);
  if (typeof repidObj.repid !== 'number' || !repidObj.tier) {
    throw new Error('get_repid did not return a live repid + tier');
  }
  line(`live keyless read OK ✓  (sophia repid=${repidObj.repid}, tier=${repidObj.tier})`);

  // 3) Also exercise verify_output (the flagship HAL tool) against the live backend.
  //    This path is anti-abuse rate-limited per IP; a 429 is a REAL guard, not a failure,
  //    so we treat "rate limited" as a pass (the keyless wiring is proven either way).
  line('\ncalling verify_output("The Eiffel Tower is located in Berlin, Germany.") ...');
  const verRes: any = await client.callTool({
    name: 'verify_output',
    arguments: { text: 'The Eiffel Tower is located in Berlin, Germany.' },
  });
  const verText = verRes?.content?.[0]?.text ?? '';
  line('verify_output result:');
  line(verText);
  if (verRes?.isError && /rate limit/i.test(verText)) {
    line('verify_output hit the keyless daily rate limit — real anti-abuse guard, wiring proven ✓');
  } else if (verRes?.isError) {
    throw new Error(`verify_output errored (non-rate-limit): ${verText}`);
  } else {
    const v = JSON.parse(verText);
    if (!v.verdict) throw new Error('verify_output returned no verdict');
    line(`live HAL verify OK ✓  (verdict=${v.verdict}, trustScore=${v.trustScore})`);
  }

  await client.close();
  line('\n=== SMOKE PASS ===');
}

main().catch((e) => {
  process.stderr.write(`\n=== SMOKE FAIL ===\n${e?.stack ?? e}\n`);
  process.exit(1);
});
