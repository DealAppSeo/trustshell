# Guard + Carry on two hosts: a demo you can run

Your agent changes hosts, or models. The owner's policy should still hold, the context the owner chose should
arrive, and each host should keep its own record of what it allowed and refused. This demo does exactly that,
on your machine, and then shows you each place where that promise stops. It takes under a minute on our
Windows machine (24 to 65 s, measured); the first start of the copied node binary waits for the virus scanner.

Guard + Carry is on `main` and not yet in a published release, so run it from a clone.

## Run it

Node 22.13 or later. These lines work the same in bash, zsh and PowerShell:

```bash
git clone https://github.com/DealAppSeo/trustshell
```

```bash
cd trustshell
```

```bash
npm ci --ignore-scripts
```

```bash
node demo/guard-carry/run.mjs
```

| option | what it does |
|---|---|
| `--keep` | keep the temp folder with the three homes and print where it is, so you can read the policies, bundles and ledgers yourself |
| `--cli <path>` | run against another build's `dist/cli/index.js`, for example an installed package's |

**What it touches.** One new temp folder, removed at the end unless you pass `--keep`. Inside it: one home
per host (each its own `HOME`, `TRUSTSHELL_HOME` and working folder) and the `node` binary under two names,
`reader` and `deleter` (links where your OS allows; on Windows, one copy and a hard link to it). It never reads
or writes your own `~/.trustshell`. Every command runs with the OS basics only (`PATH`, temp folders), so no key or token in your
environment reaches it. Every TrustShell process starts with `demo/guard-carry/no-network.cjs` preloaded, which
refuses and logs any TCP connection or host lookup; the demo fails if the log is not empty.

**Exit codes.** `0` every step and every line about authority and limits held. `1` one did not; the demo prints
which, with what the CLI said. `2` NOT_CHECKED: no CLI at the path, or the MCP server could not be asked.

## The six steps

| step | host | commands |
|---|---|---|
| 1 the owner sets a policy and chooses what context travels | A | `guard init`, `guard allow tool:reader`, `guard sign`, `profile add ...`, `remember --trusted ...` twice |
| 2 an allowed read runs, a forbidden delete is refused before it starts | A | `run --tool reader -- reader read.js`, `run --tool deleter -- deleter delete.js` |
| 3 the bundle is exported and verified | A, then B | `bundle export bundle.json --note 1`, then on B `bundle verify` with and without `--signer` |
| 4 the approved context is imported and the policy takes effect | B | `bundle import bundle.json --signer <fingerprint>`, `guard show`, `bundle context` |
| 5 the same forbidden delete is refused | B | the same two `run` commands |
| 6 both hosts' records are read back | A, B | `guard show --json` and each `guard-receipts.jsonl` |

Two homes are two hosts. Copying `bundle.json` between them is the transfer; on two real machines you would copy
the same file and pass the same fingerprint. No model is involved: what a model would be handed is printed
(`bundle context`), and the guard's decisions never depend on what a model does with it.

## Expected output

Keys, hashes and the expiry date differ on every run. Everything else is what you should see.
`tests/guard-carry-demo.test.ts` runs the demo in CI and fails if anything else in this block differs.

<!-- demo-output:start -->
```text
TrustShell Guard + Carry: one owner policy, carried from Host A to Host B. No model, no credentials.
Each host is a separate TrustShell home on this machine. reader and deleter are two named copies
of the node binary, so the guard can tell them apart by name.

1  The owner sets a policy and chooses what context travels (Host A)
   guard init, guard allow tool:reader, guard sign
   policy 9da231d8bc4f…, nonce 2, signed by Host A's install key 1df2da072e47…
   tool:reader is listed; tool:deleter is not, so it is denied
   profile: one value, one constraint. Two notes written; the owner selects note 1 to carry

2  Host A runs the allowed read and refuses the forbidden delete
   run --tool reader   ALLOWED, started, exited 0 (summary.txt written)
   run --tool deleter  DENIED before it started, exit 5: the owner policy does not list tool:deleter
   precious.txt is still there

3  The bundle is exported (Host A) and verified (Host B)
   Host A  bundle export --note 1   the profile, the policy by hash with its signature, the one
                                    selected note, and a pointer to Host A's guard ledger
           the CLI says: A bundle is signed, NOT encrypted: anyone with the file can read it. Keep it out of git and shared folders.
   Host B  bundle verify            NOT_CHECKED, exit 2: no key named, so nothing is trusted
   Host B  bundle verify --signer   VERIFIED, signed by 1df2da072e47…; the policy WOULD BE ENFORCED here

4  Host B imports the approved context and establishes its effective policy
   before the import       run --tool reader: NOT_CHECKED, exit 2 (no policy here, nothing is authorized)
   bundle import --signer  policy ENFORCED; profile written; 1 note stored untrusted, in quarantine
   guard show              policy 9da231d8bc4f…, nonce 2, signed by 1df2da072e47…: the same policy as Host A
   bundle context          what a model on Host B is handed:
     | # The person this agent works for (from their signed TrustShell bundle)
     |
     | Values, most important first:
     | 1. answer in plain language
     |
     | Constraints that must hold:
     | 1. never delete project files without asking
     |
     | Trust settings: autonomy ask_first; confidence gate 0.8; human-in-the-loop gate 70
     |
     | Owner policy (enforced by the harness, not by you; anything not listed is denied):
     | - allowed actions: tool:bundle, tool:ground, tool:init, tool:inspect, tool:learn, tool:profile, tool:quarantine, tool:recall, tool:redact, tool:remember, tool:report, tool:traps, tool:reader
     | - limits: per action 0, per day 0, in total 0 (smallest units)
     | - expires: 2026-11-21T18:11:06.000Z
     |
     | Notes they chose to carry:
     | - precious.txt is the project file the owner never wants deleted

5  Host B refuses the same forbidden delete
   run --tool reader   ALLOWED, started, exited 0
   run --tool deleter  DENIED before it started, exit 5: the owner policy does not list tool:deleter

6  Both hosts wrote evidence, and every record says what it did not see
   Host A  guard-receipts.jsonl, 12 records, chain INTACT
           record 9 tool:reader ALLOWED; record 10 it exited 0
           record 11 tool:deleter DENIED, executed "not run", under the policy signed by 1df2da072e47…
   Host B  guard-receipts.jsonl, 6 records, chain INTACT
           record 4 tool:reader ALLOWED; record 5 it exited 0
           record 6 tool:deleter DENIED, executed "not run", under the policy signed by 1df2da072e47…
   each record lists what it did not see, e.g. "commands run without `trustshell run`"
   the bundle points at Host A's ledger by record 12's hash: the hash travels, the records do not

What this shows, and what it does not. Each line was exercised just now; the demo exits 1 if one
did not hold.
HELD  owner-signed: the policy carries a signature by Host A's install key 1df2da072e47…. Host B enforced it only because its operator named that key (--signer); without it, NOT_CHECKED. That fingerprint must reach Host B by a channel you trust: the bundle naming its own author proves nothing. One changed word in the file: REFUSED. A record names a key, not a person.
HELD  mediated paths only: the guard decides for `trustshell run` (the deleter, exit 5) and for TrustShell's own commands at the CLI gate (`remember`, exit 5, once the owner denied tool:remember). Nothing else.
HELD  not mediated: an MCP `remember` call wrote note 3 on Host A while the policy denied tool:remember (stored untrusted, in quarantine), and the deleter, started directly instead of through TrustShell, deleted precious.txt on Host B. The guard sees only what goes through it.
HELD  signed, not encrypted: the carried note reads as plain text in bundle.json; the note the owner did not select is not in it. Anyone with the file can read it.
HELD  a declaration is not authorization: the delete labelled `--class read`, and the deleter started as `--tool reader`, were both refused. A model is told the policy is "enforced by the harness, not by you"; what it says about its own permission changes nothing.
HELD  whoever runs the CLI as the owner can change the policy: on Host B `guard allow tool:deleter` needed no key and no password: the owner signature was dropped and the next delete ran. On Host A the same edit plus `guard sign` re-signed it with the install key, and a third host trusting that key enforced it and ran the delete. The signature says which key signed, not that the owner meant it. Each change was recorded with the policy hash before and after; none was prevented.
HELD  no network: every TrustShell process ran with TCP connects and host lookups refused and logged: 0 attempt(s).

RESULT  steps 1-6 held; 7 of 7 lines above held
```
<!-- demo-output:end -->

## What it shows, and what it does not

Each line the demo prints at the end is backed by something it just did, so it cannot go stale silently: if the
behaviour changes, the demo exits 1 and its test fails until the sentence is changed to match.

- **Owner-signed.** `guard sign` signs the policy with this install's key: a file in the TrustShell home on
  Host A. Host B enforces the policy only because its operator named that key's fingerprint with `--signer`;
  without it, nothing is imported. The fingerprint has to reach Host B some way you trust: the bundle names its
  own author, and that alone proves nothing. Change one word of the file and it is refused. A record names a
  key, never a person.
- **Mediated paths only.** The guard decides for `trustshell run` and for TrustShell's own commands (the CLI
  gate). That is all it decides for.
- **Not mediated.** The MCP server (`trustshell-mcp`) does not read the policy yet: the demo writes a note over
  MCP while the policy denies `tool:remember`, and it is stored (untrusted, in quarantine). A command started
  without TrustShell is not seen at all: the demo deletes the file the policy protects by starting `deleter`
  directly. Code that imports the package is outside the guard too (`guard show` says so); the demo does not
  exercise that.
- **Signed, not encrypted.** Anyone with `bundle.json` can read it; the note the owner selected is plain text
  in the file. Only what the owner selects travels: the second note is not in it.
- **A declaration is not authorization.** Labelling the delete `--class read`, or starting `deleter` as
  `--tool reader`, is refused. The context handed to a model says the policy is enforced by the harness, not by
  the model. What a model says about its own permission changes nothing.
- **Whoever runs the CLI as the owner can change the policy.** On Host B, `guard allow tool:deleter` needs no key
  and no password; the signature is dropped and the delete runs. On Host A, the same edit followed by
  `guard sign` re-signs it with the install key, and a third host that trusts that key enforces it. So the
  signature says which key signed, not that the owner meant it, and the guard stops a mistaken command, not an
  agent that can run the CLI itself. Every change is recorded with the policy hash before and after; none is
  prevented. Whether to require more than "can run the CLI as the owner" to change a policy is an open design
  decision.
- **No network.** Observed, not assumed: every TrustShell process ran with connections refused and logged.

`trustshell guard show` prints the full list of what the guard does not cover, on any host with a policy.
