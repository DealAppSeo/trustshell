# Walkthrough

Click by click, for someone who does not write code. Each step is one command in a terminal. A terminal is the text window named Terminal, PowerShell, or Command Prompt.

This does not use a wallet. It does not turn staking on. There is no mesh in this walk.

Screenshot placeholders below are names only. The pictures are not in this repo.

## 1. Install

```bash
npm i -g @hyperdag/trustshell@1.4.0
```

Then:

```bash
trustshell --version
```

You should see a version that includes 1.4.

<!-- screenshot placeholder: screenshots/walkthrough-01-version.png — not captured -->

## 2. Paris

```bash
trustshell verify "The capital of France is Paris."
```

This asks the hosted check if that sentence is true. If the check answers, read the verdict it prints. If it cannot reach the check, that is NOT_CHECKED. NOT_CHECKED is not a pass.

<!-- screenshot placeholder: screenshots/walkthrough-02-paris.png — not captured -->

## 3. Rome

```bash
trustshell verify "The Eiffel Tower is located in Rome, Italy."
```

This sentence puts the tower in the wrong city. If the check answers, it should refuse the sentence. A refusal is not a crash. If the check cannot be reached, that is NOT_CHECKED, not a pass.

<!-- screenshot placeholder: screenshots/walkthrough-03-rome.png — not captured -->

## 4. RepID

```bash
trustshell repid trinity-shofet
```

This looks up one named agent's reputation. It does not ask for a wallet.

<!-- screenshot placeholder: screenshots/walkthrough-04-repid.png — not captured -->

## 5. Proof

```bash
trustshell proof trinity-shofet --verify
```

This fetches that agent's proof and checks it on your machine. It does not send a stake.

<!-- screenshot placeholder: screenshots/walkthrough-05-proof.png — not captured -->

## 6. After that

You have an agent. Next is the receipt. Wallet/stake are testnet shadow.

A receipt line you can copy looks like this, three words, nothing else:

```text
glm cerebras FALSE
```

If the vote did not come back, the last word is NOT_CHECKED:

```text
openai openai NOT_CHECKED
```

## Security

- Do not paste `sb_secret_` into a chat, a ticket, or this file.
- Do not paste `DATABASE_URL` into a chat, a ticket, or this file.
- Do not enable `REAL_STAKING`.

Staking is not live. There is no mesh in this walk.
