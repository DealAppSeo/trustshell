/**
 * `trustshell learn …` — the learning loop's verbs. Local sqlite only; no network.
 * Exit: 0 done, 1 a check or probe ran and failed, 2 usage / refused / not checked, 3 runtime error.
 * `learn inject` is called from a prompt hook on every turn, so it never fails a prompt: a missing
 * memory file, an unknown job or an unreadable file prints nothing and exits 0.
 */
import {
  LearnError,
  acceptLesson,
  reacceptLesson,
  retirementOf,
  addAttempt,
  addCheck,
  addJob,
  addProbe,
  answerReview,
  correct,
  declineLesson,
  dueReviews,
  inject,
  listJobs,
  listLessons,
  rateEpisode,
  recordEpisode,
  runCheck,
  runProbe,
  snapshot,
  type Outcome,
} from './store';
import { buildReport } from './report';
import { createInterface } from 'node:readline';

export type LearnIO = { out: (s: string) => void; err: (s: string) => void };

/**
 * The terminal `learn reaccept` needs: is stdin an interactive TTY, and a way to ask one question on it.
 * Injected so tests can simulate one; the default is this process's own stdin.
 */
export type Terminal = { isTTY: boolean; ask: (question: string) => Promise<string> };

export const stdinTerminal: Terminal = {
  get isTTY() {
    return process.stdin.isTTY === true;
  },
  ask: (question) =>
    new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }),
};

export const LEARN_USAGE = `trustshell learn — the learning loop (local; nothing leaves the machine)
  learn job add <slug> --mode delegate|cowork|learn "When …, I want …, so I can …"
  learn job list
  learn check add --job <slug> --id <check> --cmd "<deterministic command>"
  learn check run <check> [--episode N | --turn K]     the only writer of a check outcome (exit code)
  learn record --job <slug> [--episode N | --turn K] [--model M] [--family F] [--tokens N]
               [--check <check>] [--confidence 0-1] [--outcome pass|fail] [--ask-sha256 H]
                                                       --outcome is stored as the agent's, read by no ruler
  learn rate <episode> accept|edit|reject             your rating; reported, outside rulers 1-2
  learn correct --job <slug> [--check C] [--episode N] [--credit <label>] [--note "<paraphrase>"] "<your words>"
                                                       eval case first, then a candidate lesson
               [--derived-from-untrusted <label>]     the text is not yours: held for good, never injected
  learn accept <lesson> | learn decline <lesson>
  learn reaccept <lesson>                             bring back a RETIRED lesson: prints why it was retired,
                                                       then asks you, at a terminal, to type its id back
  learn lessons [--job <slug>]
  learn attempt --job <slug> [--episode N] "<your attempt>"
  learn inject --job <slug> [--turn K] [--check C] [--model M] [--family F] [--ask-sha256 H]
  learn probe add --job <slug> --check <check> --criterion "<written before the attempt>"
  learn probe run <probe>
  learn review | learn review <review> yes|no
  learn report`;

const VALUE = new Set([
  '--job', '--mode', '--turn', '--episode', '--model', '--family', '--tokens', '--check', '--confidence',
  '--outcome', '--source', '--derived-from-untrusted', '--credit', '--note', '--id', '--cmd', '--ask-sha256', '--criterion',
]);

function parse(argv: string[]): { pos: string[]; opt: Record<string, string> } {
  const pos: string[] = [];
  const opt: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] as string;
    if (a === '--') {
      pos.push(...argv.slice(i + 1));
      break;
    }
    if (VALUE.has(a)) {
      const v = argv[i + 1];
      if (v === undefined) throw new LearnError(`${a} requires a value`);
      opt[a.slice(2)] = v;
      i += 1;
    } else if (/^--?[A-Za-z]/.test(a)) throw new LearnError(`unknown option: ${a}`);
    else pos.push(a);
  }
  return { pos, opt };
}

/**
 * PURE. The verb when `argv` would execute a registered command (`check run`, `probe run`), else null.
 * Arguments that do not parse return null: `learn` refuses them before anything runs.
 */
export function learnExecutes(argv: string[]): string | null {
  let pos: string[];
  try {
    pos = parse(argv).pos;
  } catch {
    return null;
  }
  return (pos[0] === 'check' || pos[0] === 'probe') && pos[1] === 'run' ? `learn ${pos[0]} run` : null;
}

function whole(what: string, v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v)) throw new LearnError(`${what} must be a whole number`);
  return Number(v);
}

function id(what: string, v: string | undefined): number {
  if (v === undefined || !/^[1-9]\d*$/.test(v)) throw new LearnError(`${what} needs an id (a whole number)`);
  return Number(v);
}

function only(rest: string[], n: number): void {
  if (rest.length > n) throw new LearnError(`unexpected argument: ${rest[n]}`);
}

function ref(opt: Record<string, string>): { episode?: number; turn?: string } {
  if (opt.episode !== undefined && opt.turn !== undefined) throw new LearnError('give --episode or --turn, not both');
  return { episode: whole('--episode', opt.episode), turn: opt.turn };
}

async function dispatch(argv: string[], io: LearnIO, env: NodeJS.ProcessEnv, tty: Terminal): Promise<number> {
  const { pos, opt } = parse(argv);
  const [verb, ...rest] = pos;
  const text = rest.join(' ').trim();
  switch (verb) {
    case 'job': {
      const [sub, slug, ...words] = rest;
      if (sub === 'list') {
        only(rest, 1);
        const jobs = listJobs(env);
        if (!jobs.length) io.out('learn: no jobs yet (trustshell learn job add)');
        for (const j of jobs) {
          io.out(`${j.slug}  ${j.mode}  ${j.jtbd}`);
          for (const c of j.checks) io.out(`  check ${c.id}: ${c.cmd}`);
        }
        return 0;
      }
      if (sub !== 'add' || !slug) throw new LearnError('`learn job` takes add <slug> --mode <mode> "<line>" or list');
      if (opt.mode === undefined) throw new LearnError('--mode delegate|cowork|learn is required: the person chooses it');
      addJob(slug, opt.mode, words.join(' '), env);
      io.out(`job ${slug} added (${opt.mode})`);
      return 0;
    }
    case 'check': {
      const [sub, checkId] = rest;
      if (sub === 'add') {
        only(rest, 1);
        if (!opt.job || !opt.id || opt.cmd === undefined) throw new LearnError('`learn check add` needs --job, --id and --cmd');
        addCheck(opt.job, opt.id, opt.cmd, env);
        io.out(`check ${opt.id} registered on job ${opt.job}`);
        return 0;
      }
      if (sub !== 'run' || !checkId) throw new LearnError('`learn check` takes add or run <check>');
      only(rest, 2);
      const r = runCheck(checkId, ref(opt), env);
      if (r.outcome === null) {
        io.out(`check ${r.check} NOT_CHECKED: the command did not exit (killed, timed out or could not start); nothing was written`);
        return 2;
      }
      io.out(`check ${r.check} ${r.outcome} (exit ${r.exit}) · episode ${r.episode}`);
      for (const line of r.retired) io.out(line);
      return r.outcome === 'pass' ? 0 : 1;
    }
    case 'record': {
      only(rest, 0);
      if (opt.outcome !== undefined && opt.outcome !== 'pass' && opt.outcome !== 'fail') throw new LearnError('--outcome is pass or fail');
      const confidence = opt.confidence === undefined ? undefined : Number(opt.confidence);
      if (confidence !== undefined && !Number.isFinite(confidence)) throw new LearnError('--confidence is a probability, 0 to 1');
      const r = recordEpisode(
        {
          job: opt.job,
          ...ref(opt),
          model: opt.model,
          family: opt.family,
          tokens: whole('--tokens', opt.tokens),
          check: opt.check,
          confidence,
          outcome: opt.outcome as Outcome | undefined,
          askSha256: opt['ask-sha256'],
        },
        env,
      );
      io.out(`episode ${r.episode} ${r.created ? 'recorded' : 'updated'}`);
      return 0;
    }
    case 'rate': {
      only(rest, 2);
      const episode = id('`learn rate`', rest[0]);
      rateEpisode(episode, rest[1] ?? '', env);
      io.out(`episode ${episode} rated ${rest[1]}`);
      return 0;
    }
    case 'correct': {
      if (!opt.job) throw new LearnError('`learn correct` needs --job');
      if (opt.source !== undefined && opt['derived-from-untrusted'] !== undefined) throw new LearnError('give --derived-from-untrusted once (--source is its old name)');
      // DEPRECATED: --source used to name where a correction came from, and silently made it untrusted.
      if (opt.source !== undefined) io.err('warning: --source is deprecated and means --derived-from-untrusted: this lesson will never be injectable. To credit who prompted it, use --credit.');
      const r = correct(
        {
          job: opt.job,
          text,
          check: opt.check,
          episode: whole('--episode', opt.episode),
          derivedFrom: opt['derived-from-untrusted'] ?? opt.source,
          credit: opt.credit,
          note: opt.note,
        },
        env,
      );
      io.out(`eval case ${r.eval}, then lesson ${r.lesson} (${r.status})`);
      if (r.status === 'candidate') io.err(`your words, held until you accept them: trustshell learn accept ${r.lesson}`);
      else io.err(`held: ${r.reason}`);
      if (r.note !== null) io.err(`the paraphrase is note ${r.note}, quarantined; it is never injected`);
      return 0;
    }
    case 'accept': {
      only(rest, 1);
      const lesson = id('`learn accept`', rest[0]);
      const r = acceptLesson(lesson, env);
      io.out(`lesson ${lesson} accepted until ${r.expires_at}`);
      return 0;
    }
    case 'reaccept': {
      // Only the person brings a retired lesson back: the retirement receipt first, then an interactive
      // terminal and the lesson id typed back. A script or an agent's shell has no TTY, so it is refused
      // before anything is written. Not an MCP tool.
      only(rest, 1);
      const lesson = id('`learn reaccept`', rest[0]);
      io.out(`lesson ${lesson} was ${retirementOf(lesson, env)}`);
      if (!tty.isTTY) {
        io.err(`learn reaccept: refused, nothing was written. It needs you at an interactive terminal to type the lesson id back; this input is not a terminal.`);
        return 2;
      }
      const typed = (await tty.ask(`Type ${lesson} to re-accept this lesson for 30 days: `)).trim();
      if (typed !== String(lesson)) {
        io.err(`learn reaccept: you typed ${JSON.stringify(typed.slice(0, 20))}, not ${lesson}; nothing was written`);
        return 2;
      }
      const r = reacceptLesson(lesson, env);
      io.out(`lesson ${lesson} accepted until ${r.expires_at}`);
      io.out(`receipt: ${r.reaccept_receipt}`);
      return 0;
    }
    case 'decline': {
      only(rest, 1);
      const lesson = id('`learn decline`', rest[0]);
      declineLesson(lesson, env);
      io.out(`lesson ${lesson} declined`);
      return 0;
    }
    case 'lessons': {
      only(rest, 0);
      const rows = listLessons(opt.job, env);
      if (!rows.length) io.out('learn: no lessons');
      for (const l of rows) {
        const when = l.status === 'accepted' ? ` until ${l.expires_at}` : l.reason ? ` (${l.reason})` : '';
        io.out(`${l.id}  ${l.job}${l.check ? `/${l.check}` : ''}  ${l.status}${when}  ${l.text}`);
      }
      return 0;
    }
    case 'attempt': {
      if (!opt.job) throw new LearnError('`learn attempt` needs --job');
      const attempt = addAttempt({ job: opt.job, text, episode: whole('--episode', opt.episode) }, env);
      io.out(`attempt ${attempt} stored; the next inject on job ${opt.job} binds it to that turn`);
      return 0;
    }
    case 'inject': {
      only(rest, 0);
      if (!opt.job) throw new LearnError('`learn inject` needs --job');
      let r: ReturnType<typeof inject> = null;
      try {
        r = inject({ job: opt.job, turn: opt.turn, check: opt.check, askSha256: opt['ask-sha256'], model: opt.model, family: opt.family }, env);
      } catch (e) {
        if (e instanceof LearnError) throw e;
        io.err(`learn inject: nothing injected (${e instanceof Error ? e.message : String(e)})`);
        return 0;
      }
      if (r && r.text) io.out(r.text);
      return 0;
    }
    case 'probe': {
      const [sub, probeId] = rest;
      if (sub === 'add') {
        only(rest, 1);
        if (!opt.job || !opt.check || opt.criterion === undefined) throw new LearnError('`learn probe add` needs --job, --check and --criterion');
        const p = addProbe({ job: opt.job, check: opt.check, criterion: opt.criterion }, env);
        io.out(`probe ${p}: criterion stored before the attempt. Attempt it unaided, then: trustshell learn probe run ${p}`);
        return 0;
      }
      if (sub !== 'run') throw new LearnError('`learn probe` takes add or run <probe>');
      only(rest, 2);
      const r = runProbe(id('`learn probe run`', probeId), env);
      if (r.score === null) {
        io.out(`probe ${r.probe} NOT_CHECKED: check ${r.check} did not exit; nothing was scored`);
        return 2;
      }
      io.out(`probe ${r.probe} scored ${r.score} by check ${r.check} (exit ${r.exit}), unaided`);
      return r.score === 1 ? 0 : 1;
    }
    case 'review': {
      if (rest.length === 0) {
        const due = dueReviews(env);
        if (!due.length) io.out('learn: no review due');
        for (const d of due) io.out(`review ${d.id} · lesson ${d.lesson} · job ${d.job} · ${d.days}-day step: ${d.cue}`);
        if (due.length) io.out('answer from memory, then: trustshell learn review <review> yes|no');
        return 0;
      }
      only(rest, 2);
      const review = id('`learn review`', rest[0]);
      if (rest[1] !== 'yes' && rest[1] !== 'no') throw new LearnError('answer yes (recalled) or no (missed)');
      const r = answerReview(review, rest[1], env);
      io.out(`review ${review}: ${rest[1] === 'yes' ? 'recalled' : 'missed, back to the 1-day step'}; next due ${r.next_due} (${r.days} days)`);
      return 0;
    }
    case 'report': {
      only(rest, 0);
      const snap = snapshot(env);
      io.out(snap ? buildReport(snap) : 'learn report: no memory file, nothing measured');
      return 0;
    }
    default:
      throw new LearnError(verb ? `unknown learn verb: ${verb}` : 'learn needs a verb');
  }
}

export async function runLearn(
  argv: string[],
  io: LearnIO,
  env: NodeJS.ProcessEnv = process.env,
  tty: Terminal = stdinTerminal,
): Promise<number> {
  try {
    return await dispatch(argv, io, env, tty);
  } catch (e) {
    if (e instanceof LearnError) {
      io.err(`learn: ${e.message}`);
      if (/^(unknown|learn needs)/.test(e.message)) io.err(LEARN_USAGE);
      return 2;
    }
    io.err(`learn failed: ${e instanceof Error ? e.message : String(e)}`);
    return 3;
  }
}
