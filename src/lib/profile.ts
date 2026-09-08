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
 */

/** Bump only on a breaking change to the file's shape. */
export const PROFILE_VERSION = 1;

/** The vocabulary `tool_call_log` already uses. Most conservative first. */
export type Autonomy = 'ask_first' | 'do_then_tell' | 'just_do_it';
export const AUTONOMY_VALUES: readonly Autonomy[] = ['ask_first', 'do_then_tell', 'just_do_it'];

export interface TrustSettings {
  autonomy: Autonomy;
  confidence_gate: number;
  hitl_gate: number;
}

export interface Profile {
  version: number;
  share_identity: boolean;
  share_context: boolean;
  identity: string;
  context: string;
  trust: TrustSettings;
}

/**
 * The project's canonical gates, not numbers invented here: CONFIDENCE_GATE =
 * 0.8 and REPID_HITL_GATE = 70. `ask_first` is the most conservative autonomy.
 */
export const DEFAULT_TRUST: TrustSettings = {
  autonomy: 'ask_first',
  confidence_gate: 0.8,
  hitl_gate: 70,
};

export function defaultProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    share_identity: false,
    share_context: false,
    identity: '',
    context: '',
    trust: { ...DEFAULT_TRUST },
  };
}

/**
 * The file `init` writes. The comments are load-bearing: they are where a reader
 * learns that the blanks are deliberate, so nobody "helpfully" auto-fills them.
 */
export function renderProfile(p: Profile = defaultProfile()): string {
  return `---
trustshell_profile: ${p.version}
share_identity: ${p.share_identity}
share_context: ${p.share_context}
---

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
`;
}

/** A problem with a profile. Never thrown for a missing file — that is not an error. */
export interface ProfileProblem {
  field: string;
  detail: string;
}

export interface ParsedProfile {
  profile: Profile;
  problems: ProfileProblem[];
}

function parseFrontmatter(text: string): Record<string, string> {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out: Record<string, string> = {};
  if (!m || !m[1]) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (kv && kv[1] !== undefined && kv[2] !== undefined) out[kv[1]] = kv[2].trim();
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
function sectionBody(text: string, heading: string): string {
  const lines = text.split(/\r?\n/);
  const want = heading.toLowerCase();
  let collecting = false;
  const body: string[] = [];
  for (const line of lines) {
    const h = line.match(/^#\s+(.*?)\s*$/);
    if (h) {
      if (collecting) break;
      collecting = (h[1] ?? '').toLowerCase() === want;
      continue;
    }
    if (collecting) body.push(line);
  }
  return body.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
}

function parseBool(raw: string | undefined, field: string, problems: ProfileProblem[]): boolean {
  if (raw === undefined) return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
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
export function parseProfile(text: string): ParsedProfile {
  const problems: ProfileProblem[] = [];
  const fm = parseFrontmatter(text);

  const rawVersion = fm['trustshell_profile'];
  let version = PROFILE_VERSION;
  if (rawVersion === undefined) {
    problems.push({ field: 'trustshell_profile', detail: 'missing — not a TrustShell profile' });
  } else if (!/^\d+$/.test(rawVersion)) {
    problems.push({ field: 'trustshell_profile', detail: `not a number: "${rawVersion}"` });
  } else {
    version = Number(rawVersion);
    if (version > PROFILE_VERSION) {
      problems.push({
        field: 'trustshell_profile',
        detail: `file is version ${version}, this build understands ${PROFILE_VERSION}`,
      });
    }
  }

  const trustBody = sectionBody(text, 'Trust settings');
  const trust: TrustSettings = { ...DEFAULT_TRUST };

  const aMatch = trustBody.match(/^autonomy\s*:\s*(\S+)/m);
  if (aMatch && aMatch[1]) {
    if ((AUTONOMY_VALUES as readonly string[]).includes(aMatch[1])) {
      trust.autonomy = aMatch[1] as Autonomy;
    } else {
      problems.push({
        field: 'autonomy',
        detail: `unknown value "${aMatch[1]}" — treated as ask_first`,
      });
    }
  }

  for (const [field, key] of [
    ['confidence_gate', 'confidence_gate'],
    ['hitl_gate', 'hitl_gate'],
  ] as const) {
    const m = trustBody.match(new RegExp(`^${key}\\s*:\\s*(\\S+)`, 'm'));
    if (m && m[1] !== undefined) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) trust[key] = n;
      else problems.push({ field, detail: `not a number: "${m[1]}" — kept default` });
    }
  }

  return {
    profile: {
      version,
      share_identity: parseBool(fm['share_identity'], 'share_identity', problems),
      share_context: parseBool(fm['share_context'], 'share_context', problems),
      identity: sectionBody(text, 'Identity'),
      context: sectionBody(text, 'Context'),
      trust,
    },
    problems,
  };
}
