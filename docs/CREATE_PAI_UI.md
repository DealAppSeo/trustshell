# CREATE_PAI_UI — canonical copy + behavior for /create (CC2, 2026-09-12)

Source of truth for the **user-facing copy and behavior** of the create-PAI page (`app/create/page.tsx`,
live at https://www.trustshell.dev/create). Verified against prod + the merged source. Companion to
`CREATE_PAI.md` (the conversation/flow spec). No version string is rendered (npm publishes 1.3.0).

## The flow (one field, one button)
Name → **Create** (`POST /api/v1/agents/register` with `origin: 'Site'`) → show agentId + apiKey **once**
→ Paris PASS / Rome **VETO hero** → RepID → optional interview (opt-in, one beat, max 3, skip default)
→ **Create a second PAI** (fresh register, new name = its own agent/store; never tools on #1).

Tour anchors (markup only, no tour logic shipped): `data-tour="name"` (name input), `data-tour="key"`
(apiKey value), `data-tour="veto"` (VETO hero line).

## Error / edge copy (the contract to match)
| case | trigger | exact copy |
|---|---|---|
| **empty name** | name blank (client-side, before any call) | `Give your PAI a name first.` |
| **name taken** | register status **409** (or a taken/conflict message) | `That name is taken — pick another.` |
| **rate-limited** | register status **429** | `That name is taken — pick another.` — *see caveat (a)* |
| other failure | non-2xx | `Register failed (<status>).` |
| backend URL unset | `NEXT_PUBLIC_REPID_ENGINE_URL` missing in the build | `Backend URL is not configured for this deploy (…).` |
| apiKey absent | register 2xx without `api_key` | renders `(not returned)` |
| **shown once** | after a fresh register | `Shown once. Copy the apiKey now — it is not stored server-side and will not be shown again.` |
| Rome not VETO | HAL `decision` ≠ vetoed (quorum not reached) | non-hero line: "Rome check returned <verdict> — … (not a failure of your PAI)." |

Empty/409/429 copy on prod **matches this table** [V source `lib/create-pai-parse.ts` + `app/create/page.tsx`].

### Caveats (honest, known)
- **(a) 429 is currently labeled "name taken."** Strictly 429 = rate-limit, not a duplicate. The merged
  parser (`parseRegister`, #141, CC1) collapses 409+429 into "name taken". Conservative, not wrong enough
  to block — and see (b).
- **(b) The engine's only duplicate defense is a per-IP anti-spam 429, NOT global name-uniqueness**
  [V 2026-09-12, repid-engine `src/routes/agents-external.ts`]. `checkAndRecordDedup(ip, name)` returns
  **429** for the *same name from the same IP within 24h* — so in that narrow case the "name taken" copy
  fires correctly. But a taken name from a **different** IP/context returns **201 Created with a new
  `agent_id`** [V live: repeated `"My PAI"` POSTs → 201, distinct ids]. So **201 is NOT reuse** (a fresh
  agent each time), and there is no global 409.
- **(c) Whether a taken name SHOULD 409 is a design decision, not a clean bug — flagged for Sean.** PAI
  names are *personal labels the user chooses*; global uniqueness would stop two unrelated users both
  naming their PAI "Atlas", and the identity key is `agentId`, not the name. repid-engine's CLAUDE-RULE-1
  requires show-what-exists + GO before changing `register`, and existing duplicate names are already in
  prod. So CC2 did **not** unilaterally ship a global-409 register change; the UI's `409 → "name taken"`
  branch is correct *if* the engine ever adopts it. Decision for Sean: keep non-unique personal names
  (then soften/keep the UI copy as-is), or enforce 409 (then the branch becomes live).

## Value events — page-path gap (documented, item 2)
`register_ok` / `VETO` / `cap_refuse` **value events are a device/CLI concept**: `scripts/init-pai.mjs`
writes them to `.trustshell/value-events.jsonl` via `scripts/value-events.mjs`. **The web `/create` page
does NOT (and cannot) write them** — a browser has no access to the on-device `.trustshell/` filesystem.
The page's equivalent "value moments" are shown in the UI instead: the **VETO hero** (the `VETO` moment)
and the **"What just happened"** summary (the `register_ok` moment). So: value-events fire on the **CLI
path**, not the page path — this is a boundary of the medium, not a bug. If a web-side value-events
ledger is ever wanted, it would POST to the backend (register + hal/evaluate already hit it), not write a
local file; that is a separate, unbuilt decision.

## CLI parity
`trustshell init --pai --name <n>` spawns `scripts/init-pai.mjs` (the live register path; #138, on main).
Bare `trustshell init` stays the **no-network** local scaffold by design (egress contract + tests).

---
*CC2 · 2026-09-12 · create+CLI lane. Copy verified vs prod + merged source. Do not render a version badge.*
