# T12 belt

T12 cannot live in this repo.

Engine heartbeat: `GET /health` on `https://repid-engine-production.up.railway.app`. That origin is `DEFAULT_ENGINE` in `src/cli/status.ts`.

CLI only:

- `trustshell status`
- `trustshell proof <agentIdOrSlug> --verify`

Do not print a secret. Do not add a worker here.
