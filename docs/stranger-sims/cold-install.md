# Cold install

<!-- doc-version: historical -->

Run 2026-10-12 from a cloud sandbox. Branch `claude/bold-turing-icz50x-stranger-path` (PR #518).
Outcomes are VERIFIED / NOT_CHECKED / FAILED. Every block below is pasted from a real run; each says which engine it talked to.

A stranger with an empty folder. `ethers` is an **optional** peer: `npm i` does not install it, so a leg that needs it must fail in the open.

## 1. The published package, LIVE (npm registry, then the live engine)

```
$ npm view @hyperdag/trustshell version
1.6.0
$ mkdir cold && cd cold && npm init -y && npm i @hyperdag/trustshell
added 97 packages, and audited 98 packages in 4s
found 0 vulnerabilities
$ ls node_modules | wc -l
92
$ test -d node_modules/ethers && echo PRESENT || echo "ABSENT (optional peer, not auto-installed)"
ethers: ABSENT (optional peer, not auto-installed)

$ npx trustshell --version
1.6.0

$ npx trustshell check "The Eiffel Tower is located in Rome, Italy."
veto
The classifier labelled this sentence veto — do not rely on it (275 ms).
Groq and Cerebras both said false.
exit=1

$ npx trustshell check "The capital of France is Paris."
pass
The classifier labelled this sentence pass (145 ms).
Groq and Cerebras both said true.
exit=0
```

VERIFIED: one check works with no `ethers`, and the verdict is the exit code (1 caught, 0 checks out).

## 2. A bug the cold install found, in the PUBLISHED 1.6.0 (fixed on this branch)

```
$ npx trustshell verify The capital of France is Paris.        # unquoted
○ NOT_CHECKED  HAL did not decide. This is not a pass.
  NOT_CHECKED — hal_score 0.5 via fact-check (partial quorum)
  evidence:
    - cerebras:UNCERTAIN (Not a verifiable factual claim.)
    - groq:UNCERTAIN (Not a factual claim.)
    - deepseek:UNCERTAIN (Fragment; no factual claim to assess.)
exit=2
```

It sent only the word "The". It failed honestly (NOT_CHECKED, exit 2, never a pass), but a stranger who forgets the quotes learns nothing. On this branch `verify` and `evaluate` join the words (`tests/cli.test.ts`).

## 3. A leg that needs `ethers`, with `ethers` absent: the branch tarball (`npm pack`), LIVE

```
$ npm i ./hyperdag-trustshell-1.6.0.tgz     # no ethers
$ node kernel-leg.cjs                        # one spend-class call through kernelDecide
{
  "allowed": false,
  "verdict": "NOT_CHECKED",
  "source": "client",
  "reasons": [
    {
      "code": "ethers_missing",
      "detail": "Hashing kernel arguments needs the ethers package, which is optional since @hyperdag/trustshell 1.6.0. Install it next to trustshell: npm i ethers@^6"
    }
  ],
  "http_status": null
}
exit=3
```

**FAILED, in the open, and then fixed.** Before this branch the same call refused (correctly) but said only `the kernel client failed (MissingDependencyError); refusing`: nothing a stranger could act on. Now the refusal says what to run. Nothing left the process (`tests/kernel-client-no-ethers.test.ts` asserts `fetch` was never called).

```
$ npm i ethers@^6
$ node kernel-leg.cjs                        # ethers present, LIVE engine, NO api key
{ "allowed": false, "verdict": "NOT_CHECKED", "source": "client",
  "reasons": [ { "code": "http_401", "detail": "the kernel answered 401, not 200" } ], "http_status": 401 }
exit=3
```

VERIFIED: with the peer present the call goes as far as the engine, which wants an API key, and an unauthenticated call is still a refusal. It is never read as a yes.

## 4. The second RepID field, from the branch tarball, LIVE

```
$ npx trustshell repid trinity-sophia
trinity-sophia
  RepID 1359  (ESTABLISHED)
  ERC-8004 ID  #3747  (has a token id; no record of the mint transaction here, which is not the same as not minted)

$ npx trustshell repid trinity-sophia --json     # (keys shown)
{ "repid": 1359, "tier": "ESTABLISHED", "identity": { "registeredOnchain": "UNVERIFIED", "tokenId": "3747" } }
```

Published 1.6.0, same call, for contrast:

```
$ npx trustshell repid trinity-sophia
trinity-sophia
  RepID 1359  (ESTABLISHED)
```

The score and the ID are two lines and two JSON fields. `UNVERIFIED` is printed as what it is: a token id exists and this service has no record of the mint transaction. It is not printed as "not minted".

## Findings

1. `main` is not what is on npm: published 1.6.0 has neither the `identity` field nor the unquoted-`verify` fix nor the kernel client. **The next publish needs a version bump.**
2. A missing-`ethers` refusal named only an error class. Fixed on this branch.
