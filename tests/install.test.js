'use strict';
// Tests for scripts/install-global.sh using a temporary CLAUDE_CONFIG_DIR.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'install-global.sh');
const POSIX = process.platform !== 'win32';

function setup(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starterkit-inst-'));
  const file = path.join(dir, 'CLAUDE.md');
  if (initial !== undefined) fs.writeFileSync(file, initial);
  const run = (...args) =>
    spawnSync('bash', [SCRIPT, ...args], { env: { ...process.env, CLAUDE_CONFIG_DIR: dir }, encoding: 'utf8' });
  const backups = () => fs.readdirSync(dir).filter((f) => f.includes('.bak-'));
  return { dir, file, run, backups };
}

test('install is idempotent, makes one backup, and remove restores the original', { skip: !POSIX }, () => {
  const original = '# mine\nrule\n';
  const t = setup(original);
  assert.equal(t.run().status, 0);
  const once = fs.readFileSync(t.file, 'utf8');
  assert.equal(t.backups().length, 1);
  assert.equal(t.run().status, 0);
  assert.equal(fs.readFileSync(t.file, 'utf8'), once, 'second run must not change the file');
  assert.equal(t.backups().length, 1, 'a no-op run must not make a backup');
  assert.equal((once.match(/starterkit:start/g) || []).length, 1);
  assert.equal(t.run('--remove').status, 0);
  assert.equal(fs.readFileSync(t.file, 'utf8'), original);
});

test('install creates the file when missing; remove on a missing file does nothing', { skip: !POSIX }, () => {
  const t = setup();
  assert.equal(t.run('--remove').status, 0);
  assert.ok(!fs.existsSync(t.file));
  assert.equal(t.run().status, 0);
  assert.match(fs.readFileSync(t.file, 'utf8'), /starterkit:end/);
});

test('an unterminated start marker is refused and the file is untouched', { skip: !POSIX }, () => {
  const broken = 'top\n<!-- starterkit:start -->\nmy text after a deleted end marker\n';
  const t = setup(broken);
  const r = t.run();
  assert.notEqual(r.status, 0);
  assert.equal(fs.readFileSync(t.file, 'utf8'), broken);
  assert.equal(t.backups().length, 0);
});

test('unknown arguments are rejected', { skip: !POSIX }, () => {
  const t = setup('x\n');
  assert.equal(t.run('--help').status, 2);
  assert.equal(fs.readFileSync(t.file, 'utf8'), 'x\n');
});
