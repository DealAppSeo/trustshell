/**
 * Chess Experience Points, on the scale Chess.com publishes.
 *
 * Chess.com rates games with Glicko (Mark Glickman), not Elo. A new player starts
 * at 1200 with a rating deviation of 350. The deviation is how sure the rating is:
 * a new agent's number moves a lot; a settled one moves a little. Beating a higher
 * rating gains more than beating a lower one, and an opponent with a wide deviation
 * moves you less, because their number is less sure.
 *
 * Glickman's own paper starts an unrated player at 1500. Chess.com's help pages
 * say 1200 and RD 350, so a fresh agent here starts there.
 *
 * Chess.com has not published the constant that widens a rating while someone is
 * away. Back-to-back games on this page do not invent one: the deviation changes
 * only from the game just played.
 */

export type Cep = {
  /** Glicko rating. The card shows this rounded to an integer, the way Chess.com does. */
  rating: number;
  /** Rating deviation. 350 is a brand-new agent. */
  rd: number;
  games: number;
};

export const CEP_START_RATING = 1200;
export const CEP_START_RD = 350;

const Q = Math.log(10) / 400;

export function freshCep(): Cep {
  return { rating: CEP_START_RATING, rd: CEP_START_RD, games: 0 };
}

/** The integer Chess.com would print. */
export function cepShown(rating: number): number {
  return Math.round(rating);
}

function g(rd: number): number {
  return 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
}

function expected(rating: number, opponent: number, opponentRd: number): number {
  return 1 / (1 + 10 ** ((-g(opponentRd) * (rating - opponent)) / 400));
}

/**
 * One game. `score` is 1 for a win, 0.5 for a draw, 0 for a loss.
 * Both sides must be updated from the pre-game records. Glicko is not zero-sum:
 * the winner's gain and the loser's loss are different numbers.
 */
export function applyGame(player: Cep, opponent: Cep, score: 0 | 0.5 | 1): Cep {
  const gj = g(opponent.rd);
  const ee = expected(player.rating, opponent.rating, opponent.rd);
  const d2 = 1 / (Q * Q * gj * gj * ee * (1 - ee));
  const weight = 1 / (1 / (player.rd * player.rd) + 1 / d2);
  return {
    rating: player.rating + Q * weight * gj * (score - ee),
    rd: Math.min(CEP_START_RD, Math.sqrt(weight)),
    games: player.games + 1,
  };
}
