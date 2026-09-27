# Trust keys shape

A portable trust harness. Autonomy is earned.

Pointer only. This ticket adds no crypto.

An agent does not see a full key. `register()` returns `apiKey` once, on `RegisterResult` in `src/lib/trustshell.ts`, for the operator who stores it. Do not paste that value into a chat, a ticket, or a prompt.

The shape check that already exists is `src/lib/ingest.ts`: a prompt that asks to reveal a secret or an API key is refused. The paste ban is in [docs/WALKTHROUGH.md](./WALKTHROUGH.md).

Staking is not live.
