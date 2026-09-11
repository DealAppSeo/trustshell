import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseAnswers, parseArgv, toolPack, QUESTIONS } = require('../lib/interview.js');

test('caps answers at 3 — a fourth pipe is ignored', () => {
  assert.deepEqual(parseAnswers('a|b|c|d'), ['a', 'b', 'c']);
  assert.equal(QUESTIONS.length, 3);
});

test('blank pipe keeps positional slots', () => {
  assert.deepEqual(parseAnswers('research||grok'), ['research', '', 'grok']);
});

test('parseArgv --name and --answers', () => {
  const r = parseArgv(['node', 'init-pai.mjs', '--name', 'pai-night-1', '--answers', 'write weekly research|wasted hours|grok']);
  assert.equal(r.name, 'pai-night-1');
  assert.equal(r.force, false);
  assert.deepEqual(r.answers, ['write weekly research', 'wasted hours', 'grok']);
});

test('parseArgv --force', () => {
  const r = parseArgv(['node', 'init-pai.mjs', '--name', 'other', '--force']);
  assert.equal(r.force, true);
});

test('toolPack always verify + present_proof; pay/market adds x402-cap', () => {
  assert.deepEqual(toolPack('write weekly research'), ['verify', 'present_proof']);
  assert.deepEqual(toolPack('pay invoices on the market'), ['verify', 'present_proof', 'x402-cap']);
  assert.deepEqual(toolPack('repayment marketing notes'), ['verify', 'present_proof']);
});

test('429 with local creds reuses; 429 without local is busy not success', () => {
  const { reuseOrNameTaken } = require('../lib/interview.js');
  const err = { status: 429, message: 'Agent registration failed: 429' };
  const reuse = reuseOrNameTaken({
    name: 'pai-night-1',
    err,
    local: { agentName: 'pai-night-1', agentId: 'abc', apiKey: 'k' },
  });
  assert.equal(reuse.action, 'reuse');
  const busy = reuseOrNameTaken({ name: 'pai-night-1', err, local: null });
  assert.equal(busy.action, 'busy');
  assert.equal(busy.message, 'name taken, pick another');
  const taken = reuseOrNameTaken({
    name: 'pai-night-1',
    err: { status: 409, message: 'already exists' },
    local: null,
  });
  assert.equal(taken.action, 'name_taken');
});

test('existingCreds reuses same name; refuses other name without --force', () => {
  const { existingCreds } = require('../lib/interview.js');
  const local = { agentName: 'pai-night-1', agentId: 'abc', apiKey: 'k' };
  assert.equal(existingCreds({ local, name: 'pai-night-1', force: false }).action, 'reuse');
  const clash = existingCreds({ local, name: 'other', force: false });
  assert.equal(clash.action, 'exists');
  assert.equal(existingCreds({ local, name: 'other', force: true }).action, 'register');
  assert.equal(existingCreds({ local: null, name: 'x', force: false }).action, 'register');
});

test('writePrivate writes a regular file; refuses a symlink at that path', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { writePrivate } = require('../lib/interview.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pai-priv-'));
  const dest = path.join(dir, 'credentials.json');
  try {
    writePrivate(dest, '{"apiKey":"k"}\n');
    assert.equal(fs.readFileSync(dest, 'utf8'), '{"apiKey":"k"}\n');
    const target = path.join(dir, 'leaked.txt');
    fs.writeFileSync(target, 'innocent\n');
    fs.unlinkSync(dest);
    try {
      fs.symlinkSync(target, dest);
    } catch (e) {
      if (e.code === 'EPERM' || e.code === 'EACCES') return;
      throw e;
    }
    assert.throws(() => writePrivate(dest, '{"apiKey":"secret"}\n'), /symlink/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'innocent\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writePrivate refuses a hard link at the credential path', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { writePrivate } = require('../lib/interview.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pai-hard-'));
  const dest = path.join(dir, 'credentials.json');
  const other = path.join(dir, 'leaked.txt');
  try {
    fs.writeFileSync(other, 'innocent\n');
    try {
      fs.linkSync(other, dest);
    } catch (e) {
      if (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'ENOTSUP') return;
      throw e;
    }
    assert.throws(() => writePrivate(dest, '{"apiKey":"secret"}\n'), /hard link/);
    assert.equal(fs.readFileSync(other, 'utf8'), 'innocent\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writePrivate refuses a symlink directory', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { writePrivate } = require('../lib/interview.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pai-dir-'));
  const real = path.join(root, 'real');
  const link = path.join(root, '.trustshell');
  fs.mkdirSync(real);
  try {
    try {
      fs.symlinkSync(real, link);
    } catch (e) {
      if (e.code === 'EPERM' || e.code === 'EACCES') return;
      throw e;
    }
    assert.throws(
      () => writePrivate(path.join(link, 'credentials.json'), '{"apiKey":"secret"}\n'),
      /symlink/,
    );
    assert.equal(fs.existsSync(path.join(real, 'credentials.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
