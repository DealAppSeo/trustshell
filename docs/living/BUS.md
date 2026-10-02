# BUS — TrustShell MVP → shippable E2E
Updated 2026-10-02 (night lane added by CC1). The 2026-09-15 sections below are unchanged.

## 2026-10-02 NIGHT — the stamp on five hosts

Goal: a stranger loads the extension folder and sees a classifier label (pass / veto / not-checked)
on chatgpt.com, claude.ai, gemini.google.com, grok.com, chat.deepseek.com. A veto shows
*Caught. This reply did not pass.* A pass shows nothing. Over 3 s: not-checked + *Still checking*.

Lanes: CC1 `laya.js` `classify.js` `content.js` · CC2 `src/jev/classify.ts` · XC1 `claude.js`
`gemini.js` `grok.js` `manifest.json` · XC3 `GET /api/v1/stamp`. Merge rule: MERGE_POLICY.md (no self-merge).

### OPEN — night
- **N-ENDPOINT** (decide: Sean; build: XC3 or CC2). Every stamp paints **not-checked** today.
  `classify.js` POSTs to repid-engine `/api/v1/classify`; that route is not on repid-engine `main`
  [MEASURED 2026-10-02, `git grep`] and production answers **401** to a POST [MEASURED, curl].
  Honest, but no host can show pass or veto until a route returns `{label}` in pass|veto|not-checked.
  `/api/v1/laya/classify` exists but returns `route: cheap|escalate|ask` — a different contract.
  Do not point the stamp at it.
- **N-MANIFEST** (XC1). Add `"laya.js"` before `"classify.js"` in the claude, gemini, grok and
  deepseek entries, and `"classify.js", "laya.js"` before `"content.js"` in the chatgpt entry.
  Until then the browser runs `classify.js`'s fallback call and **chatgpt paints not-checked always**.
  After it lands, CC1 deletes the fallback so there is one call path.
- **N-LAYA-HOST** (Sean). No hosted Laya endpoint exists. Its wire shape (`{text, labels}` in,
  `{label}` out) is NOT CHECKED against Convai's docs. A content-script fetch is subject to the
  target's CORS; a background-worker fetch needs `host_permissions` (manifest, XC1).
- **N-DEBOUNCE** (XC1, optional). Hosts redraw on every DOM change. `classify.js` now caches a
  pass/veto per text and dedupes in-flight calls, but a streaming reply still sends each partial
  text. Classify only once the reply has stopped changing for ~1 s.

### Belts lane — after the night bus, before the week list
An agent takes it only after its five night boxes are committed. A belt is a clip for the PAI or a
2nd or 3rd agent. A row is a tool, skill, MCP, API or repo: name, kind, why, free or paid. The page
does not install anything, does not claim the named people endorse it, moves no token, renders no video.
- XC2 `XC2/belts` (trustshell): `public/belts/{cmo,cto,cfo}.html`, one no-stake test.
- CC1 `CC1/cmo-belt` (trustshell): `public/belts/cmo.html`, eight rows, methods offer/hook/list.
- CC2 `CC2/cfo-belt` (repid-engine): `GET /api/v1/belts/cfo`, a cap row with `can_spend: false`.
- **Collision to settle first:** XC2 and CC1 both name `public/belts/cmo.html`. One owner, please.

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
