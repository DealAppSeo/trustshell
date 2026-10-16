#!/usr/bin/env node
/**
 * Claude Code Stop hook: at the end of a turn, fill in that turn's episode with the model, its family
 * and the tokens the turn used, so rulers 1 and 2 can measure the hook path. It runs
 * `trustshell learn record --turn <key> [--model M] [--family F] [--tokens N]`.
 *
 * It only UPDATES the episode that examples/learn-hook/user-prompt-submit.mjs opened for the same turn
 * (same session id, same prompt hash). It never passes --job, so if no such episode exists `learn record`
 * refuses and nothing is written: one episode per turn. It never writes an outcome: only
 * `trustshell learn check run` does that.
 *
 * Where the numbers come from, first match wins:
 *   prompt   the payload's `prompt`, else the last prompt you typed in the transcript (`transcript_path`)
 *   model    the payload's `model`, else the last assistant message in the transcript, else TRUSTSHELL_LEARN_MODEL
 *   family   TRUSTSHELL_LEARN_FAMILY, else the model id up to its first - _ or . (claude-opus-5-5 -> claude)
 *   tokens   the payload's `usage`, else the sum over this turn's assistant messages; each counts
 *            input + output + cache creation + cache read tokens
 * The transcript is a local file Claude Code wrote. Nothing is sent anywhere; no text is stored.
 *
 * SETUP (.claude/settings.json), next to the UserPromptSubmit hook:
 *   { "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node examples/learn-hook/stop.mjs" } ] } ] } }
 * ENV: TRUSTSHELL_LEARN_JOB (required; unset = the hook does nothing), TRUSTSHELL_LEARN_MODEL,
 * TRUSTSHELL_LEARN_FAMILY, TRUSTSHELL_CLI (path to the CLI's index.js; default `trustshell` on PATH).
 *
 * It never blocks the end of a turn: any failure prints nothing and exits 0.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const LABEL = /^[A-Za-z0-9._:/@+-]{1,120}$/;
const label = (v) => (typeof v === 'string' && LABEL.test(v) ? v : undefined);

/** input + output + cache creation + cache read, from an Anthropic-style usage object. */
function usageTokens(u) {
  if (!u || typeof u !== 'object') return 0;
  return ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']
    .map((k) => (Number.isFinite(u[k]) ? Number(u[k]) : 0))
    .reduce((a, b) => a + b, 0);
}

/** A prompt the person typed: a user entry whose content is text, not a tool result. */
function typedPrompt(entry) {
  if (entry?.type !== 'user' || entry.isMeta) return null;
  const c = entry.message?.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c) || c.some((b) => b?.type === 'tool_result')) return null;
  const texts = c.filter((b) => b?.type === 'text').map((b) => b.text);
  return texts.length ? texts.join('\n') : null;
}

/** The last typed prompt, and the model and tokens of the assistant messages after it. */
function readTurn(lines) {
  let prompt = null;
  let model;
  let tokens = 0;
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const typed = typedPrompt(entry);
    if (typed !== null) {
      prompt = typed;
      model = undefined;
      tokens = 0;
    } else if (entry?.type === 'assistant' && prompt !== null) {
      model = entry.message?.model ?? model;
      tokens += usageTokens(entry.message?.usage);
    }
  }
  return { prompt, model, tokens };
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    const job = process.env.TRUSTSHELL_LEARN_JOB;
    if (!job || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(job)) return;
    const event = JSON.parse(input || '{}');
    let turn = { prompt: null, model: undefined, tokens: 0 };
    if (typeof event.transcript_path === 'string') {
      try {
        turn = readTurn(readFileSync(event.transcript_path, 'utf8').split('\n'));
      } catch {
        /* no transcript: use what the payload gives */
      }
    }
    const prompt = typeof event.prompt === 'string' ? event.prompt : turn.prompt;
    if (prompt === null) return;
    const ask = createHash('sha256').update(prompt, 'utf8').digest('hex');
    const session = String(event.session_id ?? 'no-session').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80) || 'no-session';
    const model = label(event.model) ?? label(turn.model) ?? label(process.env.TRUSTSHELL_LEARN_MODEL);
    const family = label(process.env.TRUSTSHELL_LEARN_FAMILY) ?? label(model?.split(/[-_.]/)[0]);
    const tokens = event.usage ? usageTokens(event.usage) : turn.tokens;
    const args = ['learn', 'record', '--turn', `${session}:${ask.slice(0, 16)}`];
    if (model) args.push('--model', model);
    if (family) args.push('--family', family);
    if (tokens > 0) args.push('--tokens', String(Math.round(tokens)));
    if (args.length === 4) return;
    const cli = process.env.TRUSTSHELL_CLI;
    if (cli) spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true });
    else spawnSync('trustshell', args, { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' });
  } catch {
    /* never block the end of a turn */
  }
});
