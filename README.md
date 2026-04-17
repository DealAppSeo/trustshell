    <div align="center">

# TrustShell

**Constitutional protection for any AI agent. Drop in. No rearchitecting.**

[![npm](https://img.shields.io/badge/npm-%40hyperdag%2Ftrustshell-EF4444?style=flat-square)](https://npmjs.com/package/@hyperdag/trustshell)
[![Live](https://img.shields.io/badge/Site-trustshell.dev-000000?style=flat-square)](https://trustshell.dev)
[![ERC-8004](https://img.shields.io/badge/Standard-ERC--8004-6B46C1?style=flat-square)](https://eips.ethereum.org/EIPS/eip-8004)
[![License](https://img.shields.io/badge/License-Apache_2.0-3B82F6?style=flat-square)](LICENSE)
[![HyperDAG](https://img.shields.io/badge/Protocol-HyperDAG-F59E0B?style=flat-square)](https://github.com/DealAppSeo/hyperdag-protocol)

*The constitutional layer between your agent and the world.*
*Wraps any agent. Blocks hallucinations. Builds trust.*

</div>

---

## The Problem

AI agents execute. The frameworks — LangChain, CrewAI, AutoGen, OpenClaw — give agents tools, memory, and orchestration. **None of them stop an agent that's wrong.**

When dissonance between agent signals is high enough that action is dangerous, nothing catches it. The agent executes. Something breaks. Nobody is accountable.

TrustShell is the fail-closed constitutional filter that sits between your agent and execution.

---

## How It Works

```
                    Your Agent
                        │
                        │  wants to act
                        ▼
            ┌───────────────────────┐
            │      TrustShell       │
            │                       │
            │  1. HAL-RINS audit    │◄── Pythagorean Comma veto
            │  2. ZKP attestation   │◄── on-chain proof stub
            │  3. RepID check       │◄── earned trust required
            │  4. HITL gate         │◄── human approval if needed
            └──────────┬────────────┘
                       │
              ┌────────▼────────┐
              │                 │
           APPROVED           BLOCKED
              │                 │
         Agent acts        "This pause
                           protected you"
                           (logged on-chain)
```

**Five hardcoded blocked action classes — no configuration, no override:**

| Class | Example | Why Blocked |
|-------|---------|-------------|
| `IRREVERSIBLE_DESTRUCTIVE` | Delete database, factory reset | Cannot be undone |
| `FINANCIAL_TRANSFER` | Move funds, sign transactions | Requires human confirmation |
| `CREDENTIAL_ACCESS` | Read secrets, API keys | Privilege escalation risk |
| `OUTBOUND_INSTALL` | `npm install` untrusted package | Supply chain attack vector |
| `PRIVILEGE_ESCALATION` | `sudo`, admin access requests | Lateral movement risk |

---

## The Math

**Pythagorean Comma Veto** — derived from music theory:

```
When you stack 12 perfect fifths (3/2 ratio each), you expect
to return to the same note 7 octaves higher.

You don't. The gap is:

(3/2)^12 / 2^7 = 531441/524288 ≈ 1.013643

This 1.36% gap is the Pythagorean Comma.
In TrustShell, it's the constitutional veto threshold.

HAL Dissonance Score:
  totalDissonance = (
    0.40 × harm_potential +
    0.30 × epistemic_uncertainty +
    0.20 × evidence_quality +
    0.10 × action_scope
  ) × (531441/524288)

  totalDissonance > 0.48  →  VETO
  totalDissonance < 0.48  →  APPROVE
```

**Production evidence:**
```
2,600 constitutional evaluations (SOPHIA agent, April 2026)
2,585 REFUSED  — veto held during elevated dissonance
   15 APPROVED — only during Extreme Fear market conditions
  714 capital protection events logged to RepID
```

---

## Quick Start

```bash
npm install @hyperdag/trustshell
```

```typescript
import { TrustShell } from '@hyperdag/trustshell';

const shell = new TrustShell({
  agentId: 'YOUR_AGENT_ID',
  profile: 'balanced',        // 'conservative' | 'balanced' | 'aggressive'
  hitlEnabled: true,          // human approval for borderline decisions
  onVeto: (reason) => {
    console.log('This pause protected you:', reason);
  }
});

// Wrap your existing agent action
const result = await shell.evaluate({
  action: 'transfer_funds',
  amount: 500,
  destination: '0x...',
  context: agentContext
});

if (result.approved) {
  await executeAction(result.action);
} else {
  // Veto fired — result.proof contains on-chain evidence
  await logProtectionEvent(result.proof);
}
```

**Three permission profiles:**

| Profile | Unity Threshold | Use Case |
|---------|----------------|----------|
| `conservative` | > 0.95 | High-stakes financial, medical |
| `balanced` | > 0.88 | General autonomous agents |
| `aggressive` | > 0.80 | Research, sandboxed environments |

All three profiles enforce the five blocked action classes unconditionally.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      TrustShell                             │
│                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐  │
│  │  BFTEngine  │   │ VetoEngine  │   │  ComplianceRecpt │  │
│  │             │   │             │   │                 │  │
│  │ Byzantine   │   │ Pythagorean │   │ HMAC-signed     │  │
│  │ fault       │   │ Comma       │   │ audit receipt   │  │
│  │ tolerance   │   │ threshold   │   │ per decision    │  │
│  └─────────────┘   └─────────────┘   └─────────────────┘  │
│                                                             │
│  ┌─────────────┐   ┌─────────────┐                        │
│  │ KYAValidator│   │ZKPAttestat. │                        │
│  │             │   │             │                        │
│  │ Know Your   │   │ ZKP proof   │                        │
│  │ Agent check │   │ stub (EAS)  │                        │
│  └─────────────┘   └─────────────┘                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ integrates with
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   repid-engine API                          │
│        Behavioral scoring + HAL telemetry + on-chain        │
└─────────────────────────────────────────────────────────────┘
```

---

## HITL Bridge

TrustShell includes a Telegram HITL (Human-in-the-Loop) bridge for decisions in the approval grey zone:

```
dissonance < 0.20         →  auto-approve (silent)
dissonance 0.20 – 0.48   →  Telegram notification + 60s window
dissonance > 0.48         →  auto-veto (no human override)
```

```typescript
const shell = new TrustShell({
  hitlEnabled: true,
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    timeoutMs: 60000
  }
});
```

---

## The Latency Story

TrustShell turns evaluation latency into trust signals:

```
< 50ms    "Approved"              (high harmony, fast pass)
50-200ms  "Checking scope..."     (moderate evaluation)
200-800ms "Constitutional review" (deep analysis)
> 800ms   → triggers HITL         (human review requested)
```

---

## Compliance

TrustShell is designed for:

| Standard | How TrustShell Helps |
|----------|---------------------|
| EU AI Act (Aug 2026) | High-risk AI system audit trails + human oversight |
| Colorado AI Act (Jun 2026) | Algorithmic transparency + impact assessment |
| ERC-8004 | Agent identity anchoring + reputation scoring |

Every veto generates a compliance receipt:
```typescript
{
  decisionId: "0xabc...",
  agentId: "SOPHIA",
  action: "transfer_funds",
  dissonance: 0.589,
  vetoed: true,
  timestamp: "2026-04-17T02:32:38Z",
  merkleHash: "0xde0af80d...",
  zkpProof: "pending_dual_sign",
  erc8004Chain: "base-sepolia"
}
```

---

## Ecosystem

| Product | Purpose |
|---------|---------|
| **TrustShell** ← you are here | Drop-in constitutional protection |
| [TrustRepID](https://trustrepid.dev) | Agent behavioral score dashboard |
| [RepID](https://repid.dev) | Anonymous human identity portal |
| [TrustTrader](https://trusttrader.dev) | Constitutional AI trading |
| [TrustRails](https://trustrails.dev) | Enterprise KYA compliance |

**Built on:**
[ERC-8004](https://github.com/erc-8004/erc-8004-contracts) ·
[x402](https://github.com/x402-rs/x402-rs) ·
[HyperDAG Protocol](https://github.com/DealAppSeo/hyperdag-protocol)

---

## Status

| Component | Status |
|-----------|--------|
| `BFTEngine.ts` | ✅ Production |
| `VetoEngine` (Python) | ✅ Production |
| `ComplianceReceipt` | ✅ Production |
| `KYAValidator` | ✅ Production |
| `ZKPAttestation` | 🔄 Stubs live, full proofs pending |
| npm package `@hyperdag/trustshell` | 🔄 Publishing |
| HITL Telegram bridge | ✅ Wired |

---

<div align="center">

*Constitutional protection is not optional for autonomous agents.*
*It is the foundation that makes autonomy possible.*

*Micah 6:8 — act justly, love mercy, walk humbly.*

*Patents pending: P-004, P-005, P-011*

</div>
