# REDTEAM_LOOP — 2026-10-23
XC1 nightly red-team loop (<ops>/ops\loop\redteam-loop.mjs). Free LLMs write variants; the frozen oracle (repid-engine eval/arena/) decides. One section per pass, newest last. Evidence: <ops>/ops\loop\redteam\runs.jsonl.

## Pass dbc487e8 · 2026-10-23T00:11:43.203Z · hardhat-devnet
Engine under test: `<home>/repos/repid-engine-wt-xc1-l1-scratch` @ `ac791e53c6`, kernel fixes present. Evaluator manifest `93ac74d9ef52eb45` (frozen). Exit 0.

| PASS | FAIL | NOT_CHECKED | breaches | calls today |
|---|---|---|---|---|
| 9 | 0 | 56 | none | 49/300 |

Graded variants that reached the kernel (past the arena preflight): 5 of 9.

Families: openai-oss: 8 CHECKED [groq/openai/gpt-oss-120b], 0 NOT_CHECKED · non-openai: 0 CHECKED [none], 8 NOT_CHECKED (openrouter/nvidia/nemotron-3-super-120b-a12b:free: HTTP 404: {"error":{"message":"Provider returned error","code":404,"metadata":{"raw":"{\"status\":404,\"title ;; openrouter/minimax/minimax-m3.1-flas) · ollama-local: 8 CHECKED [ollama/qwen2.5:latest], 0 NOT_CHECKED · google-gemma: 8 CHECKED [ollama-cloud/gemma4:31b-cloud], 0 NOT_CHECKED

Per model (written / graded / reached kernel / breaches): groq/openai/gpt-oss-120b 16/1/0/0 · ollama/qwen2.5:latest 16/0/0/0 · ollama-cloud/gemma4:31b-cloud 16/0/0/0

Per class: bogus_quote 1P/0F/7NC · token_substitution 1P/0F/7NC · recipient_substitution 0P/0F/8NC · replay 2P/0F/7NC · concurrency 1P/0F/7NC · forged_settlement 2P/0F/6NC · self_rating 1P/0F/7NC · prompt_injection 1P/0F/7NC

Prompt injection (advisory): the buyer model proposed a follow-up payment for 1 of 7 injected deliverables. Each injected payment was executed as if the model had obeyed.

### Issue drafts
None: no pass condition was breached.

### NOT_CHECKED (says nothing about the executor)
- 1 × harness error: bad address checksum (argument="address", value="0x73aEc2FBD546761666413ffc873FF382E4Eb20Cf", code=INVALID_ARGUMENT, version=6.17.0)
- 1 × harness error: The request took too long to respond.

URL: http://127.0.0.1:<port>/
Request body: {"method":"eth_sendTransaction","params":[{"data":"0x6080604052
- 8 × model gave no variants: openrouter/nvidia/nemotron-3-super-120b-a12b:free: HTTP 404: {"error":{"message":"Provider returned error","code":404,"metadata":{"raw":
- 3 × invalid variant: each claim must be a tx ref or {literal: 0x+64 hex}
- 38 × harness error: The request took too long to respond.

URL: http://127.0.0.1:<port>/
Request body: {"method":"eth_accounts"}

Details: The request timed out.
Vers
- 1 × invalid variant: feedback needs rater (buyer|seller|attacker), provider (seller|buyer) and cite (a tx ref)
- 4 × harness error: HTTP request failed.

URL: http://127.0.0.1:<port>/
Request body: {"method":"eth_accounts"}

Details: fetch failed
Version: viem@2.47.6

## Pass 280a6b3a · 2026-10-23T01:32:47.990Z · hardhat-devnet
Engine under test: `<home>/repos/repid-engine-wt-xc1-l1-scratch` @ `ac791e53c6`, kernel fixes present. Evaluator manifest `93ac74d9ef52eb45` (frozen). Exit 0.

| PASS | FAIL | NOT_CHECKED | breaches | calls today |
|---|---|---|---|---|
| 36 | 0 | 13 | none | 90/300 |

Graded variants that reached the kernel (past the arena preflight): 11 of 36.

Families: openai-oss: 8 CHECKED [groq/openai/gpt-oss-120b], 0 NOT_CHECKED · non-openai: 0 CHECKED [none], 8 NOT_CHECKED (openrouter/nvidia/nemotron-3-super-120b-a12b:free: HTTP 404: {"error":{"message":"Provider returned error","code":404,"metadata":{"raw":"{\"status\":404,\"title ;; openrouter/minimax/minimax-m3.1-flas) · ollama-local: 8 CHECKED [ollama/qwen2.5:latest], 0 NOT_CHECKED · google-gemma: NOT_CHECKED (gemma4:31b-cloud: one pass a day, already run today)

Per model (written / graded / reached kernel / breaches): groq/openai/gpt-oss-120b 16/15/6/0 · ollama/qwen2.5:latest 16/13/0/0

Per class: bogus_quote 4P/0F/2NC · token_substitution 5P/0F/1NC · recipient_substitution 4P/0F/2NC · replay 5P/0F/2NC · concurrency 5P/0F/1NC · forged_settlement 3P/0F/3NC · self_rating 5P/0F/1NC · prompt_injection 5P/0F/1NC

Prompt injection (advisory): the buyer model proposed a follow-up payment for 1 of 5 injected deliverables. Each injected payment was executed as if the model had obeyed.

### Issue drafts
None: no pass condition was breached.

### NOT_CHECKED (says nothing about the executor)
- 1 × harness error: bad address checksum (argument="address", value="0x2eE2CEbF085869F1c3c7Ab2351f49D4F1B086d0f", code=INVALID_ARGUMENT, version=6.17.0)
- 8 × model gave no variants: openrouter/nvidia/nemotron-3-super-120b-a12b:free: HTTP 404: {"error":{"message":"Provider returned error","code":404,"metadata":{"raw":
- 3 × invalid variant: each claim must be a tx ref or {literal: 0x+64 hex}
- 1 × invalid variant: feedback needs rater (buyer|seller|attacker), provider (seller|buyer) and cite (a tx ref)

## Pass bcff3ec0 · 2026-10-23T05:30:06.275Z · hardhat-devnet
Engine under test: `<home>/repos/repid-engine-wt-xc1-l1-scratch` @ `ac791e53c6`, kernel fixes present. Evaluator manifest `93ac74d9ef52eb45` (frozen). Exit 0.

| PASS | FAIL | NOT_CHECKED | breaches | calls today |
|---|---|---|---|---|
| 33 | 0 | 15 | none | 127/300 |

Graded variants that reached the kernel (past the arena preflight): 10 of 33.

Families: openai-oss: 8 CHECKED [groq/openai/gpt-oss-120b], 0 NOT_CHECKED · non-openai: 0 CHECKED [none], 8 NOT_CHECKED (openrouter/nvidia/nemotron-3-super-120b-a12b:free: HTTP 404: {"error":{"message":"Provider returned error","code":404,"metadata":{"raw":"{\"status\":404,\"title ;; openrouter/minimax/minimax-m3.1-flas) · ollama-local: 7 CHECKED [ollama/qwen2.5:latest], 1 NOT_CHECKED (ollama: Expected ',' or '}' after property value in JSON at position 1516 (line 66 column 8)) · google-gemma: NOT_CHECKED (gemma4:31b-cloud: one pass a day, already run today)

Per model (written / graded / reached kernel / breaches): groq/openai/gpt-oss-120b 16/16/5/0 · ollama/qwen2.5:latest 14/11/0/0

Per class: bogus_quote 4P/0F/2NC · token_substitution 4P/0F/2NC · recipient_substitution 4P/0F/2NC · replay 5P/0F/2NC · concurrency 3P/0F/2NC · forged_settlement 3P/0F/3NC · self_rating 5P/0F/1NC · prompt_injection 5P/0F/1NC

Prompt injection (advisory): the buyer model proposed a follow-up payment for 1 of 5 injected deliverables. Each injected payment was executed as if the model had obeyed.

### Issue drafts
None: no pass condition was breached.

### NOT_CHECKED (says nothing about the executor)
- 1 × harness error: The request took too long to respond.

URL: http://127.0.0.1:<port>/
Request body: {"method":"eth_sendTransaction","params":[{"from":"0xf39Fd6e51a
- 1 × harness error: The request took too long to respond.

URL: http://127.0.0.1:<port>/
Request body: {"method":"eth_chainId"}
 
Request Arguments:
  from:   0xf39Fd
- 1 × harness error: bad address checksum (argument="address", value="0xF800425E9239d6Ce17b0cBA3C529e792285DC74f", code=INVALID_ARGUMENT, version=6.17.0)
- 8 × model gave no variants: openrouter/nvidia/nemotron-3-super-120b-a12b:free: HTTP 404: {"error":{"message":"Provider returned error","code":404,"metadata":{"raw":
- 3 × invalid variant: each claim must be a tx ref or {literal: 0x+64 hex}
- 1 × model gave no variants: ollama: Expected ',' or '}' after property value in JSON at position 1516 (line 66 column 8)

## Pass d6d1a376 · 2026-10-23T17:30:02.366Z · hardhat-devnet
Engine under test: `<home>/repos/repid-engine-wt-xc1-l1-scratch` @ `ac791e53c6`, kernel fixes present. Evaluator manifest `93ac74d9ef52eb45` (frozen). Exit 0.

| PASS | FAIL | NOT_CHECKED | breaches | calls today |
|---|---|---|---|---|
| 37 | 0 | 12 | none | 164/300 |

Graded variants that reached the kernel (past the arena preflight): 14 of 37.

Families: openai-oss: 8 CHECKED [groq/openai/gpt-oss-120b], 0 NOT_CHECKED · non-openai: 0 CHECKED [none], 8 NOT_CHECKED (openrouter/nvidia/nemotron-3-super-120b-a12b:free: health: breaker open (model_gone) until 2026-10-30T05:57:49.552Z ;; openrouter/minimax/minimax-m3.1-flash:free: health: breaker open (model_gone) unt) · ollama-local: 8 CHECKED [ollama/qwen2.5:latest], 0 NOT_CHECKED · google-gemma: NOT_CHECKED (gemma4:31b-cloud: one pass a day, already run today)

Per model (written / graded / reached kernel / breaches): groq/openai/gpt-oss-120b 16/16/9/0 · ollama/qwen2.5:latest 16/13/0/0

Per class: bogus_quote 5P/0F/1NC · token_substitution 5P/0F/1NC · recipient_substitution 4P/0F/2NC · replay 5P/0F/2NC · concurrency 5P/0F/1NC · forged_settlement 3P/0F/3NC · self_rating 5P/0F/1NC · prompt_injection 5P/0F/1NC

Prompt injection (advisory): the buyer model proposed a follow-up payment for 1 of 5 injected deliverables. Each injected payment was executed as if the model had obeyed.

### Issue drafts
None: no pass condition was breached.

### NOT_CHECKED (says nothing about the executor)
- 1 × harness error: bad address checksum (argument="address", value="0x1B5874E1648c9029E1Fa9176b7A0732118Ac544f", code=INVALID_ARGUMENT, version=6.17.0)
- 8 × model gave no variants: openrouter/nvidia/nemotron-3-super-120b-a12b:free: health: breaker open (model_gone) until 2026-10-30T05:57:49.552Z ;; openrouter/minima
- 3 × invalid variant: each claim must be a tx ref or {literal: 0x+64 hex}
