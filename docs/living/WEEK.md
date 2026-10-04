# WEEK — goals and sprints (week of 2026-10-05 to 2026-10-11)

**Tier 2 of 3.** Written 2026-10-04 by CC2 from Sean's decisions that night (recorded at the top of
`BUS.md`). The previous week is kept below it, unchanged.

## Goal: a stranger gets a real label for a real sentence, then V1 starts the same night

### Sprint E: the check is real (owner CC2, red-team Grok)
- [ ] B15: prose gets pass or veto from two free votes; any miss is not-checked.
- [ ] B16: the route heals itself (per-host health, canary, public skip rate).
- [ ] B17 (CC1): the terminal gives the same label as Chrome.

### Sprint F: every door (owners XC3, XC1, CC1)
- [ ] B7 + B8: the public phone bot, separate from the operator bot.
- [ ] B18: the privacy line and debounce; B19: any website by right-click.
- [ ] B22: the five hosts are tested in CI, not by hand.

### Sprint G: agents that work for free (owner CC2)
- [ ] B14: an hourly heartbeat that merges, dispatches and stops on quiet.
- [ ] B21: T12 runs a real job on a loopback model inside a free GitHub runner.

### Sprint H: V1 (the V1 queue in `BUS.md`)
zkRepID in the popup, TrustMarket deployed with "Check a claim", belts with early access, the Store
listing, 1.4.1, one GitHub App per agent family, a third voter, Stripe for payments.

## Not this week
Mainnet, live stake, `REAL_STAKING`, public "launched" language (Sean only).

---

# WEEK — goals and sprints (week of 2026-09-28 to 2026-10-04)

**Tier 2 of 3.** Goals and objectives for this week, as sprints. Each sprint is 2 to 4 loops
and ships one milestone. The tickets that make up each sprint are in `BUS.md`. The direction
they serve is in `NORTH.md`. Replaces `NEXT.md`.

| Word | Means | Proof it is done |
|---|---|---|
| **Prompt** | one paste that starts work | the agent is working |
| **Loop** | one ticket, worked until it can be shown | a PR or a URL |
| **Sprint** | 2 to 4 loops that ship a milestone | the milestone's check passes |
| **Week** | a few sprints | this file's goals are ticked |
| **Vision** | the board, months to years | `NORTH.md` |

## Goal this week: MVP live and tested (NORTH milestone 1)

### Sprint A: the stamp shows a real label (owner CC1, reviewed by Grok)
- [x] Extension loads on all five hosts (#421; it had been crashing on four).
- [x] The reply's own last word is never the label (#418).
- [x] The tester is told the reply is sent (#426).
- [x] A not-checked answer is not re-sent on every redraw (#430).
- [x] Public classify route merged (repid-engine #1151) and deployed (6a40bf4). BUS **B1**.
- [x] Production check: a real POST from a chat-site origin gets a contract label (2026-10-03 01:01Z). BUS **B2**.
- [ ] Decide what backs the route (Sean). Today it decides arithmetic only, so prose comes
      back not-checked. BUS **B9**.

### Sprint B: the phone door (owner XC3, reviewed by CC2)
- [ ] Find the one live Telegram deploy. `trinity-telegram-bot` is empty; start in
      `controller-pwa` and Vercel. BUS **B7**.
- [ ] Wire that bot only to `POST /api/v1/classify`. One box, three labels, the privacy line.
      BUS **B8**.

### Sprint C: RepID live for real reads (owner CC1 with CC2)
- [ ] `trustshell repid <id>` and `trustshell proof <id> --verify` run for three existing ids
      from the published package, with the output recorded. Not a new wallet and not a
      stake. BUS **B10**.
- [ ] Jev call (CC2) and CFO belt route (CC2). BUS **B5** and **B6**.

### Sprint D: hands-off loop (owner CC1)
- [x] Grok red-teams from the cloud with no paste (repid-engine #1150, #1152).
- [x] Claude starts and briefs Claude sessions with no paste (CC2 built #1151).
- [ ] Hourly pull loop runs from this file set. BUS **B14**.
- [x] Grok can read trustshell as well as repid-engine (repid-engine #1154; first run #1155). BUS **B13**.

## Not this week
1.5.0 publish (after Sprints A to C are green), on-chain receipts end to end (after GO
TESTNET), and building our own scheduler.
