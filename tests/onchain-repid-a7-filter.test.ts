/**
 * S1 / A7 — the landing on-chain reader must not aggregate a stranger.
 *
 * The wrong call is `getSummary(tokenId, [...clients], …)` after `getClients`.
 * That mixes any wallet that posted `tag1=hyperdag_repid` into the number
 * `/api/agent-leaderboard` returns. This suite fails on that call.
 *
 * Synthetic addresses only. No RPC, no prod ids.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  clientsForHyperDagSummary,
  HYPERDAG_REPID_READ_SIGNERS,
} from '../lib/onchain-repid';

const WRITER = '0xb24268884472E7613aA58D38C8813f7Af1667382';
const ATTESTOR = '0xf6eE1768868c3266868edcA78bC41C50309cb22A';
const STRANGER = '0x000000000000000000000000000000000000dEaD';

describe('S1 A7 read-path client filter', () => {
  it('does not call getSummary with the unfiltered getClients list', () => {
    const src = readFileSync(join(__dirname, '../lib/onchain-repid.ts'), 'utf8');
    const wrongCall = src.includes('getSummary(tokenId, [...clients]');
    expect(wrongCall).toBe(false);
  });

  it('scripts/verify-onchain-leaderboard.mjs does not pass unfiltered clients', () => {
    const src = readFileSync(join(__dirname, '../scripts/verify-onchain-leaderboard.mjs'), 'utf8');
    expect(src.includes('getSummary(a.tokenId, [...clients]')).toBe(false);
  });

  it('clientsForHyperDagSummary drops a stranger and keeps writer+attestor', () => {
    expect(HYPERDAG_REPID_READ_SIGNERS.map((a) => a.toLowerCase())).toEqual(
      [WRITER.toLowerCase(), ATTESTOR.toLowerCase()],
    );
    const filtered = clientsForHyperDagSummary([WRITER, STRANGER, ATTESTOR]);
    const lower = filtered.map((a) => a.toLowerCase());
    expect(lower).toContain(WRITER.toLowerCase());
    expect(lower).toContain(ATTESTOR.toLowerCase());
    expect(lower).not.toContain(STRANGER.toLowerCase());
  });

  it('drops a mixed-case stranger and returns empty when only strangers wrote', () => {
    const mixedStranger = '0x000000000000000000000000000000000000DEAD';
    const mixedWriter = WRITER.toUpperCase();
    const kept = clientsForHyperDagSummary([mixedStranger, mixedWriter]);
    expect(kept.map((a) => a.toLowerCase())).toEqual([WRITER.toLowerCase()]);
    expect(clientsForHyperDagSummary([STRANGER])).toEqual([]);
  });
});
