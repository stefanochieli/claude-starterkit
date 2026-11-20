'use strict';
// Checks scripts/export-skills.sh (the PowerShell twin is exercised by the Windows CI job).
// Run from the repository root with:  node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'export-skills.sh');
const SKILLS = fs.readdirSync(path.join(ROOT, 'plugins', 'starterkit', 'skills'));
const hasBash = process.platform !== 'win32' && spawnSync('bash', ['-c', 'true']).status === 0;
const opts = { skip: !hasBash && 'needs bash (Windows is covered by the CI PowerShell step)' };

const run = (...args) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'export-skills-'));

test('copilot-repo export: portable frontmatter, no Claude Code placeholders, idempotent', opts, () => {
  const repo = tmp();
  assert.equal(run('--copilot-repo', repo).status, 0);
  for (const n of SKILLS) {
    const file = path.join(repo, '.github', 'skills', n, 'SKILL.md');
    const text = fs.readFileSync(file, 'utf8');
    const fm = text.match(/^---\n([\s\S]*?)\n---\n/)[1].split('\n');
    assert.deepEqual(fm.map((l) => l.split(':')[0]), ['name', 'description'], n);
    assert.equal(fm[0], 'name: ' + n);
    assert.doesNotMatch(text, /\$ARGUMENTS|argument-hint|disable-model-invocation/);
    assert.match(text, /written for Claude Code/);
  }
  const again = run('--copilot-repo', repo);
  assert.match(again.stdout, /Already up to date/);
  assert.doesNotMatch(again.stdout, /Backup/);
});

test('an edited Copilot SKILL.md is backed up before it is replaced', opts, () => {
  const repo = tmp();
  run('--copilot-repo', repo, '--skills', 'deeper');
  const file = path.join(repo, '.github', 'skills', 'deeper', 'SKILL.md');
  fs.appendFileSync(file, '\nmy edit\n');
  const r = run('--copilot-repo', repo, '--skills', 'deeper');
  assert.match(r.stdout, /Backup:/);
  const baks = fs.readdirSync(path.dirname(file)).filter((f) => f.startsWith('SKILL.md.bak-'));
  assert.equal(baks.length, 1);
});

test('zip export: one zip per skill with a single top-level folder named like the skill', opts, () => {
  const out = tmp();
  assert.equal(run('--zip', out).status, 0);
  for (const n of SKILLS) {
    const buf = fs.readFileSync(path.join(out, n + '.zip'));
    assert.equal(buf.subarray(0, 2).toString(), 'PK');
    const listing = spawnSync('unzip', ['-Z1', path.join(out, n + '.zip')], { encoding: 'utf8' });
    if (listing.status === 0) assert.equal(listing.stdout.trim(), n + '/SKILL.md');
    else assert.ok(buf.includes(n + '/SKILL.md'));
  }
});

test('unknown skill and unknown option are rejected', opts, () => {
  assert.equal(run('--skills', 'nope').status, 1);
  assert.equal(run('--bogus').status, 2);
});
