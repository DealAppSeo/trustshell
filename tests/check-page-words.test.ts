/**
 * /check speaks the same stranger words as the extension stamp: Checks out, Caught, Not checked.
 * The machine label stays on the page. The privacy sentence is read before the Check button.
 * A not-checked the PAGE decided (timeout, network, non-200, unreadable body) names its cause, so
 * "the network failed" never looks like "not decided". No speed numbers.
 *
 * Source-level, like the other page tests here: jest does not render TSX in this repo. The
 * behaviour is driven in a real browser by tests/e2e/check-walk.mjs (npm run test:check-walk).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const form = readFileSync(join(__dirname, '../app/check/CheckForm.tsx'), 'utf8').replace(/\r/g, '');
const page = readFileSync(join(__dirname, '../app/check/page.tsx'), 'utf8').replace(/\r/g, '');
const PRIVACY = 'What you type is sent to our checkers, Groq and Cerebras. If one cannot answer, a backup checker listed in our privacy policy takes its turn. It is not stored. Do not paste anything private.';

describe('/check words', () => {
  it('titles each label in the stranger words', () => {
    expect(form).toMatch(/pass: \{\s*title: 'Checks out'/);
    expect(form).toMatch(/veto: \{\s*title: 'Caught'/);
    expect(form).toMatch(/'not-checked': \{\s*title: 'Not checked'/);
    expect(page).toContain('Checks out');
    expect(page).toContain('Caught');
    expect(page).toContain('Not checked');
  });

  it('keeps the machine label available: title, data-label and a small label line', () => {
    expect(form).toContain('title={result.label}');
    expect(form).toContain('data-label={result.label}');
    expect(form).toContain('data-testid="check-machine-label"');
  });

  it('shows no speed or latency number', () => {
    expect(form).not.toMatch(/Answered in/);
    expect(form).not.toMatch(/\{result\.ms\}|latency_ms|\bms\./);
    expect(page).not.toMatch(/\bms\b|millisecond|second/i);
  });

  it('puts the privacy sentence, word for word, once, above the Check button', () => {
    expect(form.split(PRIVACY)).toHaveLength(2);
    expect(page).not.toContain(PRIVACY);
    expect(form.indexOf(PRIVACY)).toBeLessThan(form.indexOf('type="submit"'));
    expect(form.indexOf('id="check-privacy"')).toBeLessThan(form.indexOf('type="submit"'));
  });

  it('names a not-checked the page decided itself, one plain line per cause', () => {
    for (const line of [
      'Too many checks from this connection for now. Try again later.',
      'No answer in time.',
      'The network request failed.',
      'The check service answered with an error.',
      'The check service sent an answer we could not read.',
      'No usable answer came back.',
    ]) {
      expect(form).toContain(`'${line}'`);
      expect(line).not.toMatch(/\d/);
    }
    // The cause line replaces the checkers' line; it never sits under a pass or a veto.
    expect(form).toMatch(/result\.label === 'not-checked' && result\.reason/);
    // A 429 (the per-minute limit, or the free checks for today) is its own cause, matched first,
    // so a visitor who is over the limit is not told the service is broken.
    expect(form.indexOf("return 'limit'")).toBeGreaterThan(-1);
    expect(form.indexOf("return 'limit'")).toBeLessThan(form.indexOf("return 'http'"));
  });

  it('keeps the request shape: the shared classifyClaim, nothing hand-rolled', () => {
    expect(form).toContain("classifyClaim(text, { apiUrl: ENGINE, env: {} })");
    expect(form).not.toMatch(/fetch\(/);
  });

  it('carries no internal name and no web-search wording', () => {
    for (const src of [form, page]) {
      expect(src).not.toMatch(/laya|jev|convai/i);
      expect(src).not.toMatch(/search(es|ing)? the web|web search/i);
    }
  });
});
