# HyperDAG Mini-Agent

Zero-to-one trust-wrapped AI agent. One Node script, no build step, free-tier everything.

**What it shows:**
1. LLM call via Groq free tier (llama-3.1-8b-instant, OpenAI-compat endpoint)
2. HAL hallucination gate — `verifyOutput()` blocks vetoed outputs
3. RepID reputation score + Plonky3 ZKP range proof with client-side WASM verification
4. ERC-8004 on-chain identity lookup on Base Sepolia (read-only RPC, no wallet needed)

## Quick start (60 seconds)

```sh
git clone https://github.com/DealAppSeo/trustshell
cd trustshell/examples/mini-agent
cp .env.example .env
# Edit .env: add GROQ_API_KEY (free at https://console.groq.com)
npm install
npm start
```

No GROQ_API_KEY? Run without it — the LLM step uses a mock response so you can still
exercise the HAL gate, RepID fetch, and ZKP proof path:

```sh
npm start   # prompts for input; press Enter to use the built-in demo prompt
```

## Free-tier deploy recipe

| Platform | What to do | Cost |
|---|---|---|
| **Railway** | `railway up` from this dir; set `GROQ_API_KEY` as env var | Free hobby tier |
| **Vercel** (functions) | Deploy as a Node.js serverless function | Free tier |
| **GitHub Codespaces** | Open repo, run `npm install && npm start` in terminal | Free 60h/month |
| **Fly.io** | `fly launch --no-deploy`, set secret, `fly deploy` | Free machines |

## File structure

```
examples/mini-agent/
  agent.mjs        Main agent script (plain ESM, no build needed)
  package.json     Dependencies + start script
  .env.example     Env var template
  README.md        This file
```

## Wiring map (agent.mjs line references)

| Capability | Function | Lines |
|---|---|---|
| LLM (Groq free tier) | `callGroqLLM()` | ~29-60 |
| SDK init + health check | `TrustShell.init()` | ~77-84 |
| HAL gate (Gate-OFF mode) | `client.verifyOutput()` | ~110-127 |
| RepID fetch | `client.getRepID()` | ~131-136 |
| ZKP proof + WASM verify | `client.presentProof({ verify: true })` | ~139-160 |
| ERC-8004 identity lookup | `lookupERC8004Identity()` | ~38-65 / ~163-180 |
| Subscribe to events | `client.subscribe('verdict'/'proof', ...)` | ~87-92 |

## ANFIS routing seam

The `callGroqLLM` function is the **LLM provider seam**. In production, HyperDAG routes
through ANFIS (Adaptive Neuro-Fuzzy Inference System) with learned weights per provider:
- Groq: 0.92 (cheapest-competent for factual tasks)
- Cerebras: 1.0 (fastest, higher weight)
- DeepSeek: 0.70 (good for reasoning)

To plug in a different provider, replace `callGroqLLM` with any function matching:
`async function callLLM(prompt: string): Promise<string>`

## ERC-8004 on-chain registration (staged path)

The `lookupERC8004Identity()` function does a **read-only** RPC call. The write path
(registering a new agent on-chain) is staged as a comment block inside that function.
It requires:
- A funded Base Sepolia wallet key (`ERC8004_PRIVATE_KEY`)
- The `ethers` package (`npm install ethers`)
- The `register(agentUri)` call to IdentityRegistry at `0x8004A818BFB912233c491871b3d84c89A494BD9e`

This is Tier-3 (on-chain send) and intentionally not automated here. See `DECISIONS.md` D-065.

## Honest gaps

- **Live LLM**: needs `GROQ_API_KEY` (free at console.groq.com). Without it, uses a mock string.
- **HAL availability**: depends on the repid-engine backend being up. If unreachable, HAL is skipped gracefully.
- **ZKP proof bytes**: a real Plonky3 proof requires the zkp-postcard prover to have emitted one for this agent. If proofBytes is empty, the statement is still fetched (and the WASM verifier reports "no proof bytes").
- **ERC-8004 lookup**: requires `ERC8004_TOKEN_ID` to be set. Without it, shows the registration path comment.
- **A2A (executeA2A)**: not demonstrated here — V1-scoped to one-agent flow per the sprint brief.

## License

Apache-2.0
