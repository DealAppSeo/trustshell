/**
 * Loop sprint 2 (claims-vs-code, 2026-10-23). The /grants Revoke button posted with no API key. The
 * engine answers a keyless revoke with 401 (repid-engine src/middleware/auth.ts), so the button could
 * only fail. It now sends the grantor agent's own stored key, or, when this browser holds none, says so
 * instead of offering a button that cannot work.
 *
 * The click path itself is proven in a real browser: tests/e2e/grants-fail-closed.mjs (its mock engine
 * answers 401 to a keyless revoke, as production does). This file holds the pieces a jest run can:
 * which key is picked, and that no caller of revokeGrant forgets to pass one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { revokeKeyFor } from '../lib/grant-revoke-key';
import type { Agent } from '../lib/db';

const agent = (id: string, apiKey?: string, name = id): Agent => ({
  id, name, createdAt: 1, totalPrompts: 0, lastUsedAt: 1, ...(apiKey === undefined ? {} : { apiKey }),
});

describe('revokeKeyFor: which key a Revoke click may use', () => {
  it("returns the grantor agent's own key", () => {
    expect(revokeKeyFor([agent('a1', 'key-one'), agent('a2', 'key-two')], 'a2')).toBe('key-two');
  });

  it('returns null when the agent is not in this browser, or holds no key (created before keys were stored)', () => {
    expect(revokeKeyFor([], 'a1')).toBeNull();
    expect(revokeKeyFor([agent('a1')], 'a1')).toBeNull();
    expect(revokeKeyFor([agent('a1', '')], 'a1')).toBeNull();
    expect(revokeKeyFor([agent('a1', '   ')], 'a1')).toBeNull();
  });

  it("never hands back another agent's key, and matches by id, not by name", () => {
    const agents = [agent('a1', 'key-one', 'shared-name'), agent('a2', 'key-two', 'a1')];
    expect(revokeKeyFor(agents, 'a3')).toBeNull();
    // 'a1' is both an id and (for a2) a display name: the id wins, the name is ignored.
    expect(revokeKeyFor(agents, 'a1')).toBe('key-one');
    expect(revokeKeyFor(agents, 'shared-name')).toBeNull();
  });
});

describe('no caller of revokeGrant forgets the key', () => {
  const ROOT = join(__dirname, '..');
  const files = (dir: string): string[] =>
    readdirSync(join(ROOT, dir)).flatMap((n) => {
      const p = join(dir, n);
      if (n === 'node_modules' || n === '.next') return [];
      return statSync(join(ROOT, p)).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
    });

  /** Top-level argument count of each `revokeGrant(...)` call in the source (strings and nested brackets respected). */
  function argCounts(src: string): number[] {
    const out: number[] = [];
    let i = src.indexOf('revokeGrant(');
    while (i >= 0) {
      let depth = 0;
      let args = 1;
      let j = i + 'revokeGrant('.length;
      if (src[j] === ')') args = 0;
      for (; j < src.length; j++) {
        const c = src[j];
        if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) {
          if (depth === 0) break;
          depth--;
        } else if (c === ',' && depth === 0) args++;
      }
      out.push(args);
      i = src.indexOf('revokeGrant(', j);
    }
    return out;
  }

  it('every call in app/ and components/ passes (grantId, requestedBy, apiKey)', () => {
    const calls = [...files('app'), ...files('components')].flatMap((f) =>
      argCounts(readFileSync(join(ROOT, f), 'utf8')).map((n) => ({ f, n })),
    );
    expect(calls.length).toBeGreaterThanOrEqual(2); // GiveRole and RevokeButton: the scan can see calls
    expect(calls.filter((c) => c.n !== 3)).toEqual([]);
  });

  it('control: the scan does count a call that forgets the key', () => {
    expect(argCounts('await revokeGrant(grantId, requestedBy);')).toEqual([2]);
    expect(argCounts('revokeGrant(g.id, from.id, from.apiKey).catch(() => ({ ok: false }))')).toEqual([3]);
  });
});
