import { Chess, type Move } from 'chess.js';
import { applyGame, freshCep, type Cep } from './glicko';

/**
 * A local agent-versus-agent game. White looks one move further than black, so
 * the match has a favorite. Leaves are material and center control; mate is
 * recognized when a side has no move. Every move is a chess.js move. Nothing
 * here talks to a wallet or to the stake route.
 */

export const WAGER = {
  amountEth: '0.001',
  chain: 'Base Sepolia',
  chainId: 84532,
  status: 'unsettled',
  reason:
    'can_stake is false. The match records the 0.001 ETH wager and does not send it. The winner takes it when staking is live.',
} as const;

const VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export type Side = 'white' | 'black';

export type PlayedMove = {
  san: string;
  from: string;
  to: string;
  fen: string;
};

export type MatchResult = {
  moves: PlayedMove[];
  termination: 'checkmate' | 'draw' | 'adjudicated';
  winner: Side | null;
  white: Cep;
  black: Cep;
  wager: typeof WAGER;
};

function edge(rank: number, file: number): number {
  return Math.min(rank, 7 - rank) + Math.min(file, 7 - file);
}

function evaluate(chess: Chess): number {
  let white = 0;
  let whiteKing: { rank: number; file: number } | null = null;
  let blackKing: { rank: number; file: number } | null = null;
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]![file];
      if (!piece) continue;
      if (piece.type === 'k' && piece.color === 'w') whiteKing = { rank, file };
      if (piece.type === 'k' && piece.color === 'b') blackKing = { rank, file };
      const center = 6 - Math.abs(file - 3.5) - Math.abs(rank - 3.5);
      const value = (VALUES[piece.type] ?? 0) + center;
      white += piece.color === 'w' ? value : -value;
    }
  }
  // A king on the rim (low edge score) is easier to mate. This is what makes a
  // won position progress instead of shuffling two equal-looking king moves.
  if (whiteKing && blackKing) {
    white += (edge(whiteKing.rank, whiteKing.file) - edge(blackKing.rank, blackKing.file)) * 8;
  }
  return chess.turn() === 'w' ? white : -white;
}

function ordered(chess: Chess): Move[] {
  return chess.moves({ verbose: true }).sort((a, b) => {
    const av = a.captured ? (VALUES[a.captured] ?? 0) + 10 : 0;
    const bv = b.captured ? (VALUES[b.captured] ?? 0) + 10 : 0;
    return bv - av || a.san.localeCompare(b.san);
  });
}

function negamax(chess: Chess, depth: number, alpha: number, beta: number): number {
  if (depth === 0) {
    if (chess.inCheck() && chess.moves().length === 0) return -100_000;
    return evaluate(chess);
  }
  const moves = ordered(chess);
  if (moves.length === 0) return chess.inCheck() ? -100_000 : 0;
  let best = -Infinity;
  const considered = moves.slice(0, 10);
  for (const move of considered) {
    chess.move(move);
    const score = -negamax(chess, depth - 1, -beta, -alpha);
    chess.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function choose(chess: Chess, depth: number, seen: Set<string>): Move {
  const moves = ordered(chess);
  let best = moves[0]!;
  let bestScore = -Infinity;
  let fallback = moves[0]!;
  let fallbackScore = -Infinity;
  for (const move of moves) {
    chess.move(move);
    const score = -negamax(chess, depth - 1, -Infinity, Infinity);
    const repeated = seen.has(chess.fen().split(' ')[0]!);
    chess.undo();
    if (score > fallbackScore) {
      fallbackScore = score;
      fallback = move;
    }
    if (repeated) continue;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return bestScore === -Infinity ? fallback : best;
}

export function playMatch(options?: {
  white?: Cep;
  black?: Cep;
  whiteDepth?: number;
  blackDepth?: number;
  maxPlies?: number;
}): MatchResult {
  const beforeWhite = options?.white ?? freshCep();
  const beforeBlack = options?.black ?? freshCep();
  const whiteDepth = options?.whiteDepth ?? 2;
  const blackDepth = options?.blackDepth ?? 1;
  const maxPlies = options?.maxPlies ?? 60;
  const chess = new Chess();
  const moves: PlayedMove[] = [];
  const seen = new Set<string>();

  while (!chess.isGameOver() && moves.length < maxPlies) {
    const depth = chess.turn() === 'w' ? whiteDepth : blackDepth;
    const move = choose(chess, depth, seen);
    chess.move(move);
    seen.add(chess.fen().split(' ')[0]!);
    moves.push({ san: move.san, from: move.from, to: move.to, fen: chess.fen() });
  }

  let termination: MatchResult['termination'];
  let winner: Side | null;
  if (chess.isCheckmate()) {
    termination = 'checkmate';
    winner = chess.turn() === 'w' ? 'black' : 'white';
  } else if (moves.length >= maxPlies && !chess.isGameOver()) {
    termination = 'adjudicated';
    winner = null;
  } else {
    termination = 'draw';
    winner = null;
  }

  const whiteScore: 0 | 0.5 | 1 = winner === 'white' ? 1 : winner === 'black' ? 0 : 0.5;
  const blackScore: 0 | 0.5 | 1 = whiteScore === 1 ? 0 : whiteScore === 0 ? 1 : 0.5;

  return {
    moves,
    termination,
    winner,
    white: applyGame(beforeWhite, beforeBlack, whiteScore),
    black: applyGame(beforeBlack, beforeWhite, blackScore),
    wager: WAGER,
  };
}
