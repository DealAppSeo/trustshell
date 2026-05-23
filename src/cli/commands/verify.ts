import { Command } from 'commander';
import { loadConfig } from '../config';

export function registerVerify(program: Command) {
  program
    .command('verify <text>')
    .description('Run HAL fact-check on text')
    .option('--strictness <n>', 'HAL strictness level (1 or 2)', '2')
    .option('--endpoint <url>', 'TrustShell API endpoint')
    .option('--api-key <key>', 'API key (or set REPID_API_KEY env var)')
    .action(async (text, opts) => {
      const cliConfig = loadConfig();
      const endpoint = opts.endpoint || cliConfig.api?.endpoint || 'https://repid-engine-production.up.railway.app';
      const apiKey = opts.apiKey || process.env.REPID_API_KEY || cliConfig.api?.apiKey;

      if (!apiKey) {
        console.error('Error: API key required. Set REPID_API_KEY or pass --api-key.');
        process.exit(1);
      }

      console.log(`🔍 HAL Evaluation`);
      console.log(`  Evaluating: "${text}"`);
      console.log(`  Strictness: ${opts.strictness}`);
      console.log();

      try {
        const start = Date.now();
        const response = await fetch(`${endpoint}/api/v1/hal/evaluate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ text, strictness: parseInt(opts.strictness, 10) }),
        });

        const elapsed = Date.now() - start;

        if (response.status === 404) {
          console.error(`Error: HAL endpoint not available. Contact admin or use --endpoint to override.`);
          process.exit(1);
        }

        if (response.status === 401 || response.status === 403) {
          console.error(`Error: Unauthorized: Invalid API key.`);
          process.exit(1);
        }

        if (!response.ok) {
          const bodyText = await response.text();
          console.error(`Error: HTTP ${response.status} - ${bodyText}`);
          process.exit(1);
        }

        const data = await response.json() as any;
        const decisionIcon = data.decision === 'clean' ? '✓' : '✗';
        console.log(`  Decision: ${data.decision} ${decisionIcon}`);
        console.log(`  Score: ${typeof data.hal_score === 'number' ? data.hal_score.toFixed(2) : 'N/A'}`);
        console.log(`  Providers: ${data.providers_used ?? 'N/A'}/${data.providers_attempted ?? 'N/A'}`);
        if (data.degraded) {
          console.log(`  ⚠️ Quorum: ${data.quorum_status ?? 'partial'}`);
        }
        console.log(`  Latency: ${elapsed}ms`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
