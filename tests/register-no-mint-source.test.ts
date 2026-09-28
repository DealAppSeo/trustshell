/**
 * register() posts to /api/v1/agents/register and does not mint ERC-8004.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../src/lib/trustshell.ts'), 'utf8');

describe('register() source', () => {
  it('does not mint ERC-8004', () => {
    const start = src.indexOf('async register(');
    const end = src.indexOf('async registerHuman(');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).toContain('/api/v1/agents/register');
    expect(body).toContain('erc8004_token_id');
    expect(body).not.toMatch(/\/mint/);
    expect(body).not.toMatch(/erc-8004\/mint|mintErc8004|mint_erc8004/i);
  });
});
