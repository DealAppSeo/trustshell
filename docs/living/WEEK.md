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
