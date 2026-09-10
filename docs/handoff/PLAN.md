# TrustShell MVP close — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this session: the named implementer runs inline after Sean says yes). Superpowers TDD is mandatory for any production change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the five MVP criteria true on this tree, with the smallest diff, without publishing and without papering over live limits.

**Architecture:** Almost all of the SDK/CLI/MCP already exists and is tested. This plan closes three measured gaps (quickstart does not call `getRepID` and cannot resolve the package from a clone; CI never runs `verify` against a README claim on *this* tree; README has honesty in prose but no single live-vs-paused table) and then records live MCP + CLI measurements in `STATUS.md`. Do not rebuild TrustShell, the CLI, or the MCP.

**Tech Stack:** Existing `@hyperdag/trustshell` 1.4.0 tree (TypeScript SDK + CLI in `src/`, Jest, GitHub Actions). Live backend is the hosted HyperDAG engine. No new dependencies.

**Spec:** This file *is* the spec. Source of the five criteria: Sean's 2026-09-09 implementer brief. Read-only probe: `docs/handoff/CC-ASSESS.md` (same day, same HEAD `2915d59`). Operating rules: `AGENTS.md`, `C:\Users\Cash4\repos\repid-engine\LESSONS.md` (the `DealAppSeo/repid-engine/LESSONS.md` path named in AGENTS.md is **NOT CHECKABLE — that folder is not on this machine**).

**CC-ASSESS vs this brief.** The assess note calls publishing 1.4.0 the load-bearing stranger fix (`check` is absent from npm 1.3.0). Sean's brief names publish **out of scope**. This plan follows the brief: close the three in-tree gaps, do not publish, do not "fix" the 1.3.0 vs 1.4.0 gap. STATUS.md will name that limit instead of papering over it. What we *do* take from CC-ASSESS: HAL is **LIVE-DEGRADED** (2/6 providers funded on 2026-09-09), `trinity-shofet` exists (`2150 ESTABLISHED` on that probe), and a two-color live/paused table would lie by omission.

## Global Constraints

- v1 is a hosted thin client. On-chain writes are paused. `register()` does not mint ERC-8004. x402 is Base Sepolia. HAL is weaker on paraphrases.
- Global `trustshell` CLI is 1.3.0. This `package.json` is 1.4.0. Do not publish. Use in-repo tests / in-repo `node dist/cli/index.js` for 1.4.0 behavior. Never `npx` of the published `@latest` tag in this repo's CI — that measures the npm latest, not this tree.
- PowerShell: one command per line. No `&&`.
- Superpowers TDD: no production code without a failing test first. If you write the function first, delete it and start from the test. Do **not** delete already-shipped SDK/CLI/MCP to re-TDD it.
- Do not install anything. Do not call chrome-devtools, firecrawl, pstack, railway, cloudflare, supabase, vercel, or the github/railway/supabase MCPs.
- Trust existing live behavior. If the backend blocks a live step, write the limit in `docs/handoff/STATUS.md` and stop. Do not invent a workaround that lies.
- Out of scope: TrustMarket UI, verticals, extra MCP, memory SaaS, enabling on-chain writes, spending x402, fixing the 1.3.0 vs 1.4.0 publish.
- `AGENTS.md` / `CLAUDE.md` stay short. Do not add to them. `CLAUDE.md` may remain one line: `@AGENTS.md`.
- Verify with `npm run verify` before calling the diff done (that is what `.github/workflows/check.yml` gates on).
- Stay on this checkout. Recommend a new branch `feat/mvp-five` so this does not land on the egress PR; Sean's yes can override ("stay on feat/check-egress-2026-09-08").

---

## What is already true (do not rebuild)

Measured on this tree (`feat/check-egress-2026-09-08` @ `2915d59`, `package.json` `"version": "1.4.0"`):

| Criterion | Already here | Gap |
|---|---|---|
| 1. Fresh-clone example | `examples/quickstart/quickstart.mjs` calls `TrustShell.init()` and `verifyOutput()` twice | Does **not** call `getRepID()`. Imports `@hyperdag/trustshell`, which is **not** in this repo's `node_modules` (only `@hyperdag/proof-verifier` is). A clone + `npm install` + `node examples/quickstart/quickstart.mjs` cannot resolve the package. |
| 2. CLI gate | `src/cli/index.ts` `verdictExitCode`: PASS/FLAG → 0, VETO → 1, usage → 2, runtime → 3. Unit-tested in `tests/cli.test.ts` with the SDK mocked. | No workflow in `.github/workflows/` runs `verify` on a README claim. `examples/ci-gate/trust-gate.yml` is a drop-in for *other* repos and uses the published `@latest` tag (npm latest is 1.3.0). `.github/workflows/check.yml` deliberately excludes live-backend tests. |
| 3. MCP dogfood | Project-scoped TrustShell MCP is healthy: `verify_output`, `get_repid`, `present_proof`, `verify_proof`, `list_services`, `buy_service`. | Not yet called this session. `docs/handoff/STATUS.md` does not exist. |
| 4. Honest README | Honest-limits bullets already name thin client, register≠mint, paraphrase weakness, on-chain writes paused, x402 = Base Sepolia. | No single **live vs paused** table. |
| 5. Short agent files | `CLAUDE.md` is already `@AGENTS.md`. | Constraint: do not grow either file. |

CLI exit-code contract (already shipped, already tested — do not reimplement):

```ts
export const EXIT = { OK: 0, VETO: 1, USAGE: 2, RUNTIME: 3 } as const;
export function verdictExitCode(verdict: 'PASS' | 'FLAG' | 'VETO'): number {
  return verdict === 'VETO' ? EXIT.VETO : EXIT.OK;
}
```

---

## File map

| File | Role |
|---|---|
| `tests/mvp-example.test.ts` | **Create.** Failing-first: the quickstart file must call the three methods and import this tree's `dist/`, not npm 1.3.0. |
| `examples/quickstart/quickstart.mjs` | **Modify.** Relative import to `dist/lib/index.js`; add `getRepID('trinity-shofet')`. |
| `examples/quickstart/QUICKSTART.md` | **Modify.** One sentence: from this repo the example imports `dist/`; consumers still copy the README `@hyperdag/trustshell` snippet. |
| `tests/ci-readme-claim.test.ts` | **Create.** Failing-first: a workflow file in `.github/workflows/` verifies the Paris claim with the in-repo CLI. |
| `.github/workflows/readme-claim.yml` | **Create.** Minimal workflow. Does **not** edit `check.yml` (that file's job is package-correctness without a live backend). |
| `tests/readme-honesty.test.ts` | **Create.** Failing-first: README has one live-vs-paused table covering the five facts; a short deny-list of contradicting sentences. |
| `README.md` | **Modify.** Add the table near Honest limits. Fix only sentences that contradict the five facts. Do not rewrite the README. |
| `docs/handoff/STATUS.md` | **Create last.** Commands, exit codes, MCP verdicts. No production code. |
| `src/cli/index.ts`, `src/lib/trustshell.ts`, `src/mcp/index.ts` | **Do not touch** unless a failing test in this plan proves they are wrong. |
| `AGENTS.md`, `CLAUDE.md` | **Do not touch.** |
| `examples/ci-gate/trust-gate.yml` | **Do not touch.** Consumer template for the published CLI; `verify` exists in 1.3.0. |

---

## Decision Sean is approving with this plan

**CI placement.** Do **not** add a live HAL call to the existing `check` job. That job's header says a gate that goes red because Railway is down gets ignored, and an ignored gate is worse than no gate.

Add a **new** workflow `.github/workflows/readme-claim.yml`:

- Triggers: `pull_request` and `push` to `main` (same as `check.yml`).
- Steps: checkout → Node 20 → `npm ci` → `npm run sdk:build` → `node dist/cli/index.js verify "The capital of France is Paris."`
- Measures **this tree's 1.4.0 CLI**, never `@hyperdag/trustshell@latest`.
- Exit 0 → job green. Exit 1 (VETO) → job red. Exit 3 (backend/network) → job red as NOT_CHECKED, never remapped to 0.
- A red here can mean the hosted engine is down. That is the truth. `check.yml` still answers "does this package typecheck and do its unit tests pass?"

If you want this job schedule-only instead of PR-gating, say so in the yes. Default after yes: PR-gating as above.

---

### Task 1: Fresh-clone example calls init + verifyOutput + getRepID and can run from this tree

**Files:**
- Create: `tests/mvp-example.test.ts`
- Modify: `examples/quickstart/quickstart.mjs`
- Modify: `examples/quickstart/QUICKSTART.md` (one paragraph)

**Interfaces:**
- Consumes: existing `TrustShell.init(): Promise<{ client: TrustShell; health: { ok: boolean; status?: string; error?: string } }>`, `client.verifyOutput(text: string)`, `client.getRepID(agentId: string)`
- Produces: a runnable example whose source a test can read; live run is Task 4 / STATUS.md

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const EXAMPLE = join(ROOT, 'examples', 'quickstart', 'quickstart.mjs');

describe('fresh-clone quickstart', () => {
  const src = readFileSync(EXAMPLE, 'utf8');

  it('calls TrustShell.init, verifyOutput, and getRepID', () => {
    expect(src).toMatch(/TrustShell\.init\s*\(/);
    expect(src).toMatch(/\.verifyOutput\s*\(/);
    expect(src).toMatch(/\.getRepID\s*\(/);
  });

  it('looks up trinity-shofet (the README agent), not a placeholder', () => {
    expect(src).toMatch(/getRepID\s*\(\s*['"]trinity-shofet['"]\s*\)/);
  });

  it('imports this tree\'s dist, so a clone can run it without npm 1.3.0', () => {
    expect(src).toMatch(/from ['"]\.\.\/\.\.\/dist\/lib\/index\.js['"]/);
    expect(src).not.toMatch(/from ['"]@hyperdag\/trustshell['"]/);
  });
});
```

Why the import assertion: `node_modules/@hyperdag/` currently contains only `proof-verifier`. The package name import cannot resolve on a fresh clone of this repo. The README snippet for *consumers* stays `from '@hyperdag/trustshell'`. The in-repo example is the thing that must actually run.

- [ ] **Step 2: Run test to verify it fails**

```
npx jest tests/mvp-example.test.ts --no-coverage
```

Expected: FAIL — no `getRepID` in the file; import is still `@hyperdag/trustshell`.

- [ ] **Step 3: Minimal implementation**

In `examples/quickstart/quickstart.mjs`:

1. Change the import to `import { TrustShell } from '../../dist/lib/index.js';`
2. After the two `verifyOutput` calls, add:

```js
const rep = await client.getRepID('trinity-shofet');
console.log(`✓ getRepID (trinity-shofet): repid=${rep.repid} tier=${rep.tier}`);
```

3. In `examples/quickstart/QUICKSTART.md`, add under "Run it": from this repository the file imports `../../dist/lib/index.js` so `node examples/quickstart/quickstart.mjs` exercises 1.4.0 without publishing. After `npm install @hyperdag/trustshell` in *your* project, use the named import in the README.

Do not change the README code block's import. That block is for npm consumers.

- [ ] **Step 4: Run test to verify it passes**

```
npx jest tests/mvp-example.test.ts --no-coverage
```

Expected: PASS. Do **not** run the example yet — that is a live backend call, recorded in Task 4.

- [ ] **Step 5: Commit**

```
git add tests/mvp-example.test.ts examples/quickstart/quickstart.mjs examples/quickstart/QUICKSTART.md
git commit -m "test: quickstart calls init, verifyOutput, getRepID against this tree"
```

---

### Task 2: CI verifies one README claim with this tree's CLI

**Files:**
- Create: `tests/ci-readme-claim.test.ts`
- Create: `.github/workflows/readme-claim.yml`

**Interfaces:**
- Consumes: existing CLI `node dist/cli/index.js verify "<text>"` with EXIT 0/1/2/3 as in `src/cli/index.ts`
- Produces: a workflow file the test can read; live exit codes in Task 4

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'readme-claim.yml');

describe('CI README-claim gate', () => {
  it('exists as its own workflow (not folded into the check job)', () => {
    expect(existsSync(WORKFLOW)).toBe(true);
  });

  it('verifies the README Paris claim with this tree\'s CLI, not published 1.3.0', () => {
    const yml = readFileSync(WORKFLOW, 'utf8');
    expect(yml).toContain('The capital of France is Paris.');
    expect(yml).toContain('npm run sdk:build');
    expect(yml).toMatch(/node dist\/cli\/index\.js verify/);
    expect(yml).not.toMatch(/@hyperdag\/trustshell@latest/);
    expect(yml).not.toMatch(/npx @hyperdag\/trustshell/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx jest tests/ci-readme-claim.test.ts --no-coverage
```

Expected: FAIL — file does not exist.

- [ ] **Step 3: Minimal workflow**

Create `.github/workflows/readme-claim.yml`:

```yaml
# One README claim, through this tree's CLI.
#
# Separate from check.yml on purpose: that job answers "does this package
# typecheck and do its unit tests pass?" without talking to Railway. This job
# talks to the hosted engine. A red here can mean the backend is down.
# Exit 3 is NOT remapped to 0 — NOT_CHECKED must not share success's exit code.
name: readme-claim

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify-paris:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run sdk:build
      - name: HAL-verify one README claim
        run: node dist/cli/index.js verify "The capital of France is Paris."
```

Do not add a VETO example to CI (that would fail the build on purpose). Prove exit 1 in Task 4 against a false claim, locally, and write the code in STATUS.md.

- [ ] **Step 4: Run test to verify it passes**

```
npx jest tests/ci-readme-claim.test.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add tests/ci-readme-claim.test.ts .github/workflows/readme-claim.yml
git commit -m "ci: verify one README claim with this tree's CLI"
```

---

### Task 3: README live-vs-paused table, no contradicting sentence

**Files:**
- Create: `tests/readme-honesty.test.ts`
- Modify: `README.md` only

**Interfaces:**
- Consumes: none
- Produces: one table a test can find; README still describes the SDK that exists (`tests/docs.test.ts` must stay green)

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const README = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');

describe('README live vs paused', () => {
  it('has one table whose heading names live vs paused', () => {
    expect(README).toMatch(/##[^\n]*[Ll]ive vs paused/);
    const after = README.split(/##[^\n]*[Ll]ive vs paused/)[1] ?? '';
    const table = after.split(/\n## /)[0];
    expect(table).toMatch(/\|/);
    expect(table.toLowerCase()).toMatch(/hosted thin client/);
    expect(table.toLowerCase()).toMatch(/paused/);
    expect(table.toLowerCase()).toMatch(/degraded/);
    expect(table).toMatch(/register\(\)/);
    expect(table).toMatch(/ERC-8004/);
    expect(table).toMatch(/Base Sepolia/);
    expect(table.toLowerCase()).toMatch(/paraphras/);
  });

  it('does not contradict the five facts', () => {
    const forbidden = [
      /register\(\)\s+mints/i,
      /on-chain writes are (live|landing|active)/i,
      /v1[^\n.]{0,80}on-device/i,
      /portable mesh[^\n.]{0,40}(shipped|live)/i,
      /x402[^\n.]{0,60}mainnet/i,
      /HAL[^\n.]{0,40}(strong|robust)[^\n.]{0,20}paraphras/i,
    ];
    const hits = forbidden.filter((re) => re.test(README));
    expect(hits.map(String)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx jest tests/readme-honesty.test.ts --no-coverage
```

Expected: FAIL — no `Live vs paused` heading.

- [ ] **Step 3: Minimal README edit**

Insert this section immediately before `### Honest limits` (so the table is the index and the bullets stay as detail). Three states, not two — CC-ASSESS §5 Journey E: a two-color table lies by omission. Heading must match the test:

```markdown
### Live vs paused

| Surface | Today |
|---|---|
| This package | v1 hosted thin client. Trust computation runs on the HyperDAG engine, not on your machine. On-device proofs are v2, not shipped. npm `latest` is 1.3.0; this tree is 1.4.0 unpublished. |
| `verifyOutput()` / `trustshell verify` | Live, keyless, **degraded**: the quorum is real but not every named provider answers (CC-ASSESS 2026-09-09: 2/6 funded). HAL is weaker on paraphrases than on record-grounded facts. Which providers appear in evidence moves. |
| `getRepID()` / `presentProof()` | Live, keyless. Score moves; gate on tier or your own threshold. |
| `register()` | Live, keyless. Creates an agent and a RepID. It does not mint ERC-8004. |
| ERC-8004 identity mint | Paused/blocked for keyless use. Key-gated, separate call. A keyless `register()` leaves `NOT_MINTED`. |
| On-chain reputation writes | Paused. History is real (last write 2026-06-22); writes are not landing now. |
| x402 `executeA2A()` | Live protocol on Base Sepolia (chain id 84532), blocked without an API key and a funded testnet wallet. Not mainnet. This MVP does not spend. |
```

Then scan the README for any sentence the deny-list would catch. Known existing copy is already honest on these five facts (thin-client bullet, register≠mint, paraphrase, paused writes, Base Sepolia). Do not "improve" other sections. Do not touch AGENTS.md.

If a deny-list regex false-positives on an honest sentence, **narrow the regex in the test**, do not weaken the README.

- [ ] **Step 4: Run tests**

```
npx jest tests/readme-honesty.test.ts --no-coverage
npx jest tests/docs.test.ts --no-coverage
```

Expected: both PASS. `docs.test.ts` still forbids phantom SDK methods and phantom CLI commands.

- [ ] **Step 5: Commit**

```
git add tests/readme-honesty.test.ts README.md
git commit -m "docs: one live-vs-paused table, test-enforced"
```

---

### Task 4: Live measurements, MCP dogfood, STATUS.md

**Files:**
- Create: `docs/handoff/STATUS.md`

**Interfaces:**
- Consumes: Tasks 1–3 artifacts; TrustShell MCP tools `trustshell__verify_output` and `trustshell__get_repid`
- Produces: STATUS.md with commands and exit codes. No production code.

No failing unit test first — this task is evidence, not a new function. If you are tempted to stub MCP results into STATUS.md, stop.

- [ ] **Step 1: Confirm dist exists**

```
npm run sdk:build
```

Expected: exit 0. Uses this repo's TypeScript 5, not a global tsc. If it fails, diagnose toolchain (`node_modules/typescript` vs global) before claiming the build is broken.

- [ ] **Step 2: Run the example**

From repo root, PowerShell, one command:

```
node examples/quickstart/quickstart.mjs
```

Record: wall-clock, `init` health, both verdicts, `getRepID` for `trinity-shofet` (repid + tier). Gate on tier, not a copied number.

If `health.ok` is false or the process exits non-zero: write **LIMIT — backend unreachable** in STATUS.md with the command and the error. Stop. Do not fake verdicts.

- [ ] **Step 3: CLI gate, in-repo 1.4.0 (not global 1.3.0)**

```
node dist/cli/index.js verify "The capital of France is Paris."
echo $LASTEXITCODE
```

```
node dist/cli/index.js verify "The Eiffel Tower is located in Rome, Italy."
echo $LASTEXITCODE
```

Expected: first exit 0 (PASS or FLAG). Second exit 1 (VETO). If the second returns FLAG (0) because HAL is weaker / quorum degraded: write that as a **LIMIT** with the actual verdict and evidence. Do not remap it to VETO in code to make the story nicer.

- [ ] **Step 4: MCP dogfood (this session, project-scoped TrustShell MCP only)**

1. `trustshell__verify_output` with `text` = `The capital of France is Paris.`
2. `trustshell__get_repid` with `agent_id` = `trinity-shofet`

Write the returned verdict / score / evidence and the returned repid / tier. If the agent does not exist, write **NOT FOUND — trinity-shofet** with the tool error. Do not look up a substitute and call it trinity-shofet.

Do not call `buy_service`. Do not spend x402.

- [ ] **Step 5: Write STATUS.md** with this shape (fill in measured values, never placeholders):

```markdown
# TrustShell MVP status

Date: 2026-09-09
Tree: <branch> @ <git rev-parse --short HEAD>
package.json: 1.4.0 (not published). Global CLI, if invoked, is 1.3.0 — not used below.

## 1. Fresh-clone example
Command: node examples/quickstart/quickstart.mjs
Exit: <n>
init: <health>
verifyOutput Paris: <verdict> <trustScore>
verifyOutput Rome: <verdict> <trustScore>
getRepID trinity-shofet: <repid> <tier>

## 2. CLI gate (in-repo dist, 1.4.0)
Command: node dist/cli/index.js verify "The capital of France is Paris."
Exit: <n>  (want 0 on PASS/FLAG)
Command: node dist/cli/index.js verify "The Eiffel Tower is located in Rome, Italy."
Exit: <n>  (want 1 on VETO)
CI: .github/workflows/readme-claim.yml added. Not yet observed as a GitHub run from this session (github MCP not used).

## 3. MCP dogfood
verify_output "The capital of France is Paris." → <verdict> <trustScore> <evidence>
get_repid trinity-shofet → <repid> <tier>  OR  NOT FOUND / LIMIT <error>

## 4. README
Live-vs-paused table present. Deny-list test: <pass/fail>

## 5. Agent files
AGENTS.md / CLAUDE.md not modified.

## Limits
<empty if none, else the backend/MCP failure exactly as observed>
```

- [ ] **Step 6: `npm run verify`**

```
npm run verify
```

Expected: exit 0 (`tsc --noEmit` then jest minus `tests/e2e`). This is the check.yml gate. Do not report green from `tsc --project tsconfig.sdk.json` alone.

- [ ] **Step 7: Commit STATUS.md**

```
git add docs/handoff/STATUS.md docs/handoff/PLAN.md
git commit -m "docs: MVP handoff STATUS with measured commands and exit codes"
```

---

### Task 5: Constraint check — nothing extra

- [ ] **Step 1:** `git diff origin/feat/check-egress-2026-09-08 --stat` (or the branch you created) lists only the files in the file map.
- [ ] **Step 2:** `AGENTS.md` and `CLAUDE.md` have no diff.
- [ ] **Step 3:** No `npm publish`, no new dependency, no x402 purchase, no TrustMarket UI, no extra MCP server.
- [ ] **Step 4:** Stop.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Hosted engine down | Example, CLI, MCP all fail | STATUS.md LIMIT, stop, do not stub |
| `trinity-shofet` missing | Criterion 3 lookup fails | Write NOT FOUND; do not swap in `sophia` |
| HAL returns FLAG not VETO on the Rome claim | Exit 1 cannot be shown | Record the actual verdict. Do not change `verdictExitCode` to fail FLAG. |
| New workflow is not a GitHub-required check | PR can merge without it | Out of scope to change branch rulesets (needs github MCP / Sean). STATUS.md says the file exists, not that GitHub required it. |
| Mixing this diff into the egress PR | Review noise | Default: new branch `feat/mvp-five` after yes |

## Open questions (defaults in this plan; override in the yes)

1. New branch `feat/mvp-five` vs stay on `feat/check-egress-2026-09-08`. Default: new branch.
2. `readme-claim.yml` on pull_request vs schedule-only. Default: pull_request + push main.
3. Execution: inline in this session (you named an implementer). Say "subagents" if you want one subagent per task instead.

## Spec coverage (self-review)

| Criterion | Task |
|---|---|
| 1 Fresh-clone example with three calls, actually runs | Task 1 + Task 4 step 2 |
| 2 CLI exit 0/1 + CI | Already shipped CLI + Task 2 + Task 4 step 3 |
| 3 MCP dogfood + STATUS.md | Task 4 steps 4–5 |
| 4 Honest README live-vs-paused table | Task 3 |
| 5 AGENTS.md / CLAUDE.md stay short | Global constraint + Task 5 |

No placeholders. No production CLI/SDK rewrite. No publish.
