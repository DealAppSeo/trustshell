import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import { applyGame, cepShown, freshCep } from '../lib/chess/glicko';
import { playMatch } from '../lib/chess/match';

describe('CEP, the Chess.com Glicko scale', () => {
  it('starts a new agent at 1200 with deviation 350', () => {
    const cep = freshCep();
    expect(cepShown(cep.rating)).toBe(1200);
    expect(cep.rd).toBe(350);
    expect(cep.games).toBe(0);
  });

  it('moves a new agent more than a settled one in the same game', () => {
    const newbie = freshCep();
    const settled = { rating: 1200, rd: 80, games: 40 };
    const winner = applyGame(newbie, settled, 1);
    const loser = applyGame(settled, newbie, 0);
    expect(cepShown(winner.rating)).toBeGreaterThan(1200);
    expect(cepShown(loser.rating)).toBeLessThan(1200);
    expect(Math.abs(winner.rating - 1200)).toBeGreaterThan(Math.abs(1200 - loser.rating) + 1);
    expect(winner.rd).toBeLessThan(350);
    expect(winner.games).toBe(1);
  });

  it('gains more for beating a higher rating than a lower one', () => {
    const stronger = { rating: 1600, rd: 80, games: 30 };
    const weaker = { rating: 1000, rd: 80, games: 30 };
    const self = { rating: 1400, rd: 80, games: 30 };
    const up = applyGame(self, stronger, 1);
    const down = applyGame(self, weaker, 1);
    expect(up.rating - self.rating).toBeGreaterThan(down.rating - self.rating);
  });

  it('moves less when the opponent deviation is wide', () => {
    const self = { rating: 1500, rd: 80, games: 20 };
    const sure = applyGame(self, { rating: 1500, rd: 50, games: 40 }, 1);
    const vague = applyGame(self, { rating: 1500, rd: 300, games: 1 }, 1);
    expect(sure.rating - self.rating).toBeGreaterThan(vague.rating - self.rating);
  });
});

describe('an agent match', () => {
  it('plays a legal game, updates CEP, and leaves the 0.001 ETH wager unsettled', () => {
    const result = playMatch();
    const replay = new Chess();
    for (const move of result.moves) {
      const played = replay.move(move.san);
      expect(played).not.toBeNull();
      expect(replay.fen()).toBe(move.fen);
    }
    if (result.termination === 'adjudicated') {
      expect(result.winner).toBeNull();
      expect(replay.isGameOver()).toBe(false);
    } else {
      expect(replay.isGameOver()).toBe(true);
    }
    if (result.winner === 'white') expect(result.white.rating).toBeGreaterThan(1200);
    if (result.winner === 'black') expect(result.black.rating).toBeGreaterThan(1200);
    expect(result.white.games).toBe(1);
    expect(result.black.games).toBe(1);
    expect(result.wager).toEqual({
      amountEth: '0.001',
      chain: 'Base Sepolia',
      chainId: 84532,
      status: 'unsettled',
      reason: expect.stringContaining('can_stake is false'),
    });
    expect(JSON.stringify(result)).not.toMatch(/0x[a-fA-F0-9]{40}/);
  }, 20000);
});

describe('the chess page', () => {
  const page = readFileSync(join(__dirname, '..', 'app', 'chess', 'page.tsx'), 'utf8');

  it('shows CEP on the RepID card and does not send the stake', () => {
    expect(page).toContain('NOT_MINTED');
    expect(page).toContain('Unsettled');
    expect(page).toContain('0.001 ETH');
    expect(page).not.toContain('depositStake');
    expect(page).not.toContain('sendTransaction');
    expect(page).not.toContain('privateKey');
  });
});
