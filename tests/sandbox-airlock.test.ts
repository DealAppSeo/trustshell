/**
 * Airlock inspection, with the outbox built directly on the host (ordinary importer validation, the
 * zip-slip family). Each refusal has a test; POSIX-only cases (symlink, fifo, exec bit) skip on Windows.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canaryHit, classify, inspectOutbox, nameProblem, sha256hex, type Candidate } from '../src/sandbox/airlock';

const posixOnly = process.platform === 'win32' ? it.skip : it;
const CANARY = 'TS-CANARY-0123456789abcdef';

let dir: string;
let outbox: string;
let quarantine: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sbx-airlock-test-'));
  outbox = join(dir, 'outbox');
  quarantine = join(dir, 'quarantine');
  mkdirSync(outbox);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (maxFileBytes = 1024, maxFiles = 32) => inspectOutbox(outbox, quarantine, { maxFileBytes, maxFiles, canaries: [CANARY] });
const byName = (cs: Candidate[], n: string) => cs.find((c) => c.name === n)!;

describe('a benign artifact is quarantined as a content-addressed, read-only copy', () => {
  it('copies result.json to quarantine/<sha256> with its size and type', () => {
    const body = '{"count":2,"sum":3}';
    writeFileSync(join(outbox, 'result.json'), body);
    const [c] = run();
    expect(c).toMatchObject({ name: 'result.json', class: 'artifact', status: 'quarantined', size: body.length, type: 'json', sha256: sha256hex(body), reasons: [] });
    const q = join(quarantine, sha256hex(body));
    expect(readFileSync(q, 'utf8')).toBe(body);
    if (process.platform !== 'win32') expect(statSync(q).mode & 0o777).toBe(0o444);
  });

  it('types text and binary deterministically', () => {
    writeFileSync(join(outbox, 'a.txt'), 'hello');
    writeFileSync(join(outbox, 'b.bin'), Buffer.from([0, 1, 2]));
    const cs = run();
    expect(byName(cs, 'a.txt').type).toBe('text');
    expect(byName(cs, 'b.bin').type).toBe('binary');
  });
});

describe('refusals', () => {
  it('a file carrying a registered canary is refused, not copied, and the reason does not echo the canary', () => {
    writeFileSync(join(outbox, 'notes.txt'), `notes: ${CANARY}`);
    const c = run()[0]!;
    expect(c.status).toBe('refused');
    expect(c.reasons).toEqual(['contains registered canary #0']);
    expect(existsSync(join(quarantine, c.sha256!))).toBe(false);
    expect(JSON.stringify(c)).not.toContain(CANARY);
  });

  it('an approval or policy the worker wrote about itself is refused', () => {
    writeFileSync(join(outbox, 'approval.json'), '{"approver":"mission:x","approved":["result.json"]}');
    writeFileSync(join(outbox, 'out.json'), '{"approved_by":"mission:x"}'); // renamed, caught by its keys
    writeFileSync(join(outbox, 'policy.json'), '{"allow":["*"]}');
    const cs = run();
    expect(byName(cs, 'approval.json')).toMatchObject({ status: 'refused', class: 'approval', reasons: ['worker-written approval about itself'] });
    expect(byName(cs, 'out.json')).toMatchObject({ status: 'refused', class: 'approval' });
    expect(byName(cs, 'policy.json')).toMatchObject({ status: 'refused', class: 'policy' });
  });

  it('oversize files are refused', () => {
    writeFileSync(join(outbox, 'big.txt'), 'x'.repeat(2048));
    expect(run(1024)[0]).toMatchObject({ status: 'refused', sha256: null, reasons: ['oversize: 2048 bytes, limit 1024'] });
  });

  it('directories are refused (the outbox is flat)', () => {
    mkdirSync(join(outbox, 'sub'));
    expect(run()[0]).toMatchObject({ status: 'refused', reasons: ['directory (the outbox is flat)'] });
  });

  it('hardlinks are refused under both names', () => {
    writeFileSync(join(dir, 'outside.txt'), 'shared');
    linkSync(join(dir, 'outside.txt'), join(outbox, 'a.txt'));
    const c = run()[0]!;
    expect(c.status).toBe('refused');
    expect(c.reasons[0]).toMatch(/hardlink/);
  });

  posixOnly('symlinks are refused and their target is never read', () => {
    writeFileSync(join(dir, 'host-secret.txt'), 'host only');
    symlinkSync(join(dir, 'host-secret.txt'), join(outbox, 'link.txt'));
    const c = run()[0]!;
    expect(c).toMatchObject({ status: 'refused', sha256: null, reasons: ['symlink'] });
  });

  posixOnly('an executable bit is refused, not stripped', () => {
    writeFileSync(join(outbox, 'run.sh'), 'echo hi');
    chmodSync(join(outbox, 'run.sh'), 0o755);
    expect(run()[0]).toMatchObject({ status: 'refused', reasons: ['executable bit set (refused, not stripped)'] });
  });

  posixOnly('a fifo is refused without blocking', () => {
    const r = spawnSync('mkfifo', [join(outbox, 'pipe')]);
    if (r.status !== 0) return; // no mkfifo on this host
    expect(run()[0]).toMatchObject({ status: 'refused', reasons: ['special file (fifo, socket or device)'] });
  });

  it('entries past the file limit are refused', () => {
    for (const n of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(join(outbox, n), n);
    const cs = run(1024, 2);
    expect(cs.map((c) => c.status)).toEqual(['quarantined', 'quarantined', 'refused']);
    expect(cs[2]!.reasons).toEqual(['more than 2 entries in the outbox']);
  });
});

describe('held, never auto-promoted: tool configs and proposed memory', () => {
  it('quarantines them with a held class', () => {
    writeFileSync(join(outbox, 'memory.md'), 'remember this');
    writeFileSync(join(outbox, '.mcp.json'), '{"mcpServers":{}}');
    writeFileSync(join(outbox, 'settings.json'), '{}');
    const cs = run();
    expect(byName(cs, 'memory.md')).toMatchObject({ status: 'quarantined', class: 'memory', reasons: ['held: memory is never auto-promoted'] });
    expect(byName(cs, '.mcp.json')).toMatchObject({ status: 'quarantined', class: 'tool-config' });
    expect(byName(cs, 'settings.json')).toMatchObject({ status: 'quarantined', class: 'tool-config' });
  });
});

describe('name checks (names a directory listing cannot produce on this host are checked directly)', () => {
  it.each([
    ['', 'empty or dot name'],
    ['..', 'empty or dot name'],
    ['/etc/passwd', 'absolute path'],
    ['C:\\Windows\\x', 'absolute path'],
    ['\\\\server\\share', 'absolute path'],
    ['../escape', 'parent traversal (..)'],
    ['a\\..\\b', 'parent traversal (..)'],
    ['a/b', 'path separator in name (the outbox is flat)'],
    ['x\u0000y', 'control character in name'],
    ['x'.repeat(256), 'name longer than 255 characters'],
  ])('%j is refused: %s', (name, why) => {
    expect(nameProblem(name)).toBe(why);
  });
  it('ordinary names pass', () => {
    for (const n of ['result.json', 'notes.txt', 'a-b_c.1']) expect(nameProblem(n)).toBeNull();
  });
});

describe('classification and canary matching', () => {
  it('classifies by name and top-level JSON keys', () => {
    expect(classify('result.json', Buffer.from('{"sum":3}'))).toBe('artifact');
    expect(classify('sign-off.txt', Buffer.from(''))).toBe('approval');
    expect(classify('x.json', Buffer.from('{"permissions":[]}'))).toBe('policy');
    expect(classify('CLAUDE.md', Buffer.from(''))).toBe('memory');
    expect(classify('hooks.json', Buffer.from('{}'))).toBe('tool-config');
    expect(classify('agent.toml', Buffer.from(''))).toBe('tool-config');
  });
  it('matches canaries literally and ignores empty ones', () => {
    expect(canaryHit(Buffer.from(`a ${CANARY} b`), ['', CANARY])).toBe(1);
    expect(canaryHit(Buffer.from('nothing here'), [CANARY])).toBe(-1);
    expect(canaryHit(Buffer.from('anything'), [''])).toBe(-1);
  });
});

describe('C15: a registered canary in the FILENAME is refused, exactly as in the body', () => {
  it('a file whose NAME is a registered canary, with a benign body, is refused (not quarantined)', () => {
    // A 64-hex mission token / input canary is a valid flat outbox name, so the secret can ride
    // out in the filename. nameProblem lets it through; the airlock must still refuse it.
    writeFileSync(join(outbox, CANARY), 'benign body, nothing secret here');
    const c = run()[0]!;
    expect(c.status).toBe('refused');
    expect(c.reasons).toEqual(['contains registered canary #0 in the filename']);
    expect(existsSync(join(quarantine, c.sha256!))).toBe(false);
  });

  it('a normal file with no canary in name or body is still quarantined (unchanged)', () => {
    writeFileSync(join(outbox, 'plain.json'), '{"ok":true}');
    expect(run()[0]).toMatchObject({ status: 'quarantined', reasons: [] });
  });

  it('a canary in the body is still refused with the body reason (unchanged)', () => {
    writeFileSync(join(outbox, 'notes.txt'), `leak: ${CANARY}`);
    expect(run()[0]).toMatchObject({ status: 'refused', reasons: ['contains registered canary #0'] });
  });
});
