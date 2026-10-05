/**
 * README truth pass (R2 items c–i).
 * Items a and b landed in #459, which is on main. This file checks the merged README.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const README = readFileSync(join(__dirname, '..', 'README.md'), 'utf8').replace(/\r\n/g, '\n');

function section(heading: string): string {
  const start = README.indexOf(heading);
  if (start < 0) return '';
  const rest = README.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('README truth pass', () => {
  it('does not date reputation writes to 2026-06-22 or a lifetime of 46', () => {
    expect(README).not.toMatch(/2026-06-22/);
    expect(README).not.toMatch(/46 lifetime/);
    expect(README).not.toMatch(/writes are not landing now/);
    expect(README).not.toMatch(/on-chain writes are (live|landing|active)/i);
    expect(README).toMatch(/recorded, each with a transaction hash/i);
    const table = section('### Live vs paused');
    expect(table.toLowerCase()).toMatch(/paused\/blocked/);
    const writes = table.split('\n').find((line) => /On-chain reputation writes/.test(line)) ?? '';
    expect(writes).not.toMatch(/paused\/blocked/);
    expect(writes).toMatch(/recorded, each with a transaction hash/i);
  });

  it('keeps 12 of 12 IdentityRegistry tokens with an ownerOf date', () => {
    expect(README).toMatch(/12 of 12 core agents hold an IdentityRegistry token/);
    expect(README).toMatch(/ownerOf/);
    expect(README).toMatch(/2026-10-05/);
    expect(README).not.toMatch(/12 agents minted/);
    expect(README).not.toMatch(/the agent owns its identity/i);
  });

  it('guards an empty marketplace list in the README sample', () => {
    const sample = section('## Discover → buy → receipt');
    expect(sample).toMatch(/no verification service is listed right now/);
    expect(sample).toMatch(/if \(!svc\)/);
  });

  it('does not show the old gemini mistral openrouter sample', () => {
    expect(README).not.toMatch(/gemini:TRUE/);
    expect(README).not.toMatch(/mistral:TRUE/);
    expect(README).not.toMatch(/openrouter:TRUE/);
    expect(README).not.toMatch(/gemini:FALSE/);
    expect(README).toContain('cerebras:TRUE (Paris is the capital of France.)');
    expect(README).toContain('groq:TRUE (Paris is the capital of France.)');
    expect(README).toContain('zai:UNCERTAIN (NOT_CHECKED: late after 2-family agreement)');
    expect(README).toContain('cerebras:FALSE (It is in Paris, France.)');
    expect(README).toContain('groq:FALSE (Eiffel Tower is in Paris, France.)');
  });

  it('shows the badge subcommand', () => {
    expect(README).toMatch(/trustshell badge trinity-shofet\n/);
    expect(README).toMatch(/trustshell badge trinity-shofet --markdown/);
  });

  it('does not claim a 7 second first call', () => {
    expect(README).not.toMatch(/~7 seconds/);
    expect(README).not.toMatch(/6\.7s/);
    expect(README).not.toMatch(/Time-to-first-real-call/);
  });

  // #460 rebuilt the committed dist, so it no longer differs from the source or from npm 1.6.0
  // (measured: bin/verify.js against an all-abstain stub prints NOT_CHECKED, exit 2). A README
  // caveat saying otherwise is now the false statement, so it must stay out.
  it('says never-a-pass and exit 2, without the stale committed-dist caveat', () => {
    expect(README).toMatch(/An unavailable check is never a pass\./);
    expect(README).toMatch(/2 when HAL did not decide \(NOT_CHECKED, never a pass\)/);
    expect(README).not.toMatch(/committed dist in this repo (still|can still)/);
    expect(README).not.toMatch(/never a pass in the source/);
    expect(README).not.toMatch(/1\.6\.0 is published/);
    expect(README).not.toMatch(/npm latest is 1\.6\.0/i);
  });

  // A top-level `return` is a SyntaxError in an ES module, and this sample uses top-level await.
  it('the marketplace sample stops without a top-level return', () => {
    const sample = section('## Discover → buy → receipt');
    const code = sample.slice(sample.indexOf('```ts'), sample.indexOf('```', sample.indexOf('```ts') + 5));
    expect(code).toMatch(/await /);
    expect(code).not.toMatch(/^\s*return\b/m);
  });
});
