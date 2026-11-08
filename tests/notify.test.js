'use strict';
// Run from the repository root with:  node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PLUGIN = path.join(ROOT, 'plugins', 'starterkit');
const SCRIPT = path.join(PLUGIN, 'scripts', 'notify.js');
const POSIX = process.platform !== 'win32';

function run(args, extraEnv, input, dry = true) {
  const base = { PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '' };
  if (dry) base.STARTERKIT_NOTIFY_DRYRUN = '1';
  const r = spawnSync(process.execPath, [SCRIPT].concat(args), {
    input: input || '',
    encoding: 'utf8',
    env: Object.assign(base, extraEnv || {}),
    timeout: 20000,
  });
  const lines = (r.stdout || '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, lines, stderr: r.stderr || '' };
}

const decode = (line) => Buffer.from(line.args[line.args.length - 1], 'base64').toString('utf16le');

// Rough structural check of a generated PowerShell one-liner (no PowerShell needed).
function balanced(script) {
  const noStrings = script.replace(/'(?:[^']|'')*'/g, "''");
  const count = (c) => noStrings.split(c).length - 1;
  return count('{') === count('}') && count('(') === count(')') && !/\u2018|\u2019/.test(noStrings);
}

test('hooks.json is valid and every hook points at the script', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'));
  const seen = [];
  for (const [event, groups] of Object.entries(cfg.hooks)) {
    for (const g of groups) {
      for (const h of g.hooks) {
        assert.equal(h.type, 'command');
        assert.equal(h.command, 'node');
        assert.equal(h.async, true);
        assert.match(h.args[0], /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/notify\.js$/);
        assert.ok(['done', 'permission', 'question', 'idle'].includes(h.args[1]));
        seen.push(event + ':' + (g.matcher || '') + ':' + h.args[1]);
      }
    }
  }
  assert.ok(seen.includes('Stop::done'));
  assert.ok(seen.includes('Notification:permission_prompt:permission'));
  assert.ok(seen.includes('Notification:idle_prompt:idle'));
  assert.ok(seen.includes('PreToolUse:AskUserQuestion:question'));
});

test('unknown kind, mode off and disabled events print nothing and exit 0', () => {
  for (const [args, env] of [
    [['nonsense'], {}],
    [[], {}],
    [['done'], { STARTERKIT_NOTIFY: 'off' }],
    [['idle'], {}], // idle is not in the default events
    [['done'], { STARTERKIT_NOTIFY_EVENTS: 'permission' }],
  ]) {
    const r = run(args, Object.assign({ STARTERKIT_NOTIFY_PLATFORM: 'linux' }, env));
    assert.equal(r.status, 0);
    assert.equal(r.lines.length, 0);
  }
});

test('idle works once enabled', () => {
  const r = run(['idle'], { STARTERKIT_NOTIFY_PLATFORM: 'darwin', STARTERKIT_NOTIFY_EVENTS: 'idle' });
  assert.equal(r.lines[0].cmd, 'afplay');
  assert.match(r.lines[0].args[0], /Pop\.aiff$/);
});

test('an unknown mode falls back to sound', () => {
  const r = run(['done'], { STARTERKIT_NOTIFY_PLATFORM: 'darwin', STARTERKIT_NOTIFY: 'voce' });
  assert.deepEqual(r.lines.map((l) => l.cmd), ['afplay']);
});

test('windows sound: one PowerShell call, beeps only', () => {
  const r = run(['done'], { STARTERKIT_NOTIFY_PLATFORM: 'win32' });
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].cmd, 'powershell.exe');
  assert.ok(r.lines[0].args.includes('-EncodedCommand'));
  const s = decode(r.lines[0]);
  assert.equal(s, r.lines[0].script);
  assert.match(s, /\[Console\]::Beep/);
  assert.match(s, /'784,120;1047,200'/);
  assert.doesNotMatch(s, /Speak/);
  assert.ok(balanced(s));
});

test('windows voice in Italian picks an it voice and falls back to English text', () => {
  const r = run(['permission'], { STARTERKIT_NOTIFY_PLATFORM: 'win32', STARTERKIT_NOTIFY: 'voice', STARTERKIT_NOTIFY_LANG: 'it' });
  const s = decode(r.lines[0]);
  assert.match(s, /System\.Speech/);
  assert.match(s, /'Claude ha bisogno del tuo permesso'/);
  assert.match(s, /-like 'it\*'/);
  assert.match(s, /\$t='Claude needs your permission'/);
  // voice only: the beeps are the fallback inside catch{}
  assert.match(s, /catch\{foreach/);
  assert.ok(balanced(s));
});

test('windows both: beeps first, then speech, no beep fallback', () => {
  const r = run(['done'], { STARTERKIT_NOTIFY_PLATFORM: 'win32', STARTERKIT_NOTIFY: 'both', STARTERKIT_NOTIFY_LANG: 'en' });
  const s = decode(r.lines[0]);
  assert.ok(s.indexOf('Beep') < s.indexOf('Speak'));
  assert.match(s, /catch\{\}$/);
  assert.ok(balanced(s));
});

test('windows: explicit voice name and quote escaping in project names', () => {
  const input = JSON.stringify({ cwd: "C:\\Users\\User\\GitRepo\\O'Brien\u2019s app" });
  const r = run(['done'], {
    STARTERKIT_NOTIFY_PLATFORM: 'win32',
    STARTERKIT_NOTIFY: 'voice',
    STARTERKIT_NOTIFY_LANG: 'en',
    STARTERKIT_NOTIFY_PROJECT: '1',
    STARTERKIT_NOTIFY_VOICE: "Microsoft Elsa Desktop - Italian (Italy)",
  }, input);
  const s = decode(r.lines[0]);
  assert.match(s, /SelectVoice\('Microsoft Elsa Desktop - Italian \(Italy\)'\)/);
  // ' and the typographic quote each become '' (one literal quote in PowerShell)
  assert.match(s, /project O''Brien''s app/);
  assert.doesNotMatch(s, /’/);
  assert.ok(balanced(s));
});

test('wsl uses powershell.exe', () => {
  const r = run(['done'], { STARTERKIT_NOTIFY_PLATFORM: 'wsl' });
  assert.equal(r.lines[0].cmd, 'powershell.exe');
});

test('macOS sounds differ by event; voice uses Alice for Italian', () => {
  const d = run(['done'], { STARTERKIT_NOTIFY_PLATFORM: 'darwin' });
  const p = run(['permission'], { STARTERKIT_NOTIFY_PLATFORM: 'darwin' });
  assert.match(d.lines[0].args[0], /Glass\.aiff$/);
  assert.match(p.lines[0].args[0], /Ping\.aiff$/);
  const v = run(['done'], { STARTERKIT_NOTIFY_PLATFORM: 'darwin', STARTERKIT_NOTIFY: 'voice', STARTERKIT_NOTIFY_LANG: 'it' });
  assert.deepEqual(v.lines[0], { cmd: 'say', args: ['-v', 'Alice', '--', 'Claude ha finito'] });
  const e = run(['question'], { STARTERKIT_NOTIFY_PLATFORM: 'darwin', STARTERKIT_NOTIFY: 'voice', STARTERKIT_NOTIFY_LANG: 'en' });
  assert.deepEqual(e.lines[0], { cmd: 'say', args: ['--', 'Claude has a question'] });
});

test('linux: canberra sound id and spd-say language', () => {
  const s = run(['done'], { STARTERKIT_NOTIFY_PLATFORM: 'linux' });
  assert.deepEqual(s.lines[0], { cmd: 'canberra-gtk-play', args: ['-i', 'complete'] });
  const v = run(['done'], { STARTERKIT_NOTIFY_PLATFORM: 'linux', STARTERKIT_NOTIFY: 'voice', STARTERKIT_NOTIFY_LANG: 'it' });
  assert.deepEqual(v.lines[0], { cmd: 'spd-say', args: ['-w', '-l', 'it', '--', 'Claude ha finito'] });
});

test('language: env override, LANG, and English default', () => {
  const base = { STARTERKIT_NOTIFY_PLATFORM: 'darwin', STARTERKIT_NOTIFY: 'voice' };
  const say = (extra) => run(['done'], Object.assign({}, base, extra)).lines[0].args.slice(-1)[0];
  assert.equal(say({ STARTERKIT_NOTIFY_LANG: 'it' }), 'Claude ha finito');
  assert.equal(say({ LANG: 'it_IT.UTF-8' }), 'Claude ha finito');
  assert.equal(say({ LANG: 'en_US.UTF-8' }), 'Claude is done');
  assert.equal(say({ LANG: 'it_IT.UTF-8', STARTERKIT_NOTIFY_LANG: 'en' }), 'Claude is done');
});

test('project name is opt-in and read from stdin', () => {
  const input = JSON.stringify({ cwd: '/home/me/orders-service' });
  const env = { STARTERKIT_NOTIFY_PLATFORM: 'darwin', STARTERKIT_NOTIFY: 'voice', STARTERKIT_NOTIFY_LANG: 'it' };
  assert.equal(run(['done'], env, input).lines[0].args.slice(-1)[0], 'Claude ha finito');
  const withName = run(['done'], Object.assign({ STARTERKIT_NOTIFY_PROJECT: '1' }, env), input);
  assert.equal(withName.lines[0].args.slice(-1)[0], 'Claude ha finito, progetto orders-service');
  // garbage on stdin must not break anything
  const bad = run(['done'], Object.assign({ STARTERKIT_NOTIFY_PROJECT: '1' }, env), 'not json');
  assert.equal(bad.status, 0);
  assert.equal(bad.lines[0].args.slice(-1)[0], 'Claude ha finito');
});

// ---- real execution with fake players (POSIX only)

function fakeBin(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starterkit-fake-'));
  for (const [name, body] of Object.entries(files)) {
    const p = path.join(dir, name);
    fs.writeFileSync(p, '#!/bin/sh\n' + body + '\n');
    fs.chmodSync(p, 0o755);
  }
  return dir;
}

test('real run: macOS falls back to the English text when the Italian voice is missing', { skip: !POSIX }, () => {
  const log = path.join(os.tmpdir(), 'starterkit-log-' + process.pid + '-a');
  const bin = fakeBin({
    // fails whenever a voice is requested, like a missing voice
    say: 'echo "say $@" >> "' + log + '"; [ "$1" = "-v" ] && exit 1; exit 0',
    afplay: 'echo "afplay $@" >> "' + log + '"',
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'starterkit-tmp-'));
  const r = run(['done'], { PATH: bin, TMPDIR: tmp, STARTERKIT_NOTIFY_PLATFORM: 'darwin', STARTERKIT_NOTIFY: 'voice', STARTERKIT_NOTIFY_LANG: 'it' }, '', false);
  assert.equal(r.status, 0);
  assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), ['say -v Alice -- Claude ha finito', 'say -- Claude is done']);
});

test('real run: Linux voice falls through to espeak-ng, then to the sound', { skip: !POSIX }, () => {
  const log = path.join(os.tmpdir(), 'starterkit-log-' + process.pid + '-b');
  const bin = fakeBin({ 'espeak-ng': 'echo "espeak-ng $@" >> "' + log + '"' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'starterkit-tmp-'));
  const r = run(['done'], { PATH: bin, TMPDIR: tmp, STARTERKIT_NOTIFY_PLATFORM: 'linux', STARTERKIT_NOTIFY: 'voice', STARTERKIT_NOTIFY_LANG: 'it' }, '', false);
  assert.equal(r.status, 0);
  assert.equal(fs.readFileSync(log, 'utf8').trim(), 'espeak-ng -v it -- Claude ha finito');
});

test('real run: a second alert within a few seconds is skipped, other groups are not', { skip: !POSIX }, () => {
  const log = path.join(os.tmpdir(), 'starterkit-log-' + process.pid + '-c');
  const bin = fakeBin({ afplay: 'echo "afplay $@" >> "' + log + '"' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'starterkit-tmp-'));
  const env = { PATH: bin, TMPDIR: tmp, STARTERKIT_NOTIFY_PLATFORM: 'darwin' };
  run(['question'], env, '', false);
  run(['permission'], env, '', false); // same "input" group: debounced
  run(['done'], env, '', false); // different group: plays
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /Ping\.aiff/);
  assert.match(lines[1], /Glass\.aiff/);
});

test('real run: no player and no TTS at all still exits 0 and silently', { skip: !POSIX }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'starterkit-tmp-'));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'starterkit-empty-'));
  const r = run(['done'], { PATH: empty, TMPDIR: tmp, STARTERKIT_NOTIFY_PLATFORM: 'linux', STARTERKIT_NOTIFY: 'both' }, '', false);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('real run: the debounce stamp is a private per-user folder and a planted symlink is not followed', { skip: !POSIX || typeof process.getuid !== 'function' }, () => {
  const bin = fakeBin({ afplay: 'true' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'starterkit-tmp-'));
  const victim = path.join(tmp, 'victim.txt');
  fs.writeFileSync(victim, 'keep');
  const dir = path.join(tmp, 'starterkit-' + process.getuid());
  fs.mkdirSync(dir, { mode: 0o700 });
  fs.symlinkSync(victim, path.join(dir, 'starterkit-notify-done.stamp'));
  const r = run(['done'], { PATH: bin, TMPDIR: tmp, STARTERKIT_NOTIFY_PLATFORM: 'darwin' }, '', false);
  assert.equal(r.status, 0);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep');
  assert.equal(fs.statSync(dir).mode & 0o077, 0);
});

test('a project folder starting with "-" is passed after "--"', () => {
  const input = JSON.stringify({ cwd: '/home/me/-rf' });
  const r = run(['done'], { STARTERKIT_NOTIFY_PLATFORM: 'darwin', STARTERKIT_NOTIFY: 'voice', STARTERKIT_NOTIFY_LANG: 'en', STARTERKIT_NOTIFY_PROJECT: '1' }, input);
  assert.deepEqual(r.lines[0].args.slice(-2), ['--', 'Claude is done, project -rf']);
});
