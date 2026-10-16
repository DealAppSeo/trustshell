/**
 * Profile step 1 (Harness Blueprint §2 + §9, F4): values, people helped, style, constraints and
 * model priorities. Every new section is optional, empty by default, and written only by the person.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  renderProfile,
  defaultProfile,
  parseProfile,
  writePersonalSection,
  PERSONAL_SECTIONS,
  type PersonalSection,
  type Profile,
} from '../src/lib/profile';
import { buildReport, formatReportCard } from '../src/lib/report';
import { verifyChain, nextEntry } from '../src/lib/inspect';
import { parseArgs } from '../src/cli/index';
import { applyOp, parseProfileOp, runProfile, PROFILE_PATH, type ProfileFs, type ProfileOp } from '../src/cli/profile';

/**
 * The exact bytes `init` wrote before the personal sections existed (origin/main 51897d4c). If
 * this moves, every existing `.trustshell/profile.md` would differ from a fresh one.
 */
const GOLDEN_DEFAULT = `---
trustshell_profile: 1
share_identity: false
share_context: false
---

# Identity

<!-- Empty on purpose. \`init\` does NOT read your git config, hostname,
     username or email. Fill this in only if you want a report to say who
     ran it. Nothing here is transmitted; \`report\` includes it only when
     share_identity is true. -->

# Context

<!-- Standing notes for an agent working in this project. Never included in
     a report unless share_context is true. -->

# Trust settings
autonomy: ask_first
confidence_gate: 0.8
hitl_gate: 70
`;

/** A profile with something in every personal section. */
function full(): Profile {
  return {
    ...defaultProfile(),
    values: ['Honest work over fast work', 'Family first'],
    people: [
      { who: 'small shop owners', why: 'they cannot afford a wrong invoice' },
      { who: 'my sister', why: '' },
    ],
    style: { tone: 'plain and direct', risk: 'low', hours: '09:00-17:00' },
    constraints: ['client data never leaves my device', 'no more than $20 a day'],
    priorities: { order: ['quality', 'cost', 'speed'] },
  };
}

function memFs(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  const fs: ProfileFs = {
    exists: (p) => files.has(p),
    read: (p) => files.get(p) as string,
    mkdirp: () => undefined,
    writeFile: (p, d) => {
      files.set(p, d);
    },
  };
  return { fs, files };
}

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) }, out, err };
}

function op(argv: string[]): ProfileOp {
  const a = parseArgs(['profile', ...argv]);
  if (a.error || !a.profileOp) throw new Error(`parse failed: ${a.error}`);
  return a.profileOp;
}

describe('the default is silence', () => {
  it('renderProfile(defaultProfile()) is byte-identical to the pre-change golden', () => {
    expect(renderProfile(defaultProfile())).toBe(GOLDEN_DEFAULT);
  });

  it('every personal section is empty and share_personal is false', () => {
    const p = defaultProfile();
    expect(p.share_personal).toBe(false);
    expect([p.values, p.people, p.constraints]).toEqual([[], [], []]);
    expect(p.style).toEqual({});
    expect(p.priorities).toBeNull();
  });

  it('an existing profile (the golden) parses to the default with no problems', () => {
    const { profile, problems } = parseProfile(GOLDEN_DEFAULT);
    expect(problems).toEqual([]);
    expect(profile).toEqual(defaultProfile());
  });

  it('share_personal on its own renders the flag and empty sections, so the switch is visible', () => {
    const text = renderProfile({ ...defaultProfile(), share_personal: true });
    expect(text).toContain('share_personal: true\n---');
    expect(parseProfile(text).profile.share_personal).toBe(true);
  });
});

describe('round trip, section by section', () => {
  const sections = Object.keys(PERSONAL_SECTIONS) as PersonalSection[];

  it('render then parse gives back every section', () => {
    const { profile, problems } = parseProfile(renderProfile(full()));
    expect(problems).toEqual([]);
    expect(profile).toEqual(full());
  });

  it.each(sections)('%s: editing one section of a default file equals rendering the whole profile', (s) => {
    const p = { ...defaultProfile(), [s]: full()[s] } as Profile;
    expect(writePersonalSection(GOLDEN_DEFAULT, p, s)).toBe(renderProfile(p));
    expect(parseProfile(renderProfile(p)).profile).toEqual(p);
  });

  it('each CLI edit lands, reads back, and touches only its own section', async () => {
    const { fs, files } = memFs();
    const steps: string[][] = [
      ['add', 'value', 'Honest work over fast work'],
      ['add', 'value', 'Family first'],
      ['add', 'person', 'small shop owners', '--why', 'they cannot afford a wrong invoice'],
      ['add', 'person', 'my sister'],
      ['set', 'style', 'tone', 'plain', 'and', 'direct'],
      ['set', 'style', 'risk', 'low'],
      ['set', 'style', 'hours', '09:00-17:00'],
      ['add', 'constraint', 'client data never leaves my device'],
      ['add', 'constraint', 'no more than $20 a day'],
      ['set', 'priorities', 'quality,cost,speed'],
    ];
    for (const argv of steps) {
      const { io: o } = io();
      expect(await runProfile(op(argv), o, fs)).toBe(0);
    }
    const text = files.get(PROFILE_PATH) as string;
    expect(parseProfile(text)).toEqual({ profile: full(), problems: [] });
    expect(text).toBe(renderProfile(full()));
  });

  it('set priorities --preset and remove each section', async () => {
    const { fs, files } = memFs({ [PROFILE_PATH]: renderProfile(full()) });
    const run = async (argv: string[]) => runProfile(op(argv), io().io, fs);
    expect(await run(['set', 'priorities', '--preset', 'cost-first'])).toBe(0);
    expect(parseProfile(files.get(PROFILE_PATH) as string).profile.priorities).toEqual({ preset: 'cost-first' });
    expect(await run(['remove', 'values', '1'])).toBe(0);
    expect(await run(['remove', 'person', '2'])).toBe(0);
    expect(await run(['remove', 'style', 'risk'])).toBe(0);
    expect(await run(['remove', 'constraints', '2'])).toBe(0);
    expect(await run(['remove', 'priorities'])).toBe(0);
    const p = parseProfile(files.get(PROFILE_PATH) as string).profile;
    expect(p.values).toEqual(['Family first']);
    expect(p.people).toEqual([{ who: 'small shop owners', why: 'they cannot afford a wrong invoice' }]);
    expect(p.style).toEqual({ tone: 'plain and direct', hours: '09:00-17:00' });
    expect(p.constraints).toEqual(['client data never leaves my device']);
    expect(p.priorities).toBeNull();
  });

  it('removing an entry that is not there is a usage error and writes nothing', async () => {
    const before = renderProfile(full());
    const { fs, files } = memFs({ [PROFILE_PATH]: before });
    const { io: o, err } = io();
    expect(await runProfile(op(['remove', 'values', '9']), o, fs)).toBe(2);
    expect(err.join(' ')).toMatch(/no entry 9/);
    expect(files.get(PROFILE_PATH)).toBe(before);
  });

  it('hand edits outside the edited section survive byte for byte', () => {
    const hand = renderProfile(full()).replace('# Identity\n', '# Identity\nSean, by hand\n') + '\n# My notes\nkeep me\n<!-- mine -->\n';
    const p = { ...parseProfile(hand).profile, values: ['Only this'] };
    const out = writePersonalSection(hand, p, 'values');
    expect(out).toContain('Sean, by hand');
    expect(out).toContain('# My notes\nkeep me\n<!-- mine -->\n');
    expect(out.replace(/# Values[\s\S]*?(?=# People I help)/, '')).toBe(hand.replace(/# Values[\s\S]*?(?=# People I help)/, ''));
    expect(parseProfile(out).profile.values).toEqual(['Only this']);
  });

  it('a CRLF file stays CRLF', () => {
    const crlf = GOLDEN_DEFAULT.replace(/\n/g, '\r\n');
    const out = writePersonalSection(crlf, { ...defaultProfile(), values: ['x'] }, 'values');
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
    expect(parseProfile(out).profile.values).toEqual(['x']);
  });

  it('hand-written list markers and "— why:" are read the same as the rendered ones', () => {
    const text = `${GOLDEN_DEFAULT}\n# Values\n- first\n* second\n\n# People I help\n- my team - why: they rely on me\n`;
    const { profile, problems } = parseProfile(text);
    expect(problems).toEqual([]);
    expect(profile.values).toEqual(['first', 'second']);
    expect(profile.people).toEqual([{ who: 'my team', why: 'they rely on me' }]);
  });
});

describe('sharing: only under share_personal, default false', () => {
  const session = () => {
    const e = nextEntry('', { ts: '2026-10-16T00:00:00Z', tool: 'Bash', input_sha256: 'a'.repeat(64), output_sha256: 'b'.repeat(64) });
    return verifyChain(JSON.stringify(e) + '\n', 's.jsonl');
  };

  it('with the flag at its default, no personal text reaches report JSON or the card', () => {
    const p = full();
    expect(p.share_personal).toBe(false);
    const r = buildReport({ session: session(), evidence: { verdict: 'COMPLETE' }, profile: p });
    const shown = JSON.stringify(r) + formatReportCard(r);
    expect(r.personal).toBeUndefined();
    for (const secret of ['Honest work', 'small shop owners', 'cannot afford', 'plain and direct', 'never leaves my device', 'quality']) {
      expect(shown).not.toContain(secret);
    }
    // Withheld is NAMED, so "nothing set" and "set but not shared" read differently.
    expect(r.withheld.join(' ')).toMatch(/values, people, style, constraints, priorities — set share_personal: true/);
  });

  it('a malformed flag fails closed to false', () => {
    const text = renderProfile(full()).replace('share_personal: false', 'share_personal: yes');
    const { profile, problems } = parseProfile(text);
    expect(profile.share_personal).toBe(false);
    expect(problems.map((p) => p.field)).toContain('share_personal');
    const r = buildReport({ session: session(), evidence: null, profile });
    expect(JSON.stringify(r)).not.toContain('Honest work');
  });

  it('turned on by the person, the sections that hold something are included', () => {
    const p = { ...full(), constraints: [], share_personal: true };
    const r = buildReport({ session: session(), evidence: { verdict: 'COMPLETE' }, profile: p });
    expect(r.personal?.values).toEqual(p.values);
    expect(r.personal).not.toHaveProperty('constraints');
    expect(formatReportCard(r)).toContain('Honest work over fast work');
  });

  it('an empty personal profile adds no withheld line', () => {
    const r = buildReport({ session: session(), evidence: null, profile: defaultProfile() });
    expect(r.withheld).toEqual([]);
  });
});

describe('model priorities: validated, never guessed', () => {
  it.each<[string[], RegExp]>([
    [['set', 'priorities', '--preset', 'turbo'], /unknown preset "turbo"/],
    [['set', 'priorities', 'cost,cost,speed'], /"cost" is listed twice/],
    [['set', 'priorities', 'cost,price,speed'], /unknown priority "price"/],
    [['set', 'priorities', 'cost,speed'], /rank all three/],
    [['set', 'priorities'], /ranked order/],
    [['set', 'priorities', 'cost,speed,quality', '--preset', 'balanced'], /not both/],
  ])('%j is refused', (argv, msg) => {
    expect(parseArgs(['profile', ...argv]).error).toMatch(msg);
  });

  it.each(['balanced', 'cost-first', 'speed-first', 'quality-first'])('preset %s is accepted', (name) => {
    expect(op(['set', 'priorities', '--preset', name])).toEqual({ op: 'set-priorities', preset: name });
  });

  it('a ranked order is accepted with commas or spaces', () => {
    expect(op(['set', 'priorities', 'cost,', 'quality', 'speed'])).toEqual({ op: 'set-priorities', order: ['cost', 'quality', 'speed'] });
  });

  it('a hand-edited bad line in the file resolves to no priorities, and says so', () => {
    for (const body of ['preset: turbo', 'order: cost, cost, speed', 'preset: balanced\norder: cost, speed, quality', 'fast please']) {
      const { profile, problems } = parseProfile(`${GOLDEN_DEFAULT}\n# Model priorities\n${body}\n`);
      expect(profile.priorities).toBeNull();
      expect(problems.map((p) => p.field)).toContain('priorities');
    }
  });
});

describe('input at the trust boundary', () => {
  it.each<[string[], RegExp]>([
    [['add', 'value', 'two\nlines'], /one line/],
    [['add', 'value', 'sneaky <!-- comment'], /<!--/],
    [['add', 'value', 'ends a comment --!> here'], /--!>/],
    [['add', 'value', '   '], /empty/],
    [['add', 'constraint', 'x'.repeat(281)], /280/],
    [['add', 'constraint', 'my key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'], /credential/],
    [['add', 'value', 'honesty', '--why', 'because'], /--why does not go with/],
    [['add', 'person', 'a — why: b'], /--why/],
    [['add', 'job', 'ship it'], /value, person or constraint/],
    [['set', 'style', 'mood', 'happy'], /tone, detail, risk, hours/],
    [['remove', 'values', '0'], /number/],
    [['remove', 'style', 'mood'], /tone, detail, risk, hours/],
    [['remove', 'priorities', '1'], /unexpected argument/],
    [['frobnicate'], /show, add, set, remove or interview/],
  ])('%j is refused', (argv, msg) => {
    expect(parseArgs(['profile', ...argv]).error).toMatch(msg);
  });

  it('a file with problems is never rewritten', async () => {
    const before = renderProfile(full()).replace('tone: plain and direct', 'mood: happy');
    const { fs, files } = memFs({ [PROFILE_PATH]: before });
    const { io: o, err } = io();
    expect(await runProfile(op(['add', 'value', 'x']), o, fs)).toBe(1);
    expect(err.join('\n')).toMatch(/nothing was written/);
    expect(files.get(PROFILE_PATH)).toBe(before);
  });

  it('applyOp never mutates the profile it was given', () => {
    const p = full();
    const snapshot = JSON.stringify(p);
    applyOp(p, { op: 'set-style', key: 'tone', value: 'warm' });
    applyOp(p, { op: 'remove', section: 'values', index: 1 });
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});

describe('first-run interview', () => {
  it('--answers fills people and constraints; the job is a learn hint and is NOT stored', async () => {
    const { fs, files } = memFs();
    const { io: o, out } = io();
    const code = await runProfile(op(['interview', '--answers', 'my team|ship the invoice tool|email a client without asking me']), o, fs);
    expect(code).toBe(0);
    const text = files.get(PROFILE_PATH) as string;
    const p = parseProfile(text).profile;
    expect(p.people).toEqual([{ who: 'my team', why: '' }]);
    expect(p.constraints).toEqual(['Must never happen: email a client without asking me']);
    expect(text).not.toContain('invoice');
    expect(p.share_personal).toBe(false);
    const said = out.join('\n');
    expect(said).toContain('trustshell learn job add "ship the invoice tool"');
    // Each question says why it is asked.
    expect(said.match(/why I ask:/g)).toHaveLength(3);
  });

  it('an empty part skips that question', async () => {
    const { fs, files } = memFs();
    expect(await runProfile(op(['interview', '--answers', '||never send money']), io().io, fs)).toBe(0);
    const p = parseProfile(files.get(PROFILE_PATH) as string).profile;
    expect(p.people).toEqual([]);
    expect(p.constraints).toEqual(['never send money']);
  });

  it('skipping all three writes nothing', async () => {
    const { fs, files } = memFs();
    const { io: o, out } = io();
    expect(await runProfile(op(['interview', '--answers', '||']), o, fs)).toBe(0);
    expect(files.has(PROFILE_PATH)).toBe(false);
    expect(out.join('\n')).toMatch(/all three skipped/);
  });

  it('with no terminal and no --answers it asks nothing and says how to answer', async () => {
    const { fs, files } = memFs();
    const { io: o, err } = io();
    expect(await runProfile(op(['interview']), o, fs)).toBe(2);
    expect(err.join(' ')).toMatch(/--answers/);
    expect(files.size).toBe(0);
  });

  it('on a terminal it asks each question in turn', async () => {
    const { fs, files } = memFs();
    const answers = ['new founders', '', 'spend over budget'];
    const { io: o } = io();
    const code = await runProfile(op(['interview']), { ...o, ask: async () => answers.shift() ?? '' }, fs);
    expect(code).toBe(0);
    const p = parseProfile(files.get(PROFILE_PATH) as string).profile;
    expect(p.people.map((x) => x.who)).toEqual(['new founders']);
    expect(p.constraints).toEqual(['Must never happen: spend over budget']);
  });

  it('a credential in an answer is refused before anything is written', () => {
    expect(parseProfileOp(['interview'], { answers: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789||' })).toEqual({ error: expect.stringMatching(/credential/) });
  });
});

describe('profile opens no socket', () => {
  it.each(['src/lib/profile.ts', 'src/cli/profile.ts'])('%s has no network call', (file) => {
    const src = readFileSync(join(__dirname, '..', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/https?:\/\//);
    expect(src).not.toMatch(/['"]node:(http|https|net|dgram|tls)['"]/);
    expect(src).not.toMatch(/['"](undici|axios|node-fetch)['"]/);
  });

  it('the published egress tables pin profile as none (scripts/check-egress.cjs runs it with the network stubbed)', () => {
    for (const doc of ['README.md', 'docs/api-reference.md']) {
      expect(readFileSync(join(__dirname, '..', doc), 'utf8')).toMatch(/^\| `profile` \| \*\*none\*\*/m);
    }
  });
});
