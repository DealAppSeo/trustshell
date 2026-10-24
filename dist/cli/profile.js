"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERVIEW = exports.PROFILE_PATH = void 0;
exports.learnJobHint = learnJobHint;
exports.parseProfileOp = parseProfileOp;
exports.applyOp = applyOp;
exports.runProfile = runProfile;
exports.nodeProfileFs = nodeProfileFs;
exports.terminalAsk = terminalAsk;
/**
 * `trustshell profile` — show and edit the personal sections of `.trustshell/profile.md`.
 * --------------------------------------------------------------------------------------
 * EGRESS: none. Reads and writes one local file. Nothing here is auto-detected: every entry is
 * text the person typed. An edit rewrites only the section it touches (writePersonalSection), so
 * hand edits elsewhere in the file survive.
 *
 * Jobs to be done are not stored here; they live in the learn module's job list.
 */
const profile_1 = require("../lib/profile");
const init_1 = require("../lib/init");
const remember_1 = require("./remember");
const action_evidence_1 = require("../lib/action-evidence");
exports.PROFILE_PATH = `${init_1.TRUSTSHELL_DIR}/${init_1.PROFILE_FILE}`;
const SECTION_ALIASES = {
    value: 'values',
    values: 'values',
    person: 'people',
    people: 'people',
    constraint: 'constraints',
    constraints: 'constraints',
    style: 'style',
    priorities: 'priorities',
};
/** The first-run interview (Blueprint §5): three questions, each skippable, each says why it is asked. */
exports.INTERVIEW = [
    { question: 'Who do you most want to help?', why: 'So the agent knows whose good its work is for.' },
    { question: 'What is one thing you need done this week?', why: 'So the first job the agent learns is one you actually need.' },
    { question: 'What must never happen?', why: 'So the agent has a red line to hold, whatever else it is asked.' },
];
/** Jobs live in the learn module, not the profile. */
function learnJobHint(job) {
    return `Jobs are not kept in your profile. Add it with: trustshell learn job add "${job.replace(/["\\]/g, '\\$&')}"`;
}
/** One entry's text: one line, no comment markers, no credential shapes. */
function entryError(raw, what) {
    return (0, profile_1.checkText)(raw, what) ?? ((0, remember_1.refusedValue)(raw) ? `${what} looks like a credential; it is not stored` : null);
}
/**
 * PURE. Turn the words after `profile` into one operation, or a usage error. Every flag must
 * belong to the subcommand it came with: a stray `--why` is refused rather than ignored.
 */
function parseProfileOp(rest, opts = {}) {
    const [verb = 'show', target, ...words] = rest;
    const text = words.join(' ').trim();
    const stray = (allowed) => ['why', 'preset', 'answers'].find((k) => k !== allowed && opts[k] !== undefined);
    const strayErr = (allowed) => {
        const k = stray(allowed);
        return k ? { error: `--${k} does not go with \`profile ${rest.slice(0, 2).join(' ')}\`` } : null;
    };
    if (verb === 'show')
        return strayErr(null) ?? (target ? { error: `unexpected argument: ${target}` } : { op: 'show' });
    if (verb === 'interview') {
        const bad = strayErr('answers') ?? (target ? { error: `unexpected argument: ${target}` } : null);
        if (bad)
            return bad;
        if (opts.answers === undefined)
            return { op: 'interview' };
        const answers = opts.answers.split('|').map((s) => s.trim()).slice(0, exports.INTERVIEW.length);
        for (const [i, a] of answers.entries()) {
            // Answer 2 is a job: it is printed back as a hint, never stored, so only 1 and 3 are checked.
            const err = a && i !== 1 ? entryError(a, `answer ${i + 1}`) : null;
            if (err)
                return { error: err };
        }
        return { op: 'interview', answers };
    }
    if (verb === 'add') {
        const section = SECTION_ALIASES[target ?? ''];
        if (section !== 'values' && section !== 'people' && section !== 'constraints') {
            return { error: '`profile add` takes value, person or constraint, then the text' };
        }
        const bad = strayErr(section === 'people' ? 'why' : null) ?? entryError(text, section === 'people' ? 'who' : section.replace(/s$/, ''));
        if (bad)
            return typeof bad === 'string' ? { error: bad } : bad;
        if (section !== 'people')
            return { op: 'add', section, text };
        if (/\s[—–-]+\s*why:/i.test(text))
            return { error: 'who cannot contain "— why:"; pass the reason with --why' };
        const why = opts.why?.trim() ?? '';
        const whyErr = why ? entryError(why, 'why') : null;
        return whyErr ? { error: whyErr } : { op: 'add', section, text, why };
    }
    if (verb === 'set' && target === 'style') {
        const [key, ...value] = words;
        if (!profile_1.STYLE_KEYS.includes(key ?? '')) {
            return { error: `\`profile set style\` takes one of ${profile_1.STYLE_KEYS.join(', ')}, then the value` };
        }
        const v = value.join(' ').trim();
        const bad = strayErr(null) ?? entryError(v, key);
        if (bad)
            return typeof bad === 'string' ? { error: bad } : bad;
        return { op: 'set-style', key: key, value: v };
    }
    if (verb === 'set' && target === 'priorities') {
        const bad = strayErr('preset');
        if (bad)
            return bad;
        if (opts.preset !== undefined) {
            if (text)
                return { error: 'give either --preset <name> or a ranked order, not both' };
            const err = (0, profile_1.checkPreset)(opts.preset);
            return err ? { error: err } : { op: 'set-priorities', preset: opts.preset.trim() };
        }
        const order = (0, profile_1.splitOrder)(text);
        const err = order.length ? (0, profile_1.checkOrder)(order) : 'give a ranked order such as cost,quality,speed, or --preset <name>';
        return err ? { error: err } : { op: 'set-priorities', order: order };
    }
    if (verb === 'remove') {
        const section = SECTION_ALIASES[target ?? ''];
        const bad = strayErr(null);
        if (bad)
            return bad;
        if (!section)
            return { error: `\`profile remove\` takes one of ${Object.keys(profile_1.PERSONAL_SECTIONS).join(', ')}` };
        const [arg, extra] = words;
        if (extra !== undefined)
            return { error: `unexpected argument: ${extra}` };
        if (section === 'priorities')
            return arg === undefined ? { op: 'remove', section } : { error: `unexpected argument: ${arg}` };
        if (section === 'style') {
            return profile_1.STYLE_KEYS.includes(arg ?? '')
                ? { op: 'remove', section, key: arg }
                : { error: `\`profile remove style\` takes one of ${profile_1.STYLE_KEYS.join(', ')}` };
        }
        if (!arg || !/^[1-9]\d*$/.test(arg))
            return { error: `\`profile remove ${section}\` takes the entry's number (see profile show)` };
        return { op: 'remove', section, index: Number(arg) };
    }
    return { error: '`trustshell profile` takes show, add, set, remove or interview' };
}
/**
 * PURE. Apply an edit. Returns the new profile and the section it touched, or why it cannot.
 * `interview` is handled by runProfile, which may touch two sections.
 */
function applyOp(p, op) {
    const next = { ...p, style: { ...p.style } };
    switch (op.op) {
        case 'add':
            if (op.section === 'people')
                next.people = [...p.people, { who: op.text, why: op.why }];
            else
                next[op.section] = [...p[op.section], op.text];
            return { profile: next, section: op.section, said: `added ${op.section} ${next[op.section].length}: ${op.text}` };
        case 'set-style':
            next.style[op.key] = op.value;
            return { profile: next, section: 'style', said: `style ${op.key}: ${op.value}` };
        case 'set-priorities':
            next.priorities = op.preset ? { preset: op.preset } : { order: op.order ?? [] };
            return {
                profile: next,
                section: 'priorities',
                said: op.preset ? `model priorities: preset ${op.preset}` : `model priorities: ${(op.order ?? []).join(' > ')}`,
            };
        case 'remove': {
            if (op.section === 'priorities') {
                next.priorities = null;
                return { profile: next, section: 'priorities', said: 'model priorities cleared' };
            }
            if (op.section === 'style') {
                if (!op.key || p.style[op.key] === undefined)
                    return { error: `style has no ${op.key}` };
                delete next.style[op.key];
                return { profile: next, section: 'style', said: `style ${op.key} removed` };
            }
            const count = p[op.section].length;
            const i = (op.index ?? 0) - 1;
            if (i < 0 || i >= count)
                return { error: `${op.section} has no entry ${op.index} (it has ${count})` };
            if (op.section === 'people')
                next.people = p.people.filter((_, j) => j !== i);
            else
                next[op.section] = p[op.section].filter((_, j) => j !== i);
            return { profile: next, section: op.section, said: `removed ${op.section} ${op.index}` };
        }
    }
}
const STAYS_LOCAL = 'stays local: report leaves the personal sections out while share_personal is false';
/** Run one profile operation. Exit 0 done, 1 refused (the file has problems), 2 usage. */
async function runProfile(op, io, fs, json = false) {
    const exists = fs.exists(exports.PROFILE_PATH);
    const text = exists ? fs.read(exports.PROFILE_PATH) : (0, profile_1.renderProfile)((0, profile_1.defaultProfile)());
    const parsed = (0, profile_1.parseProfile)(text);
    if (op.op === 'show') {
        if (json)
            io.out(JSON.stringify({ path: exports.PROFILE_PATH, exists, ...parsed }, null, 2));
        else if (!exists)
            io.out(`NO_PROFILE  ${exports.PROFILE_PATH} does not exist. \`trustshell init\` creates a blank one.`);
        else {
            // The file sits in the working folder (./.trustshell/profile.md), so a cloned repository can carry one someone else wrote, and a problem line quotes the bad value: print both as text.
            io.out((0, action_evidence_1.cleanCodePoints)(text.replace(/\s+$/, ''), true));
            for (const pr of parsed.problems)
                io.err(`problem: ${pr.field}: ${(0, action_evidence_1.cleanCodePoints)(pr.detail)}`);
        }
        return 0;
    }
    // Never rewrite a file this build cannot read cleanly: the rewrite could drop what it misread.
    if (parsed.problems.length) {
        io.err(`${exports.PROFILE_PATH} has problems; fix them by hand first, nothing was written:`);
        for (const pr of parsed.problems)
            io.err(`  ${pr.field}: ${(0, action_evidence_1.cleanCodePoints)(pr.detail)}`);
        return 1;
    }
    let profile = parsed.profile;
    let out = text;
    const said = [];
    if (op.op === 'interview') {
        let answers = op.answers;
        if (!answers) {
            if (!io.ask) {
                io.err('profile interview: not a terminal. Pass the answers instead: --answers "who|this week|never" (leave a part empty to skip it).');
                return 2;
            }
            answers = [];
            for (const [i, q] of exports.INTERVIEW.entries()) {
                io.out(`${i + 1}/${exports.INTERVIEW.length}  ${q.question}\n     why I ask: ${q.why}  (Enter skips)`);
                const a = (await io.ask('     > ')).trim();
                const err = a && i !== 1 ? entryError(a, `answer ${i + 1}`) : null;
                if (err)
                    io.err(`     ${err}; skipped`);
                answers.push(err ? '' : a);
            }
        }
        else {
            for (const [i, q] of exports.INTERVIEW.entries())
                io.out(`${i + 1}/${exports.INTERVIEW.length}  ${q.question}\n     why I ask: ${q.why}`);
        }
        const [who = '', job = '', never = ''] = answers;
        if (who) {
            profile = { ...profile, people: [...profile.people, { who, why: '' }] };
            out = (0, profile_1.writePersonalSection)(out, profile, 'people');
            said.push(`people I help ${profile.people.length}: ${who}`);
        }
        if (job)
            said.push(learnJobHint(job));
        if (never) {
            // The answer names what must NOT happen. Stored bare, "email a client" would read as a rule to do it.
            const line = /^never\b/i.test(never) ? never : `Must never happen: ${never}`;
            profile = { ...profile, constraints: [...profile.constraints, line] };
            out = (0, profile_1.writePersonalSection)(out, profile, 'constraints');
            said.push(`constraint ${profile.constraints.length}: ${line}`);
        }
        if (!who && !job && !never)
            said.push('all three skipped; nothing written');
    }
    else {
        const r = applyOp(profile, op);
        if ('error' in r) {
            io.err(`profile: ${r.error}`);
            return 2;
        }
        profile = r.profile;
        out = (0, profile_1.writePersonalSection)(out, profile, r.section);
        said.push(r.said);
    }
    if (out !== text) {
        fs.mkdirp(init_1.TRUSTSHELL_DIR);
        fs.writeFile(exports.PROFILE_PATH, out);
    }
    if (json)
        io.out(JSON.stringify({ path: exports.PROFILE_PATH, written: out !== text, said, profile }, null, 2));
    else {
        for (const s of said)
            io.out(s);
        if (out !== text)
            io.out(`${exports.PROFILE_PATH}${profile.share_personal ? '' : ` — ${STAYS_LOCAL}`}`);
    }
    return 0;
}
/** The real filesystem. Local file only; opens no socket. */
function nodeProfileFs() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs');
    return {
        exists: (p) => fs.existsSync(p),
        read: (p) => fs.readFileSync(p, 'utf8'),
        mkdirp: (p) => {
            fs.mkdirSync(p, { recursive: true });
        },
        writeFile: (p, data) => {
            fs.writeFileSync(p, data, 'utf8');
        },
    };
}
/** Ask on a terminal only. Piped stdin gets no prompt: use --answers. */
function terminalAsk() {
    if (!process.stdin.isTTY)
        return undefined;
    return async (prompt) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const readline = require('node:readline/promises');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        try {
            return await rl.question(prompt);
        }
        finally {
            rl.close();
        }
    };
}
