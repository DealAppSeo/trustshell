// A local HTTP server that records every request body and answers /api/v1/classify with not-checked.
// Used to see EXACTLY which bytes a client would send, without sending them anywhere.
import http from 'node:http';
export function startCapture() {
  const log = [];
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      log.push({ method: req.method, url: req.url, body: raw });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ label: 'not-checked', latency_ms: 1, by: 'skipped' }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    port: server.address().port,
    log,
    reset: () => { log.length = 0; },
    lastClassifyText: () => { const c = log.filter((r) => r.url === '/api/v1/classify'); if (!c.length) return null; try { return JSON.parse(c[c.length - 1].body).text ?? null; } catch { return null; } },
    close: () => new Promise((r) => server.close(r)),
  })));
}
