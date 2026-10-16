#!/usr/bin/env node
/**
 * Claude Code UserPromptSubmit hook: the reader of the learning loop on a path every turn takes.
 *
 * On each prompt it runs `trustshell learn inject --job <slug> --turn <key>` and prints what that
 * prints. Claude Code adds a UserPromptSubmit hook's stdout to the prompt's context, so the model
 * sees the lessons YOU accepted for this job, in your own words, verbatim (at most 5 / 400 tokens),
 * and the instruction for the mode you chose (learn: your attempt first; cowork: your prediction
 * first). Nothing else: declined, held, expired and other jobs' lessons never print.
 *
 * SETUP (.claude/settings.json in your project):
 *   { "hooks": { "UserPromptSubmit": [ { "hooks": [
 *       { "type": "command", "command": "node examples/learn-hook/user-prompt-submit.mjs" } ] } ] } }
 * and set TRUSTSHELL_LEARN_JOB to a job you created (`trustshell learn job add`). Unset: prints nothing.
 *
 * ENV
 *   TRUSTSHELL_LEARN_JOB    the job slug for this project. Required, or the hook does nothing.
 *   TRUSTSHELL_LEARN_CHECK  optional: a check you registered on that job; frozen on the turn's episode.
 *   TRUSTSHELL_LEARN_MODEL  optional: the model id (claude-opus-5-5), recorded on the episode.
 *   TRUSTSHELL_LEARN_FAMILY optional: the model family (claude, gpt, gemini). Without it the episode has no
 *                           family and ruler 1 leaves it out. examples/learn-hook/stop.mjs fills both in
 *                           from the transcript at the end of the turn.
 *   TRUSTSHELL_CLI          optional: path to the CLI's index.js, run with this node. Default: `trustshell`.
 *
 * The turn key is the session id plus a hash of the prompt, so a second call for the same turn updates
 * the same episode. The prompt itself is never passed on or stored: only its sha256.
 *
 * It never blocks your prompt: any failure prints nothing and exits 0.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    const job = process.env.TRUSTSHELL_LEARN_JOB;
    const check = process.env.TRUSTSHELL_LEARN_CHECK;
    // The same shapes the CLI accepts, checked here too: on Windows the call goes through a shell.
    if (!job || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(job)) return;
    if (check && !/^[A-Za-z0-9._:/@+-]{1,120}$/.test(check)) return;
    const label = (v) => (v && /^[A-Za-z0-9._:/@+-]{1,120}$/.test(v) ? v : undefined);
    const model = label(process.env.TRUSTSHELL_LEARN_MODEL);
    const family = label(process.env.TRUSTSHELL_LEARN_FAMILY);
    const event = JSON.parse(input || '{}');
    const ask = createHash('sha256').update(String(event.prompt ?? ''), 'utf8').digest('hex');
    const session = String(event.session_id ?? 'no-session').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80) || 'no-session';
    const args = ['learn', 'inject', '--job', job, '--turn', `${session}:${ask.slice(0, 16)}`, '--ask-sha256', ask];
    if (check) args.push('--check', check);
    if (model) args.push('--model', model);
    if (family) args.push('--family', family);
    const cli = process.env.TRUSTSHELL_CLI;
    const r = cli
      ? spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true })
      : spawnSync('trustshell', args, { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' });
    if (r.status === 0 && r.stdout) process.stdout.write(r.stdout);
  } catch {
    /* never block the prompt */
  }
});
