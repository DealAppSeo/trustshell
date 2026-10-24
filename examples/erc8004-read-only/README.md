# ERC-8004, read only

Give it an agent id. It reads that agent's identity from the ERC-8004 IdentityRegistry on Base Sepolia, checks the
agent's registration file against the EIP-8004 text, and runs one TrustShell `check` on a sentence from that file.

**It only reads.** No key, no gas, no transaction, no feedback posted. Every step it did not take is printed at the end
of every run, under `not done`, so a reader of the output cannot mistake "I looked" for "I checked everything".

## Run it

From a clone of this repo (it imports this tree's `dist/`, like `examples/quickstart`), Node 22.13 or newer (`engines` in `package.json`):

```powershell
node examples/erc8004-read-only/read-agent.mjs 6705
```

Two of this repo's own agents are 6705 and 6706. Any id works. Useful options:

| Option | Does |
|---|---|
| `--no-check` | Send nothing to the hosted check. The claim is reported `not-checked`. |
| `--claim "<sentence>"` | Check your sentence instead of the file's `description`. |
| `--claim-field <name>` | Check another top-level text field of the file. |
| `--json` | Print the full record, including the `notDone` list. |
| `--rpc <url>` | Another JSON-RPC endpoint. https only (plain http for localhost). |
| `--registry 0x…` `--chain-id N` | Another ERC-8004 deployment. The RPC's chain id must match, or nothing else is read. |
| `--ipfs-gateway <https url>` | Read an `ipfs://` agentURI through a gateway you choose. Without one it is `NOT_CHECKED`. |

Exit codes: `0` every check passed and the claim label is `pass`; `1` a check failed or the claim was vetoed;
`2` something was `NOT_CHECKED`; `3` bad usage. A `NOT_CHECKED` never exits 0.

## What a run looks like

Measured 2026-10-24 against Base Sepolia with `node examples/erc8004-read-only/read-agent.mjs 6705 --no-check`
(chain, registry code, owner, agentURI and the shape rows are live reads; the file is fetched from the agent's own URI):

```
chain             PASS
registry code     PASS (130 bytes, a proxy if small)
ownerOf           OWNER_FOUND 0xf6ee1768868c3266868edca78bc41c50309cb22a
agentURI          https://trustrepid.dev/agents/trinity-orch
registration      FETCHED 1040 bytes sha256 1943072704ecf2b9... from https://repid-engine-production.up.railway.app/api/v1/agents/trinity-orch/registration.json
  type            PASS
  image           SHOULD_MISSING - the text says type, name, description and image SHOULD be present for ERC-721 apps
  services        PASS - 3 endpoint(s); names are free-form in the text
  registrations   PASS - 1 entry
points back       MATCH
check             not-checked - --no-check: nothing was sent
exit 2
```

The same script on a stranger's agent (id 1, whose agentURI is a `data:` URI) gives `registrations SHOULD_MISSING`,
`points back ABSENT` and exit 2: the file is readable but nothing in it ties it back to token 1, so the script does
not say it checked out. An id that was never minted prints `ownerOf NO_TOKEN` and exits 1.

## What the five states mean

- **`PASS` / `OWNER_FOUND` / `MATCH`**: read, and it agreed with the EIP text.
- **`FAIL` / `MISMATCH` / `NO_TOKEN` / `REVERTED`**: read, and it did not.
- **`SHOULD_MISSING`** and **`ABSENT`**: a field the text says SHOULD be there, or shows in its example structure
  without making it individually mandatory. Not a failure. `ABSENT` on the back-reference stops the run from reporting a pass.
- **`NOT_CHECKED`**: not read, with the reason (RPC down, URL refused, `ipfs://` with no gateway, hosted check down).
  It is never shown as a pass.

"Points back" is the EIP's own link between the two halves: the registration file lists `{ agentId, agentRegistry }`
and the chain says which agent that id is. The script requires an entry with this id and `eip155:<chainId>:<registry>`.

## What it does NOT do

- It sends no transaction and cannot: the source has no signer, no key and no send method, and
  `tests/erc8004-read-only-example.test.ts` fails if one appears.
- It reads no reputation (`getClients`, `getSummary`, `readAllFeedback`) and posts no feedback.
- It reads no validation request or response. The Validation Registry has no published address for Base Sepolia in
  the reference repo's README, and the repo marks that registry as still being revised.
- It does not call the agent's service endpoints, so "this agent works" is `NOT_CHECKED`.
- It does not check the optional `/.well-known/agent-registration.json` domain proof.
- It does not prove the file is the one the owner meant: an `https` agentURI can be changed by whoever controls the
  host, and the script prints the file's sha256 so you can see when it changes, not so you can trust it.
- It is not a Sybil check, and not an endorsement of any agent.

## The registry is not ours

`0x8004A818BFB912233c491871b3d84c89A494BD9e` is the shared testnet singleton listed in
[erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts) for Base Sepolia and many other
testnets. TrustShell did not deploy it and does not control it. See `docs/integrations/erc-8004-x402-openclaw.md`
and the conformance report for what the deployed code exposes against the EIP.

## The hosted check, and what a hostile agentURI can do

- The `check` step sends **one sentence**, with keys and personal-data formats removed first, to the TrustShell
  backend (`POST /api/v1/classify`, the same call as `trustshell check "<sentence>"`). `--no-check`, `OFFLINE=1` and
  `TRUSTSHELL_LOCAL_ONLY=1` send nothing. If the file does not point back to the agent you asked about, its text is
  not sent (unless you pass `--claim` yourself).
- The sentence comes from a file the agent's owner controls. Treat it as untrusted text. The label is about that
  sentence only; it says nothing about the agent.
- **The agentURI is chosen by whoever registered the agent**, so it is treated as hostile: `https` only, no private,
  loopback or link-local addresses (`--allow-local-uri` to read one on purpose), at most 3 redirects with each hop
  checked again, 256 KiB cap, 8 s timeout. **Not covered:** a public hostname that *resolves* to a private address
  (no DNS check), and a host that serves different bytes to different callers.

## Tests

`npm run verify` runs `tests/erc8004-read-only-example.test.ts` offline: a stubbed chain and stubbed hosts for every
branch above (one child process, about 45 scenarios, no socket), and the real CLI spawned against a loopback server with a
preload that rejects any fetch to a host other than `127.0.0.1`. More than a dozen ways of spelling a private address
(a trailing dot, decimal and hex IPv4, mapped and link-local IPv6, the private ranges) are refused before anything is fetched. The test was also run against the library with five defects injected on purpose
(a back-reference that always matches, a hole in the link-local range, a not-checked claim counted as clean, a zero
owner accepted, the size cap off); it failed on each. The three selectors the script hard-codes are
recomputed with `ethers` in the test.
