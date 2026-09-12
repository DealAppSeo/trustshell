# Create your PAI — a conversation, not a form

This is the script an agent (or `init-pai.mjs`) follows to help a person stand up a **Personal AI**
on TrustShell. It is a **conversation**, not a wizard with ten required fields. The goal is a working
tool pack + a keyless trust harness, derived from whatever the person actually volunteers.

## The turn rule (hard)
- **One question OR one answer per turn.** Never a wall of both.
- **Max 3 turns** to a usable PAI — *unless the user keeps going*. If they stop at turn 1, they still
  leave with something real.
- **Every turn carries exactly one bullet of value** — a concrete thing TrustShell does for them —
  and *optionally* one link. Never more than one link per turn.

Value bullets to draw from (pick the one that fits what they just said):
- **HAL catch** — "Before your PAI acts on a claim, HAL cross-checks it across independent models and
  can VETO a confident lie." → link: [glossary](./glossary.md) (see *HAL*, *VETO*)
- **Spend cap** — "Set a cap and a purchase over it is refused before anything signs — your PAI can't
  overspend." → link: [glossary](./glossary.md) (see *x402*, *cap*)
- **Portable harness** — "Your RepID + proofs are portable: present a ZK proof of your standing without
  revealing the score." → link: https://hyperdag.org
- **Mission** — only if they ask *why*: "Help people help people — verified machine behavior as
  portable credit for agents." → link: https://hyperdag.org (mission)

## Privacy — say this plainly, once (and honestly)
- **Your keys stay in `.trustshell/` on your device. They are never uploaded.**
- **Your interview answers are written to `.trustshell/` on your device — and if you register the PAI
  with the hosted engine, they are also sent as the agent's `constitution_text`** (that is how the
  engine knows what your PAI is for). So on the hosted-register path the answers *do* leave the device.
  Want them local-only? Run the CLI and skip hosted registration — the answers then stay in `.trustshell/`.
- **HAL checks DO hit the hosted engine** — deliberate: a check that ran only on your machine could be
  told to always say "true." Sending the *claim* to a cross-model quorum is what lets a lie get caught.
- Net: **keys never leave; the claim you check leaves; your interview leaves only if you hosted-register.**

## JTBD → tool pack (map, don't interrogate)
Do **not** ask a fixed questionnaire. Listen for the **job to be done** in whatever they volunteer, then
map it to the smallest tool pack. Examples:
| What they said (volunteered) | Job | Tool pack to set up |
|---|---|---|
| "I want it to fact-check my drafts / not make things up" | catch hallucinations | `verifyOutput` (HAL PASS/FLAG/VETO) |
| "I want to prove I'm reputable without doxxing my score" | portable trust | `presentProof(agentId, {verify})` (ZK RepID) |
| "I want it to buy things for me but not overspend" | bounded spend | `guardedX402Payment` + a spend **cap** (refuse over cap; Unknown origin / missing policy cannot pay) |
| "I just want to try it" | first taste | `verifyOutput` on one claim they care about |
If they volunteered nothing specific, default to the **HAL catch** pack — it needs no key and shows value
in one turn (`trustshell verify "<a claim they'd believe>"`).

## Worked 3-turn example (illustrative — adapt to the person)
> **Turn 1 (question).** "What's the one thing you'd want a personal AI to *not* get wrong for you?"
> · value: HAL cross-checks claims and can VETO a confident lie. · [glossary](./glossary.md)
>
> **Turn 2 (answer, after they say "spending my money on the wrong tools").** "Then we'll set a spend
> cap — a purchase over it is refused before anything signs. Want to start it at $5?"
> · value: the cap refuses over-limit buys before signature. · [glossary](./glossary.md) (x402, cap)
>
> **Turn 3 (answer / done).** "Done — your PAI verifies claims (HAL) and won't spend over your cap.
> Your key stays in `.trustshell/` on your device; if you hosted-register, your answers go up as the
> agent's constitution. Present a proof of standing anytime, no score leaked." · value: portable proof harness. · https://hyperdag.org

## What "created" means (the honest floor)
A PAI is "created" when there is, on the person's device, a `.trustshell/` holding their interview +
(optionally) a key, and a chosen tool pack that runs against the live engine keyless where possible:
`verify` and `presentProof` need no key; `register`/mint and x402 spend need a key + wallet and are
opt-in. Nothing is published; nothing on-chain moves without the person's explicit key + cap.

*Referenced by `init-pai.mjs` (the runnable creator). CLI: `trustshell init --pai --name <n>` (or
`node scripts/init-pai.mjs --name <n>`). Value events (register_ok / VETO / cap_refuse) are
logged as JSON lines by `scripts/value-events.mjs`.*
