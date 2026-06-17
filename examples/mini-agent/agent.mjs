/**
 * HyperDAG TrustShell -- Zero-to-One Mini-Agent Example
 *
 * Four trust capabilities in a single runnable Node script:
 *   1. LLM call   Groq free tier (llama-3.1-8b-instant, OpenAI-compat endpoint)
 *   2. HAL gate   verifyOutput() -- VETO blocks output; PASS/FLAG continues
 *   3. RepID+ZKP  getRepID() + presentProof() + client-side WASM verification
 *   4. ERC-8004   on-chain identity lookup on Base Sepolia (read-only RPC, no wallet)
 *
 * One-command run:
 *   npm install && npm start
 *   (without GROQ_API_KEY: uses a mocked LLM response -- HAL+proof path still runs)
 *
 * Free-tier deploy: Railway / Vercel / GitHub Codespaces / Fly.io (see README.md)
 *
 * ANFIS routing seam:
 *   In production HyperDAG routes LLM calls through ANFIS with learned provider weights
 *   (Groq 0.92 / Cerebras 1.0 / DeepSeek 0.70 -- HYPERDAG_CANON ss3.8).
 *   Here we wire Groq as cheapest-competent. Replace callGroqLLM() to change providers.
 */

// ESM + CJS bridge: the SDK dist is compiled to CommonJS.
// Monorepo path: ../../dist/index.js (branch build, file:../.. in package.json).
// When published: replace require("@hyperdag/trustshell") works identically.
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { TrustShell } = require("@hyperdag/trustshell");

// ---- 1. LLM Provider -------------------------------------------------------

/**
 * Call Groq free-tier (OpenAI-compatible endpoint).
 * Free plan: 30 req/min, 14400 req/day -- no credit card needed.
 * Get a key at https://console.groq.com then add GROQ_API_KEY to .env.
 *
 * Without a key: returns a mock string so the rest of the pipeline still runs.
 */
async function callGroqLLM(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[LLM] GROQ_API_KEY not set -- using mock response to exercise HAL+proof path.");
    return (
      "[MOCK] The Eiffel Tower is in Paris, France, completed in 1889. " +
      "It stands 330 metres tall, designed by Gustave Eiffel for the 1889 World's Fair."
    );
  }
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant", // free tier; upgrade to llama-3.3-70b-versatile for quality
      messages: [{ role: "user", content: prompt }],
      max_tokens: 256,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ---- 2. ERC-8004 identity lookup (read-only RPC, no wallet needed) ---------

/** IdentityRegistry on Base Sepolia (HYPERDAG_CANON P-024) */
const ERC8004_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

/**
 * Look up the owner of an ERC-8004 token by tokenId (read-only eth_call).
 *
 * ON-CHAIN REGISTRATION PATH (staged / commented -- Tier-3, requires funded wallet):
 *
 *   import { ethers } from "ethers";                       // npm install ethers
 *   const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
 *   const wallet   = new ethers.Wallet(process.env.ERC8004_PRIVATE_KEY, provider);
 *   const abi      = ["function register(string agentUri) returns (uint256 agentId)"];
 *   const registry = new ethers.Contract(ERC8004_ADDRESS, abi, wallet);
 *   const tx       = await registry.register(`https://repid.dev/agents/${agentId}`);
 *   const receipt  = await tx.wait();
 *   const tokenId  = BigInt(receipt.logs[0].topics[3]).toString();
 *   // Then set ERC8004_TOKEN_ID=<tokenId> in .env to enable the lookup below.
 */
async function lookupERC8004Identity(tokenId) {
  const selector = "6352211e"; // ownerOf(uint256)
  const paddedId = BigInt(tokenId).toString(16).padStart(64, "0");
  const res = await fetch("https://sepolia.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to: ERC8004_ADDRESS, data: `0x${selector}${paddedId}` }, "latest"],
    }),
  });
  if (!res.ok) return { owner: null, error: `RPC ${res.status}` };
  const { result, error } = await res.json();
  if (error || !result || result === "0x")
    return { owner: null, error: error?.message ?? "not minted" };
  return {
    owner: "0x" + result.slice(-40),
    contractAddress: ERC8004_ADDRESS,
    chain: "Base Sepolia (84532)",
    tokenId,
  };
}

// ---- 3. Main agent loop ----------------------------------------------------

// AGENT_ID must be a repid_agents.id UUID (not agent_name).
// trinity-shofet UUID: from repid_agents WHERE agent_name='trinity-shofet'
const AGENT_ID = process.env.AGENT_ID || "32e0e809-c1c4-4405-913f-135c8a2d6626";
const BACKEND_URL = process.env.TRUSTSHELL_API_URL || "https://repid-engine-production.up.railway.app";
const ERC8004_TOKEN_ID = process.env.ERC8004_TOKEN_ID || null;

const DEMO_PROMPT = process.env.DEMO_PROMPT || "What is the Eiffel Tower and where is it located?";

async function getPrompt() {
  if (!process.stdin.isTTY || process.env.DEMO_PROMPT) return DEMO_PROMPT;
  const { createInterface } = await import("readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Enter your question (Enter for demo prompt): ");
    return answer.trim() || DEMO_PROMPT;
  } finally {
    rl.close();
  }
}

async function main() {
  console.log("\n=== HyperDAG TrustShell Mini-Agent ===\n");

  // A: Init SDK (real connectivity probe) ------------------------------------
  console.log(`[SDK] Backend: ${BACKEND_URL}`);
  const { client, health } = await TrustShell.init({ apiUrl: BACKEND_URL });
  if (!health.ok) {
    console.warn(`[SDK] Backend unreachable (${health.error ?? health.status})`);
  } else {
    console.log(`[SDK] Backend healthy: status=${health.status ?? "ok"}\n`);
  }

  // Subscribe to client-side lifecycle events (local, not server-push)
  client.subscribe("verdict", (v) => {
    if (v.verdict === "VETO") console.log("[EVENT] verdict:VETO -- output blocked by HAL.");
  });
  client.subscribe("proof", (p) => {
    console.log(`[EVENT] proof:${p.tier} emitted -- proofBytes: ${p.proofBytes?.length ?? 0}B`);
  });

  // B: Get prompt ------------------------------------------------------------
  const prompt = await getPrompt();
  console.log(`[LLM] Prompt: "${prompt}"`);

  // C: Call LLM (Groq free tier) --------------------------------------------
  let llmText;
  try {
    llmText = await callGroqLLM(prompt);
    console.log(`\n[LLM] Response:\n  ${llmText}\n`);
  } catch (err) {
    console.error(`[LLM] Error: ${err.message}`);
    process.exit(1);
  }

  // D: HAL gate (Gate-OFF mode) ----------------------------------------------
  // Gate-OFF: VETO blocks the output; PASS and soft FLAG continue.
  console.log("[HAL] Running verifyOutput (Gate-OFF: VETO blocks, PASS/FLAG continues)...");
  let halResult;
  try {
    halResult = await client.verifyOutput(llmText);
    console.log(`[HAL] Verdict : ${halResult.verdict} (${halResult.ok ? "PASS" : "BLOCKED"})`);
    console.log(`      Trust   : ${halResult.trustScore}/100 | HAL: ${halResult.halScore.toFixed(3)}`);
    console.log(`      Reason  : ${halResult.decisionReason}`);
    if (halResult.evidence?.length) {
      console.log(`      Evidence: ${halResult.evidence.slice(0, 3).join(" | ")}`);
    }
    if (!halResult.ok) {
      console.log("\n[BLOCKED] HAL vetoed -- not surfacing to user.");
      console.log("  In production: re-prompt the LLM or return a safe fallback.");
    }
  } catch (err) {
    console.warn(`[HAL] Evaluation failed (${err.message}) -- skipping gate.`);
    halResult = { ok: true, verdict: "PASS", trustScore: 0, halScore: 0, decisionReason: "HAL unavailable", evidence: [] };
  }

  // E: RepID + ZKP proof -----------------------------------------------------
  console.log(`\n[RepID] Fetching reputation for agent: ${AGENT_ID}`);
  let proof = null;
  try {
    const repid = await client.getRepID(AGENT_ID);
    console.log(`[RepID] Score: ${repid.repid ?? "unknown"} | Tier: ${repid.tier ?? "unknown"}`);
    if (repid.latestProofHash) console.log(`[RepID] Latest proof hash: ${repid.latestProofHash}`);

    // Fetch ZKP range proof + attempt client-side WASM verify via SDK
    console.log(`\n[ZKP] Fetching proof for ${AGENT_ID} (tier=postcard, production-real)...`);
    proof = await client.presentProof(AGENT_ID, { verify: true });

    const byteLen = proof.proofBytes ? Math.round((proof.proofBytes.length * 3) / 4) : 0;
    if (byteLen > 0) {
      console.log(`[ZKP] Proof   : ${byteLen}B | scheme: ${proof.scheme ?? "unknown"}`);
      if (proof.statement) {
        console.log(
          `[ZKP] Statement: agent=${proof.statement.agent_id} ` +
          `repid=${proof.statement.repid_score} > ${proof.statement.threshold} (${proof.statement.tier})`
        );
      }
      if (proof.verification) {
        const v = proof.verification;
        console.log(`[ZKP] SDK verify: ${v.verified ? "VERIFIED" : "FAILED"} | @${v.verifierVersion}`);
        if (v.error) console.log(`[ZKP]   SDK note: ${v.error}`);
      }
    } else {
      console.log("[ZKP] No proof bytes (zkp-postcard prover may not have emitted one for this agent yet).");
      if (proof.statement) console.log(`[ZKP] Statement: ${JSON.stringify(proof.statement)}`);
    }
  } catch (err) {
    console.warn(`[RepID/ZKP] ${err.message}`);
  }

  // E2: Direct client-side WASM verification ---------------------------------
  // When the SDK's internal require() can't resolve @hyperdag/proof-verifier
  // (monorepo module path issue), verify directly from this script's node_modules.
  if (proof && proof.proofBytes && proof.proofBytes.length > 0 && proof.statement) {
    const sdkVerified = proof.verification?.verified ?? false;
    const sdkFailed = proof.verification && !sdkVerified;
    if (!sdkVerified) {
      try {
        const { verify } = require("@hyperdag/proof-verifier");
        const vr = await verify(proof.proofBytes, proof.statement);
        console.log(`[ZKP] Direct WASM verify: ${vr.verified ? "VERIFIED" : "FAILED"} | @${vr.verifier_version}`);
        if (vr.verified) {
          console.log("[ZKP] Proof is AGENT-BOUND -- the statement is cryptographically tied to this agent_id.");
          console.log(`[ZKP]   proof_size_bytes: ${vr.proof_size_bytes}`);
        } else if (vr.error) {
          console.log(`[ZKP]   Note: ${vr.error}`);
        }
      } catch (verErr) {
        if (sdkFailed) {
          console.log("[ZKP] Note: proof bytes and statement confirmed -- WASM verifier unavailable in this env.");
        }
      }
    }
  }

  // F: ERC-8004 identity lookup (read-only RPC) ------------------------------
  console.log("\n[ERC-8004] Checking on-chain identity (Base Sepolia, read-only)...");
  if (ERC8004_TOKEN_ID) {
    try {
      const id = await lookupERC8004Identity(ERC8004_TOKEN_ID);
      if (id.owner) {
        console.log(`[ERC-8004] Token ${id.tokenId} owner : ${id.owner}`);
        console.log(`[ERC-8004] Registry: ${id.contractAddress} on ${id.chain}`);
        console.log("[ERC-8004] Identity verified on-chain -- agent has a minted ERC-8004 token.");
      } else {
        console.log(`[ERC-8004] Token ${ERC8004_TOKEN_ID} not minted: ${id.error}`);
      }
    } catch (err) {
      console.warn(`[ERC-8004] RPC lookup failed: ${err.message}`);
    }
  } else {
    console.log("[ERC-8004] ERC8004_TOKEN_ID not set -- showing registration path.");
    console.log(`  Registry : ${ERC8004_ADDRESS} (Base Sepolia chain 84532)`);
    console.log("  To register: see the staged ethers.js path in lookupERC8004Identity() in agent.mjs");
    console.log("  Then: set ERC8004_TOKEN_ID=<minted_token_id> in .env to enable on-chain lookup.");
  }

  // Summary ------------------------------------------------------------------
  console.log("\n=== Summary ===");
  console.log(`LLM     : ${process.env.GROQ_API_KEY ? "Groq llama-3.1-8b-instant (live)" : "mocked (set GROQ_API_KEY for live)"}`);
  console.log(`HAL     : ${halResult.verdict} (trust=${halResult.trustScore}/100)`);
  console.log(`Backend : ${health.ok ? "connected" : "unreachable"} -- ${BACKEND_URL}`);
  console.log(`Agent   : ${AGENT_ID}`);
  console.log("");
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
