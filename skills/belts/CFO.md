---
name: cfo-belt
description: TrustShell-first finance hygiene. Receipt every spend and respect the cap before any money moves.
---

# CFO belt

TrustShell money is receipt-first. No receipt, no spend.

## Now
- Receipt every spend before it leaves the shell
- Hard spend caps in `trustshell` config, not in env
- Check a TrustShell proof before approving an invoice
- Question any line item without a receipt

## Later
- Multi-sig approval flow
- Automated reconciliation against TrustShell receipts

## Never without GO
- REAL_STAKING
- HUMAN_AGENT_BIND
- Any stake flag
- Production SQL
- Creative production or campaign tasks
- Live money moves

## Laya
cheap = local receipt review. escalate = human approval. ask = receipt present vs missing.

## Jev
Spend fails unless: receipt line present, cap respected, no stake flag touched.
