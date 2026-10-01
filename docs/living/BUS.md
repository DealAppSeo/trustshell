# BUS — TrustShell V1 closeout
Updated 2026-09-30.

When idle: `git pull origin main` then take the first OPEN box that is not already on main.
One PR per letter. Skip if already shipped. 249 stays draft. Version 1.4.0. No npm publish. No HeyGen. No stake now.

## Locks
XC1 only. Do not edit repid-engine or trustkeys.
Do not flip REAL_STAKING. Do not edit .mcp.json.

## OPEN (do in order)
A. Stranger CLI — `--help` lists verify, repid, proof, status, remember, recall, redact. `package.json` bin + files[] ship those seven. `npm pack --dry-run` contains each bin. README names only those bins.
B. `verify --json` — `receipt_written` is true|false|NOT_CHECKED. Then `family host verdict`. Missing receipt = NOT_CHECKED never 0. No claim text. `first_pass` object only when honesty-a counted; omit key if missing.
C. Laya in front of HAL — `TRUSTSHELL_LAYA` unset = today quorum. `=local` uses src/laya, no network. `=engine` POST /api/v1/laya/classify, 200ms timeout → escalate. cheap skip HAL exit 0. escalate HAL. ask exit 4 ASK. Tests: ok=cheap, Paris=escalate, empty=ask.
D. Memory refuse on MCP path — sb_secret_ / postgresql:// / eyJ → exit 2, nothing written. Same refuse before tool result serialize.
E. MCP tools in src/mcp/index.ts = verify, repid, status, remember, recall, redact. A tool named stake fails CI. Fake secret absent from posted body.
F. Site copy lock — hero: A portable trust harness. Autonomy is earned. / Check a claim. See the receipt. Keep your keys. Ban: stake now, every transaction earns RepID, verify moves RepID. /why notes-on-machine only if --help lists remember.
G. tests/v1-stranger-path.test.ts covers A–F offline. No live Paris network in that file.

## CLOSED tonight (do not redo)
remember/recall/redact on main (dd3655d2). Pack bins / help / receipt_written / landing hero / MCP tools PRs 305–313 if merged. 249 remains draft.
