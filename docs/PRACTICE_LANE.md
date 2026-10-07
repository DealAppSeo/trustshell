# Practice lane: everyone starts on paper

**Status: PROPOSAL, 2026-10-07.** Nothing in this file is built yet unless a line says so.
Sean's direction, with Grok's answers, from the foundation review (BUS S56).
Today every value in this system is on the test network (Base Sepolia, chain id 84532), so the
lane changes no money today. It decides what has to be true **before** anything real moves.

## The rule in one line

A new person or a new agent starts on paper. Real value moves only after four things are true:

1. a person and an agent both exist and are **bound both ways**;
2. the person has **seen a Caught**;
3. the person has **set a limit and a payee, and stopped one**;
4. the person has **signed an acknowledgement**.

There is one bar, not a cheap one and an expensive one. The fast track is the same four
gates, done in one sitting.

## Why these four, and what each one proves

| gate | what it proves | measurable today? |
|---|---|---|
| **Bound both ways** | a person answers for this agent, and the agent proved it holds its own key (the two-sided bind, repid-engine#1243). Either can be registered first; nothing real moves until both exist and the bind holds. This is F1's accountable root | **yes**: `human_agent_bindings` |
| **Seen a Caught** | the person has watched TrustShell refuse a false claim, so they know what a refusal looks like before they rely on a pass | **no**: `/check` is anonymous. Needs the check to run while the owner is signed in, recorded against the owner |
| **Set a limit and a payee, and stopped one** | the person knows where the brake is and has used it once | **half**: the limit is an on-chain USDC allowance (`/spend`, Build D), and stopping it is `approve(0)`, both readable on chain. **Payees do not exist yet** (Sean's one migration, S6) |
| **Signed acknowledgement** | the person has read, in plain words, what can be lost and how to stop it, and signed it with the wallet that owns the agent | **no**: the signing exists (`lib/owner-auth.ts`, EIP-712); nothing stores the acknowledgement yet (same migration) |

A gate that cannot be measured is **NOT CHECKED**, never passed. Until a gate is measurable, the
lane says so on the page instead of letting the person through.

## The list is data, not code

The gates live in one manifest (`lane-gates`, served by the engine, rendered by the pages).
Adding "read the guide", "verified a proof", "caught a hallucination" or any later item is one
new row, not a release. Each row says what it unlocks, how it is measured, and the words shown
when someone reaches for it. That is how the list grows from what people actually trip on,
without anyone hand-editing pages.

Candidate rows already measurable or close: `trustshell proof --verify` run on a real id
(client-side today; recording it needs the owner signed in), a correction taught to an agent
(Build C, stored), a role given and revoked (Build B, stored).

## Progressive disclosure: nothing appears before it is needed

- **First visit:** the check, and nothing else. No wallet, no signature, no waiting period.
- **When someone reaches for a thing a gate guards** (spend, pay, stake, a widening role), the
  page shows that one gate, why it exists, and the shortest way through it.
- **The acknowledgement and the 24-hour wait never appear on a first visit.** They appear at
  the moment real value is about to be possible, and only then.
- Paper results are always labelled **Practice** in the same place a real result would sit, so
  nobody mistakes one for the other.

## Fast track

Someone who arrives with a wallet and an agent can clear all four in about ten minutes:

1. claim the agent on `/bind` (two prompts);
2. run one deliberately false claim and watch it get Caught;
3. set a cap and a payee on `/spend`, then stop it;
4. sign the acknowledgement.

Same gates, no shortcut around any of them. A fast track that skips a gate becomes the door
everyone picks.

An optional **technical attestation** ("I run my own agents and understand allowances") can be
added as one more signed line. It speeds nothing up and lowers no bar; it records what the person
said about themselves, the way a qualified-investor form does.

## The 24-hour wait, plainly

**What it is.** When something that controls money gets *more* powerful, the change is written to
the owner's log and takes effect 24 hours later. During those 24 hours the owner can cancel it
with one click. The changes that wait:

- a new owner for an agent;
- a new payee;
- a higher cap.

**What does not wait:** anything that makes things *safer*. Lowering a cap, removing a payee,
stopping an agent and unbinding all happen at once. The brake is never delayed.

**Why.** A stolen key, a tricked click or a compromised agent cannot take control and drain in
one step: it needs a day, in plain view, while the real owner can see it and stop it. That is
the whole trade. A day of delay on the rare power-raising change, and in return, theft needs a
day of nobody noticing.

**After an agent changes hands,** its spending cap is 0 for 14 days. The new owner raises it
after that, through the same wait. The agent's reputation goes with it, but its power to spend
does not, so buying a well-reputed agent does not buy a way to spend.

## Real collateral, plainly

**Real collateral is USDC that sits in the owner's own wallet and that the agent can pull only up
to a limit the owner signed.** The limit is an on-chain allowance, enforced by the USDC contract
itself, not by our database. The owner stops it at any moment by setting the allowance to 0.

**What does not count:**
- a prediction-market wager;
- a sponsorship row;
- a balance in our database;
- anything simulated.

None of these can be pulled. So none of them raises what an agent may spend: repid-engine#1246
stops the payment gate counting them. No page or chat calls them "real collateral"
(trustshell#485).

**Where it stands.** The allowance mechanism exists on the test network today: `/spend` (Build D),
switched off until S52. Test USDC is not real value. On a real network the same mechanism holds
real USDC, which is why the lane has to be in place first.

## Build order (each needs Sean's GO)

| slice | what | needs |
|---|---|---|
| P1 | `GET /api/v1/lane/:agent`: each gate VERIFIED / NOT CHECKED / FAILED from what is measurable today (binding, allowance, a recorded stop). The **Practice** label on every surface that shows a value | no database change |
| P2 | Store the acknowledgement, payees with a cap each, and the owner log with the 24-hour wait | Sean's one migration (S6), after F1/F2 are green |
| P3 | "Seen a Caught" and "verified a proof" recorded against a signed-in owner; the gate manifest served as data | P1 |
| P4 | Transfer: cap 0 for 14 days, then through the wait | P2 |
