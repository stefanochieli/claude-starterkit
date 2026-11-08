'use strict';
// Consistency checks between the manifests, the CI workflow and the ruleset.
// Run from the repository root with:  node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Normalize CRLF: on Windows, git (core.autocrlf / text=auto) checks files out with \r\n.
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const json = (p) => JSON.parse(read(p));

test('marketplace entry, plugin manifest and directory agree', () => {
  const mp = json('.claude-plugin/marketplace.json');
  assert.equal(mp.name, 'claude-starterkit');
  assert.equal(mp.plugins.length, 1);
  const entry = mp.plugins[0];
  const manifest = json(path.join(entry.source, '.claude-plugin', 'plugin.json'));
  assert.equal(manifest.name, entry.name, 'entry name must equal the manifest name');
  assert.ok(fs.existsSync(path.join(ROOT, entry.source, 'hooks', 'hooks.json')));
  assert.ok(manifest.repository.endsWith('/claude-starterkit'));
});

test('every skill and agent has frontmatter with a name matching its folder or file', () => {
  const base = path.join(ROOT, 'plugins', 'starterkit');
  for (const dir of fs.readdirSync(path.join(base, 'skills'))) {
    const text = read(path.join('plugins', 'starterkit', 'skills', dir, 'SKILL.md'));
    assert.match(text, new RegExp('^---\\nname: ' + dir + '\\n', 'm'), 'skill ' + dir);
    assert.match(text, /^description: .+/m);
  }
  for (const file of fs.readdirSync(path.join(base, 'agents'))) {
    const text = read(path.join('plugins', 'starterkit', 'agents', file));
    assert.match(text, new RegExp('^---\\nname: ' + file.replace(/\.md$/, '') + '\\n', 'm'), 'agent ' + file);
  }
});

test('ruleset: pull request required, admin bypass, and a check the workflow really produces', () => {
  const rs = json('.github/rulesets/protect-main.json');
  assert.equal(rs.name, 'protect-main');
  assert.equal(rs.enforcement, 'active');
  assert.ok(rs.rules.some((r) => r.type === 'pull_request'));
  assert.ok(rs.bypass_actors.some((a) => a.actor_type === 'RepositoryRole' && a.actor_id === 5));

  const required = rs.rules
    .find((r) => r.type === 'required_status_checks')
    .parameters.required_status_checks.map((c) => c.context);
  assert.deepEqual(required, ['checks']);

  const wf = read('.github/workflows/checks.yml');
  // job id and display name of the aggregator job must both be "checks"
  assert.match(wf, /^  checks:\n    name: checks\n/m);
  // and it must wait for every other job
  assert.match(wf, /needs: \[test, validate\]/);
});

test('workflow runs on pull requests and on pushes to main', () => {
  const wf = read('.github/workflows/checks.yml');
  assert.match(wf, /^on:\n  pull_request:\n  push:\n    branches: \[main\]/m);
});
