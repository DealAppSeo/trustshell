# Quickstart — verify it yourself in 10 steps

No account, no key, no signup. Every step is a command you run and an output you can check. Where a step leaves the machine it says so; the rest are offline. Node 22 or newer.

The one rule this project holds itself to: **receipts, not promises.** Each step below is a receipt you can reproduce, or an honest "not checked".

---

**1. Run it once, cold.** From an empty directory, no clone, no install:

```
npx @hyperdag/trustshell@latest demo
```

You get a real `kernel-receipt/2`, sealed with a key this install just made, and **verified in front of you**: Integrity `VERIFIED`, the other five claims `NOT_CHECKED`. That gap is the point — read step 10.

**2. See the whole loop in one command.** `trustshell demo` sealed a receipt and verified it under its own key, offline. Nothing was written to disk, nothing left the machine. Add `--json` to get `{ receipt, verify, root }` back as data.

**3. Do it yourself with your own receipt.** Seal a body, then verify the file — the two commands the demo ran for you:

```
trustshell sign-receipt your-body.json > r.json
trustshell verify-receipt r.json --root 0x<thekey>     # the pin sign-receipt printed on stderr
```

`integrity VERIFIED, sealer trusted → exit 0`.

**4. Break it and watch it fail.** Change one character of `r.json` (flip a digit in `decision`), then verify again:

```
trustshell verify-receipt r.json --root 0x<thekey>     # integrity FAILED → exit 1
```

The hash no longer matches the bytes. A tampered receipt cannot pass.

**5. No pin is not a pass.** Verify the untouched receipt with **no** `--root`:

```
trustshell verify-receipt r.json                       # NOT_CHECKED → exit 2, never 0
```

The bytes are whole, but no accountable key was confirmed to have sealed them. An unaccountable receipt is `NOT_CHECKED`, never success — so a CI gate written as `verify-receipt … || exit 1` can never read one as a pass.

**6. Check a real claim about a real CI run.** This one uses the network (`api.github.com` only):

```
trustshell check <github-actions-run-url> --claims-file claims.txt --out ./out
```

A true claim about the run comes back `SUPPORTED` (exit 0); a false one `CONTRADICTED` (exit 1). The record it writes under `./out` is a receipt you can re-read.

**7. Inspect an append-only tool-call log.** Offline, no socket:

```
trustshell inspect .trustshell/session.jsonl           # INTACT (0) / BROKEN (1) / UNCHAINED (3)
```

`INTACT` means nothing was edited or dropped — but see step 10 for what it does *not* prove.

**8. Reproduce the headline claims with one command.** From a clone (needs the internet; installs into a temp dir and deletes it):

```
npm run proof-pack
```

It packs this checkout, installs the tarball **and** the published `@latest` into empty dirs, runs the documented commands from both, and prints `PASS` / `FAIL` / `NOT_CHECKED` per step with a tamper control that must fail. Its dated report lands in `docs/proof-pack/`.

**9. Attack the receipt seam and watch every forgery bounce.** Offline:

```
npm run skeptic
```

It seals a receipt, then tries to forge, tamper, transplant a signature, pin the wrong key, expire the authorization, and launder a self-signature into RepID — each **passes only when the verifier refuses it**. The report names the commit, the version and every input/output.

**10. Read what a pass does NOT prove.** This is the honest part, and it is load-bearing:

- **Three evidence levels, never collapsed.** An owner self-signature (steps 1–5) proves **authorship and wholeness only**. It is *not* independent verification and it earns *no* production RepID. Whether a receipt earns RepID is the **engine's** call against its own key — never an offline verdict.
- **`NOT_CHECKED` is never a pass.** A missing observation stays not-checked; it does not quietly become "fine".
- **`inspect INTACT` has no trusted anchor.** Its hashes are unkeyed — anyone who can write the file can produce a valid-looking chain. It catches edits and deletions, not a log rewritten end to end.
- **Offline verify is stateless.** It does not catch a verbatim replay of one receipt; replay is prevented by the engine's `receipt_id`/nullifier uniqueness, not the offline verifier.
- **The ERC-8004 reads in the proof pack** show two contracts exist on Base Sepolia. They do not show that any agent holds a token or earned a reputation.

If any of steps 1–9 does something other than what it says here, that is a bug — open an issue with the output. The commands and their exit codes are the contract.
