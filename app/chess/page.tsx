'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { ChessPiece } from '@/components/chess-pieces';
import { cepShown, freshCep, type Cep } from '@/lib/chess/glicko';
import { playMatch, type MatchResult } from '@/lib/chess/match';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const STORE = 'trustshell-chess-cep';
const CLOCK = 10 * 60;

type Saved = Record<string, Cep>;

type Played = {
  result: MatchResult;
  whiteBefore: Cep;
  blackBefore: Cep;
  whiteName: string;
  blackName: string;
};

function loadSaved(): Saved {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Saved;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function squareName(file: number, rank: number): string {
  return `${'abcdefgh'[file]}${8 - rank}`;
}

export default function ChessPage() {
  const [saved, setSaved] = useState<Saved>({});
  const [whiteName, setWhiteName] = useState('rook');
  const [blackName, setBlackName] = useState('knight');
  const [played, setPlayed] = useState<Played | null>(null);
  const [ply, setPly] = useState(-1);
  const [auto, setAuto] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSaved(loadSaved());
  }, []);

  useEffect(() => {
    if (!auto || !played) return;
    if (ply >= played.result.moves.length - 1) {
      setAuto(false);
      return;
    }
    const timer = setTimeout(() => setPly((n) => n + 1), 260);
    return () => clearTimeout(timer);
  }, [auto, ply, played]);

  const whiteCep = saved[whiteName.trim()] ?? freshCep();
  const blackCep = saved[blackName.trim()] ?? freshCep();
  const fen = played && ply >= 0 ? played.result.moves[ply]!.fen : START_FEN;
  const position = useMemo(() => new Chess(fen), [fen]);
  const board = position.board();
  const last = played && ply >= 0 ? played.result.moves[ply] : null;
  const turn = position.turn();
  const finished = played !== null && !auto && ply >= played.result.moves.length - 1;

  function pit() {
    const white = whiteName.trim();
    const black = blackName.trim();
    if (!white || !black) {
      setError('Name both agents.');
      return;
    }
    if (white === black) {
      setError('The two agents need different names, so each CEP stays its own.');
      return;
    }
    setError('');
    setThinking(true);
    const whiteBefore = saved[white] ?? freshCep();
    const blackBefore = saved[black] ?? freshCep();
    window.setTimeout(() => {
      const result = playMatch({ white: whiteBefore, black: blackBefore });
      const next = { ...saved, [white]: result.white, [black]: result.black };
      setSaved(next);
      sessionStorage.setItem(STORE, JSON.stringify(next));
      setPlayed({ result, whiteBefore, blackBefore, whiteName: white, blackName: black });
      setPly(-1);
      setThinking(false);
      setAuto(true);
    }, 40);
  }

  const liveWhite = finished && played ? played.result.white : played ? played.whiteBefore : whiteCep;
  const liveBlack = finished && played ? played.result.black : played ? played.blackBefore : blackCep;
  const shownWhite = played ? played.whiteName : whiteName.trim() || 'white';
  const shownBlack = played ? played.blackName : blackName.trim() || 'black';

  return (
    <main className="chess-surface min-h-screen bg-[#312e2b] text-white selection:bg-[#81b64c] selection:text-[#1b1b1b]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-3 py-5 lg:flex-row lg:items-start lg:px-6">
        <section className="mx-auto w-full max-w-[560px] shrink-0" aria-label="Board">
          <PlayerBar
            name={shownBlack}
            cep={liveBlack}
            before={played?.blackBefore}
            active={auto && turn === 'b'}
            seconds={CLOCK - (ply < 0 ? 0 : Math.floor((ply + 1) / 2))}
            side="b"
          />
          <div
            className="grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,0.35)]"
            role="img"
            aria-label={`Chessboard. ${turn === 'w' ? 'White' : 'Black'} to move.`}
          >
            {board.map((row, rank) =>
              row.map((piece, file) => {
                const name = squareName(file, rank);
                const dark = (file + rank) % 2 === 0;
                const marked = last !== null && (last.from === name || last.to === name);
                const kingInCheck = position.inCheck() && piece?.type === 'k' && piece.color === turn;
                const coord = dark ? '#ebecd0' : '#769656';
                return (
                  <div
                    key={name}
                    className="relative flex items-center justify-center"
                    style={{ background: kingInCheck ? '#e35b4d' : dark ? '#769656' : '#ebecd0' }}
                  >
                    {marked && !kingInCheck && (
                      <span className="absolute inset-0 bg-[#f6f669]/55" />
                    )}
                    {file === 0 && (
                      <span className="absolute left-0.5 top-0.5 text-[11px] font-semibold leading-none" style={{ color: coord }}>
                        {8 - rank}
                      </span>
                    )}
                    {rank === 7 && (
                      <span className="absolute bottom-0 right-1 text-[11px] font-semibold leading-none" style={{ color: coord }}>
                        {'abcdefgh'[file]}
                      </span>
                    )}
                    {piece && <ChessPiece type={piece.type} color={piece.color} />}
                  </div>
                );
              }),
            )}
          </div>
          <PlayerBar
            name={shownWhite}
            cep={liveWhite}
            before={played?.whiteBefore}
            active={auto && turn === 'w'}
            seconds={CLOCK - (ply < 0 ? 0 : Math.ceil((ply + 1) / 2))}
            side="w"
          />
          <p className="mt-3 text-sm text-[#c3c0bb]">
            The clock is the Chess.com rapid frame. It does not decide the match. The agents play until the game ends.
          </p>
        </section>

        <aside className="flex w-full flex-col gap-4 lg:w-[360px]">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agent chess</h1>
            <p className="mt-2 text-sm leading-relaxed text-[#c3c0bb]">
              A built-in chess engine plays both sides on this page (white looks 2 plies ahead, black 1).
              The names are labels; none of your agents plays. CEP is a Glicko-1 rating on Chess.com&apos;s
              scale, starting at 1200, kept for this browser session. A 0.001 ETH wager is shown; it is
              not recorded and not sent.
            </p>
          </div>

          <label className="block text-sm text-[#c3c0bb]">
            White
            <input
              value={whiteName}
              onChange={(event) => setWhiteName(event.target.value)}
              disabled={auto || thinking}
              className="mt-1 w-full rounded bg-[#262421] px-3 py-2 text-white caret-[#81b64c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#81b64c]"
            />
          </label>
          <label className="block text-sm text-[#c3c0bb]">
            Black
            <input
              value={blackName}
              onChange={(event) => setBlackName(event.target.value)}
              disabled={auto || thinking}
              className="mt-1 w-full rounded bg-[#262421] px-3 py-2 text-white caret-[#81b64c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#81b64c]"
            />
          </label>
          {error && <p className="text-sm text-[#f08a80]">{error}</p>}
          <button
            type="button"
            onClick={pit}
            disabled={auto || thinking}
            className="rounded bg-[#81b64c] px-4 py-3 text-base font-semibold text-[#1b1b1b] hover:bg-[#96c366] disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {thinking || auto ? 'The agents are playing' : played ? 'Pit them again' : 'Pit agents'}
          </button>

          <ResultLine played={played} finished={finished} />

          <MoveList played={played} ply={ply} onPick={(index) => { setAuto(false); setPly(index); }} />

          <Stake />

          <RepIdCard
            name={shownWhite}
            cep={finished && played ? played.result.white : liveWhite}
            before={played?.whiteBefore}
          />
          <RepIdCard
            name={shownBlack}
            cep={finished && played ? played.result.black : liveBlack}
            before={played?.blackBefore}
          />

          <p className="text-sm leading-relaxed text-[#c3c0bb]">
            A minted agent&apos;s passport is the{' '}
            <Link href="/passport" className="text-[#f3e6b5] underline underline-offset-4">
              ERC-8004 RepID card
            </Link>
            . This match does not write that passport. CEP is the extra field a developer adds beside it.
          </p>
        </aside>
      </div>
    </main>
  );
}

function PlayerBar({
  name,
  cep,
  before,
  active,
  seconds,
  side,
}: {
  name: string;
  cep: Cep;
  before?: Cep;
  active: boolean;
  seconds: number;
  side: 'w' | 'b';
}) {
  const shown = cepShown(cep.rating);
  const delta = before ? shown - cepShown(before.rating) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className="grid h-10 w-10 place-items-center rounded-sm text-sm font-semibold"
        style={{ background: side === 'w' ? '#f8f8f8' : '#1c1c1c', color: side === 'w' ? '#1c1c1c' : '#f8f8f8' }}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">
          {name} <span className="font-normal text-[#b8b5b0]">({shown})</span>
          {delta !== 0 && (
            <span className={delta > 0 ? 'text-[#96c366]' : 'text-[#f08a80]'}>
              {' '}{delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </div>
        <div className="text-xs text-[#b8b5b0]">CEP · RD {Math.round(cep.rd)}</div>
      </div>
      <div
        className="ml-auto rounded px-3 py-1 font-mono text-xl tabular-nums"
        style={{ background: active ? '#5d9948' : '#262421' }}
      >
        {clock(seconds)}
      </div>
    </div>
  );
}

function ResultLine({ played, finished }: { played: Played | null; finished: boolean }) {
  if (!played || !finished) return null;
  const { result } = played;
  const text =
    result.winner === 'white'
      ? `${played.whiteName} won`
      : result.winner === 'black'
        ? `${played.blackName} won`
        : result.termination === 'adjudicated'
          ? 'Draw, adjudicated at 60 moves'
          : 'Draw';
  return <p className="text-lg font-semibold text-[#f3e6b5]">{text}</p>;
}

function MoveList({
  played,
  ply,
  onPick,
}: {
  played: Played | null;
  ply: number;
  onPick: (index: number) => void;
}) {
  const moves = played?.result.moves ?? [];
  const rows: { n: number; white?: { san: string; index: number }; black?: { san: string; index: number } }[] = [];
  moves.forEach((move, index) => {
    const n = Math.floor(index / 2);
    const row = rows[n] ?? { n: n + 1 };
    if (index % 2 === 0) row.white = { san: move.san, index };
    else row.black = { san: move.san, index };
    rows[n] = row;
  });
  return (
    <div className="max-h-64 overflow-auto rounded bg-[#262421] [scrollbar-color:#5a574f_#262421]">
      {rows.length === 0 && <p className="px-3 py-4 text-sm text-[#b8b5b0]">The move list fills in as they play.</p>}
      <ol>
        {rows.map((row) => (
          <li key={row.n} className="grid grid-cols-[2.5rem_1fr_1fr] text-sm">
            <span className="px-2 py-1 text-[#8d8a84] tabular-nums">{row.n}.</span>
            <MoveCell move={row.white} current={ply} onPick={onPick} />
            <MoveCell move={row.black} current={ply} onPick={onPick} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function MoveCell({
  move,
  current,
  onPick,
}: {
  move?: { san: string; index: number };
  current: number;
  onPick: (index: number) => void;
}) {
  if (!move) return <span />;
  const on = move.index === current;
  return (
    <button
      type="button"
      onClick={() => onPick(move.index)}
      className="px-2 py-1 text-left tabular-nums hover:bg-[#3c3a37] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#81b64c]"
      style={{ background: on ? '#4a4844' : undefined }}
    >
      {move.san}
    </button>
  );
}

function Stake() {
  return (
    <div className="rounded bg-[#262421] px-3 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-lg tabular-nums">0.001 ETH</span>
        <span className="text-sm font-semibold text-[#f3e6b5]">Unsettled</span>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-[#c3c0bb]">
        Base Sepolia. The winner would take the stake. Staking is off, so this match does not send it.
      </p>
    </div>
  );
}

function RepIdCard({ name, cep, before }: { name: string; cep: Cep; before?: Cep }) {
  const shown = cepShown(cep.rating);
  const delta = before ? shown - cepShown(before.rating) : 0;
  const extension = {
    extensions: {
      cep: {
        system: 'glicko-1',
        scale: 'chess.com',
        rating: shown,
        rd: Math.round(cep.rd),
        games: cep.games,
      },
    },
  };
  return (
    <article className="rounded bg-[#262421] px-3 py-3" data-testid={`repid-card-${name}`}>
      <h2 className="text-base font-semibold">ERC-8004 RepID · {name}</h2>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-[#b8b5b0]">Identity</dt>
          <dd>NOT_MINTED</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[#b8b5b0]">RepID</dt>
          <dd>not written by this match</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[#b8b5b0]">CEP</dt>
          <dd className="tabular-nums">
            {shown}
            {delta !== 0 && (
              <span className={delta > 0 ? 'text-[#96c366]' : 'text-[#f08a80]'}>
                {' '}{delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </dd>
        </div>
      </dl>
      <pre className="mt-3 overflow-auto text-xs leading-relaxed text-[#d7d3cc]">{JSON.stringify(extension, null, 2)}</pre>
    </article>
  );
}
