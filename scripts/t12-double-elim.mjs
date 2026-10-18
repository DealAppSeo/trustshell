/**
 * Double elimination for the Trinity 12.
 *
 * Each seat in a game thinks with one free open-weight model. The model
 * rotates so white and black never share a mind, and the next game shifts
 * the pair. Stake is recorded from the pre-game win prediction. No ETH moves.
 * CEP is Glicko, then a calibration shift from that prediction.
 *
 * Run from the trustshell worktree. GROQ_API_KEY must already be in the
 * environment. The script never prints it.
 */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Chess } = require('chess.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROGRESS = path.join(ROOT, 'results', 't12-double-elim.progress.json');
const FINAL = path.join(ROOT, 'results', 't12-double-elim.json');
const PASSPORT = 'https://repid-engine-production.up.railway.app/api/v1/passport';
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';

const ROSTER = [
  'trinity-orch',
  'trinity-w3c',
  'trinity-torch',
  'trinity-gcm',
  'trinity-chesed',
  'trinity-mel',
  'trinity-apm',
  'trinity-sophia',
  'trinity-nexus',
  'trinity-hdm',
  'trinity-shofet',
  'trinity-veritas',
];

const MODELS = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];
const MAX_PLIES = 24;
const BASE_STAKE = 0.001;
const PACE_MS = 3200;
const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const lastCall = new Map();

function freshCep() {
  return { rating: 1200, rd: 350, games: 0 };
}

function cepShown(rating) {
  return Math.round(rating);
}

const Q = Math.log(10) / 400;

function gRd(rd) {
  return 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
}

function expected(rating, opponent, opponentRd) {
  return 1 / (1 + 10 ** ((-gRd(opponentRd) * (rating - opponent)) / 400));
}

function applyGame(player, opponent, score) {
  const gj = gRd(opponent.rd);
  const ee = expected(player.rating, opponent.rating, opponent.rd);
  const d2 = 1 / (Q * Q * gj * gj * ee * (1 - ee));
  const weight = 1 / (1 / (player.rd * player.rd) + 1 / d2);
  return {
    rating: player.rating + Q * weight * gj * (score - ee),
    rd: Math.min(350, Math.sqrt(weight)),
    games: player.games + 1,
  };
}

function pairKey(a, b) {
  return [a.id, b.id].sort().join('|');
}

function alive(players) {
  return players.filter((p) => p.losses < 2);
}

function pairPool(pool, played) {
  const remaining = [...pool];
  const games = [];
  while (remaining.length >= 2) {
    const a = remaining.shift();
    let idx = remaining.findIndex((b) => !played.has(pairKey(a, b)));
    if (idx < 0) idx = 0;
    const [b] = remaining.splice(idx, 1);
    games.push([a, b]);
  }
  return { games, bye: remaining[0] ?? null };
}

function material(chess) {
  let white = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = VALUES[piece.type] ?? 0;
      white += piece.color === 'w' ? value : -value;
    }
  }
  return white;
}

function finish(chess, plies) {
  if (chess.isCheckmate()) {
    return { termination: 'checkmate', winner: chess.turn() === 'w' ? 'black' : 'white' };
  }
  if (chess.isGameOver()) return { termination: 'draw', winner: null };
  if (plies >= MAX_PLIES) {
    const score = material(chess);
    if (Math.abs(score) < 100) return { termination: 'adjudicated-draw', winner: null };
    return { termination: 'adjudicated', winner: score > 0 ? 'white' : 'black' };
  }
  return null;
}

async function pace(model) {
  const waited = Date.now() - (lastCall.get(model) ?? 0);
  if (waited < PACE_MS) await new Promise((r) => setTimeout(r, PACE_MS - waited));
  lastCall.set(model, Date.now());
}

async function complete(model, prompt, maxTokens) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');
  let delay = 3000;
  for (let attempt = 0; attempt < 5; attempt++) {
    await pace(model);
    const res = await fetch(GROQ, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const raw = await res.text();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
      continue;
    }
    if (!res.ok) {
      const brief = raw.replace(/gsk_[A-Za-z0-9]+/g, '[key]').slice(0, 240);
      throw new Error(`${model} ${res.status} ${brief}`);
    }
    const body = JSON.parse(raw);
    const message = body.choices?.[0]?.message ?? {};
    const content = String(message.content ?? '').trim();
    const text = content || String(message.reasoning ?? '').trim();
    const usage = body.usage ?? {};
    return {
      text,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
    };
  }
  throw new Error(`${model} kept rate-limiting`);
}

function clampP(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(0.95, Math.max(0.05, n));
}

async function predict(player, opponent, color, model) {
  const prompt = [
    `You are ${player.name}, about to play chess as ${color} against ${opponent.name}.`,
    `Your chess rating is ${cepShown(player.cep.rating)}. Theirs is ${cepShown(opponent.cep.rating)}.`,
    `Your mind this game is ${model}.`,
    'Reply with JSON only, in this shape: {"p_win": <a probability from 0.05 to 0.95>}',
    'Choose it from this matchup. Who is the better side, and by how much?',
  ].join('\n');
  const reply = await complete(model, prompt, 400);
  const match = reply.text.match(/\{[\s\S]*\}/);
  let p = null;
  if (match) {
    try {
      p = clampP(JSON.parse(match[0]).p_win);
    } catch {
      p = null;
    }
  }
  if (p == null) {
    const loose = reply.text.match(/0?\.\d+|1(?:\.0+)?/);
    p = loose ? clampP(loose[0]) : null;
  }
  return { p: p ?? 0.5, parsed: p != null, reply: reply.text.slice(0, 180), tokens: reply };
}

async function chooseMove(player, color, model, chess) {
  const legal = chess.moves();
  const prompt = [
    `You are ${player.name} playing ${color}.`,
    `FEN: ${chess.fen()}`,
    `Legal moves: ${legal.join(', ')}`,
    'Reply with one move from that list and nothing else.',
  ].join('\n');
  const reply = await complete(model, prompt, 400);
  const found = pickLegal(reply.text, legal);
  if (found) return { san: found, fallback: false, reply: reply.text.slice(0, 120), tokens: reply };
  const again = await complete(
    model,
    `${prompt}\nYour last reply was not a legal move. Reply with one move from the list.`,
    400,
  );
  const second = pickLegal(again.text, legal);
  return {
    san: second ?? legal[0],
    fallback: !second,
    reply: again.text.slice(0, 120),
    tokens: again,
  };
}

function pickLegal(text, legal) {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, ' ');
  const ordered = [...legal].sort((a, b) => b.length - a.length);
  const lower = cleaned.toLowerCase();
  for (const san of ordered) {
    if (lower.includes(san.toLowerCase())) return san;
  }
  return null;
}

async function playGame(white, black, models) {
  const whiteCall = await predict(white, black, 'White', models.white);
  const blackCall = await predict(black, white, 'Black', models.black);
  const chess = new Chess();
  const moves = [];
  let tokens = {
    prompt: whiteCall.tokens.promptTokens + blackCall.tokens.promptTokens,
    completion: whiteCall.tokens.completionTokens + blackCall.tokens.completionTokens,
  };
  let fallbacks = 0;
  while (!finish(chess, moves.length)) {
    const side = chess.turn() === 'w' ? white : black;
    const color = chess.turn() === 'w' ? 'White' : 'Black';
    const model = chess.turn() === 'w' ? models.white : models.black;
    const choice = await chooseMove(side, color, model, chess);
    tokens.prompt += choice.tokens.promptTokens;
    tokens.completion += choice.tokens.completionTokens;
    if (choice.fallback) fallbacks += 1;
    const played = chess.move(choice.san);
    if (!played) throw new Error(`refused legal move ${choice.san}`);
    moves.push(played.san);
    if (moves.length % 4 === 0) console.log(`  ply ${moves.length} ${moves.slice(-4).join(' ')}`);
  }
  const ended = finish(chess, moves.length);
  return {
    moves,
    termination: ended.termination,
    winner: ended.winner,
    fen: chess.fen(),
    whitePrediction: whiteCall,
    blackPrediction: blackCall,
    tokens,
    fallbacks,
  };
}

function settle(white, black, game) {
  const score = game.winner === 'white' ? 1 : game.winner === 'black' ? 0 : 0.5;
  const beforeW = white.cep;
  const beforeB = black.cep;
  let nextW = applyGame(beforeW, beforeB, score);
  let nextB = applyGame(beforeB, beforeW, score === 1 ? 0 : score === 0 ? 1 : 0.5);
  const whiteBrier = (game.whitePrediction.p - score) ** 2;
  const blackBrier = (game.blackPrediction.p - (1 - score)) ** 2;
  nextW = { ...nextW, rating: nextW.rating + (0.25 - whiteBrier) * 80 };
  nextB = { ...nextB, rating: nextB.rating + (0.25 - blackBrier) * 80 };
  const whiteStake = BASE_STAKE * game.whitePrediction.p;
  const blackStake = BASE_STAKE * game.blackPrediction.p;
  if (score === 1) {
    white.purse += blackStake;
    black.purse -= blackStake;
  } else if (score === 0) {
    black.purse += whiteStake;
    white.purse -= whiteStake;
  }
  white.cep = nextW;
  black.cep = nextB;
  white.brier += whiteBrier;
  black.brier += blackBrier;
  return { whiteStake, blackStake, whiteBrier, blackBrier, score };
}

function modelFor(gameIndex, side) {
  const shift = side === 'white' ? 0 : 1;
  return MODELS[(gameIndex + shift) % MODELS.length];
}

async function runBracket(players, play) {
  const games = [];
  const playedPairs = new Set();
  while (alive(players).length > 1) {
    const zeros = alive(players).filter((p) => p.losses === 0);
    const ones = alive(players).filter((p) => p.losses === 1);
    const bracket = zeros.length >= 2 ? 'winners' : ones.length >= 2 ? 'losers' : 'final';
    const pool = bracket === 'winners' ? zeros : bracket === 'losers' ? ones : alive(players);
    const { games: pairs, bye } = pairPool(pool, playedPairs);
    if (pairs.length === 0) throw new Error('bracket stalled');
    for (const [white, black] of pairs) {
      playedPairs.add(pairKey(white, black));
      const result = await play(white, black, games.length);
      if (result.winner === 'white') black.losses += 1;
      else if (result.winner === 'black') white.losses += 1;
      else black.losses += 1;
      games.push({
        n: games.length + 1,
        bracket,
        bye: bye?.name ?? null,
        white: white.name,
        black: black.name,
        drawAssigned: result.winner == null,
        ...result,
      });
    }
  }
  return games;
}

function simPlay(white, black) {
  const winner = white.seed < black.seed ? 'white' : 'black';
  return {
    winner,
    termination: 'sim',
    moves: [],
    whitePrediction: { p: 0.5 },
    blackPrediction: { p: 0.5 },
  };
}

function assertBracket() {
  const players = ROSTER.map((name, seed) => ({ id: name, name, seed, losses: 0, cep: freshCep(), purse: 0, brier: 0 }));
  return runBracket(players, async (white, black) => simPlay(white, black)).then((games) => {
    const champ = players.filter((p) => p.losses < 2);
    if (games.length !== 22 || champ.length !== 1 || champ[0].name !== 'trinity-orch') {
      throw new Error(`bracket sim ${games.length} games, champ ${champ.map((p) => p.name).join(',')}`);
    }
  });
}

async function loadRoster() {
  const players = [];
  for (const name of ROSTER) {
    const res = await fetch(`${PASSPORT}/${name}`);
    if (!res.ok) throw new Error(`passport ${name} ${res.status}`);
    const body = await res.json();
    const idn = body.identity_erc8004 ?? {};
    players.push({
      id: body.agent?.agent_id ?? name,
      name,
      seed: players.length,
      losses: 0,
      purse: 0,
      brier: 0,
      cep: freshCep(),
      repid: body.reputation?.repid_score ?? null,
      tier: body.reputation?.tier ?? null,
      mint: idn.registered_onchain ?? 'UNKNOWN',
      tokenId: idn.token_id ?? null,
    });
  }
  return players;
}

function standings(players) {
  return [...players]
    .map((p) => ({
      name: p.name,
      losses: p.losses,
      cep: cepShown(p.cep.rating),
      rd: Math.round(p.cep.rd),
      games: p.cep.games,
      purseEth: Number(p.purse.toFixed(6)),
      meanBrier: p.cep.games ? Number((p.brier / p.cep.games).toFixed(3)) : null,
      repid: p.repid,
      tier: p.tier,
      mint: p.mint,
      tokenId: p.tokenId,
    }))
    .sort((a, b) => a.losses - b.losses || b.cep - a.cep);
}

function modelTable(games) {
  const rows = new Map(MODELS.map((model) => [model, { model, games: 0, score: 0, brier: 0, fallbacks: 0 }]));
  for (const game of games) {
    for (const side of ['white', 'black']) {
      const model = game.models[side];
      const row = rows.get(model);
      const mine = side === 'white' ? game.score : 1 - game.score;
      const brier = side === 'white' ? game.whiteBrier : game.blackBrier;
      row.games += 1;
      row.score += mine;
      row.brier += brier;
    }
    if (game.fallbacks) {
      rows.get(game.models.white).fallbacks += game.fallbacks;
    }
  }
  return [...rows.values()].map((row) => ({
    ...row,
    score: Number(row.score.toFixed(2)),
    meanBrier: row.games ? Number((row.brier / row.games).toFixed(3)) : null,
  }));
}

function publicGame(game, settled) {
  return {
    n: game.n,
    bracket: game.bracket,
    white: game.white,
    black: game.black,
    models: game.models,
    winner: game.winner,
    termination: game.termination,
    drawAssigned: game.drawAssigned,
    plies: game.moves.length,
    moves: game.moves,
    predictions: {
      white: game.whitePrediction.p,
      black: game.blackPrediction.p,
      whiteParsed: game.whitePrediction.parsed,
      blackParsed: game.blackPrediction.parsed,
    },
    stakesEth: { white: settled.whiteStake, black: settled.blackStake },
    score: settled.score,
    whiteBrier: settled.whiteBrier,
    blackBrier: settled.blackBrier,
    fallbacks: game.fallbacks,
    tokens: game.tokens,
  };
}

async function main() {
  await assertBracket();
  if (process.argv.includes('--probe')) {
    for (const model of MODELS) {
      const reply = await complete(model, 'Reply with the one word ok.', 16);
      console.log(`PROBE ${model} ${reply.text.replace(/\s+/g, ' ').slice(0, 80)}`);
    }
    return;
  }
  await mkdir(path.dirname(PROGRESS), { recursive: true });
  let state;
  try {
    state = JSON.parse(await readFile(PROGRESS, 'utf8'));
  } catch {
    state = null;
  }
  const identity = state?.identity ?? (await loadRoster()).map((p) => ({
    id: p.id, name: p.name, seed: p.seed, repid: p.repid, tier: p.tier, mint: p.mint, tokenId: p.tokenId,
  }));
  const players = identity.map((p) => ({ ...p, losses: 0, purse: 0, brier: 0, cep: freshCep() }));
  const done = state?.games ?? [];
  console.log(`BRACKET sim ok. Agents ${players.length}. Games already logged ${done.length}.`);
  const play = async (white, black, index) => {
    const models = { white: modelFor(index, 'white'), black: modelFor(index, 'black') };
    console.log(`GAME ${index + 1} start ${white.name} (${models.white}) vs ${black.name} (${models.black})`);
    const game = await playGame(white, black, models);
    const settled = settle(white, black, game);
    const row = publicGame({ ...game, n: index + 1, bracket: 'pending', models }, settled);
    console.log(
      `GAME ${row.n} ${row.termination} winner ${row.winner ?? 'draw'} plies ${row.plies} cep ${cepShown(white.cep.rating)}/${cepShown(black.cep.rating)}`,
    );
    return { row, models };
  };
  // Resume by replaying only the unplayed tail. The scheduler is deterministic
  // given results, so fold the finished games back in before continuing.
  const playersLive = players;
  const recorded = [];
  const playedPairs = new Set();
  let index = 0;
  while (alive(playersLive).length > 1) {
    const zeros = alive(playersLive).filter((p) => p.losses === 0);
    const ones = alive(playersLive).filter((p) => p.losses === 1);
    const bracket = zeros.length >= 2 ? 'winners' : ones.length >= 2 ? 'losers' : 'final';
    const pool = bracket === 'winners' ? zeros : bracket === 'losers' ? ones : alive(playersLive);
    const { games: pairs } = pairPool(pool, playedPairs);
    if (pairs.length === 0) throw new Error('bracket stalled');
    for (const [white, black] of pairs) {
      playedPairs.add(pairKey(white, black));
      let row;
      if (index < done.length) {
        row = done[index];
        if (row.winner === 'white') black.losses += 1;
        else white.losses += 1;
        white.cep = row.cepAfter.white;
        black.cep = row.cepAfter.black;
        white.purse = row.purseAfter.white;
        black.purse = row.purseAfter.black;
        white.brier = row.brierAfter.white;
        black.brier = row.brierAfter.black;
      } else {
        const played = await play(white, black, index);
        row = { ...played.row, bracket };
        row.cepAfter = {
          white: white.cep,
          black: black.cep,
        };
        row.purseAfter = { white: white.purse, black: black.purse };
        row.brierAfter = { white: white.brier, black: black.brier };
        if (row.winner === 'white') black.losses += 1;
        else white.losses += 1;
      }
      recorded.push(row);
      index += 1;
      const snapshot = {
        identity,
        games: recorded,
        tokens: recorded.reduce(
          (sum, g) => ({
            prompt: sum.prompt + (g.tokens?.prompt ?? 0),
            completion: sum.completion + (g.tokens?.completion ?? 0),
          }),
          { prompt: 0, completion: 0 },
        ),
      };
      await writeFile(PROGRESS, JSON.stringify(snapshot, null, 2));
    }
  }
  const tokens = recorded.reduce(
    (sum, g) => ({
      prompt: sum.prompt + (g.tokens?.prompt ?? 0),
      completion: sum.completion + (g.tokens?.completion ?? 0),
    }),
    { prompt: 0, completion: 0 },
  );
  const table = standings(playersLive);
  const final = {
    event: 't12-double-elim',
    playedAt: new Date().toISOString(),
    chain: 'base-sepolia',
    chainId: 84532,
    models: MODELS,
    maxPlies: MAX_PLIES,
    stake: 'recorded, not transferred. Winner keeps the opponent stake sized by the opponent prediction.',
    games: recorded.map(({ cepAfter, purseAfter, brierAfter, ...rest }) => rest),
    standings: table,
    modelsSummary: modelTable(recorded),
    champion: table[0]?.name ?? null,
    tokens,
    onchain: null,
  };
  await writeFile(FINAL, JSON.stringify(final, null, 2));
  console.log(`DONE games ${recorded.length} champion ${final.champion} tokens ${tokens.prompt + tokens.completion}`);
  console.log(JSON.stringify(table, null, 2));
  console.log(JSON.stringify(final.modelsSummary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'tournament failed');
  process.exit(1);
});
