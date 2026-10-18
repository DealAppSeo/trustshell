/**
 * `trustshell learn report` — the rulers of spec §5 with the §8.5 numeric rules. PURE: it reads a
 * Snapshot (metadata rows) and returns lines, so every rule here is tested without a file.
 *
 * Every number carries its ruler: job, check id, model family, eval-set hash. A ruler without enough
 * data prints "not measured", never a number. Each can come out worse. Rulers 1, 2, 5 and calibration
 * read check_outcome only (written by `learn check run`); agent_outcome and the person's rating are
 * reported as counts and move nothing. Episodes under job slugs the person did not create are left out.
 */
import { sha256, type Snapshot } from './store';

export const RULER1_N = 20;
export const RULER2_MIN_SUCCESSES = 10;
export const RULER4_MIN_REVIEWS = 20;
export const CALIBRATION_MIN = 20;
/** §8.5: a relative change of 10% or more is good or down; anything smaller is flat. */
export const CHANGE = 0.1;

type Episode = Snapshot['episodes'][number];
export type Direction = 'good' | 'down' | 'flat';

const byCheckTime = (a: Episode, b: Episode) => String(a.check_at).localeCompare(String(b.check_at)) || a.id - b.id;

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** §8.5 direction of a change from `base` to `now`. `higherIsBetter` false for a cost. */
export function direction(base: number, now: number, higherIsBetter: boolean): Direction {
  const signed = (higherIsBetter ? 1 : -1) * (now - base);
  if (base === 0) return signed > 0 ? 'good' : signed < 0 ? 'down' : 'flat';
  const rel = signed / Math.abs(base);
  return rel >= CHANGE ? 'good' : rel <= -CHANGE ? 'down' : 'flat';
}

export const READING: Record<string, string> = {
  'good/good': 'compounding',
  'good/down': 'dependency',
  'flat/good': 'learning is leaking out of the assets',
  'flat/down': 'stagnation',
};

function evalset(snap: Snapshot, job: string): string {
  const rows = snap.evals.filter((e) => e.job === job).map((e) => `${e.id}:${e.check_id ?? '-'}:${e.body_id}`);
  return rows.length ? sha256(rows.join('\n')).slice(0, 12) : 'none';
}

type Agent = { check: string; family: string; first: number; second: number };
type Human = { probe: number; check: string; first: number; latest: number };

export function buildReport(snap: Snapshot, now: Date = new Date()): string {
  const known = new Set(snap.jobs.map((j) => j.slug));
  const eps = snap.episodes.filter((e) => known.has(e.job));
  const checked = eps.filter((e) => e.check_outcome !== null && e.check_id !== null);
  const out: string[] = [`learn report · ${now.toISOString()} · rulers read check outcomes only (trustshell learn check run)`];
  const tag = (job: string, check: string, family: string) => `job ${job} · check ${check} · family ${family} · evalset ${evalset(snap, job)}`;

  // Ruler 1: same-check pass rate, first 10 vs next 10, same model family (a family change voids the job).
  // An episode with no recorded family is left out: it is neither a family change nor a data point.
  const r1: string[] = [];
  const familied = checked.filter((e) => e.family !== null);
  for (const c of snap.checks.filter((x) => known.has(x.job))) {
    const runs = familied.filter((e) => e.job === c.job && e.check_id === c.id).sort(byCheckTime);
    const fams = [...new Set(familied.filter((e) => e.job === c.job).map((e) => e.family as string))];
    const label = `ruler 1 same-check pass rate · job ${c.job} · check ${c.id}`;
    if (fams.length > 1) r1.push(`${label}: void, the model family changed on this job (${fams.join(', ')})`);
    else if (runs.length < RULER1_N) r1.push(`${label}: not measured (needs ${RULER1_N} checked episodes with a recorded model family)`);
    else {
      const w = runs.slice(0, RULER1_N);
      const pass = (xs: Episode[]) => xs.filter((e) => e.check_outcome === 'pass').length;
      r1.push(`ruler 1 same-check pass rate · ${tag(c.job, c.id, fams[0] as string)}: first 10 ${pass(w.slice(0, 10))}/10 pass, next 10 ${pass(w.slice(10))}/10 pass`);
    }
  }
  out.push(...(r1.length ? r1 : ['ruler 1 same-check pass rate: not measured (no check registered on a job)']));

  // Ruler 2: median (task + loop) tokens per verified success, first half vs second half, >= 5 a side.
  const agent = new Map<string, Agent>();
  const r2: string[] = [];
  for (const c of snap.checks.filter((x) => known.has(x.job))) {
    const wins = checked.filter((e) => e.job === c.job && e.check_id === c.id && e.check_outcome === 'pass' && e.tokens !== null);
    const fams = [...new Set(wins.map((e) => e.family ?? 'unrecorded'))];
    if (!fams.length) r2.push(`ruler 2 tokens per verified success · job ${c.job} · check ${c.id}: not measured (needs ${RULER2_MIN_SUCCESSES} passes with tokens recorded)`);
    for (const f of fams) {
      const s = wins.filter((e) => (e.family ?? 'unrecorded') === f).sort(byCheckTime);
      if (s.length < RULER2_MIN_SUCCESSES) {
        r2.push(`ruler 2 tokens per verified success · job ${c.job} · check ${c.id} · family ${f}: not measured (needs ${RULER2_MIN_SUCCESSES} passes with tokens recorded)`);
        continue;
      }
      const half = Math.floor(s.length / 2);
      const cost = (xs: Episode[]) => median(xs.map((e) => (e.tokens as number) + e.loop_tokens));
      const first = cost(s.slice(0, half));
      const second = cost(s.slice(half));
      if (!agent.has(c.job)) agent.set(c.job, { check: c.id, family: f, first, second });
      r2.push(`ruler 2 tokens per verified success · ${tag(c.job, c.id, f)}: median task+loop tokens first half ${first} (n=${half}), second half ${second} (n=${s.length - half})`);
    }
  }
  out.push(...(r2.length ? r2 : ['ruler 2 tokens per verified success: not measured (no check registered on a job)']));

  // Ruler 3: unaided probe on a learn job, first scored attempt vs the latest, same criterion.
  const human = new Map<string, Human>();
  const learnJobs = new Set(snap.jobs.filter((j) => j.mode === 'learn').map((j) => j.slug));
  const r3: string[] = [];
  for (const p of snap.probes.filter((x) => learnJobs.has(x.job))) {
    const label = `ruler 3 unaided probe · job ${p.job} · probe ${p.id} · check ${p.check_id} · family none (unaided)`;
    if (p.scores.length < 2) {
      r3.push(`${label}: not measured (needs two scored attempts)`);
      continue;
    }
    const first = (p.scores[0] as { score: number }).score;
    const latest = (p.scores[p.scores.length - 1] as { score: number }).score;
    if (!human.has(p.job)) human.set(p.job, { probe: p.id, check: p.check_id, first, latest });
    r3.push(`${label}: first ${first}, latest ${latest} (${p.scores.length} scored attempts)`);
  }
  out.push(...(r3.length ? r3 : ['ruler 3 unaided probe: not measured (no probe on a learn-mode job)']));

  // Ruler 4: share of due reviews recalled, first half vs second half, >= 10 a side.
  const rv = snap.reviews;
  if (rv.length < RULER4_MIN_REVIEWS) out.push(`ruler 4 retention: not measured (needs ${RULER4_MIN_REVIEWS} answered reviews)`);
  else {
    const half = Math.floor(rv.length / 2);
    const yes = (xs: typeof rv) => xs.filter((r) => r.result === 'yes').length;
    out.push(`ruler 4 retention · ladder 1/3/7/14/30 days: recalled first half ${yes(rv.slice(0, half))}/${half}, second half ${yes(rv.slice(half))}/${rv.length - half}`);
  }

  // Ruler 5: coupling. Correction -> eval case -> accepted lesson; prevented repeats per (job, check id).
  const r5: string[] = [];
  for (const j of snap.jobs) {
    const evals = snap.evals.filter((e) => e.job === j.slug).length;
    const accepted = snap.lessons.filter((l) => l.job === j.slug && l.accepted_at !== null).length;
    r5.push(
      evals
        ? `ruler 5 coupling · job ${j.slug} · evalset ${evalset(snap, j.slug)}: corrections ${evals} -> eval cases ${evals} -> accepted lessons ${accepted}`
        : `ruler 5 coupling · job ${j.slug}: not measured (no correction yet)`,
    );
  }
  const tags = new Map<string, string>();
  for (const l of snap.lessons) {
    if (l.accepted_at === null || l.check_id === null || !known.has(l.job)) continue;
    const key = `${l.job}\u0000${l.check_id}`;
    const at = tags.get(key);
    if (at === undefined || l.accepted_at < at) tags.set(key, l.accepted_at);
  }
  for (const [key, at] of tags) {
    const [job, check] = key.split('\u0000') as [string, string];
    const runs = checked.filter((e) => e.job === job && e.check_id === check);
    const before = runs.filter((e) => String(e.check_at) < at);
    const after = runs.filter((e) => String(e.check_at) >= at);
    const fails = (xs: Episode[]) => xs.filter((e) => e.check_outcome === 'fail').length;
    const fams = [...new Set(runs.map((e) => e.family ?? 'unrecorded'))].join(', ') || 'none';
    r5.push(
      before.length && after.length
        ? `ruler 5 prevented repeats · ${tag(job, check, fams)}: fails before acceptance ${fails(before)}/${before.length}, after ${fails(after)}/${after.length}`
        : `ruler 5 prevented repeats · job ${job} · check ${check}: not measured (needs checked episodes before and after the first acceptance)`,
    );
  }
  if (!tags.size) r5.push('ruler 5 prevented repeats: not measured (no accepted lesson on a (job, check id) tag)');
  out.push(...(r5.length ? r5 : ['ruler 5 coupling: not measured (no job)']));

  // Ruler 6: the 2x2. Agent cost per success (down is good) against the unaided score (up is good).
  const r6: string[] = [];
  for (const j of snap.jobs) {
    const a = agent.get(j.slug);
    const h = human.get(j.slug);
    if (!a || !h) continue;
    const ad = direction(a.first, a.second, false);
    const hd = direction(h.first, h.latest, true);
    const reading = READING[`${ad}/${hd}`] ?? 'no named reading';
    r6.push(`ruler 6 2x2 · job ${j.slug} · agent check ${a.check} family ${a.family} · human probe ${h.probe} check ${h.check}: agent ${ad}, human ${hd} -> ${reading}`);
  }
  out.push(...(r6.length ? r6 : ['ruler 6 2x2: not measured (needs ruler 2 and ruler 3 on the same job)']));

  // Calibration: Brier score of the confidence stated before the check ran, per model family.
  const stated = checked.filter((e) => e.confidence !== null && e.confidence_at !== null && String(e.confidence_at) <= String(e.check_at));
  const fams = [...new Set(stated.map((e) => e.family ?? 'unrecorded'))];
  const cal: string[] = [];
  for (const f of fams) {
    const xs = stated.filter((e) => (e.family ?? 'unrecorded') === f);
    if (xs.length < CALIBRATION_MIN) {
      cal.push(`calibration · family ${f}: not measured (needs ${CALIBRATION_MIN} checked episodes with confidence stated first)`);
      continue;
    }
    const brier = xs.reduce((s, e) => s + ((e.confidence as number) - (e.check_outcome === 'pass' ? 1 : 0)) ** 2, 0) / xs.length;
    const ids = [...new Set(xs.map((e) => e.check_id))].join(', ');
    cal.push(`calibration · family ${f} · checks ${ids}: Brier ${brier.toFixed(3)} over ${xs.length} checked episodes`);
  }
  out.push(...(cal.length ? cal : [`calibration: not measured (needs ${CALIBRATION_MIN} checked episodes with confidence stated first)`]));

  // Counts that move no ruler, said out loud so nobody reads them as outcomes.
  for (const j of snap.jobs) {
    const rated = eps.filter((e) => e.job === j.slug && e.rating !== null);
    if (rated.length) {
      const n = (r: string) => rated.filter((e) => e.rating === r).length;
      out.push(`person ratings · job ${j.slug} (reported, outside rulers 1-2): accept ${n('accept')}, edit ${n('edit')}, reject ${n('reject')}`);
    }
  }
  const agentWritten = snap.episodes.filter((e) => e.agent_outcome !== null).length;
  if (agentWritten) out.push(`agent-written outcomes: ${agentWritten} stored, read by no ruler`);
  const unknown = snap.episodes.length - eps.length;
  if (unknown) out.push(`episodes under job slugs the person did not create: ${unknown}, left out of every ruler`);
  const repeated = snap.checks.some((c) => checked.filter((e) => e.job === c.job && e.check_id === c.id).length >= 2);
  if (!snap.lessons.some((l) => l.accepted_at !== null) && !repeated) {
    out.push('capital did not compound: no accepted lesson and no repeated check');
  }
  return out.join('\n');
}
