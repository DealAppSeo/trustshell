"use strict";
/**
 * `.trustshell/profile.md` — read, write and validate.
 * ----------------------------------------------------
 * The generator ships; what it generates does not. `.trustshell/` is gitignored,
 * this module is committed, so a fresh clone can always regenerate a profile and
 * never inherits one.
 *
 * EGRESS: none. This module opens no socket and never will. `init` is the one
 * command a sceptic runs before deciding whether to trust the rest.
 *
 * THE DEFAULT IS SILENCE. Every share flag is false and every section is empty.
 * `init` does not read your git config, hostname, username or email — not
 * because it cannot, but because a file that may be summarised into a shareable
 * artefact must contain nothing you did not deliberately write. Auto-detecting a
 * name is a convenience that silently converts a local file into a disclosure
 * the first time anyone runs `report`.
 *
 * The personal sections (values, people helped, style, constraints, model priorities) follow the
 * same rule: empty, never inferred, written only by the person, shared only under share_personal.
 * They are not rendered at all until one holds something, so a default profile stays
 * byte-identical to the one written before they existed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TRUST = exports.PERSONAL_SECTIONS = exports.STYLE_KEYS = exports.PRESETS = exports.PRIORITY_NAMES = exports.AUTONOMY_VALUES = exports.PROFILE_VERSION = void 0;
exports.defaultProfile = defaultProfile;
exports.personalSectionsSet = personalSectionsSet;
exports.renderPersonalSection = renderPersonalSection;
exports.renderProfile = renderProfile;
exports.parseProfile = parseProfile;
exports.splitOrder = splitOrder;
exports.checkOrder = checkOrder;
exports.checkPreset = checkPreset;
exports.checkText = checkText;
exports.writePersonalSection = writePersonalSection;
/** Bump only on a breaking change to the file's shape. */
exports.PROFILE_VERSION = 1;
exports.AUTONOMY_VALUES = ['ask_first', 'do_then_tell', 'just_do_it'];
/**
 * Model priorities (F4): a full ranking of the three, or one preset. Stored here only. Nothing
 * sends it to an engine yet; that needs the router change (F1).
 */
exports.PRIORITY_NAMES = ['cost', 'speed', 'quality'];
exports.PRESETS = ['balanced', 'cost-first', 'speed-first', 'quality-first'];
/** Character and style (Blueprint §2): tone, detail level, risk appetite, working hours. */
exports.STYLE_KEYS = ['tone', 'detail', 'risk', 'hours'];
/**
 * The personal sections and their headings, in file order. Jobs to be done are NOT here: they
 * live in the learn module's own job list.
 */
exports.PERSONAL_SECTIONS = {
    values: 'Values',
    people: 'People I help',
    style: 'Style',
    constraints: 'Constraints',
    priorities: 'Model priorities',
};
const SECTION_KEYS = Object.keys(exports.PERSONAL_SECTIONS);
/**
 * The project's canonical gates, not numbers invented here: CONFIDENCE_GATE =
 * 0.8 and REPID_HITL_GATE = 70. `ask_first` is the most conservative autonomy.
 */
exports.DEFAULT_TRUST = {
    autonomy: 'ask_first',
    confidence_gate: 0.8,
    hitl_gate: 70,
};
function defaultProfile() {
    return {
        version: exports.PROFILE_VERSION,
        share_identity: false,
        share_context: false,
        share_personal: false,
        identity: '',
        context: '',
        trust: { ...exports.DEFAULT_TRUST },
        values: [],
        people: [],
        style: {},
        constraints: [],
        priorities: null,
    };
}
/** The personal sections that hold something, in file order. */
function personalSectionsSet(p) {
    return SECTION_KEYS.filter((s) => s === 'style' ? Object.keys(p.style).length > 0 : s === 'priorities' ? p.priorities !== null : p[s].length > 0);
}
const SECTION_NOTE = {
    values: '<!-- What you care about, most important first, in your own words. None of\n     these sections is in a report unless share_personal is true. -->',
    people: '<!-- Who you want to help, and why it matters to you. -->',
    style: `<!-- One per line, key: value. Keys: ${exports.STYLE_KEYS.join(', ')}. -->`,
    constraints: '<!-- Lines that must hold: "never leaves my device", a budget, a time limit. -->',
    priorities: `<!-- order: ${exports.PRIORITY_NAMES.join(', ')} (all three, most important first), or
     preset: ${exports.PRESETS.join(' | ')}.
     Stored here only; nothing sends it to a model yet. -->`,
};
function sectionItems(p, s) {
    switch (s) {
        case 'values':
            return p.values.map((v, i) => `${i + 1}. ${v}`);
        case 'people':
            return p.people.map((x, i) => `${i + 1}. ${x.who}${x.why ? ` — why: ${x.why}` : ''}`);
        case 'style':
            return exports.STYLE_KEYS.filter((k) => p.style[k]).map((k) => `${k}: ${p.style[k]}`);
        case 'constraints':
            return p.constraints.map((c, i) => `${i + 1}. ${c}`);
        case 'priorities':
            if (!p.priorities)
                return [];
            return ['preset' in p.priorities ? `preset: ${p.priorities.preset}` : `order: ${p.priorities.order.join(', ')}`];
    }
}
/** One personal section, heading to note, newline-terminated. An empty body is a blank line, like Identity. */
function renderPersonalSection(p, s) {
    return `# ${exports.PERSONAL_SECTIONS[s]}\n${sectionItems(p, s).join('\n')}\n${SECTION_NOTE[s]}\n`;
}
/**
 * The file `init` writes. The comments are load-bearing: they are where a reader
 * learns that the blanks are deliberate, so nobody "helpfully" auto-fills them.
 */
function renderProfile(p = defaultProfile()) {
    // The personal block (and its share flag) is rendered only once it holds something or sharing
    // is on, so a profile without it is byte-identical to the one written before it existed.
    const personal = p.share_personal || personalSectionsSet(p).length > 0;
    const shareLine = personal ? `share_personal: ${p.share_personal}\n` : '';
    const block = personal ? '\n' + SECTION_KEYS.map((s) => renderPersonalSection(p, s)).join('\n') : '';
    return `---
trustshell_profile: ${p.version}
share_identity: ${p.share_identity}
share_context: ${p.share_context}
${shareLine}---

# Identity
${p.identity}
<!-- Empty on purpose. \`init\` does NOT read your git config, hostname,
     username or email. Fill this in only if you want a report to say who
     ran it. Nothing here is transmitted; \`report\` includes it only when
     share_identity is true. -->

# Context
${p.context}
<!-- Standing notes for an agent working in this project. Never included in
     a report unless share_context is true. -->

# Trust settings
autonomy: ${p.trust.autonomy}
confidence_gate: ${p.trust.confidence_gate}
hitl_gate: ${p.trust.hitl_gate}
${block}`;
}
function parseFrontmatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const out = {};
    if (!m || !m[1])
        return out;
    for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
        if (kv && kv[1] !== undefined && kv[2] !== undefined)
            out[kv[1]] = kv[2].trim();
    }
    return out;
}
/**
 * Body of a `# Heading` section, comments and blank padding stripped.
 *
 * A line walk, not a regex. The first version used `\Z` to mean end-of-input —
 * which is a Perl/Python anchor that JavaScript does not have, so the pattern
 * silently matched nothing and every section came back empty. The tests caught
 * it; a regex that fails by returning "" rather than throwing is exactly the
 * shape of bug that reaches production looking like an empty config.
 */
function sectionBody(text, heading) {
    const lines = text.split(/\r?\n/);
    const want = heading.toLowerCase();
    let collecting = false;
    const body = [];
    for (const line of lines) {
        const h = line.match(/^#\s+(.*?)\s*$/);
        if (h) {
            if (collecting)
                break;
            collecting = (h[1] ?? '').toLowerCase() === want;
            continue;
        }
        if (collecting)
            body.push(line);
    }
    return body.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
}
function parseBool(raw, field, problems) {
    if (raw === undefined)
        return false;
    if (raw === 'true')
        return true;
    if (raw === 'false')
        return false;
    // Anything unrecognised resolves to the PRIVATE setting and says so. A typo in
    // a share flag must never fail open into disclosure.
    problems.push({ field, detail: `expected true or false, got "${raw}" — treated as false` });
    return false;
}
/**
 * PURE. Parse profile text into a Profile plus the list of things wrong with it.
 * Unparseable values always resolve to the private/conservative default and are
 * reported, rather than throwing — a malformed profile must not stop `report`
 * from running, it must stop `report` from sharing.
 */
function parseProfile(text) {
    const problems = [];
    const fm = parseFrontmatter(text);
    const rawVersion = fm['trustshell_profile'];
    let version = exports.PROFILE_VERSION;
    if (rawVersion === undefined) {
        problems.push({ field: 'trustshell_profile', detail: 'missing — not a TrustShell profile' });
    }
    else if (!/^\d+$/.test(rawVersion)) {
        problems.push({ field: 'trustshell_profile', detail: `not a number: "${rawVersion}"` });
    }
    else {
        version = Number(rawVersion);
        if (version > exports.PROFILE_VERSION) {
            problems.push({
                field: 'trustshell_profile',
                detail: `file is version ${version}, this build understands ${exports.PROFILE_VERSION}`,
            });
        }
    }
    const trustBody = sectionBody(text, 'Trust settings');
    const trust = { ...exports.DEFAULT_TRUST };
    const aMatch = trustBody.match(/^autonomy\s*:\s*(\S+)/m);
    if (aMatch && aMatch[1]) {
        if (exports.AUTONOMY_VALUES.includes(aMatch[1])) {
            trust.autonomy = aMatch[1];
        }
        else {
            problems.push({
                field: 'autonomy',
                detail: `unknown value "${aMatch[1]}" — treated as ask_first`,
            });
        }
    }
    for (const [field, key] of [
        ['confidence_gate', 'confidence_gate'],
        ['hitl_gate', 'hitl_gate'],
    ]) {
        const m = trustBody.match(new RegExp(`^${key}\\s*:\\s*(\\S+)`, 'm'));
        if (m && m[1] !== undefined) {
            const n = Number(m[1]);
            if (Number.isFinite(n))
                trust[key] = n;
            else
                problems.push({ field, detail: `not a number: "${m[1]}" — kept default` });
        }
    }
    return {
        profile: {
            version,
            share_identity: parseBool(fm['share_identity'], 'share_identity', problems),
            share_context: parseBool(fm['share_context'], 'share_context', problems),
            share_personal: parseBool(fm['share_personal'], 'share_personal', problems),
            identity: sectionBody(text, 'Identity'),
            context: sectionBody(text, 'Context'),
            trust,
            ...parsePersonal(text, problems),
        },
        problems,
    };
}
/** List lines with an optional `1.` / `-` marker stripped. Order is rank. */
function listItems(body) {
    return body
        .split('\n')
        .map((l) => l.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, '').trim())
        .filter(Boolean);
}
/** An unparseable line drops only that line and is reported; nothing is guessed. */
function parsePersonal(text, problems) {
    const body = (s) => sectionBody(text, exports.PERSONAL_SECTIONS[s]);
    const people = listItems(body('people')).map((item) => {
        const m = item.match(/^(.*?)\s+[—–-]+\s*why:\s*(.*)$/i);
        return m ? { who: (m[1] ?? '').trim(), why: (m[2] ?? '').trim() } : { who: item, why: '' };
    });
    const style = {};
    for (const line of listItems(body('style'))) {
        const kv = line.match(/^([A-Za-z_]+)\s*:\s*(.+)$/);
        const key = kv?.[1]?.toLowerCase();
        if (kv && exports.STYLE_KEYS.includes(key ?? ''))
            style[key] = (kv[2] ?? '').trim();
        else
            problems.push({ field: 'style', detail: `"${line}" is not one of ${exports.STYLE_KEYS.join(', ')} as key: value — ignored` });
    }
    // ANY problem in this section resolves to NONE set, the same as an absent section: a valid line
    // beside an invalid one is not a ranking the person can be assumed to mean.
    const found = [];
    let unclear = false;
    for (const line of listItems(body('priorities'))) {
        const kv = line.match(/^(preset|order)\s*:\s*(.*)$/i);
        const isPreset = kv?.[1]?.toLowerCase() === 'preset';
        const raw = kv?.[2] ?? '';
        const err = !kv ? 'it is neither preset: nor order:' : isPreset ? checkPreset(raw) : checkOrder(splitOrder(raw));
        if (err) {
            unclear = true;
            problems.push({ field: 'priorities', detail: `line "${line}": ${err} — no priorities set` });
        }
        else
            found.push(isPreset ? { preset: raw.trim() } : { order: splitOrder(raw) });
    }
    if (found.length > 1) {
        unclear = true;
        problems.push({ field: 'priorities', detail: `${found.length} preset:/order: lines, expected one — no priorities set` });
    }
    return {
        values: listItems(body('values')),
        people,
        style,
        constraints: listItems(body('constraints')),
        priorities: unclear ? null : (found[0] ?? null),
    };
}
/** `cost,quality speed` → ['cost','quality','speed'], lower-cased. */
function splitOrder(raw) {
    return raw.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}
/** null when `names` ranks all three priorities exactly once; otherwise why not. */
function checkOrder(names) {
    const seen = new Set();
    for (const n of names) {
        if (!exports.PRIORITY_NAMES.includes(n))
            return `unknown priority "${n}" — use ${exports.PRIORITY_NAMES.join(', ')}`;
        if (seen.has(n))
            return `"${n}" is listed twice`;
        seen.add(n);
    }
    if (seen.size !== exports.PRIORITY_NAMES.length)
        return `rank all three (${exports.PRIORITY_NAMES.join(', ')}), or use a preset`;
    return null;
}
/** null when `raw` is a known preset; otherwise why not. */
function checkPreset(raw) {
    return exports.PRESETS.includes(raw.trim()) ? null : `unknown preset "${raw.trim()}" — use ${exports.PRESETS.join(', ')}`;
}
/**
 * null when `raw` can be stored as one entry and read back unchanged; otherwise why not. One line,
 * so it cannot open a new section; no comment markers, because the parser strips comments.
 */
function checkText(raw, what) {
    const t = raw.trim();
    if (!t)
        return `${what} is empty`;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(t))
        return `${what} must be one line of plain text`;
    if (t.length > 280)
        return `${what} is longer than 280 characters`;
    // `--!>` too: an HTML viewer of the file ends a comment there, even though our parser does not.
    if (/<!--|--!?>/.test(t))
        return `${what} cannot contain <!--, --> or --!>`;
    return null;
}
/**
 * PURE. Rewrite ONE personal section of an existing profile file to match `p`, leaving every other
 * byte alone: hand edits, comments and unknown sections elsewhere survive. A file with no personal
 * section yet gets the whole block appended, in file order, exactly as `renderProfile` would write
 * it, and the `share_personal` flag is added to the frontmatter as written in `p` (false unless the
 * person set it).
 */
function writePersonalSection(text, p, s) {
    // Every line keeps its own ending, so a mixed-ending file stays byte-stable outside the edited
    // section. Lines written here use the file's dominant ending (a tie goes to \n).
    const chunks = (t) => t.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    const lines = chunks(text);
    const crlf = lines.filter((l) => l.endsWith('\r\n')).length;
    const eol = crlf * 2 > lines.filter((l) => l.endsWith('\n')).length ? '\r\n' : '\n';
    const own = (block) => chunks(block.replace(/\n/g, eol));
    const bare = (l) => l.replace(/\r?\n$/, '');
    const headingOf = (l) => bare(l).match(/^#\s+(.*?)\s*$/)?.[1]?.toLowerCase();
    const close = bare(lines[0] ?? '') === '---' ? lines.findIndex((l, i) => i > 0 && bare(l) === '---') : -1;
    if (close > 0 && parseFrontmatter(text)['share_personal'] === undefined) {
        lines.splice(close, 0, `share_personal: ${p.share_personal}${eol}`);
    }
    const start = lines.findIndex((l) => headingOf(l) === exports.PERSONAL_SECTIONS[s].toLowerCase());
    const section = renderPersonalSection(p, s);
    if (start === -1) {
        const headings = new Set(lines.map(headingOf));
        const anyPersonal = SECTION_KEYS.some((k) => headings.has(exports.PERSONAL_SECTIONS[k].toLowerCase()));
        const add = anyPersonal ? section : SECTION_KEYS.map((k) => renderPersonalSection(p, k)).join('\n');
        const last = lines[lines.length - 1];
        if (last !== undefined && !last.endsWith('\n'))
            lines[lines.length - 1] = last + eol;
        const endsBlank = last !== undefined && bare(last) === '';
        return lines.join('') + (endsBlank ? '' : eol) + own(add).join('');
    }
    let end = start + 1;
    while (end < lines.length && headingOf(lines[end] ?? '') === undefined)
        end += 1;
    const atEnd = end === lines.length;
    lines.splice(start, end - start, ...own(section), ...(atEnd ? [] : [eol]));
    return lines.join('');
}
