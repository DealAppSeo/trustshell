#!/usr/bin/env node
/**
 * drawdown-backtest.mjs: a re-runnable test of the claim "0% drawdown with the veto vs 49.63% without".
 *
 * WHY THIS EXISTS. That figure was on TrustTrader, TrustRails and repid-engine surfaces with no source:
 * `backtest_variance` has 0 rows, there is no price-series code in those repos, and trinity-ecosystem's
 * trinity-science/backtest.py cannot produce it (its veto engine's `execute` needs unity > 0.95, which
 * is unreachable for ANY input: see `unityMax` below). The copy has been removed
 * (trustrails-dev#7, trusttrader#30, repid-engine#1464). This is the measurement that was missing. It
 * reports what it measures, good or bad. NOTHING here is posted, and nothing here is a claim.
 *
 * THE RULER (CLAUDE_RULES r24). Every number carries: the pinned price file and its sha256, the veto
 * engine configuration, the event windows, and what is NOT modelled. Numbers from a different
 * configuration are not comparable and are never merged.
 *
 *   node scripts/drawdown-backtest.mjs fetch   # ONE network step: writes the pinned data + MANIFEST.json
 *   node scripts/drawdown-backtest.mjs run     # offline: verifies sha256, writes results.json, prints REPORT
 *   node scripts/drawdown-backtest.mjs run --check   # offline: same, exits 1 if results.json differs
 *
 * `run` opens no socket. Same pinned files + same script = byte-identical results.json.
 *
 * WHAT IS MODELLED, AND WHAT IS NOT.
 *   - Spot BTC-USD daily bars (Coinbase Exchange public candles). Daily close to close. No fees,
 *     slippage, funding or execution delay beyond "decide at close of day i, earn the return i to i+1"
 *     (the same timing as the original script).
 *   - 4 of the original 13 signals can be rebuilt from history: price momentum, RSI(14, simple mean),
 *     volume spike, Fear and Greed. The other 9 are held at 0.0 exactly as the original did. So this
 *     measures the veto engine as that script ran it, not a live TrustTrader.
 *   - The veto engine is a line-for-line port of trinity-science/veto_engine.py `compute_veto`,
 *     cross-checked against the Python original on committed vectors (tests/drawdown-backtest.test.ts).
 *   - n = 4 events. That is a description of four episodes, not evidence about a strategy.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = resolve(HERE, '..', 'docs', 'measurements', 'drawdown-backtest-2026-10-23');
const PRICE_FILE = 'btc-usd-daily.json';
const FNG_FILE = 'fear-greed.json';
const MANIFEST_FILE = 'MANIFEST.json';
const RESULTS_FILE = 'results.json';

/** Data range pinned. Starts early enough for RSI/volume warm-up before the first event window. */
export const RANGE = { from: '2019-10-01', to: '2024-12-31' };

/** The four named events (trusttrader lib/backtests.ts CANONICAL_BACKTESTS, the first four). */
export const EVENTS = [
  { date: '2020-03-12', name: 'COVID Market Crash' },
  { date: '2021-05-19', name: 'China Mining Ban' },
  { date: '2022-11-09', name: 'FTX Collapse' },
  { date: '2024-01-10', name: 'Bitcoin ETF Approval Rally' },
];
/** Window = event date minus/plus this many days, fixed before looking at any result. */
export const WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
/**
 * Hash of the text with CRLF read as LF. A Windows checkout with core.autocrlf rewrites these files
 * with CRLF, and a hash of the raw bytes would then fail there while passing on Linux CI. None of
 * the files holds a carriage return of its own, so this changes nothing but the line ending.
 */
const CRLF = new RegExp(String.fromCharCode(13, 10), 'g');
const lf = (text) => text.replace(CRLF, String.fromCharCode(10));
const sha256Text = (buf) => sha256(Buffer.from(lf(buf.toString('utf8'))));

// ---------------------------------------------------------------------------------------------
// The veto engine: a port of trinity-science/veto_engine.py. Keep it line-for-line.
// ---------------------------------------------------------------------------------------------
export const PHI = (1 + Math.sqrt(5)) / 2;
export const COMMA_GAP = (3 / 2) ** 12 / 2 ** 7 - 1;
const BASE_THETA = 0.0195;
export const RISK_PROFILES = {
  very_conservative: BASE_THETA / PHI,
  conservative: BASE_THETA * 0.8,
  moderate: BASE_THETA,
  aggressive: BASE_THETA * PHI,
  very_aggressive: BASE_THETA * PHI ** 2,
};
export const REPID_THRESHOLDS = {
  very_conservative: 8500,
  conservative: 7500,
  moderate: 6500,
  aggressive: 5000,
  very_aggressive: 3000,
};
export const SIGNAL_WEIGHTS = {
  fear_greed: 1.5,
  on_chain_health: 1.2,
  whale_alert: 1.2,
  btc_price: 1.0,
  btc_rsi: 1.0,
  volume_spike: 1.0,
  exchange_sentiment: 0.9,
  news_sentiment: 0.9,
  interest_rates: 0.8,
  inflation: 0.8,
  guru_consensus: 0.7,
  etf_flow: 0.7,
  congressional_trading: 0.6,
};

/** numpy.round: halves go to the even neighbour (JS Math.round sends them up). */
export function roundHalfEven(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}
/** Python/numpy float `%` with a positive divisor: the result is never negative. */
const floorMod = (a, m) => ((a % m) + m) % m;

/** The chromatic note index each signal maps to. Same expression as computeVeto uses. */
export const notesOf = (signals) => Object.values(signals).map((s) => floorMod(roundHalfEven(7 * (s + 1)), 12));

/**
 * KNIFE EDGE, stated rather than hidden. When every signal lands on the SAME note, the phasors line
 * up exactly and `angle(h) % (pi/6)` is 0 or pi/6 depending on the last bit of floating point noise,
 * which differs between numpy's complex exp and this port's cos/sin. The Python original returns
 * dissonance 0.053846 there and this port 0.060990. Both are above every profile's theta (the largest
 * is 0.0511), so veto and execute agree. No pinned day is in that state (`alignedDays` in results.json).
 * Everywhere else the port matches the Python to the digits it prints (tests/drawdown-backtest.test.ts).
 */
export function computeVeto(signals, repid, riskProfile = 'moderate') {
  const keys = Object.keys(signals);
  let re = 0;
  let im = 0;
  for (const k of keys) {
    const w = SIGNAL_WEIGHTS[k] ?? 1.0;
    const note = floorMod(roundHalfEven(7 * (signals[k] + 1)), 12);
    const ang = (2 * Math.PI * note) / 12;
    re += w * Math.cos(ang);
    im += w * Math.sin(ang);
  }
  const mag = Math.hypot(re, im);
  const magLoss = Math.abs(mag / 13 - 1);
  const phaseOffset = Math.abs(floorMod(Math.atan2(im, re), Math.PI / 6) - Math.PI / 6);
  const dissonance = magLoss + phaseOffset * COMMA_GAP;
  const theta = RISK_PROFILES[riskProfile];
  const repidThreshold = REPID_THRESHOLDS[riskProfile];
  const logic = Math.min(repid / 10000, 1.0);
  const chaos = Math.max(0.0, 1.0 - dissonance);
  const beauty = Math.max(0.0, 1.0 - dissonance);
  const unity = (logic * chaos * beauty) ** (1 / PHI);
  const veto = dissonance > theta && repid < repidThreshold;
  const execute = unity > 0.95 && !veto;
  return { veto, execute, unity, dissonance, theta, repidThreshold };
}

/**
 * The largest unity ANY signals can reach, at ANY repid. |h| is at most the sum of the weights
 * (12.3), and the engine divides by 13, so magnitude loss is at least 1 - 12.3/13 = 0.0538 and
 * chaos = beauty <= 0.9462. With logic <= 1, unity <= (0.9462 * 0.9462)^(1/phi) = 0.9339. The gate
 * `unity > 0.95` is therefore false for every input: the as-written "with veto" arm cannot trade.
 * Checked against the Python original (tests/drawdown-backtest.test.ts): the best unity it ever
 * returns is 0.9339.
 */
export const WEIGHT_SUM = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);
export const unityMax = () => {
  const chaos = 1 - Math.abs(WEIGHT_SUM / 13 - 1);
  return (1.0 * chaos * chaos) ** (1 / PHI);
};

// ---------------------------------------------------------------------------------------------
// Signals, rebuilt from the pinned bars exactly as backtest.py built them.
// ---------------------------------------------------------------------------------------------
const normalize = (v, lo, hi) => (hi === lo ? 0.0 : Math.max(-1.0, Math.min(1.0, (2.0 * (v - lo)) / (hi - lo) - 1.0)));

/** backtest.py compute_rsi: simple mean of the last 14 deltas (through today's close), 50 padding. */
export function rsiSeries(prices, period = 14) {
  const out = new Array(period).fill(50.0);
  for (let i = period; i < prices.length; i++) {
    let gain = 0;
    let loss = 0;
    for (let j = i - period; j < i; j++) {
      const delta = j + 1 < prices.length ? prices[j + 1] - prices[j] : 0;
      if (delta > 0) gain += delta;
      else loss += Math.abs(delta);
    }
    const avgGain = gain / period;
    const avgLoss = loss / period || 0.0001;
    out.push(100 - 100 / (1 + avgGain / avgLoss));
  }
  return out;
}

const dayOf = (tsSec) => new Date(tsSec * 1000).toISOString().slice(0, 10);

export function buildDays(bars, fng) {
  // bars: [time, low, high, open, close, volume] ascending
  const close = bars.map((b) => b[4]);
  const vol = bars.map((b) => b[5]);
  const rsi = rsiSeries(close);
  const fngByDay = new Map(fng.map((r) => [dayOf(Number(r.timestamp)), Number(r.value)]));
  const days = [];
  for (let i = 0; i < bars.length; i++) {
    const day = dayOf(bars[i][0]);
    const start = Math.max(0, i - 30);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += vol[j];
    const avg = sum / (i - start + 1);
    const priceChange = i > 0 ? ((close[i] - close[i - 1]) / close[i - 1]) * 100 : 0;
    const volSpike = avg > 0 ? vol[i] / avg - 1.0 : 0.0;
    const fg = fngByDay.get(day);
    days.push({
      day,
      close: close[i],
      fngMissing: fg === undefined,
      signals: {
        fear_greed: normalize(fg === undefined ? 50 : fg, 0, 100),
        btc_price: normalize(priceChange, -15, 15),
        btc_rsi: normalize(rsi[i], 0, 100),
        volume_spike: normalize(volSpike, -0.5, 2.0),
        whale_alert: 0.0,
        exchange_sentiment: 0.0,
        interest_rates: 0.0,
        inflation: 0.0,
        news_sentiment: 0.0,
        on_chain_health: 0.0,
        guru_consensus: 0.0,
        etf_flow: 0.0,
        congressional_trading: 0.0,
      },
    });
  }
  return days;
}

// ---------------------------------------------------------------------------------------------
// Strategies, windows, drawdown.
// ---------------------------------------------------------------------------------------------
/**
 * The configurations that are run. `gate` is the original `unity > 0.95` rule; `noGate` is the same
 * engine with that one condition removed, so the question "does the veto itself do anything" can be
 * asked separately from "does the gate ever open". Pre-registered here, before the results.
 */
export function configs() {
  const out = [];
  out.push({ id: 'as-written', label: 'As written: repid 7000, moderate, unity gate 0.95', repid: 7000, profile: 'moderate', gate: true });
  for (const profile of ['moderate']) {
    for (const repid of [3000, 5000, 6499, 6500, 7000, 9500]) {
      out.push({ id: `nogate-${profile}-${repid}`, label: `Gate removed: repid ${repid}, ${profile}`, repid, profile, gate: false });
    }
  }
  for (const repid of [9500, 10000]) {
    out.push({ id: `gate-moderate-${repid}`, label: `Gate kept: repid ${repid}, moderate`, repid, profile: 'moderate', gate: true });
  }
  return out;
}

function decide(day, cfg) {
  const r = computeVeto(day.signals, cfg.repid, cfg.profile);
  return cfg.gate ? r.execute : !r.veto;
}

/** Max drawdown of an equity series that starts at 1 (a start-of-window peak counts). */
export function maxDrawdown(equity) {
  let peak = equity[0];
  let dd = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    dd = Math.max(dd, (peak - e) / peak);
  }
  return dd;
}

const pct = (x) => Math.round(x * 10000) / 100;

/** Run one config over one inclusive day range. Position for day t+1's return is decided on day t's signals. */
export function runWindow(days, from, to, cfg) {
  const idx = days.map((d) => d.day);
  const a = idx.indexOf(from);
  const b = idx.indexOf(to);
  if (a < 0 || b < 0 || b <= a) throw new Error(`window ${from}..${to} is outside the pinned data`);
  let eq = 1.0;
  let hold = 1.0;
  const equity = [1.0];
  const holdEq = [1.0];
  let executed = 0;
  let vetoedDown = 0;
  let vetoed = 0;
  let downDays = 0;
  for (let i = a; i < b; i++) {
    const r = days[i + 1].close / days[i].close - 1;
    const go = decide(days[i], cfg);
    if (go) {
      eq *= 1 + r;
      executed++;
    } else {
      vetoed++;
      if (r < 0) vetoedDown++;
    }
    if (r < 0) downDays++;
    hold *= 1 + r;
    equity.push(eq);
    holdEq.push(hold);
  }
  const n = b - a;
  return {
    days: n,
    executedDays: executed,
    vetoedDays: vetoed,
    withVetoMaxDrawdownPct: pct(maxDrawdown(equity)),
    withoutVetoMaxDrawdownPct: pct(maxDrawdown(holdEq)),
    withVetoReturnPct: pct(eq - 1),
    withoutVetoReturnPct: pct(hold - 1),
    // Share of vetoed days that were down days, beside the share of ALL days that were down days:
    // a veto that is "right" 49% of the time on a market that falls 49% of the time knows nothing.
    vetoedDayDownSharePct: vetoed ? pct(vetoedDown / vetoed) : null,
    allDaysDownSharePct: pct(downDays / n),
  };
}

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export function windowsFor(events = EVENTS, k = WINDOW_DAYS) {
  return events.map((e) => ({ ...e, from: addDays(e.date, -k), to: addDays(e.date, k) }));
}

/** How the engine's dissonance sits against each profile's theta, over every pinned day. */
export function dissonanceStats(days) {
  const d = days.map((x) => computeVeto(x.signals, 5000, 'moderate').dissonance);
  const byProfile = Object.fromEntries(
    Object.entries(RISK_PROFILES).map(([name, theta]) => [name, { theta: Math.round(theta * 1e6) / 1e6, daysAboveTheta: d.filter((x) => x > theta).length }]),
  );
  return {
    days: d.length,
    alignedDays: days.filter((x) => new Set(notesOf(x.signals)).size === 1).length,
    min: Math.round(Math.min(...d) * 1e6) / 1e6,
    max: Math.round(Math.max(...d) * 1e6) / 1e6,
    byProfile,
    note: 'veto = dissonance > theta AND repid < profile threshold. If dissonance is above theta on every day, the veto is decided by the repid input alone and never by the market.',
  };
}

/**
 * POST-HOC, so it is labelled as such: does 49.63 appear as buy-and-hold max drawdown in ANY window
 * of +/- k days around the four events? The pre-registered windows are the ones in `configs`.
 */
export function claimedScan(days, target = 49.63) {
  const rows = [];
  for (const k of [7, 14, 21, 30, 45, 60, 90]) {
    for (const w of windowsFor(EVENTS, k)) {
      const dd = runWindow(days, w.from, w.to, { repid: 7000, profile: 'moderate', gate: false }).withoutVetoMaxDrawdownPct;
      rows.push({ event: w.name, windowDays: k, maxDrawdownPct: dd });
    }
  }
  return { targetPct: target, postHoc: true, windows: rows, within0_5: rows.filter((r) => Math.abs(r.maxDrawdownPct - target) <= 0.5) };
}

/** Everything `run` reports, from the already-loaded inputs. PURE: no clock, no files, no network. */
export function measure(bars, fng) {
  const days = buildDays(bars, fng);
  const cfgs = configs();
  const windows = windowsFor();
  const perConfig = cfgs.map((cfg) => {
    const events = windows.map((w) => ({ event: w.name, date: w.date, from: w.from, to: w.to, ...runWindow(days, w.from, w.to, cfg) }));
    const full = runWindow(days, days[40].day, days[days.length - 2].day, cfg);
    return { ...cfg, events, fullPeriod: { from: days[40].day, to: days[days.length - 2].day, ...full } };
  });
  // Does 49.63 appear anywhere? Buy-and-hold max drawdown in each event window, and over each full year.
  const holdWindows = windows.map((w) => ({
    event: w.name,
    from: w.from,
    to: w.to,
    maxDrawdownPct: runWindow(days, w.from, w.to, perConfig[0]).withoutVetoMaxDrawdownPct,
  }));
  const claimed = 49.63;
  const nearest = holdWindows.reduce((best, w) => (Math.abs(w.maxDrawdownPct - claimed) < Math.abs(best.maxDrawdownPct - claimed) ? w : best));
  return {
    ruler: {
      data: { symbol: 'BTC-USD', bars: bars.length, firstDay: days[0].day, lastDay: days[days.length - 1].day, fngRows: fng.length, fngMissingDays: days.filter((d) => d.fngMissing).length },
      windowDays: WINDOW_DAYS,
      signalsRebuilt: ['fear_greed', 'btc_price', 'btc_rsi', 'volume_spike'],
      signalsHeldAtZero: Object.keys(SIGNAL_WEIGHTS).filter((k) => !['fear_greed', 'btc_price', 'btc_rsi', 'volume_spike'].includes(k)),
      engine: 'port of trinity-science/veto_engine.py compute_veto',
      notModelled: ['fees', 'slippage', 'execution delay', '9 of 13 signals', 'intraday moves', 'any asset but BTC'],
    },
    gateArithmetic: {
      weightSum: Math.round(WEIGHT_SUM * 1000) / 1000,
      unityMaxAnyInput: Math.round(unityMax() * 10000) / 10000,
      unityGate: 0.95,
      gateReachable: unityMax() > 0.95,
      note: 'unity = (logic*chaos*beauty)^(1/phi), logic <= 1, and |h| <= the sum of the weights (12.3) divided by 13, so unity cannot exceed unityMaxAnyInput for any signals at any repid. `unity > 0.95` is false for every input.',
    },
    dissonance: dissonanceStats(days),
    claimedFigureScan: claimedScan(days),
    buyAndHold: { windows: holdWindows, nearestToClaimed49_63: { claimedPct: claimed, ...nearest } },
    configs: perConfig,
  };
}

// ---------------------------------------------------------------------------------------------
// Files, fetch, run.
// ---------------------------------------------------------------------------------------------
const readPinned = (name) => readFileSync(join(DATA_DIR, name));
const stable = (obj) => JSON.stringify(obj, null, 2) + '\n';

export function verifyPinned(dir = DATA_DIR) {
  const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_FILE), 'utf8'));
  for (const f of manifest.files) {
    const got = sha256Text(readFileSync(join(dir, f.name)));
    if (got !== f.sha256) throw new Error(`NOT_CHECKED: ${f.name} sha256 ${got} does not match the manifest ${f.sha256}. The pinned data changed; the results would not be the ones the manifest names.`);
  }
  return manifest;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'trustshell-drawdown-backtest/1' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  return res.json();
}

async function fetchStep() {
  mkdirSync(DATA_DIR, { recursive: true });
  const t0 = Date.parse(`${RANGE.from}T00:00:00Z`);
  const t1 = Date.parse(`${RANGE.to}T00:00:00Z`);
  const bars = new Map();
  // Coinbase Exchange: at most 300 candles per call, [time, low, high, open, close, volume].
  for (let start = t0; start <= t1; start += 299 * DAY_MS) {
    const end = Math.min(t1, start + 299 * DAY_MS);
    const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`;
    for (const c of await getJson(url)) bars.set(c[0], c);
  }
  const sorted = [...bars.values()].sort((a, b) => a[0] - b[0]);
  const fngAll = (await getJson('https://api.alternative.me/fng/?limit=0&format=json')).data;
  const fng = fngAll
    .map((r) => ({ timestamp: String(r.timestamp), value: String(r.value) }))
    .filter((r) => Number(r.timestamp) * 1000 >= t0 && Number(r.timestamp) * 1000 <= t1 + DAY_MS)
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const priceBuf = Buffer.from(JSON.stringify(sorted) + '\n');
  const fngBuf = Buffer.from(JSON.stringify(fng) + '\n');
  writeFileSync(join(DATA_DIR, PRICE_FILE), priceBuf);
  writeFileSync(join(DATA_DIR, FNG_FILE), fngBuf);
  const manifest = {
    pinnedBy: 'scripts/drawdown-backtest.mjs fetch',
    fetchedAtUtc: new Date().toISOString(),
    range: RANGE,
    files: [
      { name: PRICE_FILE, sha256: sha256(priceBuf), bytes: priceBuf.length, rows: sorted.length, columns: ['time_unix_s', 'low', 'high', 'open', 'close', 'volume'], source: 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400 (public, keyless; 300 candles per call, merged and de-duplicated by time)' },
      { name: FNG_FILE, sha256: sha256(fngBuf), bytes: fngBuf.length, rows: fng.length, columns: ['timestamp', 'value'], source: 'https://api.alternative.me/fng/?limit=0 (public, keyless; filtered to the range)' },
    ],
    note: 'The fetch step is the only one that touches the network. `run` verifies these hashes first and refuses to run if a file changed.',
  };
  writeFileSync(join(DATA_DIR, MANIFEST_FILE), stable(manifest));
  console.log(`pinned ${sorted.length} BTC-USD daily bars (${sha256(priceBuf).slice(0, 12)}) and ${fng.length} Fear and Greed rows (${sha256(fngBuf).slice(0, 12)}) in ${DATA_DIR}`);
}

export function renderReport(results, manifest) {
  const L = [];
  const f = (x) => (x === null || x === undefined ? 'n/a' : `${x}%`);
  L.push('# Drawdown backtest, four named events');
  L.push('');
  L.push(`Data: BTC-USD daily bars ${results.ruler.data.firstDay} to ${results.ruler.data.lastDay} (${results.ruler.data.bars} bars), sha256 ${manifest.files[0].sha256.slice(0, 16)}...; Fear and Greed ${results.ruler.data.fngRows} rows, sha256 ${manifest.files[1].sha256.slice(0, 16)}... Window: event date +/- ${results.ruler.windowDays} days.`);
  L.push(`Engine: ${results.ruler.engine}. Rebuilt signals: ${results.ruler.signalsRebuilt.join(', ')}. Held at 0: ${results.ruler.signalsHeldAtZero.length} others. Not modelled: ${results.ruler.notModelled.join(', ')}.`);
  L.push('');
  L.push('## The gate and the veto in the original script');
  L.push(`Unity cannot exceed ${results.gateArithmetic.unityMaxAnyInput} for any signals at any repid (weights sum to ${results.gateArithmetic.weightSum}, divided by 13), and the gate needs more than ${results.gateArithmetic.unityGate}. So the unity gate never opens and "as written" never trades.`);
  const ds = results.dissonance;
  const above = Object.entries(ds.byProfile).map(([k, v]) => `${k} ${v.daysAboveTheta}/${ds.days}`).join(', ');
  L.push(`Dissonance over all ${ds.days} pinned days ran from ${ds.min} to ${ds.max} (${ds.alignedDays} days had every signal on one note, the case where this port and the Python can differ in the last digits). Days above each profile's theta: ${above}. So the veto does not look at the market: it is decided by the repid input alone (repid below the profile threshold: every day vetoed; at or above it: no day vetoed).`);
  L.push('');
  L.push('## Buy and hold, max drawdown in each window (the "without veto" number)');
  for (const w of results.buyAndHold.windows) L.push(`- ${w.event} (${w.from} to ${w.to}): ${f(w.maxDrawdownPct)}`);
  const n = results.buyAndHold.nearestToClaimed49_63;
  L.push(`- Nearest to the old 49.63%: ${n.event}, ${f(n.maxDrawdownPct)}.`);
  const hits = results.claimedFigureScan.within0_5;
  L.push(`- Post-hoc scan of ${results.claimedFigureScan.windows.length} windows (+/- 7 to 90 days around the four events): ${hits.length ? 'within 0.5 of 49.63% at ' + hits.map((h) => `${h.event} +/-${h.windowDays}d ${h.maxDrawdownPct}%`).join('; ') : 'none lands within 0.5 of 49.63%'}.`);
  L.push('');
  L.push('## Per configuration: max drawdown with the veto / without it, and days in the market');
  L.push('| Configuration | ' + results.buyAndHold.windows.map((w) => w.event).join(' | ') + ' | Days in market (all 4 windows) |');
  L.push('|---|' + results.buyAndHold.windows.map(() => '---|').join('') + '---|');
  for (const c of results.configs) {
    const cells = c.events.map((e) => `${f(e.withVetoMaxDrawdownPct)} / ${f(e.withoutVetoMaxDrawdownPct)}`);
    const inMarket = c.events.reduce((s, e) => s + e.executedDays, 0);
    const total = c.events.reduce((s, e) => s + e.days, 0);
    L.push(`| ${c.label} | ${cells.join(' | ')} | ${inMarket} of ${total} |`);
  }
  L.push('');
  L.push('## Returns and whether the veto knows anything (as-written excluded: it never trades)');
  L.push('| Configuration | Event | With veto return | Buy and hold return | Vetoed days that were down days | All days that were down days |');
  L.push('|---|---|---|---|---|---|');
  for (const c of results.configs) {
    if (c.id === 'as-written') continue;
    for (const e of c.events) L.push(`| ${c.label} | ${e.event} | ${f(e.withVetoReturnPct)} | ${f(e.withoutVetoReturnPct)} | ${f(e.vetoedDayDownSharePct)} | ${f(e.allDaysDownSharePct)} |`);
  }
  return L.join('\n') + '\n';
}

async function runStep(check) {
  const manifest = verifyPinned();
  const bars = JSON.parse(readPinned(PRICE_FILE).toString('utf8'));
  const fng = JSON.parse(readPinned(FNG_FILE).toString('utf8'));
  const results = {
    scriptSha256: sha256Text(readFileSync(fileURLToPath(import.meta.url))),
    inputSha256: Object.fromEntries(manifest.files.map((x) => [x.name, x.sha256])),
    ...measure(bars, fng),
  };
  const text = stable(results);
  const path = join(DATA_DIR, RESULTS_FILE);
  if (check) {
    const have = existsSync(path) ? lf(readFileSync(path, 'utf8')) : '';
    if (have !== text) {
      console.error('FAILED: results.json differs from what the pinned data and this script produce.');
      process.exit(1);
    }
  } else {
    writeFileSync(path, text);
  }
  process.stdout.write(renderReport(results, manifest));
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === 'fetch') await fetchStep();
  else if (cmd === 'run') await runStep(process.argv.includes('--check'));
  else {
    console.error('usage: node scripts/drawdown-backtest.mjs fetch | run [--check]');
    process.exit(2);
  }
}
