// A LOCAL STUB, not HAL. It stands in for the hosted checker so this example sends nothing
// off this machine. It answers every text the same way and judges nothing: a PASS that comes
// from here shows that the wrapper is wired up, never that the text is true.
import { createServer } from 'node:http';

export async function startStubHal() {
  const seen = []; // every text the wrapper sent, so the caller can compare it with the agent's output
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/v1/hal/evaluate') {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen.push(JSON.parse(body).text);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          decision: 'clean',
          hal_score: 0,
          mode: 'local-stub',
          quorum_note: 'STUB verdict from stub-hal.mjs on this machine. Nothing was checked.',
          provider_responses: [{ provider: 'local-stub', verdict: 'TRUE', note: 'stub, not a real check' }],
        }),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => server.close() };
}
