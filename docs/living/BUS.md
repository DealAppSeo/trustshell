# BUS — TrustShell MVP → shippable E2E
Updated 2026-10-02 (night lane added by CC1). The 2026-09-15 sections below are unchanged.

## 2026-10-02 NIGHT — the stamp on five hosts

Goal: a stranger loads the extension folder and sees a classifier label (pass / veto / not-checked)
on chatgpt.com, claude.ai, gemini.google.com, grok.com, chat.deepseek.com. A veto shows
*Caught. This reply did not pass.* A pass shows nothing. Over 3 s: not-checked + *Still checking*.

### Lanes — agreed 2026-10-02 (Sean, CC1, Grok)
Claude holds contracts and anything that must fail closed. Grok holds the browser and page surface.

| Agent | Lane | Does not touch |
|---|---|---|
| XC1 | Host scripts, selectors, `manifest.json`, pack, install steps | Belt pages, scoring |
| XC2 | Public pages: belts and site copy | Host scripts, engine routes |
| XC3 | Read routes the stamp shows (`GET /api/v1/stamp`); the phone door — wiring the one live Telegram bot to `POST /api/v1/classify` | Scoring, belt pages, a new PWA |
| CC1 | Label contract (`classify.js`, `laya.js`, `content.js`), its tests, this bus, review of XC1 and XC2 | Manifest, unless XC1 is idle past an hour |
| CC2 | Classifier backend (`POST /api/v1/classify`, `src/jev/`) and scoring that must fail closed | Extension surface |

Review pairs (nobody merges their own; see MERGE_POLICY.md): CC1 merges XC1 and XC2 · CC2 merges
XC3 · XC1 merges CC1 · XC3 merges CC2. Leave it open and bring it to Sean if the diff sets
`REAL_STAKING`, prints a key, moves a token, **changes the label contract**, or the reviewer is unsure.

### Three doors, one check — agreed 2026-10-02 (Grok proposed; Sean, CC1)
Do not build a fourth surface. Every door calls the same `POST /api/v1/classify` contract
(public, rate-limited, unpaid; pass | veto | not-checked; a miss is not-checked). HAL stays the
terminal receipt; the phone and the stamp do not have to match it, and none may fake a pass.

| Who | Door | First win |
|---|---|---|
| Dev, terminal | `npm i -g @hyperdag/trustshell@1.4.0`, then `trustshell verify` | a pass and a veto (no-key claim NOT CHECKED by CC1) |
| Dev in Claude Code / Cursor | `npx @hyperdag/trustshell-mcp` | the same check as a tool |
| Idea person, phone | the Telegram bot + controller PWA that is live today | paste a claim, get a label, no install |
| Already in a chat site | the extension, Load unpacked | the stamp, once the route exists |

The extension is the **third** door, not the first install for a no-code user: Load unpacked,
a missing route and a 401 are where they bounce.

Build order:
1. **CC2** ships the unpaid `POST /api/v1/classify`. Nothing below can show a label before this.
2. ~~XC1 ships the manifest load order~~ — **done, #421**.
3. **XC3 (assigned by Sean 2026-10-02)** finds the single Telegram deploy that is live today and
   wires **that bot only** to the route. Several Vercel/Cloudflare copies exist; leave the rest dark
   so a tester cannot hit a stale build. Do not fork a new PWA. The bot repos are not in CC1's
   session, so which deploy is live is NOT CHECKED here.
4. The first phone screen is one box: paste a claim, get pass | veto | not-checked, and one line
   saying the claim is sent to the checker (N-PRIVACY-LINE). On Telegram the claim also passes
   through Telegram.
5. Extension stays third. Store click later.

CC1's note on 3: the bot runs server-side, so it can carry its own key and be rate-limited per chat
id. It does not need the anonymous public path the extension needs. Keep the anonymous path for
the extension only if abuse shows up there.

**Belt pages:** already on main (#419), so "wait" means **do not link or promote them** until a
stranger can get a label on the phone without opening Chrome. Their no-stake guard missed
"staking" and `REAL_STAKING`; fixed in `CC1/belt-stake-guard`. Still open for XC2: every row says
"free" (CapCut has paid tiers), and OpenMontage, Publora and social-sdk are NOT CHECKED as real
public projects.

### The hybrid — how work moves with no human paste (CC1 + Grok, 2026-10-02)
Grok's half: **this file is the shared state.** Every agent reads it, and every change to it is a PR.
CC1's half: **a file does not wake anyone.** These are the triggers that already exist:

| From → to | How | Needs Sean? |
|---|---|---|
| CC1 → CC2 (or any Claude) | `create_session` with a standalone task; it opens a PR | no |
| CC1 → XC / GA | write the task to `docs/dispatch/INBOX_XC.md` (or `_GA`) on a **branch** of `repid-engine`, then run `dispatch-agent-cloud.yml` on that ref. The secrets are already set; it last succeeded 2026-09-22 and ran again 2026-10-02 | no |
| XC → everyone | the transcript lands as a draft PR under `reports/`; a Claude reads it and turns findings into code or into this file | no |
| any PR → main | cross-merge (MERGE_POLICY.md); Sean merges from the phone when green | only to merge |

**What this channel cannot do yet:** cloud XC holds `reasoning + repo_read` only (no shell, no
write), and sees only the repo it is dispatched in. So Grok runs **review, red-team and spec**
without a paste today; Grok **writing code** (XC1's host-script lane) still needs either Sean or a
Claude to apply its text. Giving cloud XC write scope is a trust decision for Sean, not a default.
That split happens to match the lanes: the contrarian reviews, the builder builds, and neither
grades its own work.

First run: CC1 dispatched XC to red-team CC2's `POST /api/v1/classify` contract on
`repid-engine` branch `CC1/xc-classify-redteam` while CC2 builds it.

### OPEN — night
- **N-ENDPOINT** (build: **CC2**; two decisions: Sean). Every stamp paints **not-checked** today.
  `classify.js` POSTs to repid-engine `/api/v1/classify`; that route is not on repid-engine `main`
  [MEASURED 2026-10-02, `git grep`] and production answers **401** to a POST [MEASURED, curl].
  Honest, but no host can show pass or veto until a route returns `{label}` in pass|veto|not-checked.
  `/api/v1/laya/classify` exists but returns `route: cheap|escalate|ask` — a different contract.
  Do not point the stamp at it.
  Contract: `{text, labels}` in, `{label}` out, label in pass|veto|not-checked. A 401, a timeout and
  an empty body are not-checked, never 0. No claim text stored. No user id.
  **Decided 2026-10-02 (Sean, Grok, CC1):** the route sits before `authMiddleware` (the extension
  holds no key), so it is public. It does **not** call HAL or any paid model, and it is
  rate-limited. Terminal `verify` and the stamp are not expected to agree: the end-to-end bar is
  that both receipts are pass|veto|not-checked and neither fakes a pass.
- ~~N-MANIFEST~~ **done in `CC1/manifest-laya`** (Sean: do it now). Every entry loads `laya.js`
  before `classify.js`; chatgpt loads both. `classify.js`'s fallback call is gone — one call path.
- **N-LOAD-SCOPE — found and fixed in the same PR.** Content scripts in one entry share ONE global
  scope. `toast.js` declared a top-level `const api`, and the next file declared `api` again, so
  **chatgpt, claude, gemini and deepseek threw a SyntaxError on load and painted nothing** — only
  grok worked [MEASURED 2026-10-02: Node vm in manifest order, then real Chromium classic scripts:
  "Identifier 'api' has already been declared"]. CC1's own #418 caused the chatgpt half.
  Every unit test was green, because each test `require`s one file as its own module.
  Fix: each shared script keeps its names inside a function scope.
  Guard: `tests/extension-manifest-load.test.ts` runs every entry in manifest order in one context.
  **Host scripts (XC1): keep top-level names unique, or wrap them too.**
- **N-LAYA-HOST** (Sean). No hosted Laya endpoint exists. Its wire shape (`{text, labels}` in,
  `{label}` out) is NOT CHECKED against Convai's docs. A content-script fetch is subject to the
  target's CORS; a background-worker fetch needs `host_permissions` (manifest, XC1).
- **N-PRIVACY-LINE** (XC1 install steps / XC2 site copy). "The reply is not printed" is not "the
  reply is not sent". With the extension loaded, the text of every assistant reply on five sites is
  POSTed to the classifier. Tester notes must say so in one line.
- **N-DEBOUNCE** (XC1, optional). Hosts redraw on every DOM change. `classify.js` now caches a
  pass/veto per text and dedupes in-flight calls, but a streaming reply still sends each partial
  text. Classify only once the reply has stopped changing for ~1 s.

### Belts lane — after the night bus, before the week list
An agent takes it only after its five night boxes are committed. A belt is a clip for the PAI or a
2nd or 3rd agent. A row is a tool, skill, MCP, API or repo: name, kind, why, free or paid. The page
does not install anything, does not claim the named people endorse it, moves no token, renders no video.
Starts only after N-ENDPOINT and N-MANIFEST land.
- XC2 `XC2/belts` (trustshell): owns **all three** `public/belts/{cmo,cto,cfo}.html`, one no-stake
  test. CC1 reviews and may merge. (Settled 2026-10-02: there is no `CC1/cmo-belt`.)
- CC2 `CC2/cfo-belt` (repid-engine): `GET /api/v1/belts/cfo`, a cap row with `can_spend: false`.

### Gotchas measured today
- **Green unit tests do not mean a host loads.** See N-LOAD-SCOPE. Load the real order before
  saying a host works.
- Do not cite `trustshell repid trinity-shofet` in tester notes until that command is run again.
- A stale `tsconfig.tsbuildinfo` reported a TS2393 that was not in the tree. `rm` it before
  believing a "pre-existing" type error.
- Two classifier clients (`classify.js`, `laya.js`) had drifted: different slow line, `>=` vs `>`
  at 3000 ms, different timeout. `classify.js` now hands the call to `laya.js`; the line is
  *Still checking* and the cut is strictly over 3000 ms.
- chatgpt's `content.js` read the verdict from the reply's own last line, so a reply ending in
  "veto" painted veto. Fixed: it paints only the classifier's label.

## Closed on branches (not published)
E1 unique evidence_id. E2 exclusive floor + window. E3 SQL written not applied. E4 happy-path settle fixtures. E5 score_lane. E6 C9/C10 scratch. S1 A7 filter. S2 #156-158 green. S3 measured quorum or 503. S4 extra cases #756. S5/S11 envelope exported on verify. S6 present_proof on packed tree. S8 README pin 1.3.0. S10 evaluate=verifyOutput alias. S12 local e2e:mvp on pack. #159 refuse eyJ fallback.

## OPEN
F-PUBLISH — Sean: npm publish packed candidate after audit.
F-DDL — Sean: apply unique-on-evidence_id after reading SQL.
F-E2E-PUB — after publish, e2e:mvp against @latest.
F-LIVE-SETTLE — one production service_contracts row reaches settled.
F-STACK-GH — TrustShell stack exists on GitHub as one PR, not only local feat/xc2-2026-09-15-stack.
F-754-CLEAN — rebase #754 if dirty; fold #756; merge when CI green (policy allows if no version bump / no apply-SQL).
F-SITE — site version = published @latest after publish.

## Locks
XC1: repid-engine #754 branch only.
XC2: trustshell stack only. Never #754 scoring files.
