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
| XC3 | Read routes the stamp shows (`GET /api/v1/stamp`) | Scoring, belt pages |
| CC1 | Label contract (`classify.js`, `laya.js`, `content.js`), its tests, this bus, review of XC1 and XC2 | Manifest, unless XC1 is idle past an hour |
| CC2 | Classifier backend (`POST /api/v1/classify`, `src/jev/`) and scoring that must fail closed | Extension surface |

Review pairs (nobody merges their own; see MERGE_POLICY.md): CC1 merges XC1 and XC2 · CC2 merges
XC3 · XC1 merges CC1 · XC3 merges CC2. Leave it open and bring it to Sean if the diff sets
`REAL_STAKING`, prints a key, moves a token, **changes the label contract**, or the reviewer is unsure.

### OPEN — night
- **N-ENDPOINT** (build: **CC2**; two decisions: Sean). Every stamp paints **not-checked** today.
  `classify.js` POSTs to repid-engine `/api/v1/classify`; that route is not on repid-engine `main`
  [MEASURED 2026-10-02, `git grep`] and production answers **401** to a POST [MEASURED, curl].
  Honest, but no host can show pass or veto until a route returns `{label}` in pass|veto|not-checked.
  `/api/v1/laya/classify` exists but returns `route: cheap|escalate|ask` — a different contract.
  Do not point the stamp at it.
  Contract: `{text, labels}` in, `{label}` out, label in pass|veto|not-checked. A 401, a timeout and
  an empty body are not-checked, never 0. No claim text stored. No user id.
  **Decision 1 — auth and spend.** The extension holds no key, so the route must sit before
  `authMiddleware` (as `/laya/classify` does). That makes it a public endpoint: if it calls HAL or
  any paid model, it is an open spend tap. It needs a rate limit, and Sean decides whether it may
  call anything paid.
  **Decision 2 — HAL or not.** If the route is not HAL-backed, the terminal `verify` and the stamp
  can legitimately give different labels for the same text, and an end-to-end that expects "same
  label" is wrong. Then the bar is: both are pass|veto|not-checked and neither fakes a pass.
- **N-MANIFEST** (XC1; if no PR by ~00:30Z 2026-10-03, CC1 opens it and XC1 merges). Add `"laya.js"` before `"classify.js"` in the claude, gemini, grok and
  deepseek entries, and `"classify.js", "laya.js"` before `"content.js"` in the chatgpt entry.
  #418 is merged, so chatgpt no longer paints the reply's last word — but until this lands it
  paints **not-checked always**, not the classifier label. The browser runs `classify.js`'s fallback.
  After it lands, CC1 deletes the fallback so there is one call path.
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
