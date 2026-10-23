# Join kit

A portable trust harness. Autonomy is earned.

One screen for an ERC-8004 agent. Verify a claim. Read the receipt line.

```bash
npm i -g @hyperdag/trustshell@1.7.0
trustshell verify "The capital of France is Paris."
```

Receipt line, three words:

```text
glm cerebras FALSE
```

If the vote did not come back, the last word is NOT_CHECKED:

```text
openai openai NOT_CHECKED
```

Staking is on the Base Sepolia test network only. No mainnet or real-money stake.
