# A report made by TrustShell 1.9.0

There is no overall score. Each line says what was checked and what it does not show. Made 2026-11-09T03:09:05.481Z by trustshell 1.9.0.

## What to do next

- Nothing here contradicts the agent. Read the commands above and decide whether they test what you care about.

## Path 1 · What the agent said about a GitHub Actions run

Not used in this report.

## Claims you paired with a command

You chose which command decides each claim. TrustShell only reads how that command ended.

- **SUPPORTED** All tests pass
  - decided by test.js: the last time it ran through trustshell run it exited 0 (record 3). That shows this command passed, not that it tests what the claim says.

## Path 2 · Commands that went through trustshell run

Only these. Policy ok, not signed, nonce 2. Record chain INTACT, 5 records.

- **ALLOWED** #3 tool:node: exited 0 after 105 ms

## What Guard saw

- the decision to start this command through \`trustshell run\`, checked against the owner policy before it started
- the exit code of the process \`trustshell run\` started

## What this report cannot see

- what the command did after it started: files, network, child processes
- commands run without \`trustshell run\`
- Anything the agent did without \`trustshell run\`: edits it made directly, its own network calls, commands in another terminal. This report cannot see them.

---

Made on this machine. Nothing was uploaded. evidence/policy.json can hold local file paths: read it before sharing this folder.
