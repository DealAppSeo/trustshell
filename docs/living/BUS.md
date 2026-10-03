# BUS — the next ticket, granular (tier 1 of 3)

Read `NORTH.md` (where we are going) and then `WEEK.md` (this week's sprints), then act from
here. This is the **one** bus: the `BUS.md` / `NEXT.md` copies in repid-engine and
hyperdag-protocol now point here. **A Loop is one ticket worked until a PR or a URL proves
it.** Take the top `open` ticket in your lane, set it to `CLAIMED by <you>` in a PR (or on
the PR you open for it), and close it with the proof link. Updated 2026-10-03 by CC1.

## Tickets

| ID | Lane | Loop | Done when (proof) | Status |
|---|---|---|---|---|
| B1 | XC3 or Sean | Merge repid-engine #1151 (classify route). Green, approved by Grok and Strix | #1151 merged | **done** (merged 00:59Z, main 1a1d1cb) |
| B2 | CC1 | After deploy: production `POST /api/v1/classify` from a chat-site Origin returns a contract label, and the preflight passes | command and output recorded in a PR to this file | **VERIFIED 2026-10-03 01:01Z** on deployed 6a40bf4: OPTIONS from `https://chatgpt.com` → 204, allow-origin `*`; POST `2 + 2 = 4` → pass, `2 + 2 = 5` → veto, prose with `;`, `--` and a closing "veto" → not-checked (no sanitizer 400), empty → not-checked; all 200, ~1 ms |
| B3 | Sean | Close or merge repid-engine #1152 (Grok transcript) **after** B1, because its branch contains #1151's code | #1152 closed | blocked by B1 |
| B4 | XC1 | Merge trustshell #427 (bus note) | merged | **done** (main d10b7b3) |
| B5 | CC2 | `CC2/jev-call`: src/jev/classify.ts, label + score, never `reject`; four tests (Sean's five boxes) | PR open, ready | **done**: repid-engine #1157 merged (0f18a25). Inert until B9; refuses any non-loopback model |
| B6 | CC2 | `CC2/cfo-belt`: GET /api/v1/belts/cfo, cap row `can_spend:false`, inserts nothing; read `src/routes/belts.ts` first | PR open, ready | **done**: repid-engine #1158 merged (aa87d18). Grok: MERGE |
| B7 | XC3 | Find the one live Telegram deploy (start in `controller-pwa` and the Vercel projects; `trinity-telegram-bot` is empty) | deploy URL + commit sha in a PR to this file | open |
| B8 | XC3 | Wire that bot only to `POST /api/v1/classify`: one box, three labels, the privacy line on the first screen | PR open | blocked by B7 |
| B9 | Sean | What backs the classify route: (1) arithmetic only, (2) a free hosted model, (3) our own small model | a line here with the choice | open |
| B10 | CC1 | `trustshell repid <id>` and `trustshell proof <id> --verify` for three existing ids, run on the published 1.4.0 package (2026-10-03). No wallet, no stake | output recorded in a PR to this file | **half done.** `proof --verify` VERIFIED for trinity-shofet (2202), trinity-sophia (1334), trinity-veritas (1816): plonky3, client-side ✓, exit 0. `repid` FAILED on 1.4.0: prints `RepID undefined` with exit 0, because the API now returns `{score, tier}`. Fix in trustshell #429 (Grok to merge); users get it only after a publish (Sean) |
| B11 | Sean | One GitHub identity per agent family, so RepID can tell who wrote and who reviewed | decision line here | open |
| B12 | Sean | Confirm `LOOP_GH_PAT` can read trustshell (steps in the 2026-10-03 chat) | "done" line here | **not needed.** trustshell is public, so B13 reads it with the run's own token |
| B13 | CC1 | Let the cloud Grok dispatch also check out trustshell, read-only | PR in repid-engine | **works.** repid-engine #1154 (Grok or Sean to merge). First run: transcript #1155, Grok read `./trustshell` and red-teamed all five hosts. That surfaced trustshell #430 |
| B14 | CC1 | Hourly pull loop: read NORTH, WEEK and BUS; dispatch Grok; nudge Claude sessions; review and merge the other family's green PRs; stop after 3 quiet hours | trigger id recorded here | open |

### Carried from the older buses: **UNVERIFIED, re-check before working**
These were OPEN on 2026-09-15 to 09-19 in repid-engine and hyperdag-protocol. Some may already
be done. Check main, npm and the DB first, and close with the evidence; do not redo them blind.
- **Sean-only:** F-DDL (apply `migrations/2026-09-15_kind_custody.sql`), F-PUBLISH / F-E2E-PUB
  / F-SITE (npm and site version), F-LIVE-SETTLE (one Sepolia `service_contracts` row
  `settled`), F-PINS, F-DISCUSSIONS, F-FRIENDS, F-EXPERTS, F-GROUND-ENFORCE.
- **Engine:** HYP-10 (wrap type-B callsites; CLAUDE.md now says CALLSITES = 0, which suggests
  this is done), HYP-11, HYP-7 (freshness stall), HYP-8 (register Map). Sean product holds:
  #743 and #739.
- **Protocol:** L1 (example-agent refresh), L3 (honest STATUS block), L10 (release notes), L4
  to L6, L11, L12.

---

## Reference: decisions and notes behind the tickets (kept, not tickets)

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
| Dev, terminal | `npm i -g @hyperdag/trustshell@1.4.1`, then `trustshell verify` | a pass and a veto (no-key claim NOT CHECKED by CC1) |
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
- **N-ENDPOINT status (2026-10-03):** CC2: `POST /api/v1/classify` in repid-engine #1151 — public,
  unpaid, stores nothing; arithmetic-only pass/veto, prose is not-checked; own CORS + per-IP 429.
  XC red-team of the code as written was dispatched by CC1. **Open decision for Sean:** with no
  model behind it, almost every real reply stamps not-checked. Honest, but not yet useful.
  **Do not merge XC's transcript PR for #1151 before #1151 itself:** its branch contains CC2's code.
- **N-TELEGRAM finding (2026-10-03):** `DealAppSeo/trinity-telegram-bot` is **empty** (no
  commits). Telegram code lives in `DealAppSeo/controller-pwa` (`app/page.tsx`,
  `app/settings/page.tsx`). XC3 starts there and in the Vercel projects, not the bot repo.
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

(The 2026-09-15 OPEN and Locks lists that used to sit here are carried into the ticket table above as UNVERIFIED.)
