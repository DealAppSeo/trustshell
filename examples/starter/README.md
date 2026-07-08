# TrustShell starter

The smallest real TrustShell app — a keyless HAL verification against the **live**
HyperDAG backend. No API key, no wallet.

## Run it (two commands)

```bash
npm install
npm start
```

Expected output (live backend reachable):

```
✓ backend healthy (status=ok)

claim:      The capital of France is Paris.
verdict:    PASS
trustScore: 100
halScore:   0.000
evidence:   cerebras:TRUE (Paris is the official capital of France.)
```

(Exact `evidence` providers vary run-to-run with the live quorum.)

## Scaffold from this in one click

This repo is a **GitHub template** (Sean: enable via repo **Settings → Template repository**).
Once enabled, hit **Use this template → Create a new repository** to get your own copy of
this starter, or just copy the `examples/starter/` folder into a new project.

## What's next

- Edit the `claim` line in [`index.mjs`](./index.mjs) to verify your own agent's output.
- Reputation lookups (`getRepID`) are also keyless — see the repo [Quick start](../quickstart/QUICKSTART.md).
- The agent-to-agent **purchase** loop (needs an API key + funded Base Sepolia wallet) is in
  [`examples/a2a-purchase`](../a2a-purchase/).

## Where does `@hyperdag/trustshell` come from?

Any of the install points in the [root README](../../README.md#install-choose-one):
public npm, GitHub Packages, or straight-from-GitHub. This starter's `package.json` uses the
public npm default (`@hyperdag/trustshell`); swap the dependency line if you want a different source.
