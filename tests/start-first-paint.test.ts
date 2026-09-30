/**
 * /start first paint is the question, before a chat or terminal pick.
 * It has no "stake now" and no wallet field.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const page = readFileSync(join(ROOT, 'app/start/page.tsx'), 'utf8').replace(/\r/g, '');
const layout = readFileSync(join(ROOT, 'app/start/layout.tsx'), 'utf8').replace(/\r/g, '');

describe('/start first paint', () => {
  it('has no stake now and no wallet field before a pick', () => {
    const start = page.indexOf('return (');
    const end = page.indexOf('{chat ? (');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const idle = page.slice(start, end);
    expect(page).toContain("const QUESTION = 'Where do you already talk to AI?'");
    expect(idle).toContain('{QUESTION}');
    expect(idle).not.toMatch(/stake now/i);
    expect(idle).not.toMatch(/wallet/i);
    expect(idle).not.toMatch(/<input/i);
    expect(idle).not.toMatch(/<textarea/i);
    expect(layout).not.toMatch(/stake now/i);
    expect(layout).not.toMatch(/wallet/i);
    expect(layout).not.toMatch(/<input/i);
  });
});
