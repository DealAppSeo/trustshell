/**
 * The Inspect demo's claims were written by us, for the demo. Several pages said or implied an AI agent
 * wrote them ("An AI agent wrote two sentences", "what the agent said", "Agent claim"). A trust product
 * cannot misattribute its own example. Found by Codex on 2026-11-09; this keeps it fixed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

const SURFACES = [
  'README.md',
  'docs/challenge.md',
  'app/page.tsx',
  'app/inspect/page.tsx',
  'components/build/charts.tsx',
  'components/gateway-install.tsx',
];

const MISATTRIBUTIONS = [/An AI agent wrote/i, /what the agent said/i, /title: 'Agent claim'/, /Catch an AI's false claim/i, /one true and one false claim\b/i];

describe('the demo claims are labelled as ours', () => {
  it.each(SURFACES)('%s does not credit the demo claims to an AI agent', (file) => {
    for (const pattern of MISATTRIBUTIONS) expect(read(file)).not.toMatch(pattern);
  });

  it.each(SURFACES)('%s says we wrote them', (file) => {
    expect(read(file)).toMatch(/example claims? we wrote|we wrote (?:this example claim|two example sentences)|title: 'Example claim'/i);
  });
});
