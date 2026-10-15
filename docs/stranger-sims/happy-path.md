# Happy path

Run 2026-10-12 from a cloud sandbox. Branch `claude/bold-turing-icz50x-stranger-path` (PR #518).
Outcomes are VERIFIED / NOT_CHECKED / FAILED. Every block below is pasted from a real run; each says which engine it talked to.

Install, name the agent, pick a belt (or skip), run one check, read the receipt, bind, get test tokens from a public faucet, practice-stake, pull the limit to zero and watch the next spend refuse.

The legs ran as separate suites, so each is labelled with what it talked to.

| # | leg | engine | outcome |
|---|---|---|---|
| 1 | install the published package into an empty folder, run one check | LIVE | VERIFIED (see [cold-install.md](cold-install.md)) |
| 2 | name the agent | STUB | VERIFIED |
| 3 | pick a belt, suggest a skill (stores a link, installs nothing), or skip | STUB | VERIFIED |
| 4 | run one check, read the receipt, watch the score | STUB | VERIFIED; the score stays put |
| 5 | the offer: register / bind / test tokens / practice stake / limit | STUB (server-rendered) | VERIFIED |
| 6 | bind the agent with the agent's own key | STUB, strict CORS | VERIFIED |
| 7 | the faucet: points at public faucets, reads the balance back, never dispenses | LIVE reads + STUB page | VERIFIED |
| 8 | the practice stake, held until the agent is bound | STUB | VERIFIED |
| 9 | pull the limit to zero, the next spend refuses | STUB chain | VERIFIED (see [refused-path.md](refused-path.md)) |
| 10 | a check on this site writes nothing to a score (how scores move is on /repid) | none | NOT_CHECKED: the web has no settler; it shows the score unchanged and says why |

## 2 to 5, 8: the browser walk (`tests/e2e/stranger-path-walk.mjs`), phone leg

Full list in [phone-width.md](phone-width.md). The lines that matter for the path:

```
screen 1 prints "Step 1 of 4" ON the create page
naming an agent registers it and it appears
the register call carried the name
the rail's Next goes to screen 2
picking a belt writes it down and says it installs nothing
suggest-a-skill refuses javascript: and stores nothing
suggest-a-skill stores the link and says nothing was opened or installed
the browser asked for NOTHING outside our app and engine (the link was not fetched)
Skip on screen 2 lands on screen 3
your agent is shown as TWO fields: score and ID
the new agent's score reads 200 and its ID reads "None yet" (off-chain only)
a true claim gets a receipt
the receipt says PROVISIONAL, never SETTLED
on the wire, the check asked two checkers and wrote NO score (only classify + passport reads) — POST /api/v1/classify, GET /api/v1/passport/<id>
the score is unchanged by the check, and the page says so
the offer lists register, bind, test tokens, practice stake and the limit, in order
the on-chain mint is said to be NOT offered yet, and has no button
an UNBOUND agent cannot stake: the button is held and says to bind first
once the agent is bound, the practice stake is offered
the practice stake succeeds and says it does not raise what the agent may spend
it sent a deposit with NO tx hash and NO signature (practice, nothing signed)
```

The receipt, as a stranger sees it (390px, after a false claim):

![](phone-390/3-check-receipt-390.png)

## 6: bind (`tests/e2e/journey-walk.mjs`, STUB with the engine's strict CORS list)

```
PASS  terminal + fresh: the plan says how to make an agent in the terminal and then claim it
PASS  /spend says to claim the agent first, with a link
PASS  REPRODUCED: with the old CORS list the claim never reaches the engine — TrustShell | Claim your agent |  | You have built something. This is where it becomes yours — not by us recordin
PASS  with the new list the claim reaches the engine, carrying the agent's own key — {"agentKey":"ts_live_journey_walk_key","wallet":"0x1111111111111111111111111111111111111111","body":{"age
PASS  the claim is recorded
```

## 7: the faucet, LIVE reads from this sandbox

```
$ curl https://repid-engine-production.up.railway.app/api/v1/faucet/info
dispenses: false
"We do not run a faucet. Fund your wallet from one of the public faucets below, then check your balance at /api/v1/faucet/balance."
chain 84532, Base Sepolia, staking_min_eth 0.0001, staking_suggested_eth 0.001
 - Coinbase Base Sepolia Faucet   [ETH, USDC]  https://www.coinbase.com/faucets/base-sepolia
 - Base.org Sepolia Faucet        [ETH]        https://sepolia.base.org/faucet
 - Alchemy Base Sepolia Faucet    [ETH]        https://www.alchemy.com/faucets/base-sepolia

$ curl "https://repid-engine-production.up.railway.app/api/v1/faucet/balance?address=0x8004A818BFB912233c491871b3d84c89A494BD9e"
eth_balance "0.0", usdc_balance "1.0", enough_to_stake false, enough_for_gas false
```

Both answered with `Access-Control-Allow-Origin: https://trustshell.dev`, so the page can read them from a browser. The page was **not** pointed at production in a real browser from here (NOT_CHECKED: a browser cannot reach third-party sites or the Base RPC from this sandbox). Against the stub the page: lists the engine's faucets and drops a `javascript:` link the stub slipped in, sends nothing until you press Read, reads an empty wallet as 0, a funded one as "Enough to stake", and shows "Not checked" with no number when the engine is down.

## What the walk would NOT have caught

- A real wallet: the bind and the cap use a fake provider.
- The engine answering differently from the stub. The live reads in 7 are the only production checks of the faucet shape.
- Whether a **known answer** can move a score at all: the table that decides that lives in the engine lane.
