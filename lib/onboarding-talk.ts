/**
 * THE POST-CHECK CONVERSATION (onboarding v0, 2026-10-24). SHADOW: off by default (lib/onboarding-flag.ts).
 *
 * WHAT IT IS, SAID PLAINLY. A scripted guide, not an AI model: a few fixed questions that come one at a time,
 * each worded from the last answer, in a pace that never stacks the personal ones. It sends nothing; the
 * answers live in this visit until the person chooses to keep them on this device. It is a layer AFTER the free
 * check, never before it, the check never waits on it and its verdict never depends on it, and every question
 * can be skipped.
 *
 * BILATERAL, in the one sense this site can honestly mean today. The person teaches the guide how they work
 * (the answers); the guide teaches the person one true thing back, picked from the answers and tied to a page
 * that exists (`lesson`), and says back what it heard first (`reflect`). Nothing is learned between visits except
 * what the person chose to keep, and they can download it or delete it. (Evidence for two-way teaching raising
 * outcomes in adults is thin; Zhang et al. 2024 found no team-performance gain. This is a design choice, not a claim.)
 *
 * WHY NOT AN LLM HERE. Anything typed to a model leaves the browser, and a model can state a false quote in the
 * same voice as a true one, which is the thing this site exists to catch. A script cannot, and can say so. A later
 * version could use a model WITH consent; the profile below is the same either way.
 *
 * WHAT THE RESEARCH CHANGED (notes folder, RESEARCH_A / RESEARCH_B, 2026-10-24):
 *   - No "favorite book or film" free text. A favorite can reveal belief or orientation (GDPR Art. 9 looks at what
 *     data reveal), so the book question is a MENU of six public-domain classics and anything else is not stored.
 *   - Session-only by default; keeping it on the device is a separate, explicit tick, with a stated expiry.
 *   - Every question shows why it is asked. Skip is as easy as answer. Delete is one click.
 *   - It is called "a scripted guide" and says so on the first screen and in the export. No name, face or voice.
 *   - No sound. (Web Audio goes silent or loud against the phone's silent switch on iOS; the value is unproven.)
 *
 * NO FALSE QUOTE, EVER. A line comes back only from `QUOTES`: public-domain lines, each checked against its
 * edition's own text (docs/measurements/onboarding-quotes-2026-10-24.md; the check caught a wrong comma in the first
 * draft of one). A film gets none, and a title not on the menu gets none.
 */

export type Role = 'engineer' | 'designer' | 'vibe-coder' | 'marketer' | 'other';

/** The portable "how I work" card. Versioned, plain JSON, only the keys the person answered. */
export type Profile = {
  v: 1;
  job?: string;
  role?: Role;
  tools?: string;
  wish?: string;
  experience?: 'new' | 'some' | 'daily';
  color?: string;
  /** The work's canonical title, from the menu. Never free text. */
  book?: string;
  /** Set only when the person chose to keep this on the device; the card expires EXPIRY_DAYS later. */
  savedAt?: string;
};

export type QuestionId = 'job' | 'role' | 'tools' | 'wish' | 'experience' | 'color' | 'book';
export type Question = { id: QuestionId; kind: 'core' | 'delight'; text: string; why: string; options?: readonly string[]; placeholder?: string };

export const EMPTY: Profile = { v: 1 };
export const EXPIRY_DAYS = 90;

/** Said on the first screen, and again in the export. */
export const DISCLOSURE =
  'This is a scripted guide. It asks fixed questions and does not use an AI model. Your answers stay in this browser. You can see, download or delete them.';
export const ABOUT = 'Made by the scripted guide on trustshell.dev. No AI model was used. Kept only in your browser until you downloaded this file.';

/** The pace rules, in one place so a test can hold them. */
export const PACE = {
  /** Questions in the first pass: three that matter, and at most one for fun. */
  firstPassCore: 3,
  firstPassDelight: 1,
  /** A fun question never comes before this many answered or skipped turns. */
  delightNotBefore: 2,
  /** Across a whole visit, however many times the person asks to keep going. */
  delightMax: 2,
} as const;

const ROLE_OPTIONS: readonly string[] = ['Engineer', 'Designer', 'Vibe-coder', 'Marketer', 'Something else'];
const ROLE_OF: Record<string, Role> = { engineer: 'engineer', designer: 'designer', 'vibe-coder': 'vibe-coder', marketer: 'marketer' };
export const roleFromAnswer = (a: string): Role => ROLE_OF[a.trim().toLowerCase()] ?? 'other';

const lower = (s: string | undefined) => (s ?? '').trim().toLowerCase();
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const mentions = (s: string | undefined, ...words: string[]) => words.some((w) => lower(s).includes(w));

// --- one line from a classic, or none ------------------------------------------------------------------

export type Quote = { work: string; author: string; line: string; where: string; source: string };

/**
 * Public-domain lines only, each one checked against its edition's text on 2026-10-24
 * (docs/measurements/onboarding-quotes-2026-10-24.md). Keys are normalized titles; several spellings of one work share a row.
 */
const ROWS: Quote[] = [
  { work: 'Pride and Prejudice', author: 'Jane Austen', line: 'It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.', where: 'Chapter 1', source: 'https://www.gutenberg.org/ebooks/1342' },
  { work: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', line: 'Curiouser and curiouser!', where: 'Chapter 2', source: 'https://www.gutenberg.org/ebooks/11' },
  { work: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', line: 'You see, but you do not observe.', where: 'A Scandal in Bohemia', source: 'https://www.gutenberg.org/ebooks/1661' },
  { work: 'Frankenstein', author: 'Mary Shelley', line: 'It was on a dreary night of November that I beheld the accomplishment of my toils.', where: 'Chapter 5', source: 'https://www.gutenberg.org/ebooks/84' },
  { work: 'Moby-Dick', author: 'Herman Melville', line: 'Call me Ishmael.', where: 'Chapter 1', source: 'https://www.gutenberg.org/ebooks/2701' },
  // A clause of a longer sentence ("... it was the age of wisdom ..."): it stops at the clause boundary and shows no closing period.
  { work: 'A Tale of Two Cities', author: 'Charles Dickens', line: 'It was the best of times, it was the worst of times', where: 'Book 1, Chapter 1', source: 'https://www.gutenberg.org/ebooks/98' },
];
const ALIASES: Record<string, string> = {
  'alice in wonderland': "Alice's Adventures in Wonderland",
  'adventures of sherlock holmes': 'The Adventures of Sherlock Holmes',
  'sherlock holmes': 'The Adventures of Sherlock Holmes',
  'moby dick': 'Moby-Dick',
};
/** Lowercase, straight apostrophes, single spaces, no leading "the ". */
const normTitle = (t: string) => t.trim().toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').replace(/^the\s+/, '');

export const QUOTES: Record<string, Quote> = Object.fromEntries([
  ...ROWS.map((q) => [normTitle(q.work), q] as const),
  ...Object.entries(ALIASES).map(([alias, work]) => [alias, ROWS.find((q) => q.work === work)!] as const),
]);
/** The menu: each work once, in list order. */
export const WORKS: readonly string[] = ROWS.map((q) => q.work);

/** The menu answer for what was typed or clicked, or null: anything not on the menu is not stored. */
export const bookFrom = (answer: string): string | null => QUOTES[normTitle(answer)]?.work ?? null;
export const quoteFor = (book: string | undefined): Quote | null => (book ? ROWS.find((q) => q.work === book) ?? null : null);

/** What the guide says when the typed title is not on the menu. */
export const NOT_ON_MENU = 'I only have checked lines from the six classics on the menu, so I will not guess at that one, and I did not keep it.';

// --- the questions --------------------------------------------------------------------------------------

/** The question for an id, worded from what the person already said. Each says why it is asked. */
export function ask(id: QuestionId, p: Profile): Question {
  switch (id) {
    case 'job':
      return {
        id, kind: 'core',
        text: 'What is the main thing you would want an AI assistant to handle for you right now?',
        why: 'So I can suggest a first thing to try.',
        options: ['Coding', 'Research', 'Writing and content', 'Something else'],
        placeholder: 'Or say it your own way',
      };
    case 'role': {
      // The option that fits the job comes first; the rest keep their order. Same five options either way.
      const first = mentions(p.job, 'cod', 'build', 'software', 'program', 'develop') ? 'Vibe-coder'
        : mentions(p.job, 'writ', 'content', 'market') ? 'Marketer'
        : mentions(p.job, 'design') ? 'Designer' : null;
      const options = first ? [first, ...ROLE_OPTIONS.filter((o) => o !== first)] : ROLE_OPTIONS;
      return {
        id, kind: 'core',
        text: p.job ? `You said "${short(p.job, 60)}". Which of these sounds most like you?` : 'Which of these sounds most like you?',
        why: 'So I can pick which page to show you next.',
        options,
      };
    }
    case 'tools':
      return {
        id, kind: 'core',
        text: p.role && p.role !== 'other' ? `As ${/^[aeiou]/.test(p.role) ? 'an' : 'a'} ${p.role}, which software do you use the most?` : 'Which software do you use the most?',
        why: 'So the examples can use software you already know.',
        placeholder: 'A few names is plenty',
      };
    case 'wish':
      return {
        id, kind: 'core',
        text: p.tools ? `Of ${short(p.tools, 80)}, which would you most like an AI to handle for you?` : 'Which software would you like an AI to manage for you?',
        why: 'So I know where a second opinion would help you most.',
        placeholder: 'One is enough',
      };
    case 'experience':
      return { id, kind: 'core', text: 'How much have you used AI tools so far?', why: 'So the next step is pitched at the right level.', options: ['Just starting', 'Some', 'Every day'] };
    case 'color':
      return {
        id, kind: 'delight',
        text: 'One just for fun: what is your favorite color?',
        why: 'Only to tint this page a little. Nothing else uses it.',
        placeholder: 'A color name, or pick one',
      };
    case 'book':
      return {
        id, kind: 'delight',
        text: 'And one more, just for fun: pick a classic and I will show you a line from it before we are done.',
        why: 'Only to show you that line. Nothing else uses it, and it is a menu so you do not have to tell me what you read.',
        options: WORKS,
      };
  }
}

/** The order the core questions come in. The first three are the first pass; the rest are "keep going". */
const CORE_ORDER: readonly QuestionId[] = ['job', 'role', 'tools', 'wish', 'experience'];
const DELIGHT_ORDER: readonly QuestionId[] = ['color', 'book'];

export type Rng = () => number;
export type Turn = { asked: readonly QuestionId[]; lastKind: 'core' | 'delight' | null };

/**
 * The next question, or null when this pass is over. Rules: core questions first, in order, adapted by the
 * answers; a fun question only after PACE.delightNotBefore turns, never right after another one, never in the
 * last slot, at most PACE.delightMax per visit; and a pass ends at three core plus at most one fun question.
 * `keepGoing` is the person's own request for more after the first pass (a deliberate step past "four or fewer").
 */
export function pickNext(t: Turn, p: Profile, rng: Rng, keepGoing = false): Question | null {
  const core = t.asked.filter((id) => CORE_ORDER.includes(id)).length;
  const fun = t.asked.filter((id) => DELIGHT_ORDER.includes(id)).length;
  const pending = CORE_ORDER.filter((id) => !t.asked.includes(id));
  const coreCap = keepGoing ? CORE_ORDER.length : PACE.firstPassCore;
  const funCap = keepGoing ? PACE.delightMax : PACE.firstPassDelight;

  const funLeft = DELIGHT_ORDER.filter((id) => !t.asked.includes(id));
  const funAllowed =
    funLeft.length > 0 && fun < funCap && t.asked.length >= PACE.delightNotBefore && t.lastKind !== 'delight' &&
    core < coreCap; // not in the last slot: the pass ends on something that helps, not on a fun question
  if (funAllowed && rng() < 0.5) return ask(funLeft[0], p);
  if (core < coreCap && pending.length) return ask(pending[0], p);
  return null;
}

/** What it heard, in the person's own words. Names only what was said; says nothing about the rest. */
export function reflect(p: Profile): string {
  const bits: string[] = [];
  if (p.job) bits.push(`you want help with "${short(p.job, 60)}"`);
  if (p.role && p.role !== 'other') bits.push(`you would call yourself ${/^[aeiou]/.test(p.role) ? 'an' : 'a'} ${p.role}`);
  if (p.tools) bits.push(`you use "${short(p.tools, 80)}" the most`);
  if (p.wish) bits.push(`you would like an AI to handle "${short(p.wish, 60)}"`);
  if (p.experience) bits.push(p.experience === 'daily' ? 'you use AI tools every day' : p.experience === 'some' ? 'you have used AI tools some' : 'you are just starting with AI tools');
  if (!bits.length) return 'You skipped all of it, which is fine. I kept nothing.';
  return `Here is what I heard: ${bits.join('; ')}. If that is off, delete it and tell me again.`;
}

export type Step = { text: string; href: string; cta: string };

/**
 * One true thing back, and one next step, picked from the answers. Every href is a page that exists, and each
 * sentence restates something that page already says.
 */
export function lesson(p: Profile): Step {
  if (mentions(p.tools, 'openclaw') || mentions(p.job, 'openclaw')) {
    return { text: 'Skills and plugins for an autonomous agent are code you did not write. Here is what a check does and does not do for that.', href: '/for/openclaw', cta: 'See how it applies to OpenClaw' };
  }
  switch (p.role) {
    case 'vibe-coder':
      return { text: "An AI can write working code with a secret key in it. A key left in a page's JavaScript is readable by every visitor.", href: '/for/vibe-coders', cta: 'Play five rounds: spot the lie' };
    case 'engineer':
      return { text: 'The same check runs from your terminal, so a claim about a CI run is checked before it is believed.', href: '/build#run-it', cta: 'Run it in five minutes' };
    case 'marketer':
      return { text: 'A confident sentence is easy to publish and hard to take back. Paste the one you are about to post.', href: '/check', cta: 'Check a claim before it goes out' };
    case 'designer':
      return { text: 'When an AI tells you a spec, a license or a number, you can have two other AIs read it before you build on it.', href: '/check', cta: 'Check one answer' };
    default:
      return { text: 'You can make an agent of your own in three questions and watch its public score move.', href: '/pai', cta: 'Make your agent' };
  }
}

// --- color: a tint that cannot hurt contrast -----------------------------------------------------------

const HUE: Record<string, number> = {
  red: 0, orange: 25, amber: 40, yellow: 50, lime: 90, green: 130, teal: 175, cyan: 190, blue: 215,
  indigo: 240, purple: 270, violet: 270, magenta: 300, pink: 330,
};

function hexToHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.04) return null; // a gray has no hue to follow
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(((hue * 60) + 360) % 360);
}

/** A hue 0-359 for a color word or a hex code, or null: an unknown color leaves the page alone and says so. */
export function hueOf(input: string): number | null {
  const s = lower(input).replace(/^(dark|light|deep|bright|pale)\s+/, '');
  if (s in HUE) return HUE[s];
  return hexToHue(input);
}

/** Low alpha over the dark page: the text colors keep their contrast (held by a test over every hue). */
export const TINT_ALPHA = 0.08;
export const tintCss = (hue: number) => `hsl(${hue} 70% 50% / ${TINT_ALPHA})`;

// --- the card the person owns --------------------------------------------------------------------------

/** The export: versioned plain JSON, exactly what was answered, plus what made it. */
export function toExport(p: Profile): string {
  const clean: Record<string, unknown> = { v: 1, about: ABOUT };
  for (const k of ['job', 'role', 'tools', 'wish', 'experience', 'color', 'book', 'savedAt'] as const) if (p[k] !== undefined) clean[k] = p[k];
  return JSON.stringify(clean, null, 2) + '\n';
}

/**
 * Read back what was stored, keeping only keys of the right shape. A bad blob, an unknown book or one saved
 * more than EXPIRY_DAYS ago is an empty profile.
 */
export function parseStored(raw: string | null, now: number = Date.now()): Profile {
  try {
    const o = JSON.parse(raw ?? '');
    if (!o || o.v !== 1) return EMPTY;
    if (typeof o.savedAt === 'string') {
      const saved = Date.parse(o.savedAt);
      if (!Number.isFinite(saved) || now - saved > EXPIRY_DAYS * 86_400_000) return EMPTY;
    }
    const p: Profile = { v: 1 };
    for (const k of ['job', 'tools', 'wish', 'color'] as const) if (typeof o[k] === 'string' && o[k].length <= 200) p[k] = o[k];
    if (typeof o.role === 'string' && ['engineer', 'designer', 'vibe-coder', 'marketer', 'other'].includes(o.role)) p.role = o.role;
    if (['new', 'some', 'daily'].includes(o.experience)) p.experience = o.experience;
    if (typeof o.book === 'string' && WORKS.includes(o.book)) p.book = o.book;
    if (typeof o.savedAt === 'string') p.savedAt = o.savedAt;
    return p;
  } catch {
    return EMPTY;
  }
}
