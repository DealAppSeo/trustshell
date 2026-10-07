/**
 * README `## Where this sits` — the edges, pinned to the code, not to a picture.
 *
 * Sean, 2026-10-07: "Each README names only what it calls and what calls it, and links to the
 * map. A pin test on those edges, not on a picture." Every value the README states about an edge
 * is read back from the thing it describes:
 *
 *   engine URL       the TrustShell constructor default, resolveClassifyUrl, and every
 *                    DEFAULT_ENGINE / DEFAULT_API_URL constant found by walking src/
 *   proof-verifier   package.json `dependencies` (not peer, not optional, not bundled)
 *   MCP tools        the names createServer() actually registers
 *   verdicts         the `Verdict` union in src/lib/trustshell.ts and CLAIM_LABELS
 *   the map          the one BUILDERS.md anchor every Trust* README links to
 *
 * Production changes that make this fail: moving the default engine without the README; turning
 * proof-verifier into a peer or bundled dependency; registering or dropping an MCP tool without
 * naming it here; adding a verdict the README does not list; pointing the map anywhere else.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TrustShell, REPUTATION_REGISTRY_BASE_SEPOLIA } from '../src/lib/index';
import { CLAIM_LABELS, DEFAULT_API_URL, resolveClassifyUrl } from '../src/lib/claim';
import { createServer } from '../src/mcp/index';

const ROOT = join(__dirname, '..');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, any>;
const MAP = 'https://github.com/DealAppSeo/hyperdag-protocol/blob/main/BUILDERS.md#how-the-pieces-fit';
const HEADING = '## Where this sits';

// ---- pure readers, exported so the negative controls below run the same code ----------------

/** The text under a `## ` heading, up to the next `## ` heading. '' when the heading is absent. */
export function sectionOf(readme: string, heading: string): string {
  const at = readme.indexOf(`\n${heading}\n`);
  if (at < 0) return '';
  const rest = readme.slice(at + heading.length + 2);
  const next = rest.search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next);
}

/** The block after a bold label (`**Calls:**`), up to the next bold label or the end. */
export function blockOf(section: string, label: string): string {
  const at = section.indexOf(`**${label}:**`);
  if (at < 0) return '';
  const rest = section.slice(at + label.length + 5);
  const next = rest.search(/^\*\*[A-Z][^*]*:\*\*/m);
  return next < 0 ? rest : rest.slice(0, next);
}

/** The engine origin the README names: the first backticked URL on the repid-engine line. */
export function engineUrlNamed(calls: string): string | null {
  const line = calls.split('\n').find((l) => l.includes('DealAppSeo/repid-engine'));
  return line?.match(/`(https?:\/\/[^`]+)`/)?.[1] ?? null;
}

/** Every `@scope/name` the block names, with the backticked range right after it if there is one. */
export function packagesNamed(calls: string): Array<{ name: string; range: string | null }> {
  return [...calls.matchAll(/`(@[a-z0-9-]+\/[a-z0-9-]+)`\**\s*(?:`([^`]+)`)?/g)].map((m) => ({
    name: m[1] as string,
    range: m[2] ?? null,
  }));
}

/** The MCP tool names the README lists, from "In x.y.z its tools are" to "It has no purchase tool". */
export function mcpToolsNamed(readme: string): string[] {
  const m = readme.match(/In \d+\.\d+\.\d+ its tools are([\s\S]*?)It has no purchase tool/);
  if (!m) return [];
  return [...new Set([...(m[1] as string).matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((x) => x[1] as string))].sort();
}

/** The verdicts in "get a `A` / `B` / … verdict". */
export function verdictsNamed(readme: string): string[] {
  const m = readme.match(/get a ((?:`[A-Z_]+`(?:\s*\/\s*)?)+) verdict/);
  if (!m) return [];
  return [...(m[1] as string).matchAll(/`([A-Z_]+)`/g)].map((x) => x[1] as string).sort();
}

/** The members of `export type <name> = 'a' | 'b';` in a source text. Every quoted member. */
export function unionMembers(source: string, name: string): string[] {
  const m = source.match(new RegExp(`export type ${name}\\s*=\\s*([^;]+);`));
  if (!m) return [];
  return [...(m[1] as string).matchAll(/'([^']*)'/g)].map((x) => x[1] as string).sort();
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

// ---- the README as it is ------------------------------------------------------------------

const section = sectionOf(README, HEADING);
const calls = blockOf(section, 'Calls');
const calledBy = blockOf(section, 'Called by');

describe('README: Where this sits', () => {
  it('has the section, a Calls list, a Called by list, and names the engine repo', () => {
    expect(section).not.toBe('');
    expect(calls).not.toBe('');
    expect(calledBy).not.toBe('');
    expect(calls).toContain('[DealAppSeo/repid-engine](https://github.com/DealAppSeo/repid-engine)');
  });

  it('names the engine URL the code uses by default, and the env var that overrides it', () => {
    const named = engineUrlNamed(calls);
    expect(named).not.toBeNull();

    const saved = process.env.TRUSTSHELL_API_URL;
    try {
      delete process.env.TRUSTSHELL_API_URL;
      expect((new TrustShell() as any).baseUrl).toBe(named);
      process.env.TRUSTSHELL_API_URL = 'https://override.example';
      expect((new TrustShell() as any).baseUrl).toBe('https://override.example');
    } finally {
      if (saved === undefined) delete process.env.TRUSTSHELL_API_URL;
      else process.env.TRUSTSHELL_API_URL = saved;
    }
    expect(calls).toContain('`TRUSTSHELL_API_URL`');
    expect(DEFAULT_API_URL).toBe(named);
    expect(resolveClassifyUrl(undefined, {})).toBe(`${named}/api/v1/classify`);

    // Every other default-engine constant, found by walking src/ (a walk, not a list).
    const defaults = walkTs(join(ROOT, 'src')).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/\bDEFAULT_(?:ENGINE|API_URL)\s*=\s*'([^']+)'/g)].map((m) => m[1]),
    );
    expect(defaults.length).toBeGreaterThanOrEqual(3);
    expect([...new Set(defaults)]).toEqual([named]);
  });

  it('names @hyperdag/proof-verifier as a runtime dependency, with the range package.json has', () => {
    const named = packagesNamed(calls);
    const pv = named.find((p) => p.name === '@hyperdag/proof-verifier');
    expect(pv?.range).toBe(PKG.dependencies['@hyperdag/proof-verifier']);
    // Every package the Calls list names is a real runtime dependency.
    for (const p of named) expect(Object.keys(PKG.dependencies)).toContain(p.name);
    // "npm installs it alongside, and the published tarball contains none of its files."
    for (const key of ['peerDependencies', 'optionalDependencies']) {
      expect(Object.keys(PKG[key] ?? {})).not.toContain('@hyperdag/proof-verifier');
    }
    expect(PKG.bundleDependencies ?? PKG.bundledDependencies).toBeUndefined();
    expect((PKG.files as string[]).some((f) => /node_modules|proof-verifier/.test(f))).toBe(false);
    expect(README).not.toMatch(/ships inside trustshell|bundled with trustshell/i);
  });

  it('names the ERC-8004 read the code makes, and nothing it does not', () => {
    const signer = readFileSync(join(ROOT, 'src/lib/verify-signer.ts'), 'utf8');
    const rpc = signer.match(/const DEFAULT_RPC = '([^']+)'/)?.[1];
    expect(rpc).toBeDefined();
    expect(calls).toContain(`\`${rpc}\``);
    expect(signer).toMatch(/function getClients\(/);
    expect(calls).toMatch(/ReputationRegistry on Base Sepolia/);
    expect(README).toContain(REPUTATION_REGISTRY_BASE_SEPOLIA);
    // The README says the package does not read the IdentityRegistry. Hold the code to that: its
    // address and an ownerOf call are what a read would need.
    const src = walkTs(join(ROOT, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(src).not.toMatch(/0x8004A818BFB912233c491871b3d84c89A494BD9e|ownerOf\s*\(/i);
  });

  it('names api.github.com for check <runUrl>, which is where src/lib/check.ts fetches', () => {
    const check = readFileSync(join(ROOT, 'src/lib/check.ts'), 'utf8');
    expect(check).toMatch(/fetch\('https:\/\/api\.github\.com'/);
    expect(calls).toContain('`api.github.com`');
  });

  it('names callers the repo can support', () => {
    const bins = Object.keys(PKG.bin);
    expect(calledBy).toContain('`trustshell`');
    expect(calledBy).toContain('`trustshell-mcp`');
    expect(bins).toEqual(expect.arrayContaining(['trustshell', 'trustshell-mcp']));
    // "its /check page imports src/lib/claim.ts from this tree"
    expect(calledBy).toContain('`src/lib/claim.ts`');
    expect(readFileSync(join(ROOT, 'app/check/CheckForm.tsx'), 'utf8')).toMatch(/from '@\/src\/lib\/claim'/);
    // "The Chrome extension in extension/ does not import this package."
    const ext = readdirSync(join(ROOT, 'extension')).filter((f) => f.endsWith('.js'));
    expect(ext.length).toBeGreaterThan(0);
    for (const f of ext) {
      const js = readFileSync(join(ROOT, 'extension', f), 'utf8');
      expect(js).not.toMatch(/(?:require\(|from\s+|import\()\s*['"](?:@hyperdag\/trustshell|\.\.\/src\/|\.\.\/dist\/)/);
    }
    expect(calledBy).toContain('[DealAppSeo/example-agent](https://github.com/DealAppSeo/example-agent)');
  });

  it('links the map, and only the map', () => {
    expect(section).toContain(`**The whole map:** ${MAP}`);
    const builders = [...README.matchAll(/https:\/\/github\.com\/DealAppSeo\/hyperdag-protocol\/blob\/main\/BUILDERS\.md[^\s)]*/g)].map((m) => m[0]);
    expect([...new Set(builders)]).toEqual([MAP]);
  });
});

describe('README: MCP tools and verdicts match the code', () => {
  it('lists exactly the tools the MCP server registers', () => {
    const server: any = createServer({} as unknown as TrustShell);
    const registered = Object.keys(server._registeredTools ?? {}).sort();
    expect(registered.length).toBeGreaterThan(5);
    expect(mcpToolsNamed(README)).toEqual(registered);
  });

  it('lists every verdict verifyOutput can return, and no other', () => {
    const declared = unionMembers(readFileSync(join(ROOT, 'src/lib/trustshell.ts'), 'utf8'), 'Verdict');
    expect(declared).toContain('NOT_CHECKED');
    expect(verdictsNamed(README)).toEqual(declared);
  });

  it('gives every label check "<sentence>" can return its own exit row', () => {
    for (const label of CLAIM_LABELS) expect(README).toMatch(new RegExp(`^\\| \`${label}\` \\| `, 'm'));
  });
});

describe('the readers fail when an edge is wrong (negative controls)', () => {
  const sample = [
    '# x',
    '',
    HEADING,
    '',
    '**Calls:**',
    '',
    '- **[DealAppSeo/repid-engine](https://github.com/DealAppSeo/repid-engine)**, at `https://wrong.example` unless `TRUSTSHELL_API_URL` names another.',
    '- **`@hyperdag/proof-verifier`** `^9.9.9`, a runtime dependency.',
    '',
    '**Called by:**',
    '',
    '- People.',
    '',
    '**The whole map:** https://example.com/map',
    '',
    '## Next',
    '',
    'In 1.6.0 its tools are `verify_output` and `status`. It has no purchase tool.',
    'get a `PASS` / `VETO` verdict',
  ].join('\n');
  const s = sectionOf(sample, HEADING);
  const c = blockOf(s, 'Calls');

  it('reads a wrong engine URL as wrong', () => {
    expect(engineUrlNamed(c)).toBe('https://wrong.example');
    expect(engineUrlNamed(c)).not.toBe(DEFAULT_API_URL);
  });

  it('reads a wrong dependency range as wrong', () => {
    const pv = packagesNamed(c).find((p) => p.name === '@hyperdag/proof-verifier');
    expect(pv?.range).toBe('^9.9.9');
    expect(pv?.range).not.toBe(PKG.dependencies['@hyperdag/proof-verifier']);
  });

  it('reads a short tool list and a short verdict list as short', () => {
    expect(mcpToolsNamed(sample)).toEqual(['status', 'verify_output']);
    expect(verdictsNamed(sample)).toEqual(['PASS', 'VETO']);
    expect(unionMembers("export type Verdict = 'PASS' | 'NOT_CHECKED';", 'Verdict')).toEqual(['NOT_CHECKED', 'PASS']);
  });

  it('reads a wrong map link as wrong, and a missing section as missing', () => {
    expect(s).not.toContain(`**The whole map:** ${MAP}`);
    expect(blockOf(s, 'Called by')).toContain('People.');
    expect(sectionOf('# x\n\n## Elsewhere\n', HEADING)).toBe('');
  });
});
