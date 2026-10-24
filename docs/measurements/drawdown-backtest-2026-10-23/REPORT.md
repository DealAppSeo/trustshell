# Drawdown backtest, four named events (2026-10-23)

**Status: a measurement, not a claim. Nothing in this folder is posted anywhere.** It replaces a
figure ("0% drawdown vs 49.63% without the veto") that had no source and has been removed from
trustrails-dev, trusttrader and repid-engine.

Re-run it with nothing but Node (no network): `node scripts/drawdown-backtest.mjs run --check`.
Pinned inputs are `btc-usd-daily.json` and `fear-greed.json`, hashed in `MANIFEST.json`; `run`
refuses to start if either hash differs. The full numbers are `results.json`.

## The ruler (CLAUDE_RULES r24)

| | |
|---|---|
| Prices | Coinbase Exchange public candles, BTC-USD, daily, 2019-10-01 to 2024-12-31, 1,919 bars, sha256 `42a87e6c...`. No gaps, no bad rows. |
| Sentiment | alternative.me Fear and Greed, same range, 1,919 rows, sha256 `98a52e01...` |
| Engine | `compute_veto` from `trinity-ecosystem/trinity-science/veto_engine.py` (sha256 `dc2b5ee0...`), ported line for line to JavaScript. Held to the Python on 113 vectors (`fixtures/veto-engine-vectors.json`). |
| Signals | 4 of the 13 rebuilt from the bars exactly as `backtest.py` built them (price change, RSI-14 simple mean, volume spike, Fear and Greed). The other 9 are held at 0, as that script did. |
| Events | The first four in `trusttrader/lib/backtests.ts`: 2020-03-12 COVID crash, 2021-05-19 China mining ban, 2022-11-09 FTX collapse, 2024-01-10 Bitcoin ETF approval rally (a rally, not a crash). |
| Window | Event date minus 30 days to plus 30 days. Fixed before any result was looked at. |
| Timing | Decide on day t's signals, earn day t to t+1's return. Same as the original script. |
| Not modelled | Fees, slippage, execution delay, 9 of 13 signals, intraday moves, any asset but BTC. |

n = 4 episodes. This describes four episodes. It is not evidence about a strategy.

## What it measured

1. **The old "with veto" arm cannot trade, for any input.** `execute` needs `unity > 0.95`. Unity is
   `(logic x chaos x beauty)^(1/phi)`, and the weights sum to 12.3 against a divisor of 13, so chaos
   and beauty are at most 0.9462 and unity is at most **0.9339** whatever the signals and whatever the
   repid. The best unity the Python original returned on any of the 113 vectors was 0.9339. A
   strategy that never trades has a drawdown of 0%.
2. **The veto does not look at the market.** Dissonance ran from 0.0724 to 0.6890 over all 1,919
   days, above the threshold of every risk profile (largest 0.0511) on every day. The veto is
   `dissonance > theta AND repid < threshold`, so the first half is always true and the repid input
   decides alone: with the moderate profile, repid 6,499 vetoes all 240 window days and repid 6,500
   vetoes none. There is no setting in between where it picks days.
3. **Take the gate away and the result is a switch.** Below the threshold the strategy sits in cash for
   all 240 days (0% drawdown, 0% return). At or above it, it holds for all 240 days and equals
   buy-and-hold to the digit.
4. **49.63% is not reproduced.** Buy-and-hold max drawdown in the pre-registered windows: COVID
   53.17%, China mining ban 43.35%, FTX 26.01%, ETF rally 15.90%. A post-hoc scan of 28 windows
   (plus or minus 7 to 90 days around each event) has none within 0.5 of 49.63%. Per the earlier
   prior-work check, that figure most likely came from a rolling 365-day CoinGecko window that cannot
   contain these events; I did not run that script.

| Max drawdown, with the veto / without it | COVID | China ban | FTX | ETF rally |
|---|---|---|---|---|
| As written (repid 7000, moderate, gate 0.95) | 0% / 53.17% | 0% / 43.35% | 0% / 26.01% | 0% / 15.90% |
| Gate removed, repid 6,499 | 0% / 53.17% | 0% / 43.35% | 0% / 26.01% | 0% / 15.90% |
| Gate removed, repid 6,500 | 53.17% / 53.17% | 43.35% / 43.35% | 26.01% / 26.01% | 15.90% / 15.90% |

Returns over the same windows: buy-and-hold -32.91%, -35.65%, -10.46%, +14.38%. The cash arm earns
0% on all four, so it also gives up the ETF rally.

## What this does and does not say

- It says the figure cannot be produced by this engine as written, and that "0% drawdown" here means
  "never in the market".
- It does not say a working veto could not reduce drawdown. It says this one does not discriminate
  between days. A real test needs a veto whose decision depends on the day, and signals that could
  have been known on that day (the 9 held at zero are the ones that matter most for the events named).
- Knife edge, disclosed: when every signal lands on the same note, the Python and this port can differ
  in the last digits of dissonance (0.053846 vs 0.060990). Both are above every theta, the decision is
  the same, and no pinned day is in that state (`dissonance.alignedDays` is 0).

## Decision for Sean

None needed to keep the removals. If the claim is ever wanted back, it needs a new veto with a
decision that depends on the day, built and measured on this ruler first; the copy follows the
measurement. The three removal PRs stand.
