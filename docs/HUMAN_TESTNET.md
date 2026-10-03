# Human testnet

Chain is Base Sepolia, chain id 84532. This is not mainnet.

1. Install: `npm i -g @hyperdag/trustshell@1.4.1`
2. Read `GET /api/v1/faucet/info` on the engine. `chain_id` is 84532. `dispenses` is false.
3. The faucet is external. The engine does not send ETH.
4. Fund a wallet from a faucet that response names. TrustShell does not send the ETH.
5. `trustshell verify "The capital of France is Paris."` needs no ETH.
6. `trustshell status` leaves can_stake shadow. No mainnet stake.
